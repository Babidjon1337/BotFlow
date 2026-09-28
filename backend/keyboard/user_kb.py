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


import re


def format_period_suffix(period: str | None) -> str:
    """Format recurring period as concise Telegram button suffix."""
    if not period:
        return "/ мес"
    p = str(period).lower().strip()
    if p in ("1_week", "week", "1 week", "7_days", "7 days", "1 нед", "1 неделя"):
        return "/ нед"
    elif p in ("1_month", "month", "1 month", "30_days", "30 days", "1 мес", "1 месяц"):
        return "/ мес"
    elif p in ("3_months", "3months", "3 months", "90_days", "90 days", "3 мес", "3 месяца"):
        return "/ 3 мес"
    elif p in ("1_year", "year", "1 year", "365_days", "1 год", "год"):
        return "/ год"

    nums = re.findall(r"\d+", p)
    val = nums[0] if nums else "1"
    if any(k in p for k in ("day", "дн", "ден", "d")):
        return f"/ {val} дн"
    elif any(k in p for k in ("week", "нед", "w")):
        return f"/ {val} нед"
    elif any(k in p for k in ("month", "мес", "m")):
        return f"/ {val} мес"
    elif any(k in p for k in ("year", "год", "лет", "y")):
        return f"/ {val} г"
    return "/ мес"


def user_tariff_keyboard(tariffs, *, include_back: bool = False):
    """Build tariff choices for a V2 payment node."""
    rows = []
    for tariff in tariffs:
        title = (getattr(tariff, "name", "Тариф") or "Тариф").strip()
        price = getattr(tariff, "price", 0)
        tariff_id = getattr(tariff, "id", None)
        if not tariff_id:
            continue
        try:
            num_price = float(price or 0)
        except (ValueError, TypeError):
            num_price = 0

        is_sub = (
            getattr(tariff, "installments", False)
            or getattr(tariff, "payment_type", "") == "recurring"
            or getattr(tariff, "paymentType", "") == "recurring"
        )
        period = (
            getattr(tariff, "recurring_period", None)
            or getattr(tariff, "recurringPeriod", None)
        )
        sub_suffix = f" {format_period_suffix(period)}" if is_sub else ""

        if num_price > 0:
            label = f"{title} · {num_price:,.0f} ₽{sub_suffix}".replace(",", " ")
        else:
            label = f"{title} · Бесплатно"
        rows.append([InlineKeyboardButton(text=label[:64], callback_data=f"payment_tariff:{tariff_id}")])
    if include_back:
        rows.append([InlineKeyboardButton(text="← Назад", callback_data="payment_tariffs_back")])
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
