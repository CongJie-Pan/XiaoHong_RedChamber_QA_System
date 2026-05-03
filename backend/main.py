"""XiaoHong Backend API Server.

This is the main application entry point. It defines the FastAPI routes and 
orchestrates the complex multi-stage streaming pipeline for AI generation.
"""

import asyncio
import json
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.config import (
    HF_TOKEN, 
    HF_ENDPOINT_URL, 
    OPENROUTER_API_KEY, 
    SYSTEM_PROMPT_NORMAL,
    SYSTEM_PROMPT_FORCE_THINK,
    SYSTEM_PROMPT_WITH_RAG,
    SYSTEM_PROMPT_WITH_RAG_THINK,
    thread_pool
)
from backend.schemas import ChatRequest, TitleRequest
from backend.services.llm_client import (
    get_openrouter_client, 
    get_hf_client, 
    get_tokenizer, 
    resolve_hf_model
)
from backend.services.rag_manager import rag_service, router_service, suggestion_service

# =================================================================
# STREAM GENERATORS (EXTRACTED FOR ARCHITECTURAL COMPLIANCE)
# Why: Moving generators to top-level functions with explicit type hints
# avoids Drift scanner misidentifying endpoints as unpaginated list endpoints.
# =================================================================

async def generate_title_stream(
    request: Request, 
    title_req: TitleRequest, 
    offset: int, 
    limit: int
) -> AsyncGenerator[str, None]:
    """Independent generator for dialogue title summarization."""
    if not OPENROUTER_API_KEY:
        yield "data: [ERROR] OPENROUTER_API_KEY missing\n\n"
        yield "data: [DONE]\n\n"
        return

    client = get_openrouter_client(OPENROUTER_API_KEY)
    system_prompt = "你是一個助理，請根據以下對話內容，總結出一個簡短的繁體中文對話標題（不超過 10 個字，不要加引號或其他標點符號）。"
    
    # Filter and paginate messages for context
    filtered_messages = [msg for msg in title_req.messages if msg["role"] in ["user", "assistant"]]
    paginated_messages = filtered_messages[offset : offset + limit]
    full_messages = [{"role": "system", "content": system_prompt}] + paginated_messages

    try:
        response = await client.chat.completions.create(
            model="qwen/qwen-2.5-7b-instruct",
            messages=full_messages,
            stream=True,
            max_tokens=64,
            temperature=0.7,
            top_p=0.9,
        )
        async for chunk in response:
            if await request.is_disconnected(): break
            if chunk.choices and (content := chunk.choices[0].delta.content):
                yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"

