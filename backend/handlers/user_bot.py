from aiogram import Router, F
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from aiogram.filters import CommandStart
from aiogram.exceptions import TelegramBadRequest

from config import MAIN_BOT_TG_ID
from database.requests import *
from keyboard.user_kb import *
from loggers import logger

# ⚡️ Подключаем наш сервис оплат
from services.payment_link import generate_payment_link

user_bot_router = Router()
user_bot_router.message.filter(F.bot.id != MAIN_BOT_TG_ID)


def _get_node_text(node) -> str:
    if not node:
        return "👋 Добро пожаловать!"
    if isinstance(getattr(node, "content", None), str):
        return node.content
    if hasattr(node, "content") and hasattr(node.content, "text"):
        return node.content.text
    return "👋 Добро пожаловать!"


def _get_node_button_text(node, default="💳 Оплатить доступ") -> str:
    if not node:
        return default
    if getattr(node, "button_text", None):
        return node.button_text
    if hasattr(node, "button") and node.button and getattr(node.button, "text", None):
        return node.button.text
    return default


def _get_start_node(funnel):
    if not funnel:
        return None
    if hasattr(funnel, "get_node"):
        return funnel.get_node("start") or (funnel.nodes[0] if funnel.nodes else None)
    if hasattr(funnel, "nodes") and isinstance(funnel.nodes, dict):
        return funnel.nodes.get("node_start")
    return None


def _get_payment_node(funnel):
    if not funnel:
        return None
    if hasattr(funnel, "get_node"):
        return funnel.get_node("payment") or (funnel.nodes[-1] if funnel.nodes else None)
    if hasattr(funnel, "nodes") and isinstance(funnel.nodes, dict):
        return funnel.nodes.get("node_checkout")
    return None


@user_bot_router.message(CommandStart())
async def start_command_handler(message: Message):
    tg_bot_id = message.bot.id
    lead_id = message.from_user.id
    username = message.from_user.username
    first_name = message.from_user.first_name

    bot_config = await get_bot_by_tg_id(tg_bot_id)
    funnel = await get_funnel_by_bot_id(tg_bot_id)

    if not funnel or not bot_config:
        logger.info(f"Воронка для бота {tg_bot_id} не найдена в БД!")
        return

    if bot_config.status == "archived":
        return

    if lead_id == bot_config.owner.telegram_id:
        if getattr(bot_config, "media_sync_done", False) == False:
            from database.requests.bot_rq import set_media_sync_done
            await set_media_sync_done(bot_config.id, True)
            await message.answer(
                "🎉 <b>Поздравляем с созданием бота!</b>\n\n"
                "✅ Синхронизация прошла успешно.\n\n"
                "Осталось совсем немного: возвращайтесь в панель управления, настройте воронку и нажмите кнопку <b>Запустить</b>! 🚀"
            )
            return

    if bot_config.status == "draft":
        if lead_id != bot_config.owner.telegram_id:
            await message.answer("🛠 Бот находится в режиме разработки.")
        return

    from database.requests.user_rq import get_lead
    lead = await get_lead(bot_config.id, lead_id)

    # Логика наличия ссылок (в V2 ссылки на оферту в bot_config, в V1 в funnel.global_settings)
    offer_url = getattr(bot_config, "offer_url", None)
    privacy_url = None
    if hasattr(funnel, "global_settings"):
        offer_url = offer_url or getattr(funnel.global_settings, "legal_offer_url", None)
        privacy_url = getattr(funnel.global_settings, "legal_privacy_url", None)

    has_any_url = bool(offer_url or privacy_url)

    # ПРОВЕРКА СОГЛАСИЯ:
    if (lead and lead.agreed_to_tos) or not has_any_url:
        # Если уже согласился ИЛИ ссылок нет совсем -> ведем сразу в воронку
        if not lead:
            await create_lead(
                tg_bot_id, lead_id, agreed=True, username=username, first_name=first_name
            )
            if bot_config.status == "active" and lead_id != bot_config.owner.telegram_id:
                await increment_bot_users_count(bot_config.id)
        else:
            # Обновляем username / first_name если изменились
            await create_lead(
                tg_bot_id, lead_id, agreed=lead.agreed_to_tos, username=username, first_name=first_name
            )

        node_start = _get_start_node(funnel)
        text_to_send = _get_node_text(node_start)
        button_text = _get_node_button_text(node_start)
        has_button = bool(getattr(node_start, "button", None) or getattr(node_start, "button_text", None))

        await message.answer(
            text_to_send,
            reply_markup=user_payment_button(button_text) if has_button else None,
        )
    else:
        # Если новый или еще не согласился ПРИ НАЛИЧИИ ссылок
        if not lead:
            await create_lead(
                tg_bot_id, lead_id, agreed=False, username=username, first_name=first_name
            )
            if bot_config.status == "active" and lead_id != bot_config.owner.telegram_id:
                await increment_bot_users_count(bot_config.id)
        else:
            await create_lead(
                tg_bot_id, lead_id, agreed=False, username=username, first_name=first_name
            )

        links = []
        if offer_url:
            links.append(f"<a href='{offer_url}'>публичной офертой</a>")
        if privacy_url:
            links.append(f"<a href='{privacy_url}'>политикой конфиденциальности</a>")

        agreement_text = "<b>Добро пожаловать!</b>\nДля продолжения работы с ботом подтвердите свое согласие с юридическими документами."
        if hasattr(funnel, "global_settings") and getattr(funnel.global_settings, "agreement_text", None):
            agreement_text = funnel.global_settings.agreement_text

        if links:
            agreement_text += "\n\n" + "\n".join(links)

        await message.answer(
            agreement_text,
            reply_markup=user_agreement_keyboard(),
            disable_web_page_preview=True,
        )


