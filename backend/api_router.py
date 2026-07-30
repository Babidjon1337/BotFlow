import json
import datetime
from fastapi import APIRouter, Request, HTTPException
from loggers import logger
from config import ADMIN_TELEGRAM_IDS, ALLOW_INSECURE_DEV_AUTH, WEBHOOK_URL, SECRET_KEY
from services.security import crypto
from services.telegram_auth import TelegramAuthError, TelegramUser, validate_init_data
from database.requests.bot_rq import (
    get_bot_by_id,
    get_bot_by_tg_id,
    create_user_if_not_exists,
    get_user_bots,
    create_bot_config,
    update_bot_config,
    delete_bot_config,
    set_bot_status,
    assign_lifetime_license,
    update_bot_funnel,
    set_media_sync_done,
)
from database.requests.user_rq import get_lead, get_leads_by_bot_id, delete_leads_by_bot_id
from database.requests.billing_rq import cancel_subscription_auto_renew
from schemas.api_schemas import (
    BotCreateApiRequest,
    BotUpdateApiRequest,
    BotApiResponse,
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    ManualInvoiceRequest,
    FunnelApiResponse,
    FunnelUpdateApiRequest,
    LeadApiResponse,
)
from services.saas_billing import BillingError, PRODUCTS, create_checkout
from services.entitlements import available_lifetime_licenses, is_pro_active
from services.funnel_readiness import evaluate_funnel_readiness
from services.payment_link import validate_payment_credentials

api_router = APIRouter()


def _readiness_for_bot(bot) -> tuple[bool, list[str]]:
    """Return the only publishability decision used by API endpoints."""
    readiness = evaluate_funnel_readiness(
        bot.funnel_schema,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
    )
    return readiness.is_ready, list(readiness.reasons)


def _subscription_status(user) -> str:
    return "active" if is_pro_active(user) else ("expired" if user.subscription_ends_at else "none")


def _user_payload(user, telegram_id: int) -> dict:
    return {
        "telegram_id": telegram_id,
        "subscription_status": _subscription_status(user),
        "subscription_until": user.subscription_ends_at.isoformat() if user.subscription_ends_at else None,
        "slots_bought": user.lifetime_slots,
        "subscription_auto_renew": user.subscription_auto_renew,
        "subscription_retry_count": user.subscription_retry_count,
        "is_admin": telegram_id in ADMIN_TELEGRAM_IDS,
    }


def _get_development_user(request: Request) -> TelegramUser | None:
    """Return an explicitly enabled local-development identity, if any."""
    if not ALLOW_INSECURE_DEV_AUTH:
        return None

    telegram_id = request.headers.get("X-Telegram-Id") or request.headers.get(
        "X-User-Id"
    )
    if not telegram_id:
        return None
    try:
        return TelegramUser(telegram_id=int(telegram_id))
    except ValueError:
        return None


async def get_current_user(request: Request) -> TelegramUser:
    """Resolve an authenticated Telegram user for dashboard API requests."""
    init_data = request.headers.get("X-Telegram-Init-Data")
    if init_data:
        try:
            return validate_init_data(init_data)
        except TelegramAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    development_user = _get_development_user(request)
    if development_user:
        return development_user

    raise HTTPException(status_code=401, detail="Telegram authorization is required")


async def get_owned_bot(bot_id: int, request: Request):
    """Load a bot only when it belongs to the authenticated dashboard user."""
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    if bot.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Бот не найден")
    return bot


@api_router.post("/api/auth")
async def auth_user(request: Request, body: dict = None):
    body = body or {}
    init_data = body.get("init_data") or body.get("initData")
    if init_data:
        try:
            telegram_user = validate_init_data(init_data)
        except TelegramAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
    else:
        development_user = _get_development_user(request)
        if not development_user:
            raise HTTPException(
                status_code=401,
                detail="Telegram authorization is required. Open the app from Telegram.",
            )
        telegram_user = development_user

    user = await create_user_if_not_exists(telegram_id=telegram_user.telegram_id)
    bots = await get_user_bots(owner_id=user.id)

    bots_resp = [BotApiResponse.from_orm_bot(b, WEBHOOK_URL) for b in bots]
    return {
        "status": "ok",
        "user": _user_payload(user, telegram_user.telegram_id),
        "bots": [b.model_dump(by_alias=True) for b in bots_resp],
    }


