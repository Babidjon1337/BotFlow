"""Public URL separation for Telegram and payment callbacks."""

from types import SimpleNamespace

from schemas.api_schemas import BotApiResponse


def test_bot_response_keeps_telegram_and_payment_webhooks_on_separate_hosts():
    bot = SimpleNamespace(
        id=18,
        username="client_bot",
        status="active",
        users_count=0,
        offer_url=None,
        offer_installments=False,
        funnel_complete=False,
        media_sync_done=False,
        is_token_locked=False,
        payment_provider="yookassa",
        payment_creds_enc=None,
        bot_token_enc=None,
        tg_bot_id=123456,
        created_at=None,
    )

    response = BotApiResponse.from_orm_bot(
        bot,
        "https://tg.botflow.example/",
        "https://botflow.example/",
    )

    assert response.webhook_url == "https://tg.botflow.example/webhook/bots/18"
    assert (
        response.payment_webhook_url
        == "https://botflow.example/webhook/payments/yookassa/123456"
    )