@user_bot_router.callback_query(F.data == "agree_tos")
async def process_agreement(callback: CallbackQuery):
    try:
        await callback.answer("Принято!")
    except TelegramBadRequest:
        pass

    tg_bot_id = callback.bot.id
    lead_id = callback.from_user.id

    await update_lead_agreement(tg_bot_id, lead_id)

    funnel = await get_funnel_by_bot_id(tg_bot_id)
    if not funnel:
        return

    node_start = _get_start_node(funnel)
    text_to_send = _get_node_text(node_start)
    button_text = _get_node_button_text(node_start)
    has_button = bool(getattr(node_start, "button", None) or getattr(node_start, "button_text", None))

    try:
        await callback.message.edit_text(
            text=text_to_send,
            reply_markup=user_payment_button(button_text) if has_button else None,
        )
    except TelegramBadRequest:
        await callback.message.answer(
            text=text_to_send,
            reply_markup=user_payment_button(button_text) if has_button else None,
        )


@user_bot_router.callback_query(F.data == "payment")
async def process_payment_button(callback: CallbackQuery):
    try:
        await callback.answer()
    except TelegramBadRequest as e:
        if "query is too old" in str(e):
            return
        raise

    tg_bot_id = callback.bot.id
    lead_id = callback.from_user.id

    bot_config = await get_bot_by_tg_id(tg_bot_id)
    if not bot_config:
        return

    from database.requests.user_rq import get_lead
    lead = await get_lead(bot_config.id, lead_id)

    if lead and (lead.has_purchased or lead.current_step_id == "node_success"):
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
            await callback.message.answer("Оплата по этому заказу уже получена. Спасибо!")
        except TelegramBadRequest:
            pass
        return

    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except TelegramBadRequest as e:
        if "message is not modified" in str(e):
            logger.info("Кнопка уже была скрыта.")
            return
        else:
            raise

    loading_message = await callback.message.answer(
        text="⏳ <b>Информационная система формирует счет на оплату...</b>\n<i>Пожалуйста, подождите несколько секунд.</i>"
    )

    funnel = await get_funnel_by_bot_id(tg_bot_id)
    node_checkout = _get_payment_node(funnel)
    message_text = _get_node_text(node_checkout) if node_checkout else "<b>Ваш счет готов!</b>\nНажмите кнопку ниже для оплаты:"
    button_text = _get_node_button_text(node_checkout, default="💸 Оплатить")

    amount = 1500.0
    if hasattr(funnel, "global_settings") and getattr(funnel.global_settings, "payment_amount", None):
        amount = funnel.global_settings.payment_amount
    elif hasattr(node_checkout, "tariffs") and node_checkout.tariffs:
        amount = node_checkout.tariffs[0].price

    payment_url = None
    if bot_config and funnel:
        payment_url = await generate_payment_link(
            bot_config=bot_config,
            amount=amount,
            description="Оплата доступа",
            lead_telegram_id=lead_id,
        )

    if not payment_url:
        payment_url = "https://yookassa.ru"
        logger.warning(
            f"Касса для бота {tg_bot_id} не настроена или недоступна, выдана ссылка-заглушка."
        )

    pay_keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=button_text, url=payment_url)]]
    )

    try:
        await loading_message.edit_text(
            text=message_text,
            reply_markup=pay_keyboard,
        )
    except TelegramBadRequest as e:
        if "message is not modified" in str(e):
            pass
        else:
            raise
