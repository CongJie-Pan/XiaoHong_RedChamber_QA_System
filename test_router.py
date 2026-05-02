import asyncio
from src.main.python.services.router_service import RouterService

async def main():
    service = RouterService()
    if service.client:
        print("Testing...")
        result = await service.check_query_intent("1+1=?")
        print("Result:", result)
    else:
        print("No client configured.")

asyncio.run(main())
