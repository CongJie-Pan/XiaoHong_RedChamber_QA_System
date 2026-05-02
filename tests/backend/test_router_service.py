import pytest
from unittest.mock import AsyncMock, patch
from backend.services.router_service import RouterService

@pytest.mark.asyncio
async def test_router_service_allow():
    # Mock the AsyncOpenAI client
    with patch('backend.services.router_service.AsyncOpenAI') as mock_openai:
        mock_client = mock_openai.return_value
        mock_client.chat.completions.create = AsyncMock()
        
        # Mock successful ALLOW response
        mock_response = AsyncMock()
        mock_response.choices = [
            AsyncMock(message=AsyncMock(content='{"action": "ALLOW", "domain": null, "refusal_message": null}'))
        ]
        mock_client.chat.completions.create.return_value = mock_response
        
        service = RouterService(api_key="test_key")
        result = await service.check_query_intent("賈寶玉是誰？")
        
        assert result["action"] == "ALLOW"
        assert result["refusal_message"] is None

@pytest.mark.asyncio
async def test_router_service_deny():
    # Mock the AsyncOpenAI client
    with patch('backend.services.router_service.AsyncOpenAI') as mock_openai:
        mock_client = mock_openai.return_value
        mock_client.chat.completions.create = AsyncMock()
        
        # Mock DENY response
        refusal_msg = "這是數學領域的問題呢..."
        mock_response = AsyncMock()
        mock_response.choices = [
            AsyncMock(message=AsyncMock(content=f'{{"action": "DENY", "domain": "數學", "refusal_message": "{refusal_msg}"}}'))
        ]
        mock_client.chat.completions.create.return_value = mock_response
        
        service = RouterService(api_key="test_key")
        result = await service.check_query_intent("1+1等於多少？")
        
        assert result["action"] == "DENY"
        assert result["refusal_message"] == refusal_msg

@pytest.mark.asyncio
async def test_router_service_fail_safe():
    # Test that the service fails safe (ALLOWs) when an error occurs
    with patch('backend.services.router_service.AsyncOpenAI') as mock_openai:
        mock_client = mock_openai.return_value
        mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API Error"))
        
        service = RouterService(api_key="test_key")
        result = await service.check_query_intent("任何問題")
        
        assert result["action"] == "ALLOW"

@pytest.mark.asyncio
async def test_router_service_reasoning_content():
    # Test fallback to reasoning_content (DeepInfra behavior)
    with patch('backend.services.router_service.AsyncOpenAI') as mock_openai:
        mock_client = mock_openai.return_value
        mock_client.chat.completions.create = AsyncMock()
        
        # Mock message with empty content but populated reasoning_content
        mock_message = AsyncMock()
        mock_message.content = ""
        mock_message.reasoning_content = '{"action": "DENY", "domain": "數學", "refusal_message": "拒絕數學問題"}'
        
        mock_response = AsyncMock()
        mock_response.choices = [
            AsyncMock(message=mock_message)
        ]
        mock_client.chat.completions.create.return_value = mock_response
        
        service = RouterService(api_key="test_key")
        result = await service.check_query_intent("x2+87+y3 = ?")
        
        assert result["action"] == "DENY"
        assert result["domain"] == "數學"
        assert result["refusal_message"] == "拒絕數學問題"
