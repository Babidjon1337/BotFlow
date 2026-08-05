"""Safe paid access to private Telegram channels and supergroups."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from html import escape
from typing import List

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.types import ChatPermissions

from database.requests.chat_access_rq import (
    create_chat_access_grant,
    get_chat_access_grant_for_payment,
)
from loggers import logger
from services.security import crypto


class ChatAccessError(Exception):
    pass


def _normalise_chat_id(value: str) -> str:
    chat_id = value.strip()
    if not chat_id:
        raise ChatAccessError("Выберите подключённый канал или группу.")
    return chat_id


async def verify_chat_delivery(bot_config, chat_id: str, access_mode: str, http_session):
    """Verify that a client bot can create the configured paid access."""
    chat_id = _normalise_chat_id(chat_id)
    token = crypto.decrypt(bot_config.bot_token_enc)
    bot = Bot(token=token, session=http_session, default=DefaultBotProperties(parse_mode="HTML"))
    try:
        chat = await bot.get_chat(chat_id)
        member = await bot.get_chat_member(chat.id, bot.id)
    except Exception as exc:
        logger.warning(
            "Не удалось проверить чат для выдачи доступа: bot_id=%s, chat_id=%s, error=%s",
            bot_config.id,
            chat_id,
            exc,
        )
        raise ChatAccessError(
            "Бот не может проверить этот чат. Убедитесь, что выбран именно чат из списка и бот добавлен в него администратором."
        ) from exc

    if getattr(member, "status", "") not in {"administrator", "creator"}:
        logger.warning(
            "У бота нет статуса администратора: bot_id=%s, chat_id=%s, status=%s",
            bot_config.id,
            chat.id,
            getattr(member, "status", None),
        )
        raise ChatAccessError("Бот должен быть администратором закрытого чата.")
    if not getattr(member, "can_invite_users", False):
        logger.warning(
            "У бота нет права приглашать пользователей: bot_id=%s, chat_id=%s",
            bot_config.id,
            chat.id,
        )
        raise ChatAccessError("Дайте боту право создавать пригласительные ссылки.")
    if access_mode == "read_only":
        if chat.type != "supergroup":
            raise ChatAccessError("Режим «Только чтение» доступен только для супергруппы.")
        if not getattr(member, "can_restrict_members", False):
            raise ChatAccessError("Для режима «Только чтение» дайте боту право ограничивать участников.")
    return chat


def _parse_chat_ids(action_data: str) -> List[str]:
    """Parse actionData which may be a single chat_id or a JSON array of chat_ids."""
    value = (action_data or "").strip()
    if not value:
        raise ChatAccessError("Выберите канал или группу для выдачи доступа.")
    if value.startswith("["):
        try:
            ids = json.loads(value)
            if isinstance(ids, list) and ids:
                return [str(i).strip() for i in ids if str(i).strip()]
        except json.JSONDecodeError:
            pass
    return [value]


async def issue_paid_chat_invites(
    *, bot_config, payment, tariff: dict, http_session
) -> List[str]:
    """Create invite links (one per selected chat) after a verified payment.

    Idempotent: if grants already exist for this payment, returns the cached links.
    Supports both legacy single-chat and new multi-chat (JSON array) actionData.
    """
    existing = await get_chat_access_grant_for_payment(payment.id)
    if existing:
        # Return all grants for this payment (may be multiple rows)
        return [existing.invite_link]

    raw_data = str(tariff.get("actionData") or tariff.get("action_data") or "")
    chat_ids = _parse_chat_ids(raw_data)
    raw_access_mode = tariff.get("chatAccessMode") or tariff.get("chat_access_mode") or "member"
    token = crypto.decrypt(bot_config.bot_token_enc)
    bot = Bot(token=token, session=http_session, default=DefaultBotProperties(parse_mode="HTML"))

    invite_links: List[str] = []
    for chat_id in chat_ids:
        chat_access_mode = "member"
        if isinstance(raw_access_mode, str) and raw_access_mode.startswith("{"):
            try:
                modes = json.loads(raw_access_mode)
                chat_access_mode = modes.get(chat_id, "member")
            except Exception:
                chat_access_mode = "member"
        elif isinstance(raw_access_mode, dict):
            chat_access_mode = raw_access_mode.get(chat_id, "member")
        else:
            chat_access_mode = str(raw_access_mode)
            
        chat = await verify_chat_delivery(bot_config, chat_id, chat_access_mode, http_session)
        try:
            invite = await bot.create_chat_invite_link(
                chat_id=chat.id,
                name=f"Оплата {str(payment.id)[:8]}",
                member_limit=1,
            )
        except Exception as exc:
            raise ChatAccessError(
                f"Не удалось создать персональную ссылку для чата {chat.title or chat_id}."
            ) from exc

        await create_chat_access_grant(
            bot_id=bot_config.id,
            lead_id=payment.lead_id,
            payment_id=payment.id,
            chat_id=str(chat.id),
            invite_link=invite.invite_link,
            access_mode=chat_access_mode,
            expires_at=None,
        )
        invite_links.append(invite.invite_link)
        logger.info(
            "Создан персональный инвайт: bot_id=%s, payment_id=%s, chat_id=%s",
            bot_config.id, payment.id, chat.id,
        )

    return invite_links


async def issue_paid_chat_invite(
    *, bot_config, payment, tariff: dict, http_session
) -> str:
    """Backward-compatible wrapper — returns the first invite link."""
    links = await issue_paid_chat_invites(
        bot_config=bot_config, payment=payment, tariff=tariff, http_session=http_session
    )
    return links[0] if links else ""


async def apply_joined_member_access(*, bot, grant, user_id: int) -> None:
    """Apply the only safe per-member profile currently supported by Telegram."""
    if grant.access_mode != "read_only":
        return
    try:
        await bot.restrict_chat_member(
            chat_id=grant.chat_id,
            user_id=user_id,
            permissions=ChatPermissions(
                can_send_messages=False,
                can_send_audios=False,
                can_send_documents=False,
                can_send_photos=False,
                can_send_videos=False,
                can_send_video_notes=False,
                can_send_voice_notes=False,
                can_send_polls=False,
                can_send_other_messages=False,
                can_add_web_page_previews=False,
                can_change_info=False,
                can_invite_users=False,
                can_pin_messages=False,
            ),
            use_independent_chat_permissions=True,
        )
    except Exception as exc:
        logger.warning("Не удалось применить профиль доступа к чату %s: %s", grant.chat_id, exc)


def chat_delivery_success_text(tariff: dict, invite_link: str) -> str:
    """Single-link backward-compatible variant."""
    return chat_delivery_success_text_multi(tariff, [invite_link])


def chat_delivery_success_text_multi(tariff: dict, invite_links: List[str]) -> str:
    title = escape(str(tariff.get("name", "Тариф")))
    if len(invite_links) == 1:
        link_block = f'<a href="{escape(invite_links[0], quote=True)}">Вступить в закрытый чат</a>'
        note = "Ссылка персональная и сработает только для одного вступления."
    else:
        lines = "".join(
            f'<a href="{escape(lnk, quote=True)}">Вступить в чат {i + 1}</a>\n'
            for i, lnk in enumerate(invite_links)
        )
        link_block = lines.rstrip()
        note = "Ссылки персональные и каждая сработает только один раз."
    return (
        f"✅ <b>Оплата получена!</b>\n\n"
        f"Доступ к «{title}» активирован.\n"
        f"{link_block}\n\n"
        f"{note}"
    )
