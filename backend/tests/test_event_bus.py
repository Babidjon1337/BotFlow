import asyncio
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
import pytest
from services.event_bus import EventBus


def test_event_bus_subscribe_and_publish():
    async def _test():
        bus = EventBus()
        queue = await bus.subscribe(12345)

        delivered = bus.publish_user(12345, "test:event", {"foo": "bar"})
        assert delivered == 1

        event = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert event["type"] == "test:event"
        assert event["data"] == {"foo": "bar"}

        await bus.unsubscribe(12345, queue)
        assert bus.publish_user(12345, "test:event2", {}) == 0

    asyncio.run(_test())


def test_event_bus_multiple_tabs():
    async def _test():
        bus = EventBus()
        q1 = await bus.subscribe(100)
        q2 = await bus.subscribe(100)

        delivered = bus.publish_user(100, "tab:event", {"msg": "hello"})
        assert delivered == 2

        e1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        e2 = await asyncio.wait_for(q2.get(), timeout=1.0)
        assert e1["data"]["msg"] == "hello"
        assert e2["data"]["msg"] == "hello"

        await bus.unsubscribe(100, q1)
        # q2 is still active
        delivered = bus.publish_user(100, "tab:event", {"msg": "world"})
        assert delivered == 1
        e2_next = await asyncio.wait_for(q2.get(), timeout=1.0)
        assert e2_next["data"]["msg"] == "world"

        await bus.unsubscribe(100, q2)

    asyncio.run(_test())


def test_event_bus_publish_bot():
    async def _test():
        bus = EventBus()
        queue = await bus.subscribe(777)

        mock_bot = SimpleNamespace(
            id=42,
            owner=SimpleNamespace(telegram_id=777),
        )

        with patch("database.requests.bot_rq.get_bot_by_id", AsyncMock(return_value=mock_bot)):
            delivered = await bus.publish_bot(42, "bot:updated", {"active": True})
            assert delivered == 1

        event = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert event["type"] == "bot:updated"
        assert event["data"] == {"active": True}

        await bus.unsubscribe(777, queue)

    asyncio.run(_test())
