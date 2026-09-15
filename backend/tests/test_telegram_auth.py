"""Unit tests for Telegram Mini App request authentication."""

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
from unittest.mock import patch

import pytest

from services import telegram_auth


BOT_TOKEN = "123456:unit-test-token"


def make_init_data(*, auth_date: int | None = None, user_id: int = 42) -> str:
    values = {
        "auth_date": str(auth_date or int(time.time())),
        "query_id": "unit-test-query",
        "user": json.dumps(
            {"id": user_id, "first_name": "Test", "username": "tester"},
            separators=(",", ":"),
        ),
    }
    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256
    ).digest()
    values["hash"] = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    return urlencode(values)


def test_validate_init_data_returns_authenticated_user():
    with patch.object(telegram_auth, "MAIN_BOT_TOKEN", BOT_TOKEN):
        user = telegram_auth.validate_init_data(make_init_data(user_id=77))

    assert user.telegram_id == 77
    assert user.username == "tester"


def test_validate_init_data_rejects_tampered_payload():
    init_data = make_init_data().replace("tester", "attacker")

    with patch.object(telegram_auth, "MAIN_BOT_TOKEN", BOT_TOKEN), pytest.raises(
        telegram_auth.TelegramAuthError, match="signature is invalid"
    ):
        telegram_auth.validate_init_data(init_data)


def test_validate_init_data_rejects_expired_payload():
    init_data = make_init_data(auth_date=int(time.time()) - 86_401)

    with patch.object(telegram_auth, "MAIN_BOT_TOKEN", BOT_TOKEN), pytest.raises(
        telegram_auth.TelegramAuthError, match="has expired"
    ):
        telegram_auth.validate_init_data(init_data)
