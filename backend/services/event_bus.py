"""In-memory event bus for Server-Sent Events (SSE).

Поддерживает подписки по Telegram ID пользователя (владельца бота)
и доставку событий реального времени без внешних брокеров (Redis).
"""
import asyncio
from typing import Any, Dict, Set
from loggers import logger


class EventBus:
    def __init__(self) -> None:
        # user_tg_id -> Set[asyncio.Queue]
        self._subscribers: Dict[int, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
        # bot_id -> owner_tg_id lightweight cache to avoid DB roundtrips on every bot event
        self._bot_owner_cache: Dict[int, int] = {}

    def set_bot_owner_cache(self, bot_id: int, owner_tg_id: int) -> None:
        """Регистрирует сопоставление bot_id -> owner_tg_id в кэше."""
        self._bot_owner_cache[bot_id] = owner_tg_id

    def invalidate_bot_owner_cache(self, bot_id: int) -> None:
        """Сбрасывает запись кэша при смене владельца или удалении бота."""
        self._bot_owner_cache.pop(bot_id, None)

    async def subscribe(self, user_tg_id: int) -> asyncio.Queue:
        """Создает и регистрирует очередь событий для данного пользователя."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            if user_tg_id not in self._subscribers:
                self._subscribers[user_tg_id] = set()
            self._subscribers[user_tg_id].add(queue)
        logger.debug("SSE: пользователь %s подписался на события (активно очередей: %d)",
                     user_tg_id, len(self._subscribers[user_tg_id]))
        return queue

    async def unsubscribe(self, user_tg_id: int, queue: asyncio.Queue) -> None:
        """Удаляет очередь событий при разрыве соединения."""
        async with self._lock:
            queues = self._subscribers.get(user_tg_id)
            if queues:
                queues.discard(queue)
                if not queues:
                    self._subscribers.pop(user_tg_id, None)
        logger.debug("SSE: пользователь %s отписался от событий", user_tg_id)

    def publish_user(self, user_tg_id: int, event_type: str, data: Any) -> int:
        """Публикует событие всем активным соединениям конкретного пользователя.
        
        При переполнении очереди вытесняет самое старое событие (FIFO),
        чтобы клиент всегда получал актуальное состояние.
        """
        queues = self._subscribers.get(user_tg_id)
        if not queues:
            return 0

        event_payload = {
            "type": event_type,
            "data": data,
        }
        delivered = 0
        for q in list(queues):
            try:
                q.put_nowait(event_payload)
                delivered += 1
            except asyncio.QueueFull:
                try:
                    # Вытесняем устаревшее событие ради свежего состояния
                    _ = q.get_nowait()
                    q.put_nowait(event_payload)
                    delivered += 1
                except Exception:
                    logger.warning("SSE: очередь пользователя %s переполнена, не удалось доставить событие %s",
                                   user_tg_id, event_type)
        return delivered

    async def publish_bot(self, bot_id: int, event_type: str, data: Any, owner_tg_id: int | None = None) -> int:
        """Находит владельца бота и публикует ему событие (с кэшированием ID владельца)."""
        if owner_tg_id is not None:
            self._bot_owner_cache[bot_id] = owner_tg_id
            return self.publish_user(owner_tg_id, event_type, data)

        cached_owner = self._bot_owner_cache.get(bot_id)
        if cached_owner is not None:
            return self.publish_user(cached_owner, event_type, data)

        try:
            from database.requests.bot_rq import get_bot_by_id
            bot = await get_bot_by_id(bot_id)
            if bot and bot.owner and bot.owner.telegram_id:
                self._bot_owner_cache[bot_id] = bot.owner.telegram_id
                return self.publish_user(bot.owner.telegram_id, event_type, data)
        except Exception as exc:
            logger.warning("SSE: ошибка отправки события боту %s: %s", bot_id, exc)
        return 0


event_bus = EventBus()
