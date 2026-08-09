from services.funnel_readiness import evaluate_funnel_readiness


def _ready_funnel():
    return {
        "version": 2,
        "nodes": [
            {"id": "start", "content": "Старт", "buttonText": "Купить"},
            {"id": "push1", "content": "Дожим 1", "buttonText": "Купить"},
            {"id": "push2", "content": "Дожим 2", "buttonText": "Купить"},
            {
                "id": "payment",
                "paymentMode": "auto",
                "tariffs": [
                    {
                        "id": "basic",
                        "name": "Базовый",
                        "price": 1000,
                        "description": "Доступ",
                        "actionData": "https://example.com/access",
                    }
                ],
            },
        ],
    }


def test_complete_auto_funnel_is_ready_with_payment_configuration():
    result = evaluate_funnel_readiness(
        _ready_funnel(), has_payment_provider=True, has_payment_credentials=True
    )

    assert result.is_ready
    assert result.reasons == ()


def test_payment_configuration_is_required_for_public_launch():
    result = evaluate_funnel_readiness(
        _ready_funnel(), has_payment_provider=False, has_payment_credentials=False
    )

    assert not result.is_ready
    assert "Подключите платёжную систему." in result.reasons


def test_hybrid_requires_second_buttons_and_manager_text():
    funnel = _ready_funnel()
    funnel["nodes"][-1]["paymentMode"] = "hybrid"

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=True, has_payment_credentials=True
    )

    assert not result.is_ready
    assert "Добавьте текст для обращения к менеджеру." in result.reasons
    assert "В гибридном режиме заполните вторую кнопку каждого сообщения." in result.reasons


def test_application_funnel_does_not_require_payment_provider():
    funnel = _ready_funnel()
    payment = funnel["nodes"][-1]
    payment["paymentMode"] = "application"
    payment["managerText"] = "Хочу консультацию"
    payment["managerUrl"] = "@sales_manager"

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=False, has_payment_credentials=False
    )

    assert result.is_ready


def test_media_message_must_fit_telegram_caption_limit():
    funnel = _ready_funnel()
    funnel["nodes"][0].update(
        {"media": True, "mediaFileId": "telegram-file", "content": "a" * 1025}
    )

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=True, has_payment_credentials=True
    )

    assert not result.is_ready
    assert "Сократите подпись с медиа блока «Старт» до 1024 символов." in result.reasons


def test_tariff_description_must_fit_invoice_message_limit():
    funnel = _ready_funnel()
    funnel["nodes"][-1]["tariffs"][0]["description"] = "a" * 3001

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=True, has_payment_credentials=True
    )

    assert not result.is_ready
    assert "Сократите описание: тариф 1 до 3000 символов." in result.reasons


def test_combined_invoice_text_must_fit_telegram_message_limit():
    funnel = _ready_funnel()
    payment = funnel["nodes"][-1]
    payment["content"] = "a" * 1500
    payment["tariffs"][0]["description"] = "b" * 3000

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=True, has_payment_credentials=True
    )

    assert not result.is_ready
    assert any("не помещается в сообщение Telegram" in reason for reason in result.reasons)


def test_tariff_selection_with_media_must_fit_caption_limit():
    funnel = _ready_funnel()
    payment = funnel["nodes"][-1]
    payment["tariffs"].append({
        "id": "pro", "name": "PRO", "price": 2000, "description": "Доступ",
        "actionData": "https://example.com/pro",
    })
    payment.update({"mediaFileId": "selection-photo", "tariffSelectionText": "a" * 1025})

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=True, has_payment_credentials=True
    )

    assert not result.is_ready
    assert "Сократите текст выбора тарифов до 1024 символов." in result.reasons


def test_tariff_invoice_with_media_must_fit_caption_limit():
    funnel = _ready_funnel()
    tariff = funnel["nodes"][-1]["tariffs"][0]
    tariff.update({"mediaFileId": "invoice-photo", "description": "a" * 1100})

    result = evaluate_funnel_readiness(
        funnel, has_payment_provider=True, has_payment_credentials=True
    )

    assert not result.is_ready
    assert any("не помещается в сообщение Telegram" in reason for reason in result.reasons)
