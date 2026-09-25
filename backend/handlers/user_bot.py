import asyncio
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
from aiogram.filters import Command, CommandStart, CommandObject
from aiogram.exceptions import TelegramBadRequest

from services.media_upload_session import (
    get_upload_session,
    get_active_session_for_user_bot,
    cancel_upload_session,
    complete_upload_session,
)


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
async def start_command_handler(message: Message, command: CommandObject | None = None):
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

    # Проверяем deep link загрузки большого медиа для владельца бота
    if command and command.args and command.args.startswith("up_"):
        if lead_id == bot_config.owner.telegram_id:
            session_token = command.args.removeprefix("up_")
            session = get_upload_session(session_token)
            if session and session.owner_tg_id == lead_id and session.tg_bot_id == tg_bot_id:
                text = (
                    f"Отправьте фото или видео для блока “{session.node_title}”.\n"
                    "Можно отправить несколько файлов подряд."
                )
                kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [InlineKeyboardButton(text="Отмена", callback_data=f"cancel_upload:{session.id}")]
                    ]
                )
                sent = await message.answer(text, reply_markup=kb)
                session.prompt_message_id = sent.message_id
                return

    from config import ADMIN_TELEGRAM_IDS
    is_owner_or_admin = (lead_id == bot_config.owner.telegram_id) or (lead_id in ADMIN_TELEGRAM_IDS)
    if is_owner_or_admin:
        if getattr(bot_config, "media_sync_done", False) == False:
            from database.requests.bot_rq import set_media_sync_done
            from services.event_bus import event_bus

            await set_media_sync_done(bot_config.id, True)
            event_bus.publish_user(
                bot_config.owner.telegram_id,
                "bot:media_sync_done",
                {"botId": bot_config.id, "mediaSyncDone": True},
            )
            if lead_id != bot_config.owner.telegram_id:
                event_bus.publish_user(
                    lead_id,
                    "bot:media_sync_done",
                    {"botId": bot_config.id, "mediaSyncDone": True},
                )
            await message.answer(
                "🎉 <b>Поздравляем с созданием бота!</b>\n\n"
                "✅ Синхронизация прошла успешно.\n\n"
                "Осталось совсем немного: возвращайтесь в панель управления, настройте воронку и нажмите кнопку <b>Запустить</b>! 🚀"
            )
            return

    if bot_config.status == "draft":
        if not is_owner_or_admin:
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


@user_bot_router.callback_query(F.data.startswith("cancel_upload:"))
async def on_cancel_upload_callback(callback: CallbackQuery):
    session_id = callback.data.removeprefix("cancel_upload:")
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    if not bot_config or callback.from_user.id != bot_config.owner.telegram_id:
        await callback.answer("Действие недоступно", show_alert=True)
        return

    session = get_upload_session(session_id)
    cancel_upload_session(session_id)
    if session:
        from services.event_bus import event_bus
        event_bus.publish_user(
            session.owner_tg_id,
            "media:upload_cancelled",
            {"botId": session.bot_id, "sessionId": session.id, "nodeId": session.node_id, "isCancelled": True},
        )
    try:
        await callback.message.delete()
    except Exception:
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass
    await callback.answer("Загрузка отменена")


async def _finalize_large_upload_after_delay(session_id: str, bot, chat_id: int):
    try:
        # Ждём 3 секунды на случай отправки альбома или нескольких файлов подряд
        await asyncio.sleep(3.0)
        session = get_upload_session(session_id)
        if not session or session.is_cancelled or session.is_completed:
            return

        session.is_completed = True
        from services.event_bus import event_bus
        event_bus.publish_user(
            session.owner_tg_id,
            "media:upload_completed",
            {
                "botId": session.bot_id,
                "sessionId": session.id,
                "nodeId": session.node_id,
                "mediaAssets": session.media_assets,
                "isCompleted": True,
            },
        )

        done_msg = None
        try:
            done_msg = await bot.send_message(
                chat_id,
                "Готово. Все файлы загружены.\nСообщения будут удалены через 5 секунд.",
            )
        except Exception as e:
            logger.warning("Не удалось отправить сообщение о завершении загрузки: %s", e)

        # Ждём 5 секунд по ТЗ
        await asyncio.sleep(5.0)

        # Удаляем отправленные пользователем медиафайлы, чтобы чат не засорялся
        for msg_id in session.user_media_message_ids:
            try:
                await bot.delete_message(chat_id, msg_id)
            except Exception:
                pass

        # Удаляем стартовое сообщение-инструкцию с кнопкой «Отмена»
        if session.prompt_message_id:
            try:
                await bot.delete_message(chat_id, session.prompt_message_id)
            except Exception:
                pass

        # Удаляем сообщение о готовности
        if done_msg:
            try:
                await bot.delete_message(chat_id, done_msg.message_id)
            except Exception:
                pass

        complete_upload_session(session_id)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.warning("Ошибка при финализации сессии загрузки %s: %s", session_id, e)