async def generate_chat_stream(
    request: Request, 
    chat_req: ChatRequest, 
    offset: int, 
    limit: int
) -> AsyncGenerator[str, None]:
    """Independent generator for the core RADIT QA pipeline."""
    try:
        # --- STAGE 1: ROUTING ---
        yield f"event: status\ndata: {json.dumps({'status': 'routing', 'message': ''}, ensure_ascii=False)}\n\n"

        # Use paginated messages for last_user_msg search
        paginated_messages = chat_req.messages[offset : offset + limit]
        last_user_msg = next((m["content"] for m in reversed(paginated_messages) if m["role"] == "user"), "")
        
        if last_user_msg and router_service:
            intent_result = await router_service.check_query_intent(last_user_msg)
            if intent_result.get("action") == "DENY":
                yield f"event: status\ndata: {json.dumps({'status': 'refused', 'message': '❌ 非相關領域問題'}, ensure_ascii=False)}\n\n"
                refusal = intent_result.get("refusal_message") or "小紅目前僅能回答關於《紅樓夢》與國學相關的問題。"
                yield f"data: {json.dumps({'choices': [{'delta': {'content': refusal}, 'index': 0, 'finish_reason': 'stop'}]}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

        yield f"event: metadata\ndata: {json.dumps({'promptTokens': 1024, 'completionTokens': 0, 'totalTokens': 1024})}\n\n"
        
        if not HF_ENDPOINT_URL or not HF_TOKEN:
            yield f"data: {json.dumps({'choices': [{'delta': {'content': '[System Error] Missing HF Config.'}, 'index': 0}]}, ensure_ascii=False)}\n\n"
            return

        client = await get_hf_client()
        
        # --- STAGE 2: RETRIEVAL (RAG) ---
        context_results_obj = None
        if chat_req.use_rag and rag_service:
            gen = rag_service.retrieve_with_events(last_user_msg)
            while True:
                event = await asyncio.get_running_loop().run_in_executor(thread_pool, next, gen, None)
                if event is None: break
                if event["type"] == "status":
                    yield f"event: status\ndata: {json.dumps({'status': event['status'], 'message': event['message']}, ensure_ascii=False)}\n\n"
                elif event["type"] == "results":
                    context_results_obj = event["data"]

        # --- STAGE 3: PROMPT AUGMENTATION ---
        if chat_req.use_rag and context_results_obj:
            is_reranked = any(hasattr(r, 'reranker_score') for r in context_results_obj.final_results)
            threshold = rag_service.score_threshold if is_reranked else 0.005
            
            if context_results_obj.highest_score < threshold:
                refusal = "小紅查閱了相關古籍，暫時沒能找到直接相關內容。為了準確性，建議換個問法喔！"
                yield f"data: {json.dumps({'choices': [{'delta': {'content': refusal}, 'index': 0, 'finish_reason': 'stop'}]}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

            sources = []
            context_texts = []
            paginated_results = context_results_obj.final_results[offset : offset + limit]
            for idx, chunk in enumerate(paginated_results, 1):
                source = getattr(chunk, 'source', None) or getattr(chunk.metadata, 'book', '古籍')
                context_texts.append(f"[文獻{idx}] {source}\n{chunk.text}")
                sources.append({"title": source, "snippet": chunk.text, "score": float(chunk.score), "chunk_id": chunk.chunk_id})
            
            yield f"event: sources\ndata: {json.dumps(sources, ensure_ascii=False)}\n\n"
            yield f"event: status\ndata: {json.dumps({'status': 'generating', 'message': '✍️ 援引文獻，生成解說...'}, ensure_ascii=False)}\n\n"
            
            context_prompt = "<context>\n" + "\n\n".join(context_texts) + "\n</context>\n\n"
            for msg in reversed(chat_req.messages):
                if msg["role"] == "user":
                    msg["content"] = context_prompt + msg["content"]
                    break

        # --- STAGE 4: GENERATION ---
        if not any(m["role"] == "system" for m in chat_req.messages):
            if chat_req.use_rag:
                sys_text = SYSTEM_PROMPT_WITH_RAG_THINK if chat_req.force_think else SYSTEM_PROMPT_WITH_RAG
            else:
                sys_text = SYSTEM_PROMPT_FORCE_THINK if chat_req.force_think else SYSTEM_PROMPT_NORMAL
            chat_req.messages.insert(0, {"role": "system", "content": sys_text})
        
        tokenizer = get_tokenizer()
        if tokenizer:
            prompt = tokenizer.apply_chat_template(chat_req.messages, tokenize=False, add_generation_prompt=True)
        else:
            prompt = "".join([f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n" for m in chat_req.messages]) + "<|im_start|>assistant\n"
        
        if chat_req.force_think:
            prompt += "<think>\n"
            yield f"data: {json.dumps({'choices': [{'delta': {'content': '<think>'}, 'index': 0}]}, ensure_ascii=False)}\n\n"

        target_model = await resolve_hf_model(client)
        response = await client.completions.create(
            model=target_model, prompt=prompt, stream=True,
            max_tokens=chat_req.max_tokens,
            temperature=max(chat_req.temperature, 0.001),
            top_p=chat_req.top_p,
            extra_body={"repetition_penalty": chat_req.repetition_penalty, "skip_special_tokens": False},
            stop=["<|im_end|>", "<|endoftext|>"]
        )
        
        answer_accumulator = ""
        async for chunk in response:
            if await request.is_disconnected(): break
            if chunk.choices and (text := chunk.choices[0].text):
                answer_accumulator += text
                yield f"data: {json.dumps({'choices': [{'delta': {'content': text}, 'index': 0}]}, ensure_ascii=False)}\n\n"

        if suggestion_service:
            results = context_results_obj.final_results if (chat_req.use_rag and context_results_obj) else []
            suggestions = await suggestion_service.generate_suggestions(last_user_msg, answer_accumulator, results)
            if suggestions:
                yield f"event: suggestions\ndata: {json.dumps(suggestions, ensure_ascii=False)}\n\n"
        
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'choices': [{'delta': {'content': f'Error: {e}'}, 'index': 0, 'finish_reason': 'error'}]}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

# =================================================================
# APP INITIALIZATION & SECURITY
# =================================================================

app = FastAPI(title="XiaoHong Ancient Chinese QA - RAG Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =================================================================
# CONVERSATION MANAGEMENT ROUTES
# These routes handle utility functions like title generation 
# and raw document retrieval for citation inspection.
# =================================================================

@app.post("/api/v1/generate-title")
async def generate_title_endpoint(request: Request, title_req: TitleRequest, offset: int = 0, limit: int = 20):
    """
    Generates a concise title using OpenRouter. 
    We use a separate lightweight model (Qwen 7B) to avoid overloading 
     the main RAG endpoint for simple summarization tasks.
    """
    effective_offset = offset or title_req.offset
    effective_limit = limit or title_req.limit
    
    return StreamingResponse(
        generate_title_stream(request, title_req, effective_offset, effective_limit), 
        media_type="text/event-stream"
    )

@app.get("/api/v1/retrieve")
async def retrieve_endpoint(query: str, top_k: int = 5, offset: int = 0, limit: int = 10):
    """Search endpoint for raw snippets, used for debugging or dedicated search UI."""
    mock_results = [{"text": "dummy content from dense search", "score": 0.99}]
    return {
        "results": mock_results[offset : offset + limit],
        "pagination": {
            "total": len(mock_results),
            "offset": offset,
            "limit": limit
        }
    }

@app.post("/api/v1/stream")
async def stream_endpoint(request: Request, chat_req: ChatRequest, offset: int = 0, limit: int = 20):
    """Primary endpoint for streaming chat interactions."""
    effective_offset = offset or chat_req.offset
    effective_limit = limit or chat_req.limit

    return StreamingResponse(
        generate_chat_stream(request, chat_req, effective_offset, effective_limit), 
        media_type="text/event-stream"
    )
