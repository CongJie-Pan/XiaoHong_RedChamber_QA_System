import pytest
from httpx import AsyncClient, ASGITransport
import json
from unittest.mock import patch, MagicMock
import asyncio

# Import the FastAPI app
from backend.main import app

class MockRagChunk:
    def __init__(self, text, score, chunk_id):
        self.text = text
        self.score = score
        self.chunk_id = chunk_id
        self.source = "test_source"

class MockRagResults:
    def __init__(self):
        self.final_results = [
            MockRagChunk("Document content here", 0.95, "test_doc_01")
        ]

@pytest.mark.asyncio
async def test_sse_streaming_sequence_with_rag():
    # Scenario 1: SSE Streaming sequence with RAG events
    
    def mock_retrieve_with_events(query):
        # Synchronous generator as in the original code
        yield {"type": "status", "status": "searching_dense", "message": "📖 翻閱古籍索引..."}
        yield {"type": "status", "status": "reranking", "message": "⚖️ 比較段落關聯性..."}
        yield {"type": "results", "data": MockRagResults()}
    
    # We patch the rag_service instance's method in the main app
    with patch('backend.main.rag_service') as mock_rag, \
         patch('backend.main.HF_ENDPOINT_URL', 'http://mock-url'), \
         patch('backend.main.HF_TOKEN', 'mock-token'):
        mock_rag.retrieve_with_events.side_effect = mock_retrieve_with_events
        
        # We also need to patch AsyncOpenAI so it doesn't try to call HF endpoint
        with patch('backend.main.AsyncOpenAI') as mock_openai:
            mock_client = MagicMock()
            
            # Setup fake streaming completion
            class FakeAsyncIterator:
                def __aiter__(self):
                    return self
                async def __anext__(self):
                    raise StopAsyncIteration
            
            mock_client.completions.create.return_value = FakeAsyncIterator()
            # Mock models.list to return a dummy model
            mock_client.models.list = MagicMock()
            mock_client.models.list.return_value = asyncio.Future()
            mock_client.models.list.return_value.set_result(MagicMock(data=[MagicMock(id="test-model")]))
            
            mock_openai.return_value = mock_client
            
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                req_data = {
                    "messages": [{"role": "user", "content": "賈寶玉是誰？"}],
                    "use_rag": True
                }
                response = await ac.post("/api/stream", json=req_data)
                
                assert response.status_code == 200
                content = response.text
                
                # Check for the sequence of SSE events
                assert "event: metadata" in content
                assert "event: status" in content
                assert "📖 翻閱古籍索引..." in content
                assert "⚖️ 比較段落關聯性..." in content
                assert "event: sources" in content
                assert "test_source" in content
                assert "data: [DONE]" in content
