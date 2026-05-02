"""LLM Client module for XiaoHong Backend.

This module manages the connectivity and model resolution for external 
AI providers (Hugging Face and OpenRouter).
"""

from openai import AsyncOpenAI
from backend.config import HF_TOKEN, HF_ENDPOINT_URL, HF_REPO_ID

# =================================================================
# MODEL RESOLUTION CACHING
# We cache the resolved model name to avoid redundant API calls to 
# the provider's /models endpoint, reducing the overhead for each 
# streaming request.
# =================================================================
_resolved_model_name = None

# =================================================================
# PROVIDER-SPECIFIC CLIENT FACTORIES
# Different providers require different base URLs and authentication 
# strategies. These factory functions encapsulate the complexity 
# of ensuring the API endpoints are correctly formatted (e.g., /v1 suffix).
# =================================================================

async def get_hf_client():
    """Returns an AsyncOpenAI client configured for Hugging Face Endpoint."""
    hf_base_url = HF_ENDPOINT_URL.strip()
    # Ensure the URL ends with /v1/ to be compatible with the OpenAI SDK
    if not hf_base_url.strip("/").endswith("v1"):
        hf_base_url = hf_base_url.rstrip("/") + "/v1/"
        
    return AsyncOpenAI(
        base_url=hf_base_url, 
        api_key=HF_TOKEN, 
        timeout=120.0 # Higher timeout for long-running RAG generations
    )

async def resolve_hf_model(client: AsyncOpenAI):
    """
    Dynamically identifies the target model ID. 
    Priority: 
    1. User-defined HF_REPO_ID in .env 
    2. Auto-discovery via models.list() 
    3. Fallback to '/repository'
    """
    global _resolved_model_name
    if _resolved_model_name:
        return _resolved_model_name
        
    try:
        # If the user explicitly sets a model name, use it to bypass model listing issues
        if HF_REPO_ID and HF_REPO_ID != "/repository":
            _resolved_model_name = HF_REPO_ID
        else:
            models_resp = await client.models.list()
            _resolved_model_name = models_resp.data[0].id
    except Exception:
        # Generic fallback for vLLM instances that don't expose model lists
        _resolved_model_name = "/repository"
        
    return _resolved_model_name

def get_openrouter_client(api_key: str):
    """Configures a client specifically for OpenRouter (used for utility tasks)."""
    return AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
        timeout=30.0
    )

# =================================================================
# TOKENIZER ASSET MANAGEMENT
# Loading a tokenizer is an expensive I/O operation. We initialize 
# it globally at the module level so it's only loaded once during 
# server startup, ensuring fast chat template applications.
# =================================================================

_tokenizer = None
try:
    from transformers import AutoTokenizer
    # We use the specific XiaoHong-v1 tokenizer to ensure prompt 
    # templates exactly match the fine-tuned model's requirements.
    _tokenizer = AutoTokenizer.from_pretrained("CongJ-Pan/XiaoHong-v1")
except Exception as e:
    print(f"Warning: Could not load tokenizer. Prompt templates may fallback to naive formatting. {e}")

def get_tokenizer():
    """Provides access to the shared global tokenizer instance."""
    return _tokenizer
