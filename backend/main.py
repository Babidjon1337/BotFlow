from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.default import DefaultBotProperties
from aiogram.exceptions import TelegramUnauthorizedError
from aiogram.types import Update

from contextlib import asynccontextmanager
import uvicorn
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from handlers.main_bot import main_bot_router
from handlers.user_bot import user_bot_router
from api_router import api_router, get_owned_bot
from database.requests import *
from database.models import init_models
from services.security import crypto
from services.scheduler import start_scheduler, stop_scheduler
from services.funnel_readiness import evaluate_funnel_readiness
from services.payment_webhook import (
    PaymentProviderUnavailable,
    PaymentWebhookError,
    parse_prodamus_notification,
    verify_payment_notification,
)
from services.saas_billing import (
    BillingError,
    BillingProviderUnavailable,
    verify_billing_notification,
)
from services.billing_notifications import notify_billing_user
from database.requests.client_payment_rq import (
    ClientPaymentInvariantError,
    mark_client_payment_succeeded,
)
from services.payment_fulfillment import process_client_payment_fulfillment
from loggers import logger
from config import (
    CORS_ALLOWED_ORIGINS,
    ENVIRONMENT,
    TG_WEBHOOK_URL,
    WEBAPP_URL,
    WEBHOOK_PORT,
    MAIN_BOT_TOKEN,
    PROXY_URL,
    SECRET_KEY,
)
from schemas.main_schemas import HealthCheckResponse
from schemas.funnel import FunnelSchema

dp = Dispatcher()


@asynccontextmanager
async def lifespan(app: FastAPI):

    # Регистрация роутеров
    if main_bot_router not in dp.sub_routers:
        dp.include_router(main_bot_router)
    if user_bot_router not in dp.sub_routers:
        dp.include_router(user_bot_router)

    await init_models()
    start_scheduler()

    session = AiohttpSession(proxy=PROXY_URL) if PROXY_URL else AiohttpSession()
    main_bot = Bot(
        token=MAIN_BOT_TOKEN,
        session=session,
        default=DefaultBotProperties(parse_mode="HTML"),
    )

    app.state.session = session
    app.state.main_bot = main_bot

    try:
        await main_bot.set_webhook(
            url=f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/main",
            secret_token=SECRET_KEY,
            drop_pending_updates=True,
        )
    except Exception:
        # A proxy or Telegram connectivity failure must not leave the temporary
        # startup HTTP sessions open while systemd restarts the process.
        await session.close()
        await stop_scheduler()
        raise
    logger.info("Вебхук главного бота успешно установлен ✅")

    yield

    await stop_scheduler()
    from services.broadcast import close_broadcast_session
    from services.billing_notifications import close_billing_notification_session
    from services.media_upload_session import cancel_all_upload_sessions

    cancel_all_upload_sessions()
    await close_broadcast_session()
    await close_billing_notification_session()
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

from limiter import limiter
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict):
        code = exc.detail.get("code", "error")
        message = exc.detail.get("message") or exc.detail.get("detail", "Произошла ошибка")
        detail = exc.detail.get("detail", message)
    else:
        code = "error"
        message = str(exc.detail) if exc.detail else "Произошла ошибка"
        detail = message
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": code, "message": message, "detail": detail},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_err = errors[0] if errors else {}
    loc = " -> ".join(str(l) for l in first_err.get("loc", []) if l != "body")
    msg = first_err.get("msg", "Некорректные данные")
    user_msg = f"Ошибка в поле '{loc}': некорректное значение." if loc else "Некорректные данные запроса."
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": user_msg,
            "detail": f"{loc}: {msg}" if loc else msg,
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Необработанная ошибка сервера при обработке %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={
            "code": "internal_server_error",
            "message": "Внутренняя ошибка сервера. Пожалуйста, повторите попытку позже.",
            "detail": "Сервер временно не может обработать запрос.",
        },
    )


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
    """Deprecated compatibility endpoint with the canonical launch checks."""
    bot = await get_owned_bot(bot_id, request)
    schema = funnel.model_dump(by_alias=True)
    from database.requests.connected_chat_rq import list_connected_chats
    connected_chats = await list_connected_chats(bot_id)
    readiness = evaluate_funnel_readiness(
        schema,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
        connected_chat_ids={chat.chat_id for chat in connected_chats},
    )
    saved_bot = await update_bot_funnel(
        bot_id,
        schema,
        funnel_complete=readiness.is_ready,
    )
    stopped = False
    if saved_bot and saved_bot.status == "active" and not readiness.is_ready:
        try:
            token = crypto.decrypt(saved_bot.bot_token_enc)
            telegram_bot = Bot(token=token, session=request.app.state.session)
            await telegram_bot.delete_webhook()
            await set_bot_status(saved_bot.id, "draft")
            stopped = True
        except Exception as exc:
            logger.warning("Не удалось остановить неполную воронку %s: %s", bot_id, exc)
    logger.info(f"Сохранение воронки для бота {bot_id} через устаревший маршрут")
    return {
        "status": "ok",
        "message": "Funnel saved successfully",
        "funnelComplete": readiness.is_ready,
        "readinessReasons": list(readiness.reasons),
        "stopped": stopped,
    }


