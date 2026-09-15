"""Unit tests for local payment-notification signature checks."""

import hashlib
import hmac
import json

import pytest

from services.payment_webhook import (
    PaymentWebhookError,
    _prodamus_signature_payload,
    _verify_prodamus,
    _verify_robokassa,
)


def test_robokassa_accepts_valid_result_signature():
    payload = {
        "OutSum": "1500.00",
        "InvId": "42",
        "Shp_telegram_id": "12345",
    }
    signature_data = "1500.00:42:password-2:Shp_telegram_id=12345"
    payload["SignatureValue"] = hashlib.md5(signature_data.encode()).hexdigest()

    payment = _verify_robokassa({"password2": "password-2"}, payload)

    assert payment.telegram_id == 12345
    assert payment.payment_id == "42"


def test_robokassa_rejects_tampered_notification():
    payload = {
        "OutSum": "1.00",
        "InvId": "42",
        "Shp_telegram_id": "12345",
        "SignatureValue": "invalid",
    }

    with pytest.raises(PaymentWebhookError, match="signature is invalid"):
        _verify_robokassa({"password2": "password-2"}, payload)


def test_robokassa_supports_configured_sha256_signature():
    payload = {
        "OutSum": "1500.00",
        "InvId": "42",
        "Shp_telegram_id": "12345",
    }
    payload["SignatureValue"] = hashlib.sha256(
        b"1500.00:42:password-2:Shp_telegram_id=12345"
    ).hexdigest()

    payment = _verify_robokassa(
        {"password2": "password-2", "hash_algorithm": "sha256"}, payload
    )

    assert payment.payment_id == "42"


def test_prodamus_accepts_valid_signature_header():
    payload = {"payment_status": "success", "order_num": "12345_678"}
    serialized = json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )
    signature = hmac.new(
        b"webhook-secret", serialized.encode(), hashlib.sha256
    ).hexdigest()

    payment = _verify_prodamus(
        {"webhook_secret": "webhook-secret"}, payload, {"signature": signature}
    )

    assert payment.telegram_id == 12345
    assert payment.payment_id == "12345_678"


def test_prodamus_signature_uses_official_escaped_slash_canonicalization():
    payload = {
        "payment_status": "success",
        "order_num": "42",
        "url": "https://example.com/order/42",
    }
    serialized = _prodamus_signature_payload(payload)
    signature = hmac.new(
        b"webhook-secret", serialized.encode(), hashlib.sha256
    ).hexdigest()

    payment = _verify_prodamus(
        {"webhook_secret": "webhook-secret"},
        payload,
        {"Sign": signature},
    )

    assert "\\/" in serialized
    assert payment.payment_id == "42"


def test_robokassa_returns_trusted_local_order_data():
    local_id = "4d0a7caf-4381-4c45-b886-12e77fb1c3b6"
    payload = {
        "OutSum": "1500.000000",
        "InvId": "42",
        "Shp_bot_id": "18",
        "Shp_client_payment_id": local_id,
        "Shp_telegram_id": "12345",
    }
    custom = ":".join(
        f"{key}={payload[key]}"
        for key in sorted((key for key in payload if key.startswith("Shp_")), key=str.casefold)
    )
    payload["SignatureValue"] = hashlib.md5(
        f"1500.000000:42:password-2:{custom}".encode()
    ).hexdigest()

    payment = _verify_robokassa(
        {"password2": "password-2"},
        payload,
        type("BotConfig", (), {"id": 18})(),
    )

    assert str(payment.client_payment_id) == local_id
    assert payment.amount == pytest.approx(1500)
    assert payment.currency == "RUB"
