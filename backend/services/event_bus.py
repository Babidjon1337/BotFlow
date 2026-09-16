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
        
        Возвращает количество очередей, которым доставлено событие.
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
                logger.warning("SSE: очередь пользователя %s переполнена, пропускаем событие %s",
                               user_tg_id, event_type)
        return delivered

    async def publish_bot(self, bot_id: int, event_type: str, data: Any) -> int:
        """Находит владельца бота и публикует ему событие."""
        try:
            from database.requests.bot_rq import get_bot_by_id
            bot = await get_bot_by_id(bot_id)
            if bot and bot.owner and bot.owner.telegram_id:
                return self.publish_user(bot.owner.telegram_id, event_type, data)
        except Exception as exc:
            logger.warning("SSE: ошибка отправки события боту %s: %s", bot_id, exc)
        return 0


event_bus = EventBus()
