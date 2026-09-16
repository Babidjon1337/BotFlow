"""In-memory event bus for Server-Sent Events (SSE).

Поддерживает подписки по Telegram ID пользователя (владельца бота)
и доставку событий реального времени без внешних брокеров (Redis).
"""
import asyncio
from typing import Any, Dict
from loggers import logger

EVENT_ALIASES: dict[str, str] = {
    "media:upload_completed": "media_upload_completed",
    "media_upload_completed": "media:upload_completed",
    "media:upload_cancelled": "media_upload_cancelled",
    "media_upload_cancelled": "media:upload_cancelled",
    "bot:media_sync_done": "media_sync_completed",
    "media_sync_completed": "bot:media_sync_done",
    "bot:status_changed": "bot_status_changed",
    "bot_status_changed": "bot:status_changed",
    "broadcast:status_changed": "broadcast_status_changed",
    "broadcast_status_changed": "broadcast:status_changed",
    "operation:completed": "operation_completed",
    "operation_completed": "operation:completed",
    "operation:failed": "operation_failed",
    "operation_failed": "operation:failed",
}

MAX_QUEUES_PER_USER = 10
MAX_CACHE_SIZE = 5000


class EventBus:
    def __init__(self) -> None:
        # user_tg_id -> dict[asyncio.Queue, None] (гарантирует O(1) и детерминированный FIFO-порядок)
        self._subscribers: Dict[int, dict[asyncio.Queue, None]] = {}
        self._lock = asyncio.Lock()
        # bot_id -> owner_tg_id lightweight cache to avoid DB roundtrips on every bot event
        self._bot_owner_cache: Dict[int, int] = {}

    def set_bot_owner_cache(self, bot_id: int, owner_tg_id: int) -> None:
        """Регистрирует сопоставление bot_id -> owner_tg_id в кэше."""
        if len(self._bot_owner_cache) >= MAX_CACHE_SIZE:
            self._bot_owner_cache.clear()
        self._bot_owner_cache[bot_id] = owner_tg_id

    def invalidate_bot_owner_cache(self, bot_id: int) -> None:
        """Сбрасывает запись кэша при смене владельца или удалении бота."""
        self._bot_owner_cache.pop(bot_id, None)

    async def subscribe(self, user_tg_id: int) -> asyncio.Queue:
        """Создает и регистрирует очередь событий для данного пользователя (с лимитом очередей на пользователя)."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            if user_tg_id not in self._subscribers:
                self._subscribers[user_tg_id] = {}
            elif len(self._subscribers[user_tg_id]) >= MAX_QUEUES_PER_USER:
                # Вытесняем старейшую очередь при превышении лимита соединений (FIFO)
                oldest_queue = next(iter(self._subscribers[user_tg_id]))
                self._subscribers[user_tg_id].pop(oldest_queue, None)
                logger.info("SSE: превышен лимит (%d) очередей для %s, старая очередь удалена",
                            MAX_QUEUES_PER_USER, user_tg_id)
            self._subscribers[user_tg_id][queue] = None
        logger.debug("SSE: пользователь %s подписался на события (активно очередей: %d)",
                     user_tg_id, len(self._subscribers[user_tg_id]))
        return queue

    async def unsubscribe(self, user_tg_id: int, queue: asyncio.Queue) -> None:
        """Удаляет очередь событий при разрыве соединения."""
        async with self._lock:
            queues = self._subscribers.get(user_tg_id)
            if queues is not None:
                queues.pop(queue, None)
                if not queues:
                    self._subscribers.pop(user_tg_id, None)
        logger.debug("SSE: пользователь %s отписался от событий", user_tg_id)

    def _put_event(self, q: asyncio.Queue, payload: dict, user_tg_id: int, event_type: str) -> bool:
        """Добавляет событие в очередь с FIFO-вытеснением при переполнении."""
        try:
            q.put_nowait(payload)
            return True
        except asyncio.QueueFull:
            try:
                _ = q.get_nowait()
                q.put_nowait(payload)
                return True
            except Exception:
                logger.warning("SSE: очередь пользователя %s переполнена, не удалось доставить событие %s",
                               user_tg_id, event_type)
                return False

    def publish_user(self, user_tg_id: int, event_type: str, data: Any) -> int:
        """Публикует событие всем активным соединениям конкретного пользователя.
        
        При переполнении очереди вытесняет самое старое событие (FIFO).
        Поддерживает псевдонимы имен событий для совместимости.
        """
        queues = self._subscribers.get(user_tg_id)
        if not queues:
            return 0

        event_payload = {
            "type": event_type,
            "data": data,
        }
        alias_type = EVENT_ALIASES.get(event_type)
        alias_payload = {"type": alias_type, "data": data} if alias_type else None

        delivered = 0
        for q in list(queues.keys()):
            if self._put_event(q, event_payload, user_tg_id, event_type):
                delivered += 1
            if alias_payload and alias_type:
                self._put_event(q, alias_payload, user_tg_id, alias_type)
        return delivered

    async def publish_bot(self, bot_id: int, event_type: str, data: Any, owner_tg_id: int | None = None) -> int:
        """Находит владельца бота и публикует ему событие (с кэшированием ID владельца)."""
        if owner_tg_id is not None:
            self.set_bot_owner_cache(bot_id, owner_tg_id)
            return self.publish_user(owner_tg_id, event_type, data)

        cached_owner = self._bot_owner_cache.get(bot_id)
        if cached_owner is not None:
            return self.publish_user(cached_owner, event_type, data)

        try:
            from database.requests.bot_rq import get_bot_by_id
            bot = await get_bot_by_id(bot_id)
            if bot and bot.owner and bot.owner.telegram_id:
                self.set_bot_owner_cache(bot_id, bot.owner.telegram_id)
                return self.publish_user(bot.owner.telegram_id, event_type, data)
        except Exception as exc:
            logger.warning("SSE: ошибка отправки события боту %s: %s", bot_id, exc)
        return 0


event_bus = EventBus()
