from html import escape
from uuid import UUID

from aiogram import Router, F
from aiogram.types import (
    Message,
    CallbackQuery,
    ChatMemberUpdated,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from aiogram.filters import Command, CommandStart
from aiogram.exceptions import TelegramBadRequest

from config import MAIN_BOT_TG_ID
from database.requests import *
from keyboard.user_kb import *
from loggers import logger

# ⚡️ Подключаем наш сервис оплат
from services.payment_link import generate_payment_link
from services.funnel_message import send_funnel_node_message, to_telegram_html
from services.manager_link import build_manager_deep_link
from database.requests.client_payment_rq import create_client_payment
from database.requests.client_payment_rq import get_client_payment, list_invoice_batch
from database.requests.chat_access_rq import activate_chat_access_grant
from database.requests.connected_chat_rq import (
    upsert_connected_chat,
    delete_connected_chat,
)
from services.chat_access import apply_joined_member_access

user_bot_router = Router()
user_bot_router.message.filter(F.bot.id != MAIN_BOT_TG_ID)


@user_bot_router.my_chat_member()
async def on_my_chat_member_update(event: ChatMemberUpdated):
    """Track when the bot is added or removed from a group/channel."""
    # Check if the bot was kicked or left
    if event.new_chat_member.status in ("kicked", "left"):
        bot_config = await get_bot_by_tg_id(event.bot.id)
        if bot_config:
            await delete_connected_chat(bot_config.id, str(event.chat.id))
    elif event.new_chat_member.status in ("member", "administrator", "creator"):
        bot_config = await get_bot_by_tg_id(event.bot.id)
        if bot_config:
            if event.from_user.id != bot_config.owner.telegram_id:
                logger.warning(
                    f"Чужой пользователь {event.from_user.id} попытался добавить бота {bot_config.id} в чат {event.chat.id}. Бот покидает чат."
                )
                try:
                    await event.bot.leave_chat(event.chat.id)
                except Exception:
                    pass
                return

            await upsert_connected_chat(
                bot_id=bot_config.id,
                chat_id=str(event.chat.id),
                title=event.chat.title or "Без названия",
                chat_type=event.chat.type,
            )
            
            if event.old_chat_member.status not in ("member", "administrator", "creator"):
                try:
                    chat_type_ru = "Канал" if event.chat.type == "channel" else "Группа"
                    from aiogram import Bot
                    from aiogram.client.default import DefaultBotProperties
                    from config import MAIN_BOT_TOKEN, PROXY_URL
                    from aiogram.client.session.aiohttp import AiohttpSession
                    
                    session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else None
                    main_bot = Bot(token=MAIN_BOT_TOKEN, session=session, default=DefaultBotProperties(parse_mode="HTML"))
                    await main_bot.send_message(
                        bot_config.owner.telegram_id,
                        f"✅ {chat_type_ru} <b>{event.chat.title or 'Без названия'}</b> успешно подключён(а) к вашему боту!\n\nСинхронизация завершена. Вернитесь в Mini App, чтобы настроить выдачу доступа."
                    )
                    await main_bot.session.close()
                except Exception as e:
                    logger.warning("Не удалось отправить уведомление о подключении чата: %s", e)




@user_bot_router.chat_member()
async def apply_paid_chat_access(event: ChatMemberUpdated):
    """Bind a one-use invite to its buyer and apply the configured group profile."""
    invite = getattr(event, "invite_link", None)
    if not invite or not getattr(invite, "invite_link", None):
        return
    bot_config = await get_bot_by_tg_id(event.bot.id)
    if not bot_config:
        return
    grant = await activate_chat_access_grant(
        bot_id=bot_config.id,
        lead_telegram_id=event.new_chat_member.user.id,
        chat_id=str(event.chat.id),
        invite_link=invite.invite_link,
    )
    if not grant:
        return
    await apply_joined_member_access(
        bot=event.bot, grant=grant, user_id=event.new_chat_member.user.id
    )
    logger.info(
        "Покупатель %s вошёл в закрытый чат по выданной ссылке",
        event.new_chat_member.user.id,
    )


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
        return funnel.get_node("payment") or (
            funnel.nodes[-1] if funnel.nodes else None
        )
    if hasattr(funnel, "nodes") and isinstance(funnel.nodes, dict):
        return funnel.nodes.get("node_checkout")
    return None


def _payment_mode(funnel) -> str:
    payment_node = _get_payment_node(funnel)
    return getattr(payment_node, "payment_mode", "auto") if payment_node else "auto"


def _funnel_action_keyboard(funnel, node):
    mode = _payment_mode(funnel)
    primary_text = _get_node_button_text(node)
    secondary_text = getattr(node, "button_text2", "") or "Связаться с менеджером"
    payment_node = _get_payment_node(funnel)
    manager_url = (
        build_manager_deep_link(
            getattr(payment_node, "manager_url", ""),
            getattr(payment_node, "manager_text", ""),
        )
        if payment_node
        else None
    )
    return user_funnel_action_keyboard(mode, primary_text, secondary_text, manager_url)


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
        offer_url = offer_url or getattr(
            funnel.global_settings, "legal_offer_url", None
        )
        privacy_url = getattr(funnel.global_settings, "legal_privacy_url", None)

    has_any_url = bool(offer_url or privacy_url)

    # ПРОВЕРКА СОГЛАСИЯ:
    if (lead and lead.agreed_to_tos) or not has_any_url:
        # Если уже согласился ИЛИ ссылок нет совсем -> ведем сразу в воронку
        if not lead:
            await create_lead(
                tg_bot_id,
                lead_id,
                agreed=True,
                username=username,
                first_name=first_name,
            )
            if (
                bot_config.status == "active"
                and lead_id != bot_config.owner.telegram_id
            ):
                await increment_bot_users_count(bot_config.id)
        else:
            # Обновляем username / first_name если изменились
            await create_lead(
                tg_bot_id,
                lead_id,
                agreed=lead.agreed_to_tos,
                username=username,
                first_name=first_name,
            )

        node_start = _get_start_node(funnel)
        has_button = bool(
            getattr(node_start, "button", None)
            or getattr(node_start, "button_text", None)
        )
        await send_funnel_node_message(
            message.bot,
            message.chat.id,
            node_start,
            reply_markup=(
                _funnel_action_keyboard(funnel, node_start) if has_button else None
            ),
        )
    else:
        # Если новый или еще не согласился ПРИ НАЛИЧИИ ссылок
        if not lead:
            await create_lead(
                tg_bot_id,
                lead_id,
                agreed=False,
                username=username,
                first_name=first_name,
            )
            if (
                bot_config.status == "active"
                and lead_id != bot_config.owner.telegram_id
            ):
                await increment_bot_users_count(bot_config.id)
        else:
            await create_lead(
                tg_bot_id,
                lead_id,
                agreed=False,
                username=username,
                first_name=first_name,
            )

        links = []
        if offer_url:
            links.append(f"<a href='{offer_url}'>публичной офертой</a>")
        if privacy_url:
            links.append(f"<a href='{privacy_url}'>политикой конфиденциальности</a>")

        agreement_text = "<b>Добро пожаловать!</b>\nДля продолжения работы с ботом подтвердите свое согласие с юридическими документами."
        if hasattr(funnel, "global_settings") and getattr(
            funnel.global_settings, "agreement_text", None
        ):
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
    has_button = bool(
        getattr(node_start, "button", None) or getattr(node_start, "button_text", None)
    )

    try:
        await callback.message.edit_text(
            text="✅ Согласие подтверждено.",
            reply_markup=None,
        )
    except TelegramBadRequest:
        pass
    await send_funnel_node_message(
        callback.bot,
        callback.message.chat.id,
        node_start,
        reply_markup=(
            _funnel_action_keyboard(funnel, node_start) if has_button else None
        ),
    )


@user_bot_router.callback_query(F.data == "application")
async def process_application_button(callback: CallbackQuery):
    """Create a traceable manager request without relying on a user deep link."""
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    if (
        not bot_config
        or not funnel
        or _payment_mode(funnel) not in {"application", "hybrid"}
    ):
        await callback.answer("Этот способ связи сейчас недоступен.", show_alert=True)
        return

    payment_node = _get_payment_node(funnel)
    manager_text = (
        getattr(payment_node, "manager_text", "") or "Хочу получить консультацию."
    )
    lead_name = callback.from_user.full_name
    lead_handle = (
        f"@{callback.from_user.username}"
        if callback.from_user.username
        else f"ID: {callback.from_user.id}"
    )
    try:
        await callback.bot.send_message(
            bot_config.owner.telegram_id,
            f"📩 <b>Новая заявка в «{bot_config.display_name}»</b>\n\n"
            f"Клиент: {lead_name} ({lead_handle})\n"
            f"Telegram ID: <code>{callback.from_user.id}</code>\n\n"
            f"Текст заявки:\n{manager_text}",
        )
    except Exception as exc:
        logger.warning(
            "Не удалось отправить владельцу заявку бота %s: %s", bot_config.id, exc
        )
        await callback.answer(
            "Не удалось передать заявку. Попробуйте позже.", show_alert=True
        )
        return

    await callback.answer("Заявка отправлена")
    await callback.message.answer(
        "✅ Заявка передана владельцу. Он свяжется с вами в Telegram."
    )


async def _send_tariff_invoice(
    callback: CallbackQuery, bot_config, funnel, tariff, edit_message: bool = True
):
    """Create a YooKassa link and replace the message with an invoice."""
    try:
        await callback.answer(
            text="⏳ Формируем счёт на оплату… Пожалуйста, подождите.", show_alert=False
        )
    except Exception:
        pass
    node_checkout = _get_payment_node(funnel)
    tariff_name = str(getattr(tariff, "name", "Доступ") or "Доступ").strip()
    tariff_description = getattr(tariff, "description", "") or ""
    amount = float(getattr(tariff, "price", 0) or 0)
    message_text = _get_node_text(node_checkout) if node_checkout else ""
    button_text = (
        _get_node_button_text(node_checkout, default="🟢 Оплатить") or "🟢 Оплатить"
    )

    tariff_details = f"<b>{escape(tariff_name)}</b>"
    if tariff_description:
        tariff_details += f"\n\n{to_telegram_html(tariff_description)}"
    tariff_details += f"\n\n💳 <b>Стоимость: {amount:,.0f} ₽</b>".replace(",", " ")
    message_text = to_telegram_html(message_text)
    if message_text:
        message_text = f"{message_text}\n\n{tariff_details}"
    else:
        message_text = tariff_details

    lead = await get_lead(bot_config.id, callback.from_user.id)
    if not lead:
        error_msg = "Не удалось определить заявку. Нажмите /start и повторите попытку."
        if edit_message:
            await callback.message.edit_text(error_msg)
        else:
            await callback.message.answer(error_msg)
        return
    tariff_snapshot = (
        tariff.model_dump(by_alias=True)
        if hasattr(tariff, "model_dump")
        else dict(tariff)
    )
    client_payment = await create_client_payment(
        bot_id=bot_config.id,
        lead_id=lead.id,
        provider=bot_config.payment_provider,
        tariff=tariff_snapshot,
    )
    payment_url = await generate_payment_link(
        bot_config=bot_config,
        amount=amount,
        description=f"{tariff_name}: {tariff_description}".strip(": "),
        lead_telegram_id=callback.from_user.id,
        client_payment=client_payment,
        installments=tariff_snapshot.get("installments", False),
    )
    if not payment_url:
        error_text = "Не удалось создать ссылку на оплату. Проверьте настройки кассы и повторите попытку."
        if edit_message:
            await callback.message.edit_text(error_text)
        else:
            await callback.message.answer(error_text)
        try:
            from services.billing_notifications import notify_billing_user

            await notify_billing_user(
                bot_config.owner.telegram_id,
                f"⚠️ Не удалось сформировать счёт для лида {callback.from_user.full_name}. Проверьте реквизиты кассы в настройках бота «{bot_config.display_name}».",
            )
        except Exception as exc:
            logger.warning("Не удалось уведомить владельца о сбое счёта: %s", exc)
        return

    rows = [[InlineKeyboardButton(text=button_text, url=payment_url, style="success")]]
    if len(getattr(node_checkout, "tariffs", []) or []) > 1:
        rows.append(
            [
                InlineKeyboardButton(
                    text="← Назад к тарифам", callback_data="payment_tariffs_back"
                )
            ]
        )
    pay_keyboard = InlineKeyboardMarkup(inline_keyboard=rows)

    if edit_message:
        await _remove_callback_message(callback)
    await _send_payment_message(
        callback,
        message_text,
        pay_keyboard,
        media_type=getattr(tariff, "media_type", None),
        file_id=getattr(tariff, "media_file_id", None),
    )


async def _remove_callback_message(callback: CallbackQuery) -> None:
    """Remove a previous payment screen before rendering another message type."""
    try:
        await callback.message.delete()
    except TelegramBadRequest:
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except TelegramBadRequest:
            pass


async def _send_payment_message(
    callback: CallbackQuery,
    text: str,
    reply_markup: InlineKeyboardMarkup,
    *,
    media_type: str | None = None,
    file_id: str | None = None,
) -> None:
    """Send text/photo/video payment screens without unsupported Telegram edits."""
    chat_id = callback.message.chat.id
    if media_type == "photo" and file_id:
        await callback.bot.send_photo(
            chat_id, file_id, caption=text or "👋", reply_markup=reply_markup
        )
    elif media_type == "video" and file_id:
        await callback.bot.send_video(
            chat_id, file_id, caption=text or "👋", reply_markup=reply_markup
        )
    else:
        await callback.bot.send_message(chat_id, text or "👋", reply_markup=reply_markup)


async def _send_tariff_selection_message(callback: CallbackQuery, node_checkout, tariffs) -> None:
    selection_text = to_telegram_html(
        getattr(node_checkout, "tariff_selection_text", "")
        or "Выберите подходящий тариф:"
    )
    await _send_payment_message(
        callback,
        selection_text,
        user_tariff_keyboard(tariffs),
        media_type=getattr(node_checkout, "media_type", None),
        file_id=getattr(node_checkout, "media_file_id", None),
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

    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except TelegramBadRequest as e:
        if "message is not modified" in str(e):
            logger.info("Кнопка уже была скрыта.")
            return
        else:
            raise

    funnel = await get_funnel_by_bot_id(tg_bot_id)
    node_checkout = _get_payment_node(funnel)
    tariffs = list(getattr(node_checkout, "tariffs", []) or [])
    if not tariffs:
        await callback.message.answer(
            "Тарифы ещё не настроены. Обратитесь к владельцу бота."
        )
        return
    if len(tariffs) > 1:
        await _send_tariff_selection_message(callback, node_checkout, tariffs)
        return
    await _send_tariff_invoice(
        callback, bot_config, funnel, tariffs[0], edit_message=False
    )


@user_bot_router.callback_query(F.data.startswith("payment_tariff:"))
async def process_tariff_choice(callback: CallbackQuery):
    # We skip callback.answer() here because it is answered in _send_tariff_invoice with the alert
    # try:
    #     await callback.answer()
    # except TelegramBadRequest:
    #     pass

    bot_config = await get_bot_by_tg_id(callback.bot.id)
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    node_checkout = _get_payment_node(funnel)
    tariff_id = callback.data.split(":", 1)[1]
    tariff = next(
        (
            item
            for item in (getattr(node_checkout, "tariffs", []) or [])
            if item.id == tariff_id
        ),
        None,
    )
    if not bot_config or not funnel or not tariff:
        await callback.message.answer(
            "Тариф больше недоступен. Откройте меню оплаты заново."
        )
        return
    await _send_tariff_invoice(callback, bot_config, funnel, tariff)


@user_bot_router.callback_query(F.data == "payment_tariffs_back")
async def return_to_tariff_choices(callback: CallbackQuery):
    """Return from an automatically created invoice to the configured tariff list."""
    await callback.answer()
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    node_checkout = _get_payment_node(funnel)
    tariffs = list(getattr(node_checkout, "tariffs", []) or []) if node_checkout else []
    if len(tariffs) < 2:
        await callback.answer("Выбор тарифов больше недоступен.", show_alert=True)
        return
    await _remove_callback_message(callback)
    await _send_tariff_selection_message(callback, node_checkout, tariffs)


# ── Кнопки тарифов в рассылках: платёжный флоу, а не выдача доступа ──

async def _broadcast_payment_context(callback: CallbackQuery, bid: str):
    """Возвращает (bot_config, funnel, node_checkout, selected_tariffs) или None."""
    try:
        broadcast = await get_broadcast(UUID(bid))
    except (ValueError, TypeError):
        return None
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    if not broadcast or not bot_config or not funnel:
        return None
    node_checkout = _get_payment_node(funnel)
    tariff_ids = [str(t) for t in (broadcast.button or {}).get("tariffIds") or []]
    by_id = {str(t.id): t for t in (getattr(node_checkout, "tariffs", []) or [])}
    selected = [by_id[i] for i in tariff_ids if i in by_id]
    if not selected:
        return None
    return bot_config, funnel, node_checkout, selected


def _broadcast_tariff_selection_keyboard(bid: str, tariffs) -> InlineKeyboardMarkup:
    rows = []
    for idx, tariff in enumerate(tariffs):
        title = (getattr(tariff, "name", "Тариф") or "Тариф").strip()
        price = getattr(tariff, "price", 0)
        label = f"{title} · {price:,.0f} ₽".replace(",", " ")
        rows.append([InlineKeyboardButton(text=label[:64], callback_data=f"bc_tariff:{bid}:{idx}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _broadcast_tariff_selection_text(node_checkout, tariffs) -> str:
    header = to_telegram_html(
        getattr(node_checkout, "tariff_selection_text", "") or "Выберите подходящий тариф:"
    )
    blocks = [header] if header else ["Выберите подходящий тариф:"]
    for tariff in tariffs:
        name = escape(str(getattr(tariff, "name", "Тариф") or "Тариф"))
        price = getattr(tariff, "price", 0)
        line = f"<b>{name}</b> — {price:,.0f} ₽".replace(",", " ")
        description = to_telegram_html(getattr(tariff, "description", "") or "")
        if description:
            line += f"\n{description}"
        blocks.append(line)
    return "\n\n".join(blocks)


@user_bot_router.callback_query(F.data.startswith("bc_tariffs:"))
async def process_broadcast_tariffs(callback: CallbackQuery):
    """Кнопка «Выбрать тариф» из рассылки: один тариф — сразу счёт, несколько — выбор."""
    await callback.answer()
    bid = callback.data.split(":", 1)[1]
    context = await _broadcast_payment_context(callback, bid)
    if not context:
        await callback.message.answer(
            "Тарифы больше недоступны. Обратитесь к владельцу бота."
        )
        return
    bot_config, funnel, node_checkout, selected = context
    if len(selected) == 1:
        await _send_tariff_invoice(
            callback, bot_config, funnel, selected[0], edit_message=False
        )
        return
    await _send_payment_message(
        callback,
        _broadcast_tariff_selection_text(node_checkout, selected),
        _broadcast_tariff_selection_keyboard(bid, selected),
    )


@user_bot_router.callback_query(F.data.startswith("bc_tariff:"))
async def process_broadcast_tariff_choice(callback: CallbackQuery):
    """Выбор конкретного тарифа из рассылочного списка → счёт со ссылкой оплаты."""
    parts = callback.data.split(":")
    if len(parts) != 3:
        await callback.answer()
        return
    _, bid, idx = parts
    context = await _broadcast_payment_context(callback, bid)
    if not context:
        await callback.answer("Тариф больше недоступен.", show_alert=True)
        return
    bot_config, funnel, node_checkout, selected = context
    try:
        position = int(idx)
    except ValueError:
        await callback.answer()
        return
    if not 0 <= position < len(selected):
        await callback.answer("Тариф больше недоступен.", show_alert=True)
        return
    await _send_tariff_invoice(callback, bot_config, funnel, selected[position])


@user_bot_router.callback_query(F.data.startswith("manual_invoice:"))
async def process_manual_invoice_choice(callback: CallbackQuery):
    await callback.answer()
    payment = await get_client_payment(callback.data.split(":", 1)[1])
    if (
        not payment
        or payment.bot.tg_bot_id != callback.bot.id
        or payment.lead.telegram_id != callback.from_user.id
    ):
        await callback.message.answer(
            "Этот счёт больше недоступен. Попросите владельца выставить новый."
        )
        return
    tariff = payment.tariff_snapshot
    url = await generate_payment_link(
        payment.bot,
        float(payment.amount),
        f"{tariff.get('name', 'Тариф')}: {tariff.get('description', '')}".strip(": "),
        callback.from_user.id,
        client_payment=payment,
    )
    if not url:
        await _remove_callback_message(callback)
        await _send_payment_message(
            callback,
            "⚠️ Не удалось сформировать счёт. Попробуйте позже.",
            InlineKeyboardMarkup(inline_keyboard=[]),
        )
        return
    details = f"<b>{escape(str(tariff.get('name', 'Тариф')))}</b>"
    description = to_telegram_html(tariff.get("description", ""))
    if description:
        details += f"\n\n{description}"
    details += f"\n\n💳 <b>Стоимость: {payment.amount:,.0f} ₽</b>".replace(",", " ")
    rows = [[InlineKeyboardButton(text="Оплатить", url=url, style="success")]]
    if payment.invoice_batch_id:
        rows.append(
            [
                InlineKeyboardButton(
                    text="← Назад к выбору",
                    callback_data=f"manual_invoice_back:{payment.id}",
                )
            ]
        )
    await _remove_callback_message(callback)
    await _send_payment_message(
        callback,
        details,
        InlineKeyboardMarkup(inline_keyboard=rows),
        media_type=tariff.get("mediaType") or tariff.get("media_type"),
        file_id=tariff.get("mediaFileId") or tariff.get("media_file_id"),
    )


@user_bot_router.callback_query(F.data.startswith("manual_invoice_back:"))
async def return_to_manual_invoice_choices(callback: CallbackQuery):
    await callback.answer()
    payment = await get_client_payment(callback.data.split(":", 1)[1])
    if (
        not payment
        or payment.bot.tg_bot_id != callback.bot.id
        or payment.lead.telegram_id != callback.from_user.id
    ):
        return
    batch = await list_invoice_batch(payment)
    rows = [
        [
            InlineKeyboardButton(
                text=f"{item.tariff_snapshot.get('name', 'Тариф')} · {item.amount:,.0f} ₽".replace(
                    ",", " "
                ),
                callback_data=f"manual_invoice:{item.id}",
            )
        ]
        for item in batch
        if item.status == "pending"
    ]
    await _remove_callback_message(callback)
    await _send_payment_message(
        callback,
        "🧾 <b>Выберите товар для оплаты</b>\n\nНажмите нужный тариф.",
        InlineKeyboardMarkup(inline_keyboard=rows),
    )
