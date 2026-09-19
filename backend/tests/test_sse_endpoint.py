import asyncio
from unittest.mock import AsyncMock, patch
from starlette.requests import Request
import api_router
from services.event_bus import event_bus
from services.telegram_auth import TelegramUser


def test_sse_endpoint_streams_events():
    async def _test():
        mock_user = TelegramUser(telegram_id=9999)
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/events",
            "headers": [],
            "query_string": b"",
        }
        request = Request(scope)

        with patch("api_router.get_current_user", AsyncMock(return_value=mock_user)):
            response = await api_router.sse_events_endpoint(request)
            assert response.media_type == "text/event-stream"
            assert response.headers["Cache-Control"] == "no-cache, no-transform"
            assert response.headers["X-Accel-Buffering"] == "no"

            gen = response.body_iterator
            first = await anext(gen)
            assert "event: connected" in first

            # Publish event to user
            delivered = event_bus.publish_user(9999, "test:ping", {"hello": "world"})
            assert delivered == 1
            second = await anext(gen)
            assert "event: test:ping" in second
            assert '"hello": "world"' in second

            # Clean up generator
    asyncio.run(_test())


def test_sse_endpoint_accepts_post():
    async def _test():
        mock_user = TelegramUser(telegram_id=9999)
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/events",
            "headers": [(b"content-type", b"application/json")],
            "query_string": b"",
        }
        request = Request(scope)

        with patch("api_router.get_current_user", AsyncMock(return_value=mock_user)):
            response = await api_router.sse_events_endpoint(request)
            assert response.media_type == "text/event-stream"
            gen = response.body_iterator
            first = await anext(gen)
            assert "event: connected" in first
            await gen.aclose()

    asyncio.run(_test())
