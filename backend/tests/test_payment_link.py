import asyncio
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from services import payment_link
from services.payment_link import _yookassa_description


def test_yookassa_description_is_provider_safe_and_preserves_short_text():
    assert _yookassa_description("  Тестовый\nдоступ  ") == "Тестовый доступ"


def test_yookassa_description_is_truncated_to_provider_limit():
    description = "Тариф " + "очень " * 40

    result = _yookassa_description(description)

    assert len(result) <= 128
    assert result.endswith("…")


def test_robokassa_uses_numeric_unique_provider_order_number(monkeypatch):
    async def remember_provider_id(*_args):
        return None

    monkeypatch.setattr(payment_link, "set_client_payment_provider_id", remember_provider_id)
    client_payment = SimpleNamespace(
        id="4d0a7caf-4381-4c45-b886-12e77fb1c3b6",
        provider_order_number=987654,
    )
    bot_config = SimpleNamespace(id=18)

    url = asyncio.run(
        payment_link._create_robokassa_link(
            {
                "merchant_login": "shop",
                "password1": "password-1",
                "is_test": True,
            },
            1500,
            "Тариф",
            12345,
            bot_config,
            client_payment,
        )
    )
    query = parse_qs(urlparse(url).query)

    assert query["InvId"] == ["987654"]
    assert query["shp_client_payment_id"] == [str(client_payment.id)]
