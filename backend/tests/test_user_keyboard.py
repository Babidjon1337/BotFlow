from types import SimpleNamespace

from keyboard.user_kb import user_funnel_action_keyboard, user_tariff_keyboard


def test_hybrid_keyboard_has_purchase_and_application_actions():
    keyboard = user_funnel_action_keyboard(
        "hybrid", "Купить", "Написать", "https://t.me/manager?text=Здравствуйте"
    )
    buttons = [row[0] for row in keyboard.inline_keyboard]

    assert buttons[0].callback_data == "payment"
    assert buttons[1].url == "https://t.me/manager?text=Здравствуйте"


def test_application_keyboard_only_creates_application():
    keyboard = user_funnel_action_keyboard(
        "application", "Оставить заявку", application_url="https://t.me/manager?text=Здравствуйте"
    )

    assert keyboard.inline_keyboard[0][0].url == "https://t.me/manager?text=Здравствуйте"


def test_tariff_keyboard_can_include_return_action():
    tariffs = [
        SimpleNamespace(id="base", name="Базовый", price=990),
        SimpleNamespace(id="pro", name="Про", price=1990),
    ]

    keyboard = user_tariff_keyboard(tariffs, include_back=True)

    assert keyboard.inline_keyboard[-1][0].callback_data == "payment_tariffs_back"
