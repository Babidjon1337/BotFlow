"""R3 publication entitlement scoped to a single bot."""
from datetime import datetime, timezone

class BotEntitlementService:
    def can_publish(self, subscription, now=None) -> bool:
        if subscription is None or subscription.status != "active":
            return False
        return subscription.ends_at is None or subscription.ends_at > (now or datetime.now(timezone.utc))
