import asyncio
import collections
from datetime import datetime, timezone, timedelta
import logging
from typing import Any

MAX_LOGS = 100
MSK_TZ = timezone(timedelta(hours=3))


class LogBuffer:
    def __init__(self, maxlen: int = MAX_LOGS):
        self._buffer: collections.deque[dict[str, Any]] = collections.deque(maxlen=maxlen)
        self._subscribers: set[asyncio.Queue] = set()
        self._counter: int = 0
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def add_log(self, record: logging.LogRecord) -> None:
        self._counter += 1

        # Format message safely
        try:
            msg = record.getMessage()
        except Exception:
            msg = str(record.msg)

        exc_text = None
        if record.exc_info:
            try:
                import traceback
                exc_text = "".join(traceback.format_exception(*record.exc_info))
            except Exception:
                pass

        now = datetime.now(MSK_TZ)
        log_entry = {
            "id": self._counter,
            "timestamp": now.strftime("%H:%M:%S"),
            "iso_time": now.isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": msg,
            "exc_text": exc_text,
        }

        self._buffer.append(log_entry)

        # Notify active subscriber queues safely
        for q in list(self._subscribers):
            try:
                if self._loop and self._loop.is_running() and asyncio.get_event_loop() != self._loop:
                    self._loop.call_soon_threadsafe(self._push_to_queue, q, log_entry)
                else:
                    self._push_to_queue(q, log_entry)
            except Exception:
                pass

    @staticmethod
    def _push_to_queue(q: asyncio.Queue, item: dict[str, Any]) -> None:
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(item)
            except Exception:
                pass
        except Exception:
            pass

    def get_recent(self) -> list[dict[str, Any]]:
        return list(self._buffer)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def clear(self) -> None:
        self._buffer.clear()


log_buffer = LogBuffer(maxlen=MAX_LOGS)


class LiveLogHandler(logging.Handler):
    """Logging handler that captures records into the sliding ring buffer and broadcasts to SSE subscribers."""

    def __init__(self, buffer: LogBuffer):
        super().__init__()
        self.buffer = buffer

    def emit(self, record: logging.LogRecord) -> None:
        # Ignore our own log streaming requests to avoid feedback loops
        try:
            msg = record.getMessage()
            if "/api/admin/logs" in msg or "logs/stream" in msg:
                return
            self.buffer.add_log(record)
        except Exception:
            self.handleError(record)


live_log_handler = LiveLogHandler(log_buffer)
