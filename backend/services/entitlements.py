"""Rules for permanent bot licenses and temporary PRO access."""

from datetime import datetime, timezone


PRO_BOT_LIMIT = 10
FREE_ACTIVE_BOT_LIMIT = 1


def is_pro_active(user, now: datetime | None = None) -> bool:
    current_time = now or datetime.now(timezone.utc)
    if user.subscription_ends_at and user.subscription_ends_at > current_time:
        return True
    return bool(
        user.subscription_auto_renew
        and user.subscription_grace_until
        and user.subscription_grace_until > current_time
    )


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
