import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.bot_pricing import (
    BotPricingService,
    UnsupportedPlatformError,
    UnsupportedScenarioError,
)


def test_sales_funnel_on_telegram_has_the_approved_monthly_quote():
    quote = BotPricingService().quote("sales_funnel", {"telegram"})

    assert quote.currency == "RUB"
    assert quote.total_minor == 99_000
    assert quote.platforms == ("telegram",)
    assert quote.line_items[0].code == "sales_funnel_base"
    assert quote.line_items[0].amount_minor == 99_000
    assert quote.checkout_available is False


@pytest.mark.parametrize("platform", ["vk", "max"])
def test_future_platforms_are_not_quoted_before_their_adapter_exists(platform):
    with pytest.raises(UnsupportedPlatformError, match="not available"):
        BotPricingService().quote("sales_funnel", {"telegram", platform})


@pytest.mark.parametrize("scenario_type", ["appointment", "mini_app", "ai_knowledge_base"])
def test_future_scenarios_are_not_quoted_before_their_capability_exists(scenario_type):
    with pytest.raises(UnsupportedScenarioError, match="not available"):
        BotPricingService().quote(scenario_type, {"telegram"})


def test_quote_requires_the_one_currently_available_platform():
    with pytest.raises(UnsupportedPlatformError, match="at least one platform"):
        BotPricingService().quote("sales_funnel", set())
