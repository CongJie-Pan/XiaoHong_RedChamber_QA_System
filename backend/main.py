import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

# Try to import transformers for local chat template
try:
    from transformers import AutoTokenizer
    # Initialize tokenizer globally
    _tokenizer = AutoTokenizer.from_pretrained("CongJ-Pan/XiaoHong-v1")
except Exception as e:
    _tokenizer = None
    print(f"Warning: Could not load tokenizer. Ensure transformers is installed. {e}")

from pathlib import Path
import os
from dotenv import load_dotenv

# Try loading from the unified global .env file in the project root
# Support both .env and .env.local
for env_name in [".env", ".env.local"]:
    env_path = Path(__file__).resolve().parent.parent / env_name
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded environment variables from {env_name}")
        break

HF_TOKEN = os.environ.get("HF_TOKEN", "")
HF_ENDPOINT_URL = os.environ.get("HF_ENDPOINT_URL", "")
HF_REPO_ID = os.environ.get("HF_REPO_ID", "/repository")

# Cache to store the dynamically resolved model name so we don't spam models.list() APIs
_resolved_model_name = None

# --- System Prompts (Extracted from Streamlit chat_app.py) ---
SYSTEM_PROMPT_NORMAL = (
    "你是一位專業的古典文學與知識問答助手。你的名字叫做「小紅」。請始終使用繁體中文回答。"
    "遇到需要深度分析與邏輯推演的問題，請先在 <think> 標籤內進行思考；"
    "若是簡單的事實擷取或問候，請直接給出答案，不需思考過程。"
)
SYSTEM_PROMPT_FORCE_THINK = (
    "你是一位專業的古典文學與知識問答助手。請先在 <think> 標籤中進行詳細推理，再給出最終答案。"
)
SYSTEM_PROMPT_WITH_RAG = (
    "你是一位專業的古典文學與知識問答助手。你的名字叫做「小紅」。請始終使用繁體中文回答。"
    "系統會在使用者問題前提供 <context> 參考資料。"
    "請優先根據參考資料回答；若參考資料與問題無關，請忽略它並依據自身知識回答，"
    "並說明這是根據自身知識而非參考資料。"
    "遇到需要深度分析與邏輯推演的問題，請先在 <think> 標籤內進行思考；"
    "若是簡單的事實擷取或問候，請直接給出答案，不需思考過程。"
)
SYSTEM_PROMPT_WITH_RAG_THINK = (
    "你是一位專業的古典文學與知識問答助手。你的名字叫做「小紅」。請始終使用繁體中文回答。"
    "系統會在使用者針對問題前提供 <context> 參考資料。"
    "請優先根據參考資料回答；若參考資料與問題無關，請忽略它並依據自身知識回答，"
    "並說明這是根據自身知識而非參考資料。"
    "請先在 <think> 標籤中進行詳細推理，再給出最終答案。"
)

# Initialize the global thread pool for CPU bounds tasks (Tokenizer, FAISS, BM25)
_thread_pool = ThreadPoolExecutor(max_workers=4)

# Load RAG Service globally
try:
    import sys
    from pathlib import Path
    
    # In the new structure, backend/main.py is one level down from project root
    project_root = Path(__file__).resolve().parents[1]
    
    # Add the src/main/python folder to sys.path to resolve internal service imports
    src_python_dir = project_root / "src" / "main" / "python"
    if str(src_python_dir) not in sys.path:
        sys.path.insert(0, str(src_python_dir))
        
    from services.rag_service import RAGService
    
    faiss_dir = project_root / "data" / "rag" / "faiss_index"
    bm25_dir = project_root / "data" / "rag" / "bm25_index"
    
    def get_latest_file(directory: Path, pattern: str) -> str:
        if not directory.exists():
            return ""
        files = list(directory.glob(pattern))
        if not files:
            return ""
        return str(sorted(files, key=lambda x: x.stat().st_mtime)[-1])
        
    # Check if empty data folder issue occurs, if so, fail gracefully
    latest_faiss_idx = get_latest_file(faiss_dir, "chunks*.index")
    latest_faiss_meta = get_latest_file(faiss_dir, "index_metadata*.json")
    
    if not latest_faiss_idx:
        latest_faiss_idx = "dummy_not_found.index"  # Prevent Path("") resolving to '.'
        print("Warning: No FAISS index found in data/rag/faiss_index. RAG will not work locally.")
    
    rag_service = RAGService(
        faiss_index_path=latest_faiss_idx,
        faiss_metadata_path=latest_faiss_meta,
        bm25_index_dir=str(bm25_dir),
        embedding_model_path="api", # Changed this to API since local models were skipped
        top_k=5,
        rrf_k=60,
        score_threshold=0.3,
        max_context_tokens=4000,
    )
    print("RAG Service initialized successfully.")
except Exception as e:
    rag_service = None
    print(f"Warning: Could not load RAGService. Details: {e}")

