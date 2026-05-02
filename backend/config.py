"""Configuration module for XiaoHong Backend.

This module acts as the Single Source of Truth for all environmental settings, 
secrets, and system prompts used across the backend services.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

# =================================================================
# ENVIRONMENT LOADING STRATEGY
# We support both .env and .env.local to allow for environment-specific 
# overrides (e.g., local development vs production) without modifying 
# the tracked version-controlled .env file.
# =================================================================

for env_name in [".env", ".env.local"]:
    env_path = Path(__file__).resolve().parent.parent / env_name
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded environment variables from {env_name}")
        break

# =================================================================
# PROVIDER CONFIGURATIONS
# These variables define the connectivity to LLM providers. 
# We use environment variables to ensure secrets (like HF_TOKEN) 
# are never hardcoded in the source code.
# =================================================================

HF_TOKEN = os.environ.get("HF_TOKEN", "")
HF_ENDPOINT_URL = os.environ.get("HF_ENDPOINT_URL", "")
HF_REPO_ID = os.environ.get("HF_REPO_ID", "/repository")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
DEEPINFRA_API_KEY = os.environ.get("DEEPINFRA_API_KEY", "") or os.environ.get("DEEPINFRA_TOKEN", "")

# =================================================================
# SYSTEM PROMPT ARCHITECTURE
# Prompts are centralized here to maintain consistency across 
# different chat modes (Normal vs RAG vs CoT). We use XML-like 
# tags (<context>, <think>) to provide structural hints to the 
# model for better instruction following.
# =================================================================

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

# =================================================================
# GLOBAL RESOURCE MANAGEMENT
# We use a global ThreadPoolExecutor for CPU-bound tasks (FAISS/BM25) 
# to prevent blocking the FastAPI async event loop, ensuring the 
# server remains responsive during heavy retrieval operations.
# =================================================================

thread_pool = ThreadPoolExecutor(max_workers=4)
