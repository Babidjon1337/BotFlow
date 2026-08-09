from dotenv import load_dotenv
import os
from pathlib import Path

# Указываем путь к .env в корне проекта (на уровень выше папки backend)
root_dir = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=root_dir / ".env")

MAIN_BOT_TOKEN = os.getenv("MAIN_BOT_TOKEN")

# Runtime mode.  Insecure header-based authentication is available only when
# explicitly enabled for a local development environment.
ENVIRONMENT = os.getenv("ENVIRONMENT", "production").lower()
ALLOW_INSECURE_DEV_AUTH = (
    ENVIRONMENT == "development"
    and os.getenv("ALLOW_INSECURE_DEV_AUTH", "false").lower() == "true"
)
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = int(
    os.getenv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "86400")
)

# Защита: если нет ID, ставим 0, чтобы int() не падал
MAIN_BOT_TG_ID = int(os.getenv("MAIN_BOT_TG_ID", 0))

# Public base URL for payment-provider callbacks (YooKassa/Robokassa/Prodamus).
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
# Dedicated public base URL for Telegram updates from the main and client bots.
# Keep it separate from payment callbacks: Telegram availability and Cloudflare
# rules for this host are operationally independent from the Mini App.
TG_WEBHOOK_URL = os.getenv("TG_WEBHOOK_URL")

WEBHOOK_PORT = int(os.getenv("WEBHOOK_PORT", 8000))
PROXY_URL = os.getenv("PROXY_URL")

# Browsers with credentials must never be served with an unrestricted CORS
# policy. Production names its Mini App origin explicitly.
_configured_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = tuple(
    origin.strip().rstrip("/")
    for origin in _configured_origins.split(",")
    if origin.strip()
)

# Ссылка на Mini App Dashboard
WEBAPP_URL = os.getenv("WEBAPP_URL")

SECRET_KEY = os.getenv("SECRET_KEY")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

# YooKassa credentials for BotFlow subscriptions and permanent bot licenses.
# They are intentionally separate from the credentials stored for client bots.
SAAS_YOOKASSA_SHOP_ID = os.getenv("SAAS_YOOKASSA_SHOP_ID")
SAAS_YOOKASSA_SECRET_KEY = os.getenv("SAAS_YOOKASSA_SECRET_KEY")
# BotFlow sells a digital SaaS service. The default is "без НДС"; change it
# only when the seller's tax regime requires another fiscal rate.
SAAS_YOOKASSA_VAT_CODE = int(os.getenv("SAAS_YOOKASSA_VAT_CODE", "1"))
SAAS_LICENSE_PRICE_RUB = int(os.getenv("SAAS_LICENSE_PRICE_RUB", "2000"))
SAAS_PRO_PRICE_RUB = int(os.getenv("SAAS_PRO_PRICE_RUB", "3000"))

# Administrative access is always decided by the API.  Keep this value in the
# environment, never in the Mini App bundle.
ADMIN_TELEGRAM_IDS = frozenset(
    int(value.strip())
    for value in os.getenv("ADMIN_TELEGRAM_IDS", "").split(",")
    if value.strip().isdigit()
)

# Явно берем данные для БД
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if not POSTGRES_PASSWORD:
        raise RuntimeError(
            "Set DATABASE_URL or POSTGRES_PASSWORD in .env; database credentials "
            "must not be embedded in source code."
        )
    DATABASE_URL = (
        f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@"
        f"{DB_HOST}:{DB_PORT}/{POSTGRES_DB}"
    )

if ENVIRONMENT == "production" and not CORS_ALLOWED_ORIGINS and not WEBAPP_URL:
    raise RuntimeError(
        "Set CORS_ALLOWED_ORIGINS or WEBAPP_URL for production Mini App requests."
    )

if ENVIRONMENT == "production" and not TG_WEBHOOK_URL:
    raise RuntimeError(
        "Set TG_WEBHOOK_URL for production Telegram webhooks."
    )

if ENVIRONMENT == "production" and not WEBHOOK_URL:
    raise RuntimeError(
        "Set WEBHOOK_URL for production payment webhooks."
    )