@user_bot_router.message(F.photo | F.video | F.document)
async def on_owner_media_message(message: Message):
    bot_config = await get_bot_by_tg_id(message.bot.id)
    if not bot_config or message.from_user.id != bot_config.owner.telegram_id:
        return

    session = get_active_session_for_user_bot(message.from_user.id, message.bot.id)
    if not session or session.is_cancelled or session.is_completed:
        return

    telegram_file_id = None
    media_type = None
    file_name = None
    mime_type = None
    thumbnail_file_id = None

    if message.photo:
        telegram_file_id = message.photo[-1].file_id
        media_type = "photo"
        file_name = f"{session.node_id}_{len(session.media_assets) + 1}.jpg"
        mime_type = "image/jpeg"
    elif message.video:
        telegram_file_id = message.video.file_id
        media_type = "video"
        file_name = message.video.file_name or f"{session.node_id}_{len(session.media_assets) + 1}.mp4"
        mime_type = message.video.mime_type or "video/mp4"
        if message.video.thumbnail:
            thumbnail_file_id = message.video.thumbnail.file_id
    elif message.document:
        doc_mime = (message.document.mime_type or "").lower()
        fn = (message.document.file_name or "").lower()
        if doc_mime.startswith("image/") or fn.endswith((".jpg", ".jpeg", ".png", ".webp")):
            media_type = "photo"
            mime_type = doc_mime or "image/jpeg"
        elif doc_mime.startswith("video/") or fn.endswith((".mp4", ".mov", ".avi", ".mkv")):
            media_type = "video"
            mime_type = doc_mime or "video/mp4"
        else:
            media_type = "document"
            mime_type = message.document.mime_type or "application/octet-stream"
        telegram_file_id = message.document.file_id
        file_name = message.document.file_name or f"{session.node_id}_{len(session.media_assets) + 1}"
        if message.document.thumbnail:
            thumbnail_file_id = message.document.thumbnail.file_id

    if not telegram_file_id or not media_type:
        return

    from database.requests.media_rq import create_media_asset
    from database.requests.bot_rq import update_bot_funnel

    asset = await create_media_asset(
        bot_id=bot_config.id,
        node_id=session.node_id,
        media_type=media_type,
        telegram_file_id=telegram_file_id,
        mime_type=mime_type,
        file_name=file_name,
    )

    if thumbnail_file_id:
        try:
            await create_media_asset(
                bot_id=bot_config.id,
                node_id=f"thumb:{asset.id}",
                media_type="photo",
                telegram_file_id=thumbnail_file_id,
                mime_type="image/jpeg",
                file_name=f"thumb_{asset.id}.jpg",
            )
        except Exception as err:
            logger.warning("Не удалось сохранить thumbnail для %s: %s", asset.id, err)

    schema = dict(bot_config.funnel_schema or {})
    nodes = list(schema.get("nodes") or [])

    asset_dict = {
        "mediaFileId": telegram_file_id,
        "mediaAssetId": str(asset.id),
        "mediaType": media_type,
    }

    if session.node_id.startswith("payment:tariff:") or session.node_id.startswith("tariff:"):
        tariff_id = session.node_id.removeprefix("payment:tariff:").removeprefix("tariff:")
        payment_node = next((n for n in nodes if isinstance(n, dict) and n.get("id") == "payment"), None)
        if payment_node and isinstance(payment_node.get("tariffs"), list):
            for t in payment_node["tariffs"]:
                if isinstance(t, dict) and str(t.get("id")) == tariff_id:
                    t["mediaFileId"] = telegram_file_id
                    t["mediaAssetId"] = str(asset.id)
                    t["mediaType"] = media_type
                    t_assets = list(t.get("mediaAssets") or [])
                    t_assets.append(asset_dict)
                    t["mediaAssets"] = t_assets[-10:]
                    break
        try:
            from database.requests.tariff_rq import get_tariff_by_id, update_tariff
            db_tariff = await get_tariff_by_id(tariff_id)
            if db_tariff:
                tar_assets = list(getattr(db_tariff, "media_assets", []) or [])
                tar_assets.append(asset_dict)
                await update_tariff(db_tariff.id, media_assets=tar_assets[-10:])
        except Exception as e:
            logger.debug("Не удалось обновить медиа тарифа в БД: %s", e)
    else:
        target_node = next((n for n in nodes if isinstance(n, dict) and n.get("id") == session.node_id), None)
        if target_node:
            current_assets = list(target_node.get("mediaAssets") or [])
            current_assets.append(asset_dict)
            target_node["mediaAssets"] = current_assets[-10:]
            target_node["media"] = True
            target_node["mediaFileId"] = telegram_file_id
            target_node["mediaAssetId"] = str(asset.id)
            target_node["mediaType"] = media_type

    schema["nodes"] = nodes
    await update_bot_funnel(bot_config.id, schema, bot_config.funnel_complete)

    session.media_assets.append(asset_dict)
    session.user_media_message_ids.append(message.message_id)

    if session.debounce_task and not session.debounce_task.done():
        session.debounce_task.cancel()

    session.debounce_task = asyncio.create_task(
        _finalize_large_upload_after_delay(session.id, message.bot, message.chat.id)
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
@user_bot_router.callback_query(F.data.startswith("apply_tariff:"))
async def process_application_button(callback: CallbackQuery):
    """Create a traceable manager request without relying on a user deep link."""
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    if not bot_config or not funnel:
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

    tariff_info = ""
    if callback.data.startswith("apply_tariff:"):
        target_tariff_id = callback.data.removeprefix("apply_tariff:")
        tariffs = list(getattr(payment_node, "tariffs", []) or [])
        found_tariff = next(
            (t for t in tariffs if str(getattr(t, "id", "")) == target_tariff_id),
            None,
        )
        if not found_tariff:
            from database.requests.tariff_rq import get_tariff_by_id

            db_t = await get_tariff_by_id(target_tariff_id)
            if db_t and db_t.bot_id == bot_config.id:
                found_tariff = db_t
        if found_tariff:
            t_name = str(getattr(found_tariff, "name", "Тариф")).strip()
            t_price = float(getattr(found_tariff, "price", 0) or 0)
            tariff_info = (
                f"Выбранный тариф: <b>{escape(t_name)}</b> ({t_price:,.0f} ₽)\n\n"
            ).replace(",", " ")

    try:
        await callback.bot.send_message(
            bot_config.owner.telegram_id,
            f"📩 <b>Новая заявка в «{bot_config.display_name}»</b>\n\n"
            f"Клиент: {lead_name} ({lead_handle})\n"
            f"Telegram ID: <code>{callback.from_user.id}</code>\n\n"
            f"{tariff_info}"
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
    """Display tariff offer with appropriate action buttons depending on sales_mode."""
    node_checkout = _get_payment_node(funnel)
    tariff_sales_mode = (
        getattr(tariff, "sales_mode", None)
        or getattr(tariff, "salesMode", None)
    )
    if tariff_sales_mode in ("manual", "application"):
        mode = "application"
    elif tariff_sales_mode in ("auto", "hybrid"):
        mode = tariff_sales_mode
    else:
        mode = _payment_mode(funnel)
    tariff_name = str(getattr(tariff, "name", "Доступ") or "Доступ").strip()
    tariff_description = getattr(tariff, "description", "") or ""
    amount = float(getattr(tariff, "price", 0) or 0)
    message_text = _get_node_text(node_checkout) if node_checkout else ""

    tariff_details = f"<b>{escape(tariff_name)}</b>"
    if tariff_description:
        tariff_details += f"\n\n{to_telegram_html(tariff_description)}"
    if amount > 0:
        tariff_details += f"\n\n💳 <b>Стоимость: {amount:,.0f} ₽</b>".replace(",", " ")
    else:
        tariff_details += "\n\n🎁 <b>Стоимость: Бесплатно</b>"
    message_text = to_telegram_html(message_text)
    if message_text:
        message_text = f"{message_text}\n\n{tariff_details}"
    else:
        message_text = tariff_details

    # Manager button resolution for application and hybrid modes
    manager_url = None
    raw_url = getattr(tariff, "manager_url", None) or (
        getattr(node_checkout, "manager_url", "") if node_checkout else ""
    )
    if raw_url:
        raw_text = (
            (getattr(node_checkout, "manager_text", "") if node_checkout else "")
            or f"Здравствуйте! Хочу оформить тариф «{tariff_name}»."
        )
        manager_url = build_manager_deep_link(raw_url, raw_text)
        if not manager_url and raw_url:
            username = extract_telegram_username(raw_url)
            if username:
                manager_url = f"https://t.me/{username}"
            elif raw_url.startswith("http://") or raw_url.startswith("https://"):
                manager_url = raw_url

    tariff_id = str(getattr(tariff, "id", ""))
    manager_btn_text = (
        getattr(tariff, "button_text", None)
        if mode == "application" and getattr(tariff, "button_text", None)
        else "Связаться с менеджером"
    )
    manager_button = (
        InlineKeyboardButton(text=manager_btn_text, url=manager_url)
        if manager_url
        else InlineKeyboardButton(
            text=manager_btn_text, callback_data=f"apply_tariff:{tariff_id}"
        )
    )

    all_tariffs = list(getattr(node_checkout, "tariffs", []) or [])
    has_multiple = len(all_tariffs) > 1

    tariff_media_assets = (
        getattr(tariff, "media_assets", None)
        or getattr(tariff, "mediaAssets", None)
        or []
    )

    # 1. Application mode: only manager button
    if mode == "application":
        rows = [[manager_button]]
        if has_multiple:
            rows.append(
                [InlineKeyboardButton(text="← Назад к тарифам", callback_data="payment_tariffs_back")]
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
            media_assets=tariff_media_assets,
        )
        return

    # 2. Free tariff claim (Auto / Hybrid mode - no payment provider needed)
    if amount <= 0:
        btn_text = getattr(tariff, "button_text", None) or "🎁 Получить доступ"
        rows = [[InlineKeyboardButton(text=btn_text, callback_data=f"claim_free_tariff:{tariff_id}")]]
        if mode == "hybrid":
            rows.append([manager_button])
        if has_multiple:
            rows.append(
                [InlineKeyboardButton(text="← Назад к тарифам", callback_data="payment_tariffs_back")]
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
            media_assets=tariff_media_assets,
        )
        return

    # 3. Auto / Hybrid mode: requires payment link
    if not bot_config.payment_provider or not bot_config.payment_creds_enc:
        if mode == "hybrid":
            rows = [[manager_button]]
            if has_multiple:
                rows.append(
                    [InlineKeyboardButton(text="← Назад к тарифам", callback_data="payment_tariffs_back")]
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
                media_assets=tariff_media_assets,
            )
            return

        try:
            await callback.answer(
                "Платёжная система бота временно не настроена. Обратитесь к администратору.",
                show_alert=True,
            )
        except Exception:
            pass
        return

    try:
        await callback.answer(
            text="⏳ Формируем счёт на оплату… Пожалуйста, подождите.", show_alert=False
        )
    except Exception:
        pass

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
        else vars(tariff)
        if hasattr(tariff, "__dict__")
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
        try:
            if edit_message and getattr(callback.message, "text", None) is not None:
                await callback.message.edit_text(error_text)
            elif edit_message and getattr(callback.message, "caption", None) is not None:
                await callback.message.edit_caption(caption=error_text)
            else:
                await callback.message.answer(error_text)
        except TelegramBadRequest:
            try:
                await callback.message.answer(error_text)
            except Exception:
                pass
        try:
            from services.billing_notifications import notify_billing_user

            await notify_billing_user(
                bot_config.owner.telegram_id,
                f"⚠️ Не удалось сформировать счёт для лида {callback.from_user.full_name}. Проверьте реквизиты кассы в настройках бота «{bot_config.display_name}».",
            )
        except Exception as exc:
            logger.warning("Не удалось уведомить владельца о сбое счёта: %s", exc)
        return

    if getattr(tariff, "button_text", None):
        primary_btn_text = tariff.button_text
    elif getattr(tariff, "installments", False) or getattr(tariff, "payment_type", "") == "recurring":
        primary_btn_text = "Оформить подписку"
    elif amount > 0:
        primary_btn_text = f"Купить за {amount:,.0f} ₽".replace(",", " ")
    else:
        primary_btn_text = (
            _get_node_button_text(node_checkout, default="🟢 Оплатить") or "🟢 Оплатить"
        )

    rows = [[InlineKeyboardButton(text=primary_btn_text, url=payment_url, style="success")]]
    if mode == "hybrid":
        rows.append([manager_button])
    if has_multiple:
        rows.append(
            [InlineKeyboardButton(text="← Назад к тарифам", callback_data="payment_tariffs_back")]
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
        media_assets=tariff_media_assets,
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
    media_assets: list | None = None,
) -> None:
    """Send text/photo/video payment screens without unsupported Telegram edits."""
    chat_id = callback.message.chat.id
    if media_assets and len(media_assets) > 1:
        from aiogram.types import InputMediaPhoto, InputMediaVideo
        group = []
        for i, a in enumerate(media_assets[:10]):
            fid = a.get("mediaFileId") or a.get("file_id") if isinstance(a, dict) else getattr(a, "media_file_id", None)
            m_type = a.get("mediaType") or a.get("type") if isinstance(a, dict) else getattr(a, "media_type", None)
            if not fid:
                continue
            cap = text if i == 0 else None
            if m_type == "video":
                group.append(InputMediaVideo(media=fid, caption=cap, parse_mode="HTML"))
            else:
                group.append(InputMediaPhoto(media=fid, caption=cap, parse_mode="HTML"))
        if group:
            await callback.bot.send_media_group(chat_id=chat_id, media=group)
            if reply_markup:
                await callback.bot.send_message(chat_id=chat_id, text="👇", reply_markup=reply_markup)
            return

    effective_file_id = file_id
    effective_media_type = media_type
    if not effective_file_id and media_assets and len(media_assets) == 1:
        first = media_assets[0]
        effective_file_id = first.get("mediaFileId") or first.get("file_id") if isinstance(first, dict) else getattr(first, "media_file_id", None)
        effective_media_type = first.get("mediaType") or first.get("type") if isinstance(first, dict) else getattr(first, "media_type", None)

    if effective_media_type == "photo" and effective_file_id:
        await callback.bot.send_photo(
            chat_id, effective_file_id, caption=text or "👋", reply_markup=reply_markup
        )
    elif effective_media_type == "video" and effective_file_id:
        await callback.bot.send_video(
            chat_id, effective_file_id, caption=text or "👋", reply_markup=reply_markup
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
    if not funnel:
        return

    node_checkout = _get_payment_node(funnel)
    tariffs = list(getattr(node_checkout, "tariffs", []) or [])
    if not tariffs:
        from database.requests.tariff_rq import list_tariffs_by_bot_id

        db_tariffs = await list_tariffs_by_bot_id(bot_config.id, active_only=True)
        if db_tariffs:
            tariffs = db_tariffs

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
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    if not bot_config or not funnel:
        return

    node_checkout = _get_payment_node(funnel)
    tariff_id = callback.data.split(":", 1)[1]
    tariffs = list(getattr(node_checkout, "tariffs", []) or [])
    tariff = next(
        (
            item
            for item in tariffs
            if str(getattr(item, "id", "")) == tariff_id
        ),
        None,
    )
    if not tariff:
        from database.requests.tariff_rq import get_tariff_by_id

        db_tariff = await get_tariff_by_id(tariff_id)
        if db_tariff and db_tariff.bot_id == bot_config.id:
            tariff = db_tariff

    if not tariff:
        try:
            await callback.answer(
                "Тариф больше недоступен или принадлежит другому боту.",
                show_alert=True,
            )
        except Exception:
            pass
        return
    await _send_tariff_invoice(callback, bot_config, funnel, tariff, edit_message=True)


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


@user_bot_router.callback_query(F.data.startswith("claim_free_tariff:"))
async def process_free_tariff_claim(callback: CallbackQuery):
    """Deliver free tariff access immediately without payment provider."""
    try:
        await callback.answer("⏳ Активируем доступ…", show_alert=False)
    except Exception:
        pass

    bot_config = await get_bot_by_tg_id(callback.bot.id)
    funnel = await get_funnel_by_bot_id(callback.bot.id)
    if not bot_config or not funnel:
        await callback.message.answer("Бот временно недоступен. Попробуйте позже.")
        return

    tariff_id = callback.data.removeprefix("claim_free_tariff:")
    node_checkout = _get_payment_node(funnel)
    tariffs = list(getattr(node_checkout, "tariffs", []) or [])
    tariff = next(
        (t for t in tariffs if str(getattr(t, "id", "")) == tariff_id),
        None,
    )
    if not tariff:
        from database.requests.tariff_rq import get_tariff_by_id

        db_t = await get_tariff_by_id(tariff_id)
        if db_t and db_t.bot_id == bot_config.id:
            tariff = db_t

    if not tariff:
        await callback.answer("Тариф не найден.", show_alert=True)
        return

    # Guard against claiming paid tariffs as free
    price = float(getattr(tariff, "price", 0) or 0)
    if price > 0:
        await callback.answer("Для данного тарифа требуется оплата.", show_alert=True)
        return

    from database.requests.user_rq import get_lead, create_lead

    lead = await get_lead(bot_config.id, callback.from_user.id)
    if not lead:
        lead = await create_lead(
            bot_id=bot_config.id,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )

    tariff_snapshot = (
        tariff.model_dump(by_alias=True)
        if hasattr(tariff, "model_dump")
        else vars(tariff)
        if hasattr(tariff, "__dict__")
        else dict(tariff)
    )

    from database.requests.client_payment_rq import (
        create_client_payment,
        mark_client_payment_succeeded,
    )
    from services.payment_link import send_success_message
    from decimal import Decimal

    payment = await create_client_payment(
        bot_id=bot_config.id,
        lead_id=lead.id,
        provider="free",
        tariff=tariff_snapshot,
    )
    payment, _ = await mark_client_payment_succeeded(
        payment_id=payment.id,
        bot_id=bot_config.id,
        provider="free",
        provider_payment_id=f"free_{payment.id}",
        amount=Decimal("0.00"),
        currency="RUB",
        telegram_id=callback.from_user.id,
    )

    await _remove_callback_message(callback)

    try:
        await send_success_message(
            tg_bot_id=bot_config.tg_bot_id,
            telegram_id=callback.from_user.id,
            http_session=callback.bot.session,
            tariff_snapshot=tariff_snapshot,
            client_payment=payment,
        )
    except Exception as exc:
        logger.error("Ошибка при выдаче бесплатного доступа: %s", exc)
        await callback.message.answer(
            "✅ Вы получили доступ к тарифу! Если возникли вопросы, свяжитесь с поддержкой."
        )


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
    mode = _payment_mode(funnel)
    if mode == "application":
        return None
    node_checkout = _get_payment_node(funnel)
    tariff_ids = [str(t) for t in (broadcast.button or {}).get("tariffIds") or []]
    by_id = {str(t.id): t for t in (getattr(node_checkout, "tariffs", []) or [])}
    selected = [by_id[i] for i in tariff_ids if i in by_id]
    if not selected:
        return None

    def _is_paid_tariff(t):
        p = getattr(t, "price", None)
        if p is None:
            return True
        try:
            return float(p) > 0
        except (ValueError, TypeError):
            return True

    has_paid = any(_is_paid_tariff(t) for t in selected)
    if has_paid and (not bot_config.payment_provider or not bot_config.payment_creds_enc):
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


async def _send_lead_subscription_cards(
    *,
    bot_config,
    lead,
    send_message_fn,
):
    now = datetime.now(timezone.utc)
    from database.requests.client_payment_rq import get_lead_subscriptions
    from database.requests.chat_access_rq import (
        get_chat_access_grant_for_payment,
        compute_recurring_period_delta,
    )

    all_subs = await get_lead_subscriptions(bot_config.id, lead.id)
    if not all_subs:
        await send_message_fn("У вас нет активных подписок в этом боте.")
        return

    active_cards = []
    seen_tariffs = set()

    for p in all_subs:
        tariff_id = p.tariff_id or (p.tariff_snapshot.get("id") if p.tariff_snapshot else None)
        if tariff_id and tariff_id in seen_tariffs:
            continue

        grant = await get_chat_access_grant_for_payment(p.id)
        period = (
            p.tariff_snapshot.get("recurring_period")
            or p.tariff_snapshot.get("recurringPeriod")
            or p.tariff_snapshot.get("billing_period")
            or p.tariff_snapshot.get("billingPeriod")
        ) if p.tariff_snapshot else None
        delta = compute_recurring_period_delta(period)

        expires_at = grant.expires_at if (grant and grant.expires_at) else None
        if not expires_at:
            base_time = p.paid_at or p.created_at or now
            expires_at = base_time + delta

        # If grant was revoked and expires_at is past now, skip
        if grant and grant.status == "revoked" and expires_at <= now:
            continue
        if expires_at <= now and (not grant or grant.status != "active"):
            continue

        if tariff_id:
            seen_tariffs.add(tariff_id)

        active_cards.append((p, grant, expires_at))

    if not active_cards:
        await send_message_fn("У вас нет активных подписок в этом боте.")
        return

    for payment, grant, expires_at in active_cards:
        tariff_name = (
            payment.tariff_snapshot.get("name")
            if payment.tariff_snapshot
            else "Тариф"
        ) or "Тариф"
        amount = payment.amount
        date_str = expires_at.strftime("%d.%m.%Y %H:%M") if expires_at else "Бессрочно"
        auto_renew = (
            payment.tariff_snapshot.get("auto_renew", True)
            if payment.tariff_snapshot
            else True
        )
        auto_renew_str = "✅ Включено" if auto_renew else "❌ Отключено"

        card_text = (
            f"📦 <b>Подписка: {escape(str(tariff_name))}</b>\n"
            f"💳 Стоимость: {amount:,.0f} ₽\n"
            f"📅 Действует до: {date_str}\n"
            f"🔄 Автопродление: {auto_renew_str}"
        )

        reply_markup = None
        if auto_renew:
            reply_markup = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="❌ Отключить автосписание",
                            callback_data=f"cancel_sub:{payment.id}",
                        )
                    ]
                ]
            )
        elif not expires_at or expires_at > now:
            reply_markup = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="🔄 Включить автосписание",
                            callback_data=f"resume_sub:{payment.id}",
                        )
                    ]
                ]
            )
        elif payment.tariff_id:
            reply_markup = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="💳 Продлить подписку",
                            callback_data=f"payment_tariff:{payment.tariff_id}",
                        )
                    ]
                ]
            )
        await send_message_fn(card_text, reply_markup=reply_markup)


