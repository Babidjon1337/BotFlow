"""Validation of Telegram Mini App init data.

Telegram signs every WebApp initData payload.  The user object must never be
trusted before this signature has been verified on the server.
"""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from config import MAIN_BOT_TOKEN, TELEGRAM_INIT_DATA_MAX_AGE_SECONDS


class TelegramAuthError(ValueError):
    """Raised when Telegram WebApp credentials cannot be trusted."""


@dataclass(frozen=True)
class TelegramUser:
    telegram_id: int
    first_name: str = "User"
    username: str | None = None


def validate_init_data(init_data: str) -> TelegramUser:
    """Validate Telegram ``initData`` and return its authenticated user."""
    if not init_data:
        raise TelegramAuthError("Telegram init data is required")
    if not MAIN_BOT_TOKEN:
        raise TelegramAuthError("Server Telegram token is not configured")

    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", None)
    if not received_hash:
        raise TelegramAuthError("Telegram init data signature is missing")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData", MAIN_BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    expected_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise TelegramAuthError("Telegram init data signature is invalid")

    try:
        auth_date = int(values["auth_date"])
    except (KeyError, TypeError, ValueError) as exc:
        raise TelegramAuthError("Telegram init data auth date is invalid") from exc

    current_time = time.time()
    if auth_date > current_time + 300:
        raise TelegramAuthError("Telegram init data auth date is invalid")
    if current_time - auth_date > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS:
        raise TelegramAuthError("Telegram init data has expired")

    try:
        user = json.loads(values["user"])
        telegram_id = int(user["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise TelegramAuthError("Telegram user data is invalid") from exc

    return TelegramUser(
        telegram_id=telegram_id,
        first_name=user.get("first_name") or "User",
        username=user.get("username"),
    )
