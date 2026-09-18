"""Rules for permanent bot licenses and temporary PRO access."""

from datetime import datetime, timezone


PRO_BOT_LIMIT = 10
FREE_ACTIVE_BOT_LIMIT = 1


def is_user_vip(user, now: datetime | None = None) -> tuple[bool, str, datetime | None]:
    """Returns (is_vip: bool, vip_type: 'permanent' | 'period' | 'none', vip_ends_at: datetime | None)."""
    if getattr(user, "is_vip_permanent", False):
        return True, "permanent", None
    current_time = now or datetime.now(timezone.utc)
    ends_at = getattr(user, "subscription_ends_at", None)
    if ends_at and ends_at > current_time:
        return True, "period", ends_at
    if (
        getattr(user, "subscription_auto_renew", False)
        and getattr(user, "subscription_grace_until", None)
        and user.subscription_grace_until > current_time
    ):
        return True, "period", user.subscription_grace_until
    return False, "none", None


def is_pro_active(user, now: datetime | None = None) -> bool:
    is_vip, _, _ = is_user_vip(user, now=now)
    return is_vip


def available_lifetime_licenses(user, bots) -> int:
    used_licenses = sum(1 for bot in bots if bot.has_lifetime_license)
    return max(user.lifetime_slots - used_licenses, 0)


def can_start_bot(user, bot, bots) -> bool:
    if is_pro_active(user):
        return True
    if not bot.has_lifetime_license:
        return False
    active_licensed_bots = sum(
        1
        for item in bots
        if item.status == "active" and item.has_lifetime_license and item.id != bot.id
    )
    return active_licensed_bots < FREE_ACTIVE_BOT_LIMIT