# =====================================================================
# ЭНДПОИНТ 1: Обработка вебхуков Главного Бота
# =====================================================================
@app.post("/webhook/main")
@limiter.exempt
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
@limiter.exempt
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
@app.post("/webhook/payments/{provider}")
@app.post("/webhook/payments/{provider}/")
@app.post("/webhook/payments/{provider}/{tg_bot_id}")
@app.post("/webhook/payments/{provider}/{tg_bot_id}/")
@limiter.exempt
async def universal_payment_webhook(
    provider: str,
    request: Request,
    tg_bot_id: int | None = None,
):
    try:
        normalized_provider = provider.casefold()
        raw_body = None
        raw_data = None
        if normalized_provider == "yookassa":
            data = await request.json()
        elif normalized_provider == "prodamus":
            content_type = request.headers.get("content-type", "")
            raw_body = await request.body()
            if "application/json" in content_type:
                try:
                    raw_data = await request.json()
                except Exception:
                    try:
                        raw_data = json.loads(raw_body.decode("utf-8", errors="replace"))
                    except Exception:
                        raw_data = None
            else:
                try:
                    form = await request.form()
                    raw_data = dict(form)
                except Exception:
                    raw_data = None
            data = parse_prodamus_notification(raw_data if raw_data is not None else raw_body)
        elif normalized_provider == "robokassa":
            data = await request.form()
        else:
            raise PaymentWebhookError("Unsupported payment provider")

        bot_config = None
        if tg_bot_id is not None:
            bot_config = await get_bot_by_tg_id(tg_bot_id)

        if not bot_config:
            from database.models import async_session, BotConfig, ClientPayment
            from sqlalchemy import select
            import uuid
            order_candidates = [
                data.get("order_num"),
                data.get("order_id"),
                data.get("shp_client_payment_id"),
            ]
            async with async_session() as session:
                for cand in order_candidates:
                    if cand:
                        try:
                            order_uuid = uuid.UUID(str(cand))
                            client_pmt = await session.get(ClientPayment, order_uuid)
                            if client_pmt:
                                bot_config = await session.get(BotConfig, client_pmt.bot_id)
                                break
                        except (ValueError, TypeError):
                            pass
                if not bot_config:
                    bot_config = await session.scalar(
                        select(BotConfig).where(BotConfig.payment_provider == normalized_provider)
                    )

        if not bot_config:
            raise HTTPException(status_code=404, detail="Bot not found")

        verified_payment = await verify_payment_notification(
            normalized_provider,
            bot_config,
            data,
            request.headers,
            query_params=dict(request.query_params),
            raw_payload=raw_data,
            raw_body=raw_body,
            raw_data=raw_data,
        )
        logger.info(
            "💰 Подтверждена оплата [%s] для бота %s, пользователь %s, платеж %s",
            verified_payment.provider.upper(),
            tg_bot_id,
            verified_payment.telegram_id,
            verified_payment.payment_id,
        )

        if (
            not verified_payment.client_payment_id
            or verified_payment.amount is None
            or not verified_payment.currency
        ):
            raise PaymentWebhookError("Payment is not linked to a client order")
        try:
            payment, newly_paid = await mark_client_payment_succeeded(
                payment_id=verified_payment.client_payment_id,
                bot_id=bot_config.id,
                provider=verified_payment.provider,
                provider_payment_id=verified_payment.payment_id,
                amount=verified_payment.amount,
                currency=verified_payment.currency,
                telegram_id=verified_payment.telegram_id,
            )
        except ClientPaymentInvariantError as exc:
            raise PaymentWebhookError(str(exc)) from exc

        fulfillment = await process_client_payment_fulfillment(
            payment.id, getattr(request.app.state, "session", None)
        )
        logger.info(
            "Платёж обработан: payment_id=%s, new=%s, access=%s, owner_notice=%s",
            payment.id,
            newly_paid,
            fulfillment["access_delivered"],
            fulfillment["owner_notified"],
        )

        if normalized_provider == "robokassa":
            return PlainTextResponse(f"OK{verified_payment.payment_id}")
        return JSONResponse({"status": "ok"})

    except PaymentWebhookError as exc:
        logger.warning("Отклонён платежный webhook [%s]: %s", provider, exc)
        raise HTTPException(
            status_code=403, detail="Invalid payment notification"
        ) from exc
    except PaymentProviderUnavailable as exc:
        logger.warning("Провайдер платежей недоступен [%s]: %s", provider, exc)
        raise HTTPException(
            status_code=503, detail="Payment verification unavailable"
        ) from exc


@app.post("/webhook/billing/yookassa")
@limiter.exempt
async def saas_yookassa_webhook(request: Request):
    """Apply BotFlow purchases only after YooKassa server verification."""
    try:
        payload = await request.json()
        was_applied, user = await verify_billing_notification(payload)
    except BillingProviderUnavailable as exc:
        logger.warning("Верификация SaaS-платежа временно недоступна: %s", exc)
        raise HTTPException(
            status_code=503, detail="Payment verification unavailable"
        ) from exc
    except BillingError as exc:
        logger.warning("Отклонён SaaS webhook YooKassa: %s", exc)
        raise HTTPException(
            status_code=403, detail="Invalid billing notification"
        ) from exc

    if was_applied and user:
        if payload.get("event") == "payment.succeeded":
            await notify_billing_user(
                user.telegram_id,
                "✅ Оплата успешно получена. Доступ BotFlow обновлён.",
            )
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=WEBHOOK_PORT)
