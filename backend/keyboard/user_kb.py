from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


def user_payment_button(text: str = "💳 Оплатить доступ"):
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=text,
                    callback_data="payment",
                )
            ]
        ]
    )


def user_tariff_keyboard(tariffs):
    """Build tariff choices for a V2 payment node."""
    rows = []
    for tariff in tariffs:
        title = (getattr(tariff, "name", "Тариф") or "Тариф").strip()
        price = getattr(tariff, "price", 0)
        tariff_id = getattr(tariff, "id", None)
        if not tariff_id:
            continue
        label = f"{title} · {price:,.0f} ₽".replace(",", " ")
        rows.append([InlineKeyboardButton(text=label[:64], callback_data=f"payment_tariff:{tariff_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def user_agreement_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Я согласен с офертой",
                    callback_data="agree_tos",
                )
            ]
        ]
    )
