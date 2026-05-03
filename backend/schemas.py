"""Pydantic data models for XiaoHong Backend.

This module defines the structural "contracts" for all API interactions. 
By using Pydantic, we ensure strict data validation and type safety 
at the entry point of our backend.
"""

from pydantic import BaseModel
from typing import List, Dict

# =================================================================
# SEARCH SCHEMAS
# Used for the /retrieve endpoint. Defines how the frontend 
# requests raw document snippets for inspection or debugging.
# =================================================================

class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5

# =================================================================
# CHAT & STREAMING SCHEMAS
# This is the core data model for the streaming conversation. 
# It includes hyperparameter controls (temperature, top_p) and 
# feature toggles (use_rag, force_think) that dictate the 
# RADIT pipeline's behavior.
# =================================================================

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    use_rag: bool = False
    force_think: bool = False
    temperature: float = 0.0
    top_p: float = 0.9
    max_tokens: int = 2048
    repetition_penalty: float = 1.15
    offset: int = 0
    limit: int = 20

# =================================================================
# UTILITY SCHEMAS
# Lightweight models for secondary tasks like title generation 
# and suggested follow-up questions.
# =================================================================

class TitleRequest(BaseModel):
    messages: List[Dict[str, str]]
    offset: int = 0
    limit: int = 20
