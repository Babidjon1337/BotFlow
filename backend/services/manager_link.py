"""Telegram deep links for application and hybrid sales funnels."""

from __future__ import annotations

import re
from urllib.parse import quote, urlparse


_USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{4,31}$")
_TELEGRAM_HOSTS = {"t.me", "www.t.me", "telegram.me", "www.telegram.me"}


def extract_telegram_username(value: str | None) -> str | None:
    """Accept @username, username or a public t.me username URL only."""
    candidate = (value or "").strip()
    if not candidate:
        return None
    if candidate.startswith("@"):
        candidate = candidate[1:]
    elif "://" in candidate:
        parsed = urlparse(candidate)
        if parsed.hostname not in _TELEGRAM_HOSTS:
            return None
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) != 1:
            return None
        candidate = parts[0]
    return candidate if _USERNAME_RE.fullmatch(candidate) else None


def build_manager_deep_link(manager_url: str | None, draft_text: str | None) -> str | None:
    """Build the documented public-username link with a prefilled draft."""
    username = extract_telegram_username(manager_url)
    text = (draft_text or "").strip()
    if not username or not text:
        return None
    return f"https://t.me/{username}?text={quote(text, safe='')}"
