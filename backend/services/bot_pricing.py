"""Deterministic R3 quote for the currently sellable BotFlow configuration.

The service deliberately does not create a checkout. It is the single
server-side source for the approved v1 price while future platforms and
scenarios remain unavailable rather than accidentally saleable.
"""

from collections.abc import Iterable
from dataclasses import dataclass


BASE_SCENARIO_TYPE = "sales_funnel"
CURRENT_PLATFORM = "telegram"
BASE_MONTHLY_PRICE_MINOR = 99_000
CURRENCY_RUB = "RUB"


class UnsupportedScenarioError(ValueError):
    """Raised when the selected scenario is not commercially available."""


class UnsupportedPlatformError(ValueError):
    """Raised when a selected platform is not commercially available."""


@dataclass(frozen=True)
class QuoteLineItem:
    code: str
    amount_minor: int


@dataclass(frozen=True)
class BotQuote:
    scenario_type: str
    platforms: tuple[str, ...]
    line_items: tuple[QuoteLineItem, ...]
    subtotal_minor: int
    total_minor: int
    currency: str = CURRENCY_RUB
    checkout_available: bool = False


class BotPricingService:
    """Quote only the current Telegram sales-funnel product.

    VK, MAX and future scenarios may be displayed as Soon by clients, but they
    must not be priced or passed to checkout until their capability exists.
    """

    def quote(self, scenario_type: str, platforms: Iterable[str]) -> BotQuote:
        if scenario_type != BASE_SCENARIO_TYPE:
            raise UnsupportedScenarioError(
                f"Scenario '{scenario_type}' is not available for purchase"
            )

        normalized_platforms = tuple(sorted(set(platforms)))
        if not normalized_platforms:
            raise UnsupportedPlatformError(
                "A published bot requires at least one platform"
            )

        unsupported = set(normalized_platforms) - {CURRENT_PLATFORM}
        if unsupported:
            names = ", ".join(sorted(unsupported))
            raise UnsupportedPlatformError(
                f"Platform '{names}' is not available for purchase"
            )

        line_items = (
            QuoteLineItem(
                code="sales_funnel_base",
                amount_minor=BASE_MONTHLY_PRICE_MINOR,
            ),
        )
        total_minor = sum(item.amount_minor for item in line_items)
        return BotQuote(
            scenario_type=scenario_type,
            platforms=normalized_platforms,
            line_items=line_items,
            subtotal_minor=total_minor,
            total_minor=total_minor,
        )
