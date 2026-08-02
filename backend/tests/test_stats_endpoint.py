"""Contract tests for trusted dashboard statistics."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import api_router


def test_stats_endpoint_returns_exact_aggregates_without_fake_history(monkeypatch):
    """The API must not invent daily points when no time-series is stored."""
    leads = [
        SimpleNamespace(current_step_id="node_start"),
        SimpleNamespace(current_step_id="offer"),
        SimpleNamespace(current_step_id="push1"),
    ]
    monkeypatch.setattr(api_router, "get_owned_bot", AsyncMock())
    monkeypatch.setattr(
        api_router,
        "get_leads_by_bot_id",
        AsyncMock(return_value=(leads, 3)),
    )
    monkeypatch.setattr(
        api_router,
        "get_client_payment_stats",
        AsyncMock(return_value=(1, 1500)),
    )

    response = asyncio.run(api_router.get_bot_stats_endpoint(18, object()))

    assert response["views"] == 3
    assert response["clicks"] == 2
    assert response["sales"] == 1
    assert response["revenue"] == 1500
    assert response["conversion"] == 33.3
    assert response["chart_data"] == []
