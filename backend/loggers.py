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

# Фильтруем рутинные 200 OK polling-запросы проверки статуса сессий загрузки медиа
class PollingEndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "media-upload-session" in msg and "200 OK" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(PollingEndpointFilter())

logger = logging.getLogger(__name__)
