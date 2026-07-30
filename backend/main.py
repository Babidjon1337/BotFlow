from fastapi import FastAPI, Request, HTTPException, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.default import DefaultBotProperties
from aiogram.exceptions import TelegramUnauthorizedError
from aiogram.types import Update

from contextlib import asynccontextmanager
import uvicorn
import os
import shutil

from handlers.main_bot import main_bot_router
from handlers.user_bot import user_bot_router
from api_router import api_router, get_owned_bot
from database.requests import *
from database.models import init_models
from services.security import crypto
from services.scheduler import start_scheduler, stop_scheduler
from services.payment_link import send_success_message  # Перенесли логику в сервис
from services.payment_webhook import (
    PaymentProviderUnavailable,
    PaymentWebhookError,
    verify_payment_notification,
)
from services.saas_billing import BillingError, verify_billing_notification
from services.billing_notifications import notify_billing_user
from loggers import logger
from config import (
    CORS_ALLOWED_ORIGINS,
    ENVIRONMENT,
    WEBHOOK_URL,
    WEBAPP_URL,
    WEBHOOK_PORT,
    MAIN_BOT_TOKEN,
    SECRET_KEY,
)
from schemas.main_schemas import HealthCheckResponse, BotCreateResponse
from schemas.funnel import FunnelSchema

dp = Dispatcher()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаем папку для загрузок если её нет
    os.makedirs("uploads", exist_ok=True)
    
    # Регистрация роутеров
    if main_bot_router not in dp.sub_routers:
        dp.include_router(main_bot_router)
    if user_bot_router not in dp.sub_routers:
        dp.include_router(user_bot_router)

    await init_models()
    start_scheduler()

    session = AiohttpSession()
    main_bot = Bot(
        token=MAIN_BOT_TOKEN,
        session=session,
        default=DefaultBotProperties(parse_mode="HTML"),
    )

    app.state.session = session
    app.state.main_bot = main_bot

    await main_bot.set_webhook(
        url=f"{WEBHOOK_URL}/webhook/main",
        secret_token=SECRET_KEY,
        drop_pending_updates=True,
    )
    logger.info("Вебхук главного бота успешно установлен ✅")

    yield

    await stop_scheduler()
    if app.state.session:
        await app.state.session.close()
    logger.info("Все соединения успешно закрыты.")


app = FastAPI(lifespan=lifespan, title="Telegram Bot Constructor Backend")

cors_origins = list(CORS_ALLOWED_ORIGINS)
if not cors_origins and WEBAPP_URL:
    cors_origins = [WEBAPP_URL.rstrip("/")]
if ENVIRONMENT == "development" and not cors_origins:
    cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Монтируем папку со статикой для доступа к загруженным файлам
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.include_router(api_router)


@app.get("/", response_model=HealthCheckResponse)
async def health_check():
    return {"status": "healthy"}


# =====================================================================
# ЭНДПОИНТЫ ДАШБОРДА (API для Mini App)
# =====================================================================

@app.get("/api/funnel/{bot_id}")
async def get_funnel(bot_id: int, request: Request):
    """Возвращает текущую схему воронки для бота."""
    bot_config = await get_owned_bot(bot_id, request)
    
    return bot_config.funnel_schema or {"nodes": {}, "global_settings": {}}


