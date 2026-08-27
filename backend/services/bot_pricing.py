"""Deterministic R3 configuration quote without an unapproved price catalog."""
from dataclasses import dataclass

@dataclass(frozen=True)
class BotQuote:
    scenario_type: str
    platforms: tuple[str, ...]
    checkout_available: bool = False

class BotPricingService:
    def quote(self, scenario_type: str, platforms: set[str]) -> BotQuote:
        return BotQuote(scenario_type=scenario_type, platforms=tuple(sorted(platforms)))
