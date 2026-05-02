"""XiaoHong Backend API Server.

This is the main application entry point. It defines the FastAPI routes and 
orchestrates the complex multi-stage streaming pipeline for AI generation.
"""

import asyncio
import json
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

# Import centralized configurations and services
from backend.config import (
    OPENROUTER_API_KEY, HF_ENDPOINT_URL, HF_TOKEN,
    SYSTEM_PROMPT_NORMAL, SYSTEM_PROMPT_FORCE_THINK,
    SYSTEM_PROMPT_WITH_RAG, SYSTEM_PROMPT_WITH_RAG_THINK,
    thread_pool
)
from backend.schemas import ChatRequest, TitleRequest
from backend.services.rag_manager import rag_service, router_service, suggestion_service
from backend.services.llm_client import (
    get_hf_client, resolve_hf_model, get_openrouter_client, get_tokenizer
)

# =================================================================
# APP INITIALIZATION & SECURITY
# We use CORSMiddleware to restrict access only to our trusted frontend. 
# allow_credentials=True is required for future-proofing session management.
# =================================================================

app = FastAPI(title="XiaoHong Ancient Chinese QA - RAG Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
async def generate_title_endpoint(request: Request, title_req: TitleRequest):
    """
    Generates a concise title using OpenRouter. 
    We use a separate lightweight model (Qwen 7B) to avoid overloading 
     the main RAG endpoint for simple summarization tasks.
    """
    async def generate():
        if not OPENROUTER_API_KEY:
            yield "data: [ERROR] OPENROUTER_API_KEY missing\n\n"
            yield "data: [DONE]\n\n"
            return

        client = get_openrouter_client(OPENROUTER_API_KEY)
        system_prompt = "你是一個助理，請根據以下對話內容，總結出一個簡短的繁體中文對話標題（不超過 10 個字，不要加引號或其他標點符號）。"
        filtered_messages = [msg for msg in title_req.messages if msg["role"] in ["user", "assistant"]]
        full_messages = [{"role": "system", "content": system_prompt}] + filtered_messages

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

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/api/v1/retrieve")
async def retrieve_endpoint(query: str, top_k: int = 5, offset: int = 0, limit: int = 10):
    """Search endpoint for raw snippets, used for debugging or dedicated search UI."""
    mock_results = [{"text": "dummy content from dense search", "score": 0.99}]
    return {"results": mock_results[offset : offset + limit]}

# =================================================================
# THE STREAMING PIPELINE (CORE LOGIC)
# This endpoint implements the RADIT architecture through 4 main stages:
# 1. Routing: Out-of-Domain (OOD) detection.
# 2. Retrieval: Hybrid search (FAISS + BM25) + RRF + Rerank.
# 3. Augmentation: Injecting retrieved context into prompt.
# 4. Generation: Streaming token delivery with CoT parsing support.
# =================================================================

@app.post("/api/v1/stream")
async def stream_endpoint(request: Request, chat_req: ChatRequest):
    """Primary endpoint for streaming chat interactions."""
    async def generate():
        try:
            # --- STAGE 1: ROUTING ---
            # We detect if the query is unrelated to 'Sinology' or 'Red Chamber' first 
            # to save computation and prevent hallucinations on OOD topics.
            yield f"event: status\ndata: {json.dumps({'status': 'routing', 'message': ''}, ensure_ascii=False)}\n\n"

            last_user_msg = next((m["content"] for m in reversed(chat_req.messages) if m["role"] == "user"), "")
            
            # if the last user message is not empty and router service is available
            # then, we check the intent of the query using the router service
            if last_user_msg and router_service:
                intent_result = await router_service.check_query_intent(last_user_msg)
                if intent_result.get("action") == "DENY":
                    yield f"event: status\ndata: {json.dumps({'status': 'refused', 'message': '❌ 非相關領域問題'}, ensure_ascii=False)}\n\n"
                    refusal = intent_result.get("refusal_message") or "小紅目前僅能回答關於《紅樓夢》與國學相關的問題。"
                    yield f"data: {json.dumps({'choices': [{'delta': {'content': refusal}, 'index': 0, 'finish_reason': 'stop'}]}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

            # Synchronize frontend tokens (placeholder logic)
            yield f"event: metadata\ndata: {json.dumps({'promptTokens': 1024, 'completionTokens': 0, 'totalTokens': 1024})}\n\n"
            
            if not HF_ENDPOINT_URL or not HF_TOKEN:
                yield f"data: {json.dumps({'choices': [{'delta': {'content': '[System Error] Missing HF Config.'}, 'index': 0}]}, ensure_ascii=False)}\n\n"
                return

            client = await get_hf_client()
            
            # --- STAGE 2: RETRIEVAL (RAG) ---
            # We perform hybrid search and use a generator to yield status updates.
            # This keeps the user informed while the system queries the indices.
            context_results_obj = None

            # if RAG is enabled and the service is available, 
            # we start retrieval with event streaming
            if chat_req.use_rag and rag_service:
                gen = rag_service.retrieve_with_events(last_user_msg)
                while True:
                    # Run CPU-bound retrieval in a separate thread to keep the server responsive
                    event = await asyncio.get_running_loop().run_in_executor(thread_pool, next, gen, None)
                    if event is None: break
                    if event["type"] == "status":
                        yield f"event: status\ndata: {json.dumps({'status': event['status'], 'message': event['message']}, ensure_ascii=False)}\n\n"
                    elif event["type"] == "results":
                        context_results_obj = event["data"]

            # --- STAGE 3: PROMPT AUGMENTATION ---
            # If relevant documents are found, we wrap them in <context> tags.
            # We also apply a score threshold (Guardrail) to refuse if no quality context exists.
            if chat_req.use_rag and context_results_obj:
                is_reranked = any(hasattr(r, 'reranker_score') for r in context_results_obj.final_results)
                threshold = rag_service.score_threshold if is_reranked else 0.005
                
                # if the highest score among retrieved documents is below the threshold, 
                # we refuse to answer
                if context_results_obj.highest_score < threshold:
                    refusal = "小紅查閱了相關古籍，暫時沒能找到直接相關內容。為了準確性，建議換個問法喔！"
                    yield f"data: {json.dumps({'choices': [{'delta': {'content': refusal}, 'index': 0, 'finish_reason': 'stop'}]}, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # In order to make the revtrival more efficient, 
                # we only include the top 3 results in the prompt, 
                # and send the rest to the frontend for display in the citation cards.
                sources = []
                context_texts = []
                for idx, chunk in enumerate(context_results_obj.final_results, 1):
                    source = getattr(chunk, 'source', None) or getattr(chunk.metadata, 'book', '古籍')
                    context_texts.append(f"[文獻{idx}] {source}\n{chunk.text}")
                    sources.append({"title": source, "snippet": chunk.text, "score": float(chunk.score), "chunk_id": chunk.chunk_id})
                
                # Yield structured citations for the frontend interactive cards
                yield f"event: sources\ndata: {json.dumps(sources, ensure_ascii=False)}\n\n"
                yield f"event: status\ndata: {json.dumps({'status': 'generating', 'message': '✍️ 援引文獻，生成解說...'}, ensure_ascii=False)}\n\n"
                
                # Wrap retrieved context in special tags to signal the LLM for augmentation.
                context_prompt = "<context>\n" + "\n\n".join(context_texts) + "\n</context>\n\n"
                for msg in reversed(chat_req.messages):
                    if msg["role"] == "user":
                        msg["content"] = context_prompt + msg["content"]
                        break

            # --- STAGE 4: GENERATION ---
            # We construct the final prompt and stream tokens from the LLM.
            # We manually trigger the <think> block if force_think is enabled.
            if not any(m["role"] == "system" for m in chat_req.messages):
                if chat_req.use_rag:
                    sys_text = SYSTEM_PROMPT_WITH_RAG_THINK if chat_req.force_think else SYSTEM_PROMPT_WITH_RAG
                else:
                    sys_text = SYSTEM_PROMPT_FORCE_THINK if chat_req.force_think else SYSTEM_PROMPT_NORMAL
                chat_req.messages.insert(0, {"role": "system", "content": sys_text})
            
            # Apply chat template if tokenizer supports it, 
            # otherwise fallback to manual formatting.
            tokenizer = get_tokenizer()
            if tokenizer:
                prompt = tokenizer.apply_chat_template(chat_req.messages, tokenize=False, add_generation_prompt=True)
            else:
                prompt = "".join([f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n" for m in chat_req.messages]) + "<|im_start|>assistant\n"
            
            # If force_think is enabled, we insert a <think> block at the end of the prompt to encourage CoT reasoning.
            if chat_req.force_think:
                prompt += "<think>\n"
                yield f"data: {json.dumps({'choices': [{'delta': {'content': '<think>'}, 'index': 0}]}, ensure_ascii=False)}\n\n"

            # Resolve the target model and stream the response.
            # Also pass extra parameters for repetition penalty and stop tokens.
            target_model = await resolve_hf_model(client)
            response = await client.completions.create(
                model=target_model, prompt=prompt, stream=True,
                max_tokens=chat_req.max_tokens,
                temperature=max(chat_req.temperature, 0.001),
                top_p=chat_req.top_p,
                extra_body={"repetition_penalty": chat_req.repetition_penalty, "skip_special_tokens": False},
                stop=["<|im_end|>", "<|endoftext|>"]
            )
            
            # Accumulate the answer as it streams for later use in suggestion generation.
            answer_accumulator = ""
            async for chunk in response:
                if await request.is_disconnected(): break
                if chunk.choices and (text := chunk.choices[0].text):
                    answer_accumulator += text
                    yield f"data: {json.dumps({'choices': [{'delta': {'content': text}, 'index': 0}]}, ensure_ascii=False)}\n\n"

            # --- FINAL STAGE: FOLLOW-UP SUGGESTIONS ---
            # After the answer is generated, we use the context to suggest next questions.
            # If the suggestion service is available, we generate suggestions based on the last user message,
            if suggestion_service:
                results = context_results_obj.final_results if (chat_req.use_rag and context_results_obj) else []
                suggestions = await suggestion_service.generate_suggestions(last_user_msg, answer_accumulator, results)
                if suggestions:
                    yield f"event: suggestions\ndata: {json.dumps(suggestions, ensure_ascii=False)}\n\n"
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'choices': [{'delta': {'content': f'Error: {e}'}, 'index': 0, 'finish_reason': 'error'}]}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
