"""R3 publication entitlement scoped to a single bot."""
from datetime import datetime, timezone

class BotEntitlementService:
    def can_publish(self, subscription, now=None) -> bool:
        if subscription is None or subscription.status != "active":
            return False
        effective_now = now or datetime.now(timezone.utc)
        if effective_now.tzinfo is None:
            effective_now = effective_now.replace(tzinfo=timezone.utc)
        starts_at = getattr(subscription, "starts_at", None)
        if starts_at is not None:
            if starts_at.tzinfo is None:
                starts_at = starts_at.replace(tzinfo=timezone.utc)
            if starts_at > effective_now:
                return False
        ends_at = getattr(subscription, "ends_at", None)
        if ends_at is not None:
            if ends_at.tzinfo is None:
                ends_at = ends_at.replace(tzinfo=timezone.utc)
            return ends_at > effective_now
        return True
