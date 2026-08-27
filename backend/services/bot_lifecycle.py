"""Compatibility lifecycle rules for bots during the R2 transition.

The module deliberately owns state validation and dual-write mapping while
leaving persistence and external effects to its callers.  That keeps legacy
routes unchanged until they can be moved to this seam one by one.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from services.funnel_readiness import FunnelReadiness, evaluate_funnel_readiness


LifecycleStatus = str
PauseReason = str

LIFECYCLE_STATUSES = frozenset({"draft", "ready", "published", "paused", "archived"})
PAUSE_REASONS = frozenset({"manual", "readiness", "subscription", "integration"})
LEGACY_STATUS_BY_LIFECYCLE = {
    "draft": "draft",
    "ready": "draft",
    "published": "active",
    "paused": "draft",
    "archived": "archived",
}
ALLOWED_TRANSITIONS = {
    "draft": frozenset({"ready", "paused", "archived"}),
    "ready": frozenset({"draft", "published", "paused", "archived"}),
    "published": frozenset({"paused", "archived"}),
    "paused": frozenset({"draft", "ready", "published", "archived"}),
    "archived": frozenset(),
}

ReadinessEvaluator = Callable[..., FunnelReadiness]
ConnectedChatIdsProvider = Callable[[Any], Awaitable[set[str]]]


class LifecycleTransitionError(ValueError):
    """Raised when a requested lifecycle transition violates its invariants."""


async def _no_connected_chats(_bot: Any) -> set[str]:
    return set()


class BotLifecycleService:
    """Apply lifecycle transitions through one compatibility-aware interface.

    `transition` mutates the supplied ORM object so its caller can persist it in
    the existing transaction.  Until legacy paths are retired, every successful
    transition dual-writes `lifecycle_status` and legacy `status`.
    """

    def __init__(
        self,
        *,
        readiness_evaluator: ReadinessEvaluator = evaluate_funnel_readiness,
        connected_chat_ids_for: ConnectedChatIdsProvider = _no_connected_chats,
    ) -> None:
        self._readiness_evaluator = readiness_evaluator
        self._connected_chat_ids_for = connected_chat_ids_for

    async def readiness(self, bot: Any) -> FunnelReadiness:
        """Evaluate server-side publishability from the stored bot configuration."""
        connected_chat_ids = await self._connected_chat_ids_for(bot)
        return self._readiness_evaluator(
            getattr(bot, "funnel_schema", None),
            has_payment_provider=bool(getattr(bot, "payment_provider", None)),
            has_payment_credentials=bool(getattr(bot, "payment_creds_enc", None)),
            connected_chat_ids=connected_chat_ids,
        )

    async def transition(
        self,
        bot: Any,
        target: LifecycleStatus,
        reason: PauseReason | None = None,
    ) -> Any:
        """Move a bot to an allowed lifecycle status and keep legacy status in sync."""
        if target not in LIFECYCLE_STATUSES:
            raise LifecycleTransitionError(f"Unknown lifecycle status: {target}")
        if target == "paused":
            if reason not in PAUSE_REASONS:
                raise LifecycleTransitionError("Paused bots require a known pause reason")
        elif reason is not None:
            raise LifecycleTransitionError("Pause reason is only valid for paused bots")

        current = self._current_status(bot)
        if target != current and target not in ALLOWED_TRANSITIONS[current]:
            raise LifecycleTransitionError(
                f"Cannot transition archived or incompatible bot from {current} to {target}"
            )

        if target in {"ready", "published"}:
            readiness = await self.readiness(bot)
            if not readiness.is_ready:
                raise LifecycleTransitionError(
                    "Bot is not ready for this lifecycle transition: "
                    + "; ".join(readiness.reasons)
                )

        bot.lifecycle_status = target
        bot.pause_reason = reason if target == "paused" else None
        bot.status = LEGACY_STATUS_BY_LIFECYCLE[target]
        return bot

    @staticmethod
    def _current_status(bot: Any) -> LifecycleStatus:
        lifecycle_status = getattr(bot, "lifecycle_status", None)
        if lifecycle_status in LIFECYCLE_STATUSES:
            return lifecycle_status

        legacy_status = getattr(bot, "status", "draft")
        if legacy_status == "active":
            return "published"
        if legacy_status == "archived":
            return "archived"
        return "ready" if getattr(bot, "funnel_complete", False) else "draft"
