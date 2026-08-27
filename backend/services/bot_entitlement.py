"""R3 publication entitlement scoped to a single bot."""
from datetime import datetime, timezone

class BotEntitlementService:
    def can_publish(self, subscription, now=None) -> bool:
        if subscription is None or subscription.status != "active":
            return False
        effective_now = now or datetime.now(timezone.utc)
        starts_at = getattr(subscription, "starts_at", None)
        if starts_at is not None and starts_at > effective_now:
            return False
        ends_at = getattr(subscription, "ends_at", None)
        return ends_at is None or ends_at > effective_now
