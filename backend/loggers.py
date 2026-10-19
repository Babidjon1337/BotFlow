import logging

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)

# Убираем спам в логах от планировщика
logging.getLogger("apscheduler.executors.default").setLevel(logging.WARNING)
logging.getLogger("apscheduler.scheduler").setLevel(logging.WARNING)

# Убираем спам от внешних HTTP-запросов (httpx / httpcore)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Фильтруем рутинные 200 OK polling-запросы проверки статуса сессий загрузки медиа и стрима логов
class PollingEndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if ("media-upload-session" in msg or "admin/logs" in msg or "/api/events" in msg) and "200 OK" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(PollingEndpointFilter())

logger = logging.getLogger(__name__)

# Подключаем live_log_handler к корневому логгеру для стриминга логов в админку
from services.log_stream import live_log_handler
logging.getLogger().addHandler(live_log_handler)