@api_router.post("/api/billing/checkout", response_model=BillingCheckoutResponse)
async def create_billing_checkout(request: Request, body: BillingCheckoutRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    try:
        checkout = await create_checkout(user.id, body.product)
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return checkout


@api_router.get("/api/billing/catalog")
async def billing_catalog(request: Request):
    await get_current_user(request)
    return {
        "products": [
            {"id": "basic", "name": "Лицензия на бота", "price": PRODUCTS["basic"][1], "period": "lifetime"},
            {"id": "pro", "name": "PRO-подписка", "price": PRODUCTS["pro"][1], "period": "month"},
        ]
    }


@api_router.get("/api/billing/status")
async def billing_status(request: Request):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    return _user_payload(user, current_user.telegram_id)


@api_router.post("/api/billing/cancel")
async def cancel_billing(request: Request):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    updated = await cancel_subscription_auto_renew(user.id)
    return _user_payload(updated or user, current_user.telegram_id)


@api_router.get("/api/bots")
async def list_bots(request: Request):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    bots = await get_user_bots(owner_id=user.id)
    bots_resp = [BotApiResponse.from_orm_bot(b, WEBHOOK_URL) for b in bots]
    return {"bots": [b.model_dump(by_alias=True) for b in bots_resp]}


@api_router.post("/api/bots")
async def create_bot(request: Request, body: BotCreateApiRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    existing_user_bots = await get_user_bots(owner_id=user.id)
    is_admin = current_user.telegram_id in ADMIN_TELEGRAM_IDS
    has_pro = is_pro_active(user) or is_admin
    if has_pro and not is_admin and len(existing_user_bots) >= 10:
        raise HTTPException(status_code=403, detail="PRO позволяет создать не более 10 ботов.")
    free_license_available = available_lifetime_licenses(user, existing_user_bots)
    if not has_pro and existing_user_bots and free_license_available <= 0:
        raise HTTPException(
            status_code=403,
            detail="Для нового бота нужна лицензия или активная PRO-подписка.",
        )
    
    if not body.display_name or not body.display_name.strip():
        user_bots = await get_user_bots(owner_id=user.id)
        bot_count = len(user_bots)
        body.display_name = "Мой бот" if bot_count == 0 else f"Мой бот {bot_count + 1}"

    if body.payment_provider and body.payment_creds is not None:
        is_valid, validation_message = await validate_payment_credentials(
            body.payment_provider,
            body.payment_creds,
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=validation_message)

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties

    try:
        temp_bot = Bot(
            token=body.token,
            session=request.app.state.session,
            default=DefaultBotProperties(parse_mode="HTML"),
        )
        me = await temp_bot.get_me()
        tg_bot_id = me.id
        username = me.username
    except Exception as e:
        logger.error(f"Ошибка валидации токена: {e}")
        raise HTTPException(
            status_code=400,
            detail="Неверный токен Telegram бота. Проверьте токен от @BotFather.",
        )

    existing = await get_bot_by_tg_id(tg_bot_id)
    if existing:
        raise HTTPException(
            status_code=409, detail="Этот бот уже добавлен в систему."
        )

    token_enc = crypto.encrypt(body.token)
    creds_enc = (
        crypto.encrypt(json.dumps(body.payment_creds))
        if body.payment_creds
        else None
    )

    bot = await create_bot_config(
        owner_id=user.id,
        display_name=body.display_name,
        tg_bot_id=tg_bot_id,
        username=username,
        bot_token_enc=token_enc,
        payment_provider=body.payment_provider,
        payment_creds_enc=creds_enc,
        offer_url=body.offer_url,
        offer_installments=body.offer_installments,
    )
    if not has_pro and free_license_available > 0:
        bot = await assign_lifetime_license(bot.id) or bot

    try:
        temp_bot = Bot(token=body.token, session=request.app.state.session)
        await temp_bot.set_webhook(
            url=f"{WEBHOOK_URL}/webhook/bots/{bot.id}",
            secret_token=SECRET_KEY,
            drop_pending_updates=True,
        )
    except Exception as e:
        logger.warning(
            f"Не удалось установить вебхук для бота {bot.id}: {e}"
        )

    resp = BotApiResponse.from_orm_bot(bot, WEBHOOK_URL)
    return resp.model_dump(by_alias=True)


@api_router.get("/api/bots/{bot_id}")
async def get_bot(bot_id: int, request: Request):
    bot = await get_owned_bot(bot_id, request)
    resp = BotApiResponse.from_orm_bot(bot, WEBHOOK_URL)
    return resp.model_dump(by_alias=True)


@api_router.patch("/api/bots/{bot_id}")
@api_router.put("/api/bots/{bot_id}")
async def update_bot(bot_id: int, request: Request, body: BotUpdateApiRequest):
    bot = await get_owned_bot(bot_id, request)
    current_user = await get_current_user(request)

    update_data = {}
    token_changed = False

    if body.display_name is not None:
        update_data["display_name"] = body.display_name
    if body.offer_url is not None:
        update_data["offer_url"] = body.offer_url
    if body.offer_installments is not None:
        update_data["offer_installments"] = body.offer_installments
    if body.payment_provider is not None:
        update_data["payment_provider"] = body.payment_provider
    if body.payment_creds is not None:
        is_valid, validation_message = await validate_payment_credentials(
            body.payment_provider or bot.payment_provider,
            body.payment_creds,
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=validation_message)
        update_data["payment_creds_enc"] = crypto.encrypt(
            json.dumps(body.payment_creds)
        )

    if body.token:
        if bot.is_token_locked and not (
            is_pro_active(bot.owner) or current_user.telegram_id in ADMIN_TELEGRAM_IDS
        ):
            raise HTTPException(
                status_code=403,
                detail="Изменение токена заблокировано для активного бота с пользователями.",
            )
        from aiogram import Bot

        try:
            temp_bot = Bot(token=body.token, session=request.app.state.session)
            me = await temp_bot.get_me()
            update_data["tg_bot_id"] = me.id
            update_data["username"] = me.username
            await temp_bot.set_webhook(
                url=f"{WEBHOOK_URL}/webhook/bots/{bot.id}",
                secret_token=SECRET_KEY,
                drop_pending_updates=True,
            )
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Неверный токен: {e}"
            )
        update_data["bot_token_enc"] = crypto.encrypt(body.token)
        update_data["media_sync_done"] = False
        token_changed = True

    updated_bot = await update_bot_config(bot_id, **update_data)
    resp = BotApiResponse.from_orm_bot(updated_bot or bot, WEBHOOK_URL)
    res_dict = resp.model_dump(by_alias=True)
    res_dict["token_changed"] = token_changed
    return res_dict


@api_router.delete("/api/bots/{bot_id}")
async def delete_bot(bot_id: int, request: Request):
    bot = await get_owned_bot(bot_id, request)
    try:
        token = crypto.decrypt(bot.bot_token_enc)
        from aiogram import Bot

        temp_bot = Bot(token=token, session=request.app.state.session)
        await temp_bot.delete_webhook()
    except Exception as e:
        logger.warning(
            f"Ошибка удаления вебхука при удалении бота {bot_id}: {e}"
        )

    await delete_bot_config(bot_id)
    return {"status": "ok", "message": "Бот удален"}


@api_router.post("/api/bots/{bot_id}/toggle")
async def toggle_bot(bot_id: int, request: Request, body: dict):
    bot = await get_owned_bot(bot_id, request)
    current_user = await get_current_user(request)
    action = str(body.get("action", "")).lower()
    new_status = (
        "active"
        if action in ["start", "active", "activate", "true", "1"]
        else "draft"
    )

    if new_status == "active":
        is_ready, reasons = _readiness_for_bot(bot)
        if not is_ready:
            raise HTTPException(
                status_code=422,
                detail="Бот нельзя запустить: " + " ".join(reasons),
            )

    if new_status == "active" and not (
        is_pro_active(bot.owner) or current_user.telegram_id in ADMIN_TELEGRAM_IDS
    ):
        owner_bots = await get_user_bots(bot.owner_id)
        if not bot.has_lifetime_license:
            available = available_lifetime_licenses(bot.owner, owner_bots)
            if available <= 0:
                raise HTTPException(
                    status_code=403,
                    detail="Чтобы запустить этот бот, купите лицензию или подключите PRO.",
                )
            bot = await assign_lifetime_license(bot.id) or bot
        for owner_bot in owner_bots:
            if owner_bot.id != bot.id and owner_bot.status == "active":
                await set_bot_status(owner_bot.id, "draft")

    try:
        token = crypto.decrypt(bot.bot_token_enc)
        from aiogram import Bot

        temp_bot = Bot(token=token, session=request.app.state.session)
        if new_status == "active":
            await temp_bot.set_webhook(
                url=f"{WEBHOOK_URL}/webhook/bots/{bot.id}",
                secret_token=SECRET_KEY,
                drop_pending_updates=True,
            )
        else:
            await temp_bot.delete_webhook()
    except Exception as exc:
        logger.warning("Ошибка переключения webhook для бота %s: %s", bot_id, exc)
        if new_status == "active":
            raise HTTPException(
                status_code=502,
                detail="Telegram не подтвердил запуск бота. Проверьте токен и повторите попытку.",
            ) from exc

    updated_bot = await set_bot_status(bot_id, new_status)
    bot_url = (
        f"https://t.me/{updated_bot.username}" if updated_bot.username else None
    )
    webhook_url = f"{WEBHOOK_URL}/webhook/bots/{updated_bot.id}"
    return {
        "status": "ok",
        "message": f"Бот {'запущен' if new_status == 'active' else 'остановлен'}",
        "botStatus": new_status,
        "webhookUrl": webhook_url if new_status == "active" else None,
        "botUrl": bot_url,
    }


@api_router.get("/api/bots/{bot_id}/funnel")
async def get_bot_funnel_endpoint(bot_id: int, request: Request):
    bot = await get_owned_bot(bot_id, request)
    funnel_data = bot.funnel_schema or {"version": 2, "nodes": []}
    if isinstance(funnel_data.get("nodes"), dict):
        raise HTTPException(
            status_code=409,
            detail="Эта воронка использует устаревший формат. Сохраните её заново в редакторе.",
        )
    response = FunnelApiResponse(
        version=funnel_data.get("version", 2),
        nodes=funnel_data.get("nodes", []),
        funnelComplete=getattr(bot, "funnel_complete", False),
    )
    return response.model_dump(by_alias=True)


@api_router.get("/api/bots/{bot_id}/readiness")
async def get_bot_readiness(bot_id: int, request: Request):
    """Expose the same launch decision used by the activation endpoint."""
    bot = await get_owned_bot(bot_id, request)
    is_ready, reasons = _readiness_for_bot(bot)
    return {"isReady": is_ready, "reasons": reasons}


@api_router.put("/api/bots/{bot_id}/funnel")
@api_router.post("/api/bots/{bot_id}/funnel")
async def save_bot_funnel_endpoint(
    bot_id: int, request: Request, body: FunnelUpdateApiRequest
):
    bot = await get_owned_bot(bot_id, request)
    schema_to_save = body.as_schema().model_dump(by_alias=True)
    readiness = evaluate_funnel_readiness(
        schema_to_save,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
    )
    # The old flag is accepted for API compatibility but is no longer trusted.
    saved_bot = await update_bot_funnel(bot_id, schema_to_save, readiness.is_ready)
    stopped = False
    if saved_bot and saved_bot.status == "active" and not readiness.is_ready:
        try:
            token = crypto.decrypt(bot.bot_token_enc)
            from aiogram import Bot

            telegram_bot = Bot(token=token, session=request.app.state.session)
            await telegram_bot.delete_webhook()
        except Exception as exc:
            logger.warning("Не удалось удалить webhook невалидной воронки %s: %s", bot_id, exc)
        await set_bot_status(bot_id, "draft")
        stopped = True
    response = FunnelApiResponse(
        version=body.version,
        nodes=body.nodes,
        funnelComplete=body.funnel_complete,
    )
    return {
        "status": "ok",
        "message": "Воронка успешно сохранена",
        "funnelComplete": readiness.is_ready,
        "readinessReasons": list(readiness.reasons),
        "botStatus": "draft" if stopped else getattr(saved_bot, "status", bot.status),
        "stopped": stopped,
    }


@api_router.post("/api/bots/{bot_id}/media-sync")
async def sync_bot_media(bot_id: int, request: Request):
    await get_owned_bot(bot_id, request)
    await set_media_sync_done(bot_id, True)
    return {
        "status": "ok",
        "message": "Синхронизация медиа выполнена",
        "mediaSyncDone": True,
    }


@api_router.delete("/api/bots/{bot_id}/leads")
async def reset_bot_leads(bot_id: int, request: Request):
    """Clear lead data without resetting the permanent token-lock history."""
    await get_owned_bot(bot_id, request)
    deleted_count = await delete_leads_by_bot_id(bot_id)
    await update_bot_config(bot_id, users_count=0)
    return {"status": "ok", "deletedCount": deleted_count}


@api_router.post("/api/bots/{bot_id}/invoices")
async def send_manual_invoice(
    bot_id: int, request: Request, body: ManualInvoiceRequest
):
    """Create a payment link from the saved funnel tariffs and send it to a lead."""
    bot = await get_owned_bot(bot_id, request)
    lead = await get_lead(bot_id, body.lead_telegram_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    nodes = (bot.funnel_schema or {}).get("nodes", [])
    payment_node = next((node for node in nodes if node.get("id") == "payment"), None)
    available = (payment_node or {}).get("tariffs") or []
    tariffs = [tariff for tariff in available if str(tariff.get("id")) in set(body.tariff_ids)]
    if not tariffs:
        raise HTTPException(status_code=400, detail="Выберите действующий тариф из воронки")

    try:
        amount = sum(float(tariff.get("price", 0)) for tariff in tariffs)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="У выбранного тарифа неверная цена") from exc
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма счёта должна быть больше нуля")

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    from services.payment_link import generate_payment_link
    from services.billing_notifications import notify_billing_user

    description = ", ".join(str(tariff.get("name", "Тариф")) for tariff in tariffs)
    tariff_details = "\n\n".join(
        "\n".join(
            part
            for part in [
                f"<b>{tariff.get('name') or 'Тариф'}</b>",
                str(tariff.get("description") or "").strip(),
                f"{float(tariff.get('price', 0)):,.0f} ₽".replace(",", " "),
            ]
            if part
        )
        for tariff in tariffs
    )
    payment_url = await generate_payment_link(bot, amount, description, lead.telegram_id)
    if not payment_url:
        try:
            token = crypto.decrypt(bot.bot_token_enc)
            telegram_bot = Bot(token=token, session=request.app.state.session)
            await telegram_bot.send_message(
                lead.telegram_id,
                "⚠️ Не удалось сформировать счёт. Мы уже сообщили владельцу — попробуйте немного позже.",
            )
        except Exception as exc:
            logger.warning("Не удалось сообщить лиду об ошибке счёта: %s", exc)
        await notify_billing_user(
            bot.owner.telegram_id,
            f"⚠️ Не удалось сформировать счёт для лида {lead.first_name or lead.telegram_id}. Проверьте реквизиты кассы в настройках бота «{bot.display_name}».",
        )
        raise HTTPException(status_code=400, detail="Счёт не создан: проверьте реквизиты платёжной системы")
    try:
        token = crypto.decrypt(bot.bot_token_enc)
        telegram_bot = Bot(
            token=token,
            session=request.app.state.session,
            default=DefaultBotProperties(parse_mode="HTML"),
        )
        await telegram_bot.send_message(
            lead.telegram_id,
            f"🧾 <b>Ваш счёт готов</b>\n\n{tariff_details}\n\n<b>К оплате: {amount:,.0f} ₽</b>".replace(",", " "),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(text="Оплатить", url=payment_url, style="success")
            ]]),
        )
    except Exception as exc:
        logger.exception("Не удалось отправить ручной счёт")
        raise HTTPException(status_code=502, detail="Не удалось отправить счёт в Telegram") from exc
    return {"status": "ok", "message": "Счёт отправлен"}


