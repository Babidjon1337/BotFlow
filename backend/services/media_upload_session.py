import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
import secrets
from typing import Any
from loggers import logger


@dataclass
class UploadSession:
    id: str
    bot_id: int
    tg_bot_id: int
    owner_tg_id: int
    node_id: str
    node_title: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=30)
    )
    media_assets: list[dict[str, Any]] = field(default_factory=list)
    user_media_message_ids: list[int] = field(default_factory=list)
    prompt_message_id: int | None = None
    debounce_task: asyncio.Task | None = None
    is_completed: bool = False
    is_cancelled: bool = False


_sessions: dict[str, UploadSession] = {}
_sessions_by_user_bot: dict[tuple[int, int], str] = {}


def get_node_human_title(node_id: str, funnel_schema: dict | None = None) -> str:
    """Return friendly Russian title for a node in funnel."""
    if node_id == "start":
        return "Старт"
    elif node_id == "push1":
        return "Дожим 1"
    elif node_id == "push2":
        return "Дожим 2"
    elif node_id == "payment":
        return "Оплата"
    elif node_id.startswith("payment:tariff:"):
        tariff_id = node_id.removeprefix("payment:tariff:")
        if funnel_schema and isinstance(funnel_schema, dict):
            nodes = funnel_schema.get("nodes") or []
            payment_node = next((n for n in nodes if isinstance(n, dict) and n.get("id") == "payment"), None)
            if payment_node and isinstance(payment_node.get("tariffs"), list):
                for t in payment_node["tariffs"]:
                    if isinstance(t, dict) and str(t.get("id")) == tariff_id:
                        return f"Тариф «{t.get('name', 'Тариф')}»"
        return "Тариф"
    elif node_id == "broadcast":
        return "Рассылка"
    return node_id


def create_upload_session(
    bot_id: int,
    tg_bot_id: int,
    owner_tg_id: int,
    node_id: str,
    node_title: str,
) -> UploadSession:
    cleanup_expired_sessions()
    
    # Cancel previous session for this owner and bot if exists
    key = (owner_tg_id, tg_bot_id)
    old_session_id = _sessions_by_user_bot.get(key)
    if old_session_id and old_session_id in _sessions:
        old_sess = _sessions[old_session_id]
        old_sess.is_cancelled = True
        if old_sess.debounce_task and not old_sess.debounce_task.done():
            old_sess.debounce_task.cancel()

    session_id = secrets.token_hex(6)  # 12 chars
    session = UploadSession(
        id=session_id,
        bot_id=bot_id,
        tg_bot_id=tg_bot_id,
        owner_tg_id=owner_tg_id,
        node_id=node_id,
        node_title=node_title,
    )
    _sessions[session_id] = session
    _sessions_by_user_bot[key] = session_id
    logger.info(
        "Создана сессия загрузки большого медиа %s для бота %s, блок %s (%s)",
        session_id,
        bot_id,
        node_id,
        node_title,
    )
    return session


def get_upload_session(session_id: str) -> UploadSession | None:
    session = _sessions.get(session_id)
    if not session:
        return None
    if datetime.now(timezone.utc) > session.expires_at:
        cancel_upload_session(session_id)
        return None
    return session


def get_active_session_for_user_bot(owner_tg_id: int, tg_bot_id: int) -> UploadSession | None:
    session_id = _sessions_by_user_bot.get((owner_tg_id, tg_bot_id))
    if not session_id:
        return None
    session = _sessions.get(session_id)
    if not session:
        _sessions_by_user_bot.pop((owner_tg_id, tg_bot_id), None)
        return None
    if session.is_cancelled or session.is_completed:
        _sessions_by_user_bot.pop((owner_tg_id, tg_bot_id), None)
        return None
    if datetime.now(timezone.utc) > session.expires_at:
        cancel_upload_session(session_id)
        return None
    return session


def cancel_upload_session(session_id: str) -> bool:
    session = _sessions.get(session_id)
    if not session:
        return False
    session.is_cancelled = True
    if session.debounce_task and not session.debounce_task.done():
        session.debounce_task.cancel()
    _sessions_by_user_bot.pop((session.owner_tg_id, session.tg_bot_id), None)
    logger.info("Сессия загрузки %s отменена", session_id)
    return True


def complete_upload_session(session_id: str) -> bool:
    session = _sessions.get(session_id)
    if not session:
        return False
    session.is_completed = True
    if session.debounce_task and not session.debounce_task.done():
        session.debounce_task.cancel()
    _sessions_by_user_bot.pop((session.owner_tg_id, session.tg_bot_id), None)
    logger.info("Сессия загрузки %s успешно завершена", session_id)
    return True


def cleanup_expired_sessions() -> None:
    now = datetime.now(timezone.utc)
    expired_ids = [
        s_id for s_id, s in _sessions.items()
        if now > s.expires_at or s.is_completed or s.is_cancelled
    ]
    for s_id in expired_ids:
        s = _sessions.pop(s_id, None)
        if s:
            _sessions_by_user_bot.pop((s.owner_tg_id, s.tg_bot_id), None)
