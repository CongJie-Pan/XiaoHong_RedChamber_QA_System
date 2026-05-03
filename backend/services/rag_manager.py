"""RAG Service Manager for XiaoHong Backend.

This module orchestrates the initialization and lifecycle of specialized 
services: RAG (Retrieval), Router (Intent Detection), and Suggestion (Follow-up).
"""

import sys
from pathlib import Path

# =================================================================
# PROJECT PATH RESOLUTION
# We resolve the project root path to locate local data assets 
# (FAISS/BM25 indices) stored in the /data directory.
# =================================================================

project_root = Path(__file__).resolve().parents[2]

from backend.services.rag_service import RAGService
from backend.services.router_service import RouterService
from backend.services.suggestion_service import SuggestionService

# =================================================================
# DYNAMIC INDEX RESOLUTION
# The FAISS and BM25 indices are updated periodically. Instead of 
# hardcoding paths, we look for the most recently modified files 
# to ensure the system always uses the freshest knowledge base.
# =================================================================

from backend.config import DEEPINFRA_API_KEY

def get_latest_file(directory: Path, pattern: str) -> str:
    """Returns the absolute path of the most recently modified file."""
    if not directory.exists():
        return ""
    files = list(directory.glob(pattern))
    if not files:
        return ""
    return str(sorted(files, key=lambda x: x.stat().st_mtime)[-1])

# =================================================================
# SERVICE INITIALIZATION (SINGLETON PATTERN)
# We initialize these services once at the module level to reuse 
# their internal heavy assets (like BM25 indices or router models) 
# across all API requests, significantly reducing latency.
# =================================================================

def initialize_services():
    """Initializes and returns the suite of AI services."""
    faiss_dir = project_root / "data" / "rag" / "faiss_index"
    bm25_dir = project_root / "data" / "rag" / "bm25_index"

    # Locate the latest chunks and metadata files
    latest_faiss_idx = get_latest_file(faiss_dir, "chunks*.index")
    latest_faiss_meta = get_latest_file(faiss_dir, "index_metadata*.json")

    # Fallback for local development without indices
    if not latest_faiss_idx:
        latest_faiss_idx = "dummy_not_found.index"
        print("Warning: No FAISS index found. RAG functionality will be limited.")

    # Initialize RAG services with the resolved paths and configurations.
    try:
        # Instantiate services with optimized RAG parameters
        # score_threshold=0.3 ensures we only cite high-confidence matches.
        rag_service = RAGService(
            faiss_index_path=latest_faiss_idx,
            faiss_metadata_path=latest_faiss_meta,
            bm25_index_dir=str(bm25_dir),
            embedding_model_path="api",
            reranker_model_path="api",
            top_k=5,
            rrf_k=60,
            score_threshold=0.3,
            max_context_tokens=4000,
        )
        router_service = RouterService(api_key=DEEPINFRA_API_KEY)
        suggestion_service = SuggestionService()
        
        print("AI Services (RAG, Router, Suggestion) initialized successfully.")
        return rag_service, router_service, suggestion_service
    except Exception as e:
        print(f"Critical Error: Service initialization failed: {e}")
        return None, None, None

# Singleton instances shared across the application
rag_service, router_service, suggestion_service = initialize_services()