@user_bot_router.message(Command("sub", "subscriptions"))
async def cmd_subscriptions(message: Message):
    """Показать активные подписки пользователя в текущем боте."""
    bot_config = await get_bot_by_tg_id(message.bot.id)
    if not bot_config:
        return
    lead = await get_lead(bot_config.id, message.from_user.id)
    if not lead:
        await message.answer("У вас нет активных подписок в этом боте.")
        return

    await _send_lead_subscription_cards(
        bot_config=bot_config,
        lead=lead,
        send_message_fn=message.answer,
    )


@user_bot_router.callback_query(F.data == "my_subscriptions")
async def cb_subscriptions(callback: CallbackQuery):
    """Обработка кнопки Управление подпиской."""
    await callback.answer()
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    if not bot_config:
        return
    lead = await get_lead(bot_config.id, callback.from_user.id)
    if not lead:
        await callback.message.answer("У вас нет активных подписок в этом боте.")
        return

    await _send_lead_subscription_cards(
        bot_config=bot_config,
        lead=lead,
        send_message_fn=callback.message.answer,
    )


@user_bot_router.callback_query(F.data.startswith("cancel_sub:"))
async def cb_cancel_subscription(callback: CallbackQuery):
    """Отключение автопродления подписки лида."""
    payment_id_str = callback.data.split(":", 1)[1]
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    if not bot_config:
        await callback.answer("Бот не найден.", show_alert=True)
        return

    lead = await get_lead(bot_config.id, callback.from_user.id)
    if not lead:
        await callback.answer("Подписка не найдена.", show_alert=True)
        return

    from database.requests.client_payment_rq import cancel_client_payment_subscription
    from database.requests.chat_access_rq import (
        get_chat_access_grant_for_payment,
        compute_recurring_period_delta,
    )

    updated_payment = await cancel_client_payment_subscription(
        payment_id=payment_id_str,
        lead_id=lead.id,
        bot_id=bot_config.id,
    )
    if not updated_payment:
        await callback.answer("Подписка не найдена.", show_alert=True)
        return

    tariff_name = (
        updated_payment.tariff_snapshot.get("name")
        if updated_payment.tariff_snapshot
        else "Тариф"
    ) or "Тариф"
    amount = updated_payment.amount
    grant = await get_chat_access_grant_for_payment(updated_payment.id)
    period = (
        updated_payment.tariff_snapshot.get("recurring_period")
        or updated_payment.tariff_snapshot.get("recurringPeriod")
        or updated_payment.tariff_snapshot.get("billing_period")
        or updated_payment.tariff_snapshot.get("billingPeriod")
    ) if updated_payment.tariff_snapshot else None
    delta = compute_recurring_period_delta(period)

    expires_at = grant.expires_at if (grant and grant.expires_at) else None
    if not expires_at:
        base_time = updated_payment.paid_at or updated_payment.created_at or datetime.now(timezone.utc)
        expires_at = base_time + delta
    date_str = expires_at.strftime("%d.%m.%Y %H:%M") if expires_at else "конца оплаченного периода"

    # Edit the card message to show auto_renew disabled and offer resume button
    card_text = (
        f"📦 <b>Подписка: {escape(str(tariff_name))}</b>\n"
        f"💳 Стоимость: {amount:,.0f} ₽\n"
        f"📅 Действует до: {date_str}\n"
        f"🔄 Автопродление: ❌ Отключено"
    )
    reply_markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🔄 Включить автосписание",
                    callback_data=f"resume_sub:{updated_payment.id}",
                )
            ]
        ]
    )
    try:
        await callback.message.edit_text(card_text, reply_markup=reply_markup)
    except TelegramBadRequest:
        pass

    await callback.answer("Автосписание успешно отключено!")
    await callback.message.answer(
        f"✅ <b>Автосписание успешно отключено!</b>\n\n"
        f"Ваш доступ к «{escape(str(tariff_name))}» останется активным до конца оплаченного периода "
        f"(<b>{date_str}</b>). После этого списаний не будет."
    )