@api_router.get("/api/bots/{bot_id}/leads")
async def get_bot_leads_endpoint(
    bot_id: int, request: Request, search: str = None, page: int = 1, limit: int = 20
):
    await get_owned_bot(bot_id, request)
    leads, total = await get_leads_by_bot_id(
        bot_id, search=search, page=page, limit=limit
    )
    leads_resp = [
        LeadApiResponse.from_orm_lead(l).model_dump(by_alias=True)
        for l in leads
    ]
    return {"leads": leads_resp, "total": total}


@api_router.get("/api/bots/{bot_id}/stats")
async def get_bot_stats_endpoint(bot_id: int, request: Request):
    await get_owned_bot(bot_id, request)
    leads, total = await get_leads_by_bot_id(bot_id, limit=10000)
    views = total
    clicks = sum(
        1
        for l in leads
        if l.current_step_id and l.current_step_id != "node_start"
    )
    sales = sum(
        1
        for l in leads
        if l.has_purchased or l.current_step_id in ["node_success", "success", "delivery"]
    )
    conversion = round((sales / views * 100), 1) if views > 0 else 0.0
    revenue = sales * 1500

    return {
        "views": views,
        "clicks": clicks,
        "sales": sales,
        "conversion": conversion,
        "revenue": revenue,
        "funnel_data": [
            {"name": "Старт", "value": views},
            {"name": "Клик", "value": clicks},
            {"name": "Дожим 1", "value": int(clicks * 0.4)},
            {"name": "Оплата", "value": sales},
        ],
        "chart_data": [
            {"name": (datetime.datetime.now() - datetime.timedelta(days=6)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=5)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=4)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=3)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=2)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%d.%m"), "Просмотры": 0, "Продажи": 0},
            {"name": (datetime.datetime.now()).strftime("%d.%m"), "Просмотры": views, "Продажи": sales},
        ],
        "events": [],
    }