@app.post("/api/funnel/{bot_id}")
async def save_funnel(bot_id: int, funnel: FunnelSchema, request: Request):
    """Deprecated compatibility endpoint for saving a V2 funnel."""
    await get_owned_bot(bot_id, request)
    await update_bot_funnel(
        bot_id,
        funnel.model_dump(by_alias=True),
        funnel_complete=True,
    )
    logger.info(f"Сохранение воронки для бота {bot_id} через устаревший маршрут")
    return {"status": "ok", "message": "Funnel saved successfully"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Загрузка медиа-файлов."""
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{os.urandom(8).hex()}{file_extension}"
    file_path = os.path.join("uploads", unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Возвращаем URL для доступа к файлу
    file_url = f"{WEBHOOK_URL}/uploads/{unique_filename}"
    return {"url": file_url, "filename": unique_filename}


@app.get("/api/stats/{bot_id}")
async def get_bot_stats(bot_id: int, request: Request):
    """Возвращает статистику воронки (имитация)."""
    await get_owned_bot(bot_id, request)
    return {
        "views": 5241,
        "clicks": 1173,
        "sales": 86,
        "conversion": 1.6,
        "revenue": 154820,
        "funnel_data": [
            {"name": "Старт", "value": 5241},
            {"name": "Клик", "value": 1173},
            {"name": "Дожим 1", "value": 408},
            {"name": "Оплата", "value": 86},
        ]
    }


# =====================================================================
# ЭНДПОИНТ 1: Обработка вебхуков Главного Бота
# =====================================================================
@app.post("/webhook/main")
async def main_bot_webhook(request: Request):
    if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != SECRET_KEY:
        logger.warning("Попытка несанкционированного доступа к вебхуку главного бота")
        raise HTTPException(status_code=403, detail="Invalid secret token")

    update_data = await request.json()
    update = Update(**update_data)
    await dp.feed_update(request.app.state.main_bot, update)
    return {"status": "ok"}


# =====================================================================
# ЭНДПОИНТ 2: Универсальный вебхук для клиентских ботов
# =====================================================================
@app.post("/webhook/bots/{bot_db_id}")
async def client_bots_webhook(bot_db_id: int, request: Request):
    if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid secret token")

    bot_config = await get_bot_by_id(bot_db_id)
    if not bot_config:
        raise HTTPException(status_code=404, detail="Bot not found")

    try:
        token = crypto.decrypt(bot_config.bot_token_enc)
        bot = Bot(
            token=token,
            session=request.app.state.session,
            default=DefaultBotProperties(parse_mode="HTML"),
        )
        update_data = await request.json()
        update = Update(**update_data)
        await dp.feed_update(bot, update)
        return {"status": "ok"}

    except TelegramUnauthorizedError:
        logger.error(f"Токен для бота {bot_db_id} недействителен. Отключаем.")
        return JSONResponse(status_code=410, content={"detail": "Token revoked"})
    except Exception as e:
        logger.exception(f"Ошибка вебхука бота {bot_db_id}: {e}")
        return JSONResponse(status_code=500, content={"detail": "Error"})


# =====================================================================
# ЭНДПОИНТ 3: Универсальный вебхук оплат
# =====================================================================
@app.post("/webhook/payments/{provider}/{tg_bot_id}")
async def universal_payment_webhook(provider: str, tg_bot_id: int, request: Request):
    try:
        normalized_provider = provider.casefold()
        if normalized_provider == "yookassa":
            data = await request.json()
        elif normalized_provider in {"robokassa", "prodamus"}:
            data = await request.form()
        else:
            raise PaymentWebhookError("Unsupported payment provider")

        bot_config = await get_bot_by_tg_id(tg_bot_id)
        if not bot_config:
            raise HTTPException(status_code=404, detail="Bot not found")

        verified_payment = await verify_payment_notification(
            normalized_provider, bot_config, data, request.headers
        )
        logger.info(
            "💰 Подтверждена оплата [%s] для бота %s, пользователь %s, платеж %s",
            verified_payment.provider.upper(),
            tg_bot_id,
            verified_payment.telegram_id,
            verified_payment.payment_id,
        )

        payment_was_new = await mark_lead_as_successful(
            tg_bot_id=tg_bot_id, telegram_id=verified_payment.telegram_id
        )
        if payment_was_new:
            await send_success_message(
                tg_bot_id=tg_bot_id,
                telegram_id=verified_payment.telegram_id,
                http_session=request.app.state.session,
            )

        if normalized_provider == "robokassa":
            return PlainTextResponse(f"OK{verified_payment.payment_id}")
        return JSONResponse({"status": "ok"})

    except PaymentWebhookError as exc:
        logger.warning("Отклонён платежный webhook [%s]: %s", provider, exc)
        raise HTTPException(status_code=403, detail="Invalid payment notification") from exc
    except PaymentProviderUnavailable as exc:
        logger.warning("Провайдер платежей недоступен [%s]: %s", provider, exc)
        raise HTTPException(status_code=503, detail="Payment verification unavailable") from exc


@app.post("/webhook/billing/yookassa")
async def saas_yookassa_webhook(request: Request):
    """Apply Bot Father purchases only after YooKassa server verification."""
    try:
        payload = await request.json()
        was_applied, user = await verify_billing_notification(payload)
    except BillingError as exc:
        logger.warning("Отклонён SaaS webhook YooKassa: %s", exc)
        raise HTTPException(status_code=403, detail="Invalid billing notification") from exc

    if was_applied and user:
        if payload.get("event") == "payment.succeeded":
            await notify_billing_user(
                user.telegram_id,
                "✅ Оплата успешно получена. Доступ Bot Father обновлён.",
            )
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=WEBHOOK_PORT, reload=True)