@user_bot_router.callback_query(F.data.startswith("resume_sub:"))
async def cb_resume_subscription(callback: CallbackQuery):
    """Включение автопродления подписки лида обратно."""
    payment_id_str = callback.data.split(":", 1)[1]
    bot_config = await get_bot_by_tg_id(callback.bot.id)
    if not bot_config:
        await callback.answer("Бот не найден.", show_alert=True)
        return

    lead = await get_lead(bot_config.id, callback.from_user.id)
    if not lead:
        await callback.answer("Подписка не найдена.", show_alert=True)
        return

    from database.requests.client_payment_rq import resume_client_payment_subscription
    from database.requests.chat_access_rq import (
        get_chat_access_grant_for_payment,
        compute_recurring_period_delta,
    )

    updated_payment = await resume_client_payment_subscription(
        payment_id=payment_id_str,
        lead_id=lead.id,
        bot_id=bot_config.id,
    )
    if not updated_payment:
        await callback.answer("Подписка не найдена.", show_alert=True)
        return

    tariff_name = (
        updated_payment.tariff_snapshot.get("name")
        if updated_payment.tariff_snapshot
        else "Тариф"
    ) or "Тариф"
    amount = updated_payment.amount
    grant = await get_chat_access_grant_for_payment(updated_payment.id)
    period = (
        updated_payment.tariff_snapshot.get("recurring_period")
        or updated_payment.tariff_snapshot.get("recurringPeriod")
        or updated_payment.tariff_snapshot.get("billing_period")
        or updated_payment.tariff_snapshot.get("billingPeriod")
    ) if updated_payment.tariff_snapshot else None
    delta = compute_recurring_period_delta(period)

    expires_at = grant.expires_at if (grant and grant.expires_at) else None
    if not expires_at:
        base_time = updated_payment.paid_at or updated_payment.created_at or datetime.now(timezone.utc)
        expires_at = base_time + delta
    date_str = expires_at.strftime("%d.%m.%Y %H:%M") if expires_at else "конца оплаченного периода"

    # Edit the card message to show auto_renew enabled and offer cancel button
    card_text = (
        f"📦 <b>Подписка: {escape(str(tariff_name))}</b>\n"
        f"💳 Стоимость: {amount:,.0f} ₽\n"
        f"📅 Действует до: {date_str}\n"
        f"🔄 Автопродление: ✅ Включено"
    )
    reply_markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="❌ Отключить автосписание",
                    callback_data=f"cancel_sub:{updated_payment.id}",
                )
            ]
        ]
    )
    try:
        await callback.message.edit_text(card_text, reply_markup=reply_markup)
    except TelegramBadRequest:
        pass

    await callback.answer("Автопродление успешно включено!")
    await callback.message.answer(
        f"✅ <b>Автопродление успешно включено!</b>\n\n"
        f"Следующее списание пройдет автоматически <b>{date_str}</b>. "
        f"Ваш доступ к «{escape(str(tariff_name))}» продолжится без перерывов."
    )