app = FastAPI(title="XiaoHong Ancient Chinese QA - RAG Backend API")

# Strict CORS: Only allow connections from the Next.js local server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    use_rag: bool = False
    force_think: bool = False
    temperature: float = 0.0
    top_p: float = 0.9
    max_tokens: int = 2048
    repetition_penalty: float = 1.15

@app.post("/api/retrieve")
async def retrieve_endpoint(req: RetrieveRequest):
    """
    Search endpoint that returns pure JSON snippets.
    Suitable for frontend debug panels or citation references.
    """
    loop = asyncio.get_running_loop()
    # TODO: In future iterations, replace this with actual faiss_utils retrieval logic in the thread pool.
    
    mock_results = [{"text": "dummy content from dense search", "score": 0.99}]
    return {"results": mock_results}

@app.post("/api/stream")
async def stream_endpoint(request: Request, chat_req: ChatRequest):
    """
    Core streaming endpoint for textual generation.
    Returns:
       1) metadata event (syncing token calculations)
       2) ongoing chunk data events from vLLM
    """
    async def generate():
        try:
            # 1. Metadata synchronization phase
            metadata = {
                "promptTokens": 1024,
                "completionTokens": 0,
                "totalTokens": 1024
            }
            yield f"event: metadata\ndata: {json.dumps(metadata)}\n\n"
            
            # 2. Token generation stream phase
            if not HF_ENDPOINT_URL or not HF_TOKEN:
                chunk_data = {"choices": [{"delta": {"content": "[System Error] HF_ENDPOINT_URL or HF_TOKEN is missing in the global .env file."}, "index": 0, "finish_reason": None}]}
                yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
            else:
                try:
                    # Enforce /v1/ suffix as done in chat_app.py
                    hf_base_url = HF_ENDPOINT_URL.strip()
                    if not hf_base_url.strip("/").endswith("v1"):
                        hf_base_url = hf_base_url.rstrip("/") + "/v1/"
                        
                    client = AsyncOpenAI(
                        base_url=hf_base_url, 
                        api_key=HF_TOKEN, 
                        timeout=120.0
                    )
                    
                    # 0. RAG Retrieval phase
                    has_system = len(chat_req.messages) > 0 and chat_req.messages[0]["role"] == "system"
                    context_citations = []
                    
                    if chat_req.use_rag and rag_service:
                        last_user_msg = next((m["content"] for m in reversed(chat_req.messages) if m["role"] == "user"), "")
                        if last_user_msg:
                            try:
                                context_results_obj = None
                                # Loop through generator to yield SSE progress events!
                                # Use an executor to avoid blocking the event loop with synchronous RAG operations
                                gen = rag_service.retrieve_with_events(last_user_msg)
                                while True:
                                    event = await asyncio.get_running_loop().run_in_executor(_thread_pool, next, gen, None)
                                    if event is None:
                                        break
                                    if event["type"] == "status":
                                        status_payload = {"status": event["status"], "message": event["message"]}
                                        yield f"event: status\ndata: {json.dumps(status_payload, ensure_ascii=False)}\n\n"
                                    elif event["type"] == "results":
                                        context_results_obj = event["data"]
                                        
                                if context_results_obj and context_results_obj.final_results:
                                    context_texts = []
                                    sources_payload = []
                                    
                                    # Filter out results with empty or whitespace-only text
                                    valid_results = [r for r in context_results_obj.final_results if r.text and r.text.strip()]
                                    
                                    for idx, chunk in enumerate(valid_results, 1):
                                        # Try multiple attributes to get a meaningful source title
                                        # Priority: chunk.source > chunk.metadata.source > chunk.metadata.book > chunk_id prefix
                                        raw_source = (
                                            getattr(chunk, 'source', None)
                                            or getattr(getattr(chunk, 'metadata', None), 'source', None)
                                            or getattr(getattr(chunk, 'metadata', None), 'book', None)
                                            or getattr(getattr(chunk, 'metadata', None), 'book_name', None)
                                        )
                                        chunk_id = getattr(chunk, 'chunk_id', None) or "N/A"
                                        
                                        # If still no source, use chunk_id prefix (e.g. 'hongloumeng_ch01_0' → 'hongloumeng')
                                        if not raw_source and chunk_id != "N/A":
                                            raw_source = chunk_id.split('_')[0] if '_' in str(chunk_id) else None
                                        
                                        source = raw_source or "古籍文獻"
                                        text = chunk.text
                                        score = chunk.score
                                        
                                        context_texts.append(f"[文獻{idx}] {source}\n{text}")
                                        context_citations.append(f"[{source}] (Chunk: {chunk_id})")
                                        
                                        # Standardise source schema for interactive citation cards
                                        sources_payload.append({
                                            "title": source,
                                            "snippet": text,
                                            "score": float(score),
                                            "chunk_id": chunk_id
                                        })
                                    
                                    # Push the structured sources payload before generation begins
                                    yield f"event: sources\ndata: {json.dumps(sources_payload, ensure_ascii=False)}\n\n"
                                    
                                    yield f"event: status\ndata: {json.dumps({'status': 'generating', 'message': '✍️ 援引文獻，生成解說...' }, ensure_ascii=False)}\n\n"
                                    
                                    context_prompt = "<context>\n" + "\n\n".join(context_texts) + "\n</context>\n\n"
                                    # Update the last user message to include context!
                                    for idx in range(len(chat_req.messages)-1, -1, -1):
                                        if chat_req.messages[idx]["role"] == "user":
                                            chat_req.messages[idx]["content"] = context_prompt + chat_req.messages[idx]["content"]
                                            break
                            except Exception as e:
                                print(f"RAG retrieval failed: {e}")
                                yield f"event: error\ndata: {json.dumps({'detail': f'RAG Error: {e}'}, ensure_ascii=False)}\n\n"

                    # 0.5. Inject System Prompt logic mimicking chat_app.py
                    if not has_system:
                        # Determine which prompt to use based on RAG and force_think flags
                        if chat_req.use_rag:
                            sys_prompt_text = SYSTEM_PROMPT_WITH_RAG_THINK if chat_req.force_think else SYSTEM_PROMPT_WITH_RAG
                        else:
                            sys_prompt_text = SYSTEM_PROMPT_FORCE_THINK if chat_req.force_think else SYSTEM_PROMPT_NORMAL
                            
                        # Insert at the beginning of the messages list
                        chat_req.messages.insert(0, {"role": "system", "content": sys_prompt_text})
                    
                    # 1. Use local tokenizer to apply chat template to bypass vLLM server padding issues
                    if _tokenizer is not None:
                        prompt = _tokenizer.apply_chat_template(
                            chat_req.messages, 
                            tokenize=False, 
                            add_generation_prompt=True
                        )
                    else:
                        # Fallback naive template just in case tokenizer fails
                        prompt = ""
                        for m in chat_req.messages:
                            prompt += f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n"
                        prompt += "<|im_start|>assistant\n"
                    
                    if chat_req.force_think:
                        prompt += "<think>\n"
                        # Artificially yield the initial think tag so the strict frontend parser can catch it!
                        # NOTE: Do NOT include trailing \n here — the parser strips the <think> tag
                        # and any remaining \n would appear as a blank first line in the thinking panel.
                        chunk_data = {
                            "choices": [
                                {
                                    "delta": {"content": "<think>"},
                                    "index": 0,
                                    "finish_reason": None,
                                }
                            ]
                        }
                        yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"

                    # 2. Use completions API (not chat) to maintain absolute control over the payload
                    # This prevents vLLM from stripping <think> tags natively
                    
                    # Dynamically resolve model name identically to chat_app.py resolve_model_name()
                    try:
                        # Since `models.list()` throws an error on some instances or behaves weirdly, 
                        # we prioritize HF_REPO_ID provided via .env.local if present, to bypass 404 error!
                        if HF_REPO_ID and HF_REPO_ID != "/repository":
                            target_model_name = HF_REPO_ID
                        else:
                            models_resp = await client.models.list()
                            target_model_name = models_resp.data[0].id
                    except Exception:
                        target_model_name = "/repository"
                            
                    response = await client.completions.create(
                        model=target_model_name,
                        prompt=prompt,
                        stream=True,
                        max_tokens=chat_req.max_tokens,
                        temperature=chat_req.temperature if chat_req.temperature > 0 else 0.001,
                        top_p=chat_req.top_p,
                        extra_body={
                            "repetition_penalty": chat_req.repetition_penalty,
                            "skip_special_tokens": False
                        },
                        stop=["<|im_end|>", "<|endoftext|>"]
                    )
                    
                    async for chunk in response:
                        if await request.is_disconnected():
                            break
                        
                        # Forward the text payload but repackage it as OpenAI Chat Schema 'delta.content' 
                        # so that our rigid Next.js client parser doesn't break!
                        text_chunk = chunk.choices[0].text if chunk.choices and chunk.choices[0].text else ""
                        if text_chunk:
                            chunk_data = {
                                "choices": [
                                    {
                                        "delta": {"content": text_chunk},
                                        "index": 0,
                                        "finish_reason": None,
                                    }
                                ]
                            }
                            # NOTE: Structured sources are already sent via `event: sources` SSE.
                            # Do NOT attach context_citations here — they are non-URL strings
                            # that would cause the frontend Citations component to show "Invalid URL".
                            yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
                        await asyncio.sleep(0)
                        
                except Exception as e:
                    reason = str(e)
                    error_output = f"**[API Error]** 發生錯誤請重試。Hugging Face Endpoint 回應：\n\n```\n{reason}\n```"
                    chunk_data = {"choices": [{"delta": {"content": error_output}, "index": 0}]}
                    yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
            
            # 3. Stream End signal
            yield "data: [DONE]\n\n"
            
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        generate(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )
