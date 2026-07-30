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


def user_funnel_action_keyboard(
    mode: str,
    primary_text: str,
    secondary_text: str = "",
    application_url: str | None = None,
) -> InlineKeyboardMarkup:
    """Render the same sales mode configured in the Mini App."""
    if mode == "application":
        return InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(
                text=primary_text,
                url=application_url,
                callback_data=None if application_url else "application",
            )]]
        )
    if mode == "hybrid":
        return InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text=primary_text, callback_data="payment")],
                [InlineKeyboardButton(
                    text=secondary_text,
                    url=application_url,
                    callback_data=None if application_url else "application",
                )],
            ]
        )
    return user_payment_button(primary_text)


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
