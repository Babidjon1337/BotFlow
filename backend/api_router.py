import json
import io
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from loggers import logger
from config import (
    ADMIN_TELEGRAM_IDS,
    ALLOW_INSECURE_DEV_AUTH,
    SECRET_KEY,
    TG_WEBHOOK_URL,
    WEBHOOK_URL,
)
from services.security import crypto
from services.telegram_auth import TelegramAuthError, TelegramUser, validate_init_data
from database.requests.bot_rq import (
    get_bot_by_id,
    get_bot_by_tg_id,
    create_user_if_not_exists,
    get_user_by_tg_id,
    get_user_bots,
    get_bot_subscription,
    create_bot_config,
    update_bot_config,
    delete_bot_config,
    set_bot_status,
    set_bot_lifecycle_state,
    assign_lifetime_license,
    update_bot_funnel,
    set_media_sync_done,
)
from database.requests.user_rq import archive_leads_by_bot_id, get_lead, get_leads_by_bot_id
from database.requests.client_payment_rq import (
    ClientPaymentDeliveryRetryError,
    get_chart_data,
    get_client_payment_stats,
    requeue_client_payment_delivery,
)
from database.requests.billing_rq import cancel_subscription_auto_renew
from database.requests.connected_chat_rq import list_connected_chats, delete_connected_chat
from database.requests.admin_rq import (
    get_admin_overview,
    get_admin_user_detail,
    list_admin_audit_log,
    list_admin_bots,
    list_admin_operations,
    list_admin_saas_payments,
    list_admin_users,
    write_admin_audit_log,
    AdminMutationError,
    change_admin_user_lifetime_licenses,
    disable_admin_user_auto_renew,
    extend_admin_user_pro,
    set_admin_user_access,
)
from schemas.api_schemas import (
    BotCreateApiRequest,
    BotUpdateApiRequest,
    BotApiResponse,
    BillingCheckoutRequest,
    BillingCheckoutResponse,
    NotificationSettingsRequest,
    AdminLifetimeLicenseRequest,
    AdminProExtensionRequest,
    AdminUserAccessRequest,
    AdminBotActionRequest,
    ManualInvoiceRequest,
    ChatDeliveryVerifyRequest,
    FunnelApiResponse,
    FunnelUpdateApiRequest,
    LeadApiResponse,
)
from services.saas_billing import BillingError, PRODUCTS, create_checkout
from services.entitlements import available_lifetime_licenses, is_pro_active
from services.funnel_readiness import evaluate_funnel_readiness
from services.bot_lifecycle import BotLifecycleService
from services.bot_entitlement import BotEntitlementService
from services.bot_pricing import BASE_SCENARIO_TYPE, BotPricingService
from services.payment_link import validate_payment_credentials
from services.payment_fulfillment import process_client_payment_fulfillment
from services.chat_access import ChatAccessError, verify_chat_delivery

api_router = APIRouter()

# Telegram does not send chat_member updates by default. They are required to
# recognise that the buyer joined through their one-use paid invite.
CLIENT_BOT_ALLOWED_UPDATES = [
    "message",
    "callback_query",
    "channel_post",
    "chat_member",
    "my_chat_member",
]


def _validate_installments(provider: str | None, enabled: bool) -> None:
    if enabled and (provider or "").casefold() != "yookassa":
        raise HTTPException(
            status_code=422,
            detail="Рассрочка сейчас поддерживается только для ЮKassa.",
        )


async def _readiness_for_bot(bot) -> tuple[bool, list[str]]:
    """Return the only publishability decision used by API endpoints."""
    connected_chats = await list_connected_chats(bot.id)
    readiness = evaluate_funnel_readiness(
        bot.funnel_schema,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
        connected_chat_ids={chat.chat_id for chat in connected_chats},
    )
    return readiness.is_ready, list(readiness.reasons)


def _readiness_reason_details(reasons: list[str]) -> list[dict[str, str]]:
    """Add stable machine codes without changing legacy user-facing reasons."""
    codes = (
        ("Сохраните воронку", "funnel_format_invalid"),
        ("Добавьте блок", "required_node_missing"),
        ("Заполните текст", "message_content_missing"),
        ("Заполните кнопку", "button_missing"),
        ("платёжную систему", "payment_provider_missing"),
        ("реквизиты платёжной системы", "payment_credentials_missing"),
        ("тариф", "tariff_invalid"),
    )
    return [
        {
            "code": next((code for phrase, code in codes if phrase in reason), "configuration_invalid"),
            "message": reason,
        }
        for reason in reasons
    ]


async def _connected_chat_ids_for_bot(bot) -> set[str]:
    connected_chats = await list_connected_chats(bot.id)
    return {chat.chat_id for chat in connected_chats}


bot_lifecycle_service = BotLifecycleService(
    connected_chat_ids_for=_connected_chat_ids_for_bot,
)
bot_pricing_service = BotPricingService()
bot_entitlement_service = BotEntitlementService()


async def _install_client_bot_webhook(bot, request) -> None:
    """Install the fixed client-bot webhook without exposing its token."""
    try:
        token = crypto.decrypt(bot.bot_token_enc)
        from aiogram import Bot

        telegram_bot = Bot(token=token, session=request.app.state.session)
        await telegram_bot.set_webhook(
            url=f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/bots/{bot.id}",
            secret_token=SECRET_KEY,
            drop_pending_updates=True,
            allowed_updates=CLIENT_BOT_ALLOWED_UPDATES,
        )
    except Exception as exc:
        logger.warning("Не удалось установить webhook для бота %s: %s", bot.id, exc)
        raise HTTPException(
            status_code=502,
            detail="Telegram не подтвердил webhook бота. Проверьте токен и повторите попытку.",
        ) from exc


async def _remove_client_bot_webhook(bot, request) -> None:
    """Remove the client-bot webhook before reporting the bot as stopped."""
    try:
        token = crypto.decrypt(bot.bot_token_enc)
        from aiogram import Bot

        telegram_bot = Bot(token=token, session=request.app.state.session)
        await telegram_bot.delete_webhook()
    except Exception as exc:
        logger.warning("Не удалось удалить webhook для бота %s: %s", bot.id, exc)
        raise HTTPException(
            status_code=502,
            detail="Telegram не подтвердил остановку бота. Повторите попытку.",
        ) from exc


async def _toggle_client_bot(
    bot,
    request: Request,
    *,
    action: str,
    allow_admin_entitlement_bypass: bool,
) -> dict:
    """Apply the one shared start/stop policy for owners and administrators."""
    new_status = "active" if action in ["start", "active", "activate", "true", "1"] else "draft"

    dedicated_subscription = (
        await get_bot_subscription(bot.id) if new_status == "active" else None
    )

    if dedicated_subscription is not None:
        if not bot_entitlement_service.can_publish(dedicated_subscription):
            raise HTTPException(
                status_code=403,
                detail="Подписка этого бота неактивна или закончилась.",
            )
    elif new_status == "active" and not (
        is_pro_active(bot.owner) or allow_admin_entitlement_bypass
    ):
        # Bots that predate BotSubscription retain the legacy account-level
        # checkout semantics until their subscription is explicitly migrated.
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
                await set_bot_lifecycle_state(owner_bot.id, "paused", "subscription")

    try:
        if new_status == "active":
            await bot_lifecycle_service.transition(bot, "published")
        else:
            await bot_lifecycle_service.transition(bot, "paused", reason="manual")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Бот нельзя запустить: " + str(exc)) from exc

    if new_status == "active":
        await _install_client_bot_webhook(bot, request)
    else:
        await _remove_client_bot_webhook(bot, request)

    updated_bot = await set_bot_lifecycle_state(
        bot.id, bot.lifecycle_status, bot.pause_reason
    )
    if not updated_bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    bot_url = f"https://t.me/{updated_bot.username}" if updated_bot.username else None
    webhook_url = f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/bots/{updated_bot.id}"
    return {
        "status": "ok",
        "message": f"Бот {'запущен' if new_status == 'active' else 'остановлен'}",
        "botStatus": new_status,
        "webhookUrl": webhook_url if new_status == "active" else None,
        "botUrl": bot_url,
    }


def _merged_payment_credentials(bot, incoming: dict | None, provider_changed: bool) -> dict:
    """Apply partial credential changes without ever returning secrets to the client."""
    existing: dict = {}
    if not provider_changed and getattr(bot, "payment_creds_enc", None):
        try:
            existing = json.loads(crypto.decrypt(bot.payment_creds_enc))
        except Exception:
            logger.warning("Не удалось прочитать сохранённые реквизиты бота %s", bot.id)
    updates = {
        str(key): value.strip() if isinstance(value, str) else value
        for key, value in (incoming or {}).items()
        if value is not None and (not isinstance(value, str) or value.strip())
    }
    return {**existing, **updates}


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
        "email": user.email,
        "email_receipts_enabled": user.email_receipts_enabled,
        "email_billing_notifications_enabled": user.email_billing_notifications_enabled,
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
            telegram_user = validate_init_data(init_data)
        except TelegramAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        await _ensure_account_is_active(telegram_user.telegram_id)
        return telegram_user

    development_user = _get_development_user(request)
    if development_user:
        await _ensure_account_is_active(development_user.telegram_id)
        return development_user

    raise HTTPException(status_code=401, detail="Telegram authorization is required")


async def _ensure_account_is_active(telegram_id: int) -> None:
    """Reject a paused SaaS account across all authenticated Mini App routes."""
    account = await get_user_by_tg_id(telegram_id)
    if account and account.is_disabled:
        raise HTTPException(
            status_code=403,
            detail="Доступ к BotFlow временно ограничен. Свяжитесь с поддержкой.",
        )


async def get_current_admin(request: Request) -> TelegramUser:
    """Resolve a Telegram identity and enforce the server-side admin allowlist."""
    current_user = await get_current_user(request)
    if current_user.telegram_id not in ADMIN_TELEGRAM_IDS:
        raise HTTPException(status_code=403, detail="Administrative access is required")
    return current_user


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

    await _ensure_account_is_active(telegram_user.telegram_id)
    user = await create_user_if_not_exists(
        telegram_id=telegram_user.telegram_id,
        username=telegram_user.username,
        refresh_username=True,
    )
    bots = await get_user_bots(owner_id=user.id)

    bots_resp = []
    for b in bots:
        resp = BotApiResponse.from_orm_bot(b, TG_WEBHOOK_URL, WEBHOOK_URL)
        sales, revenue = await get_client_payment_stats(b.id)
        resp.sales = sales
        resp.revenue = float(revenue)
        bots_resp.append(resp)

    return {
        "status": "ok",
        "user": _user_payload(user, telegram_user.telegram_id),
        "bots": [b.model_dump(by_alias=True) for b in bots_resp],
    }


@api_router.get("/api/admin/overview")
async def get_admin_overview_endpoint(request: Request):
    """Return truthful, platform-wide operational metrics to administrators only."""
    await get_current_admin(request)
    return await get_admin_overview()


@api_router.get("/api/admin/users")
async def get_admin_users_endpoint(
    request: Request,
    query: str | None = Query(default=None, max_length=255),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
):
    """List bot owners for support without returning secret or payment credentials."""
    await get_current_admin(request)
    users, total = await list_admin_users(
        query=query,
        page=page,
        limit=limit,
        protected_admin_telegram_ids=ADMIN_TELEGRAM_IDS,
    )
    return {"users": users, "total": total, "page": page, "limit": limit}


@api_router.get("/api/admin/users/{user_id}")
async def get_admin_user_detail_endpoint(user_id: int, request: Request):
    """Open a support-safe owner profile with only that owner's bots."""
    await get_current_admin(request)
    detail = await get_admin_user_detail(
        user_id=user_id,
        protected_admin_telegram_ids=ADMIN_TELEGRAM_IDS,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return detail


@api_router.post("/api/admin/users/{user_id}/access")
async def update_admin_user_access_endpoint(
    user_id: int, request: Request, body: AdminUserAccessRequest
):
    """Pause/restore Mini App access and optionally stop the owner's active bots."""
    admin = await get_current_admin(request)
    try:
        return await set_admin_user_access(
            user_id=user_id,
            disabled=body.disabled,
            stop_active_bots=body.stop_active_bots,
            actor_telegram_id=admin.telegram_id,
            protected_admin_telegram_ids=ADMIN_TELEGRAM_IDS,
        )
    except AdminMutationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.post("/api/admin/users/{user_id}/lifetime-licenses")
async def change_admin_user_lifetime_licenses_endpoint(
    user_id: int, request: Request, body: AdminLifetimeLicenseRequest
):
    """Adjust available permanent-license capacity without detaching existing bots."""
    admin = await get_current_admin(request)
    try:
        return await change_admin_user_lifetime_licenses(
            user_id=user_id,
            direction=body.direction,
            quantity=body.quantity,
            actor_telegram_id=admin.telegram_id,
        )
    except AdminMutationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.post("/api/admin/users/{user_id}/pro")
async def extend_admin_user_pro_endpoint(
    user_id: int, request: Request, body: AdminProExtensionRequest
):
    """Extend a user's PRO expiry from the later of now or their current expiry."""
    admin = await get_current_admin(request)
    try:
        return await extend_admin_user_pro(
            user_id=user_id,
            days=body.days,
            actor_telegram_id=admin.telegram_id,
        )
    except AdminMutationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.post("/api/admin/users/{user_id}/cancel-auto-renew")
async def disable_admin_user_auto_renew_endpoint(user_id: int, request: Request):
    """Disable only future automatic payments; the paid PRO period stays unchanged."""
    admin = await get_current_admin(request)
    try:
        return await disable_admin_user_auto_renew(
            user_id=user_id,
            actor_telegram_id=admin.telegram_id,
        )
    except AdminMutationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.get("/api/admin/bots")
async def get_admin_bots_endpoint(
    request: Request,
    query: str | None = Query(default=None, max_length=255),
    status: str | None = Query(default=None, pattern="^(draft|active|archived)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
):
    """List operational bot metadata for administrators only."""
    await get_current_admin(request)
    bots, total = await list_admin_bots(query=query, status=status, page=page, limit=limit)
    return {"bots": bots, "total": total, "page": page, "limit": limit}


@api_router.post("/api/admin/bots/{bot_id}/action")
async def admin_bot_action_endpoint(
    bot_id: int, request: Request, body: AdminBotActionRequest
):
    """Run a traced, entitlement-safe operational action on a customer bot."""
    admin = await get_current_admin(request)
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")

    if body.action == "reinstall_webhook":
        await _install_client_bot_webhook(bot, request)
        result = {
            "status": "ok",
            "message": "Webhook переустановлен",
            "botStatus": bot.status,
            "webhookUrl": f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/bots/{bot.id}",
        }
    else:
        # A platform operator cannot silently bypass a customer's purchased
        # license/PRO limits by starting their bot from the admin panel.
        result = await _toggle_client_bot(
            bot,
            request,
            action=body.action,
            allow_admin_entitlement_bypass=False,
        )

    await write_admin_audit_log(
        actor_telegram_id=admin.telegram_id,
        action=f"bot_{body.action}",
        target_type="bot",
        target_id=bot.id,
        details={"owner_id": bot.owner_id, "status": result["botStatus"]},
    )
    return result


@api_router.get("/api/admin/bots/{bot_id}/readiness")
async def admin_bot_readiness_endpoint(bot_id: int, request: Request):
    """Expose the exact launch decision to an administrator without mutating a bot."""
    await get_current_admin(request)
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    is_ready, reasons = await _readiness_for_bot(bot)
    return {"isReady": is_ready, "reasons": reasons}


@api_router.post("/api/admin/bots/{bot_id}/archive-leads")
async def archive_admin_bot_leads_endpoint(bot_id: int, request: Request):
    """Archive a bot's active CRM leads without destroying paid-order history."""
    admin = await get_current_admin(request)
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    archived_count = await archive_leads_by_bot_id(bot.id)
    await write_admin_audit_log(
        actor_telegram_id=admin.telegram_id,
        action="bot_leads_archived",
        target_type="bot",
        target_id=bot.id,
        details={"owner_id": bot.owner_id, "archived_count": archived_count},
    )
    return {"status": "ok", "archivedCount": archived_count}


@api_router.get("/api/admin/payments")
async def get_admin_saas_payments_endpoint(
    request: Request,
    status: str | None = Query(default=None, pattern="^(pending|succeeded|failed)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
):
    """List BotFlow's own payment history. Provider truth is read-only here."""
    await get_current_admin(request)
    payments, total = await list_admin_saas_payments(status=status, page=page, limit=limit)
    return {"payments": payments, "total": total, "page": page, "limit": limit}


@api_router.get("/api/admin/operations")
async def get_admin_operations_endpoint(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
):
    """List paid client orders that still need fulfilment or owner notification."""
    await get_current_admin(request)
    operations, total = await list_admin_operations(page=page, limit=limit)
    return {"operations": operations, "total": total, "page": page, "limit": limit}


@api_router.post("/api/admin/operations/{payment_id}/retry")
async def retry_admin_operation_endpoint(payment_id: UUID, request: Request):
    """Retry only unfinished outbox work for an already verified client payment."""
    admin = await get_current_admin(request)
    try:
        requeued = await requeue_client_payment_delivery(payment_id)
    except ClientPaymentDeliveryRetryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    result = await process_client_payment_fulfillment(payment_id, request.app.state.session)
    await write_admin_audit_log(
        actor_telegram_id=admin.telegram_id,
        action="payment_delivery_retry",
        target_type="client_payment",
        target_id=str(payment_id),
        details={**requeued, **result},
    )
    return {"status": "ok", **requeued, **result}


@api_router.get("/api/admin/audit-log")
async def get_admin_audit_log_endpoint(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
):
    """Read append-only administrative history."""
    await get_current_admin(request)
    entries, total = await list_admin_audit_log(page=page, limit=limit)
    return {"entries": entries, "total": total, "page": page, "limit": limit}


@api_router.get("/api/admin/system")
async def get_admin_system_endpoint(request: Request):
    """Expose only the current process' verifiable scheduler state to admins."""
    await get_current_admin(request)
    # Import lazily: the scheduler owns an HTTP session and must not be
    # initialised merely because a regular API route is imported or tested.
    from services.scheduler import get_scheduler_health

    return get_scheduler_health()


@api_router.post("/api/billing/checkout", response_model=BillingCheckoutResponse)
async def create_billing_checkout(request: Request, body: BillingCheckoutRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    checkout_email = body.email.strip().lower() if body.email else user.email
    if checkout_email and ("@" not in checkout_email or len(checkout_email) > 320):
        raise HTTPException(status_code=422, detail="Введите корректный email.")
    if body.email and checkout_email != user.email:
        user = await update_user_notification_settings(
            user.id,
            email=checkout_email,
            email_receipts_enabled=user.email_receipts_enabled,
            email_billing_notifications_enabled=user.email_billing_notifications_enabled,
        ) or user
    try:
        checkout = await create_checkout(
            user.id,
            body.product,
            receipt_email=checkout_email if user.email_receipts_enabled else None,
        )
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return checkout


@api_router.put("/api/profile/notification-settings")
async def update_notification_settings(request: Request, body: NotificationSettingsRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    email = body.email.strip().lower() if body.email else None
    if email and ("@" not in email or len(email) > 320):
        raise HTTPException(status_code=422, detail="Введите корректный email.")
    updated = await update_user_notification_settings(
        user.id,
        email=email,
        email_receipts_enabled=body.email_receipts_enabled,
        email_billing_notifications_enabled=body.email_billing_notifications_enabled,
    )
    return _user_payload(updated or user, current_user.telegram_id)


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
    
    bots_resp = []
    for b in bots:
        resp = BotApiResponse.from_orm_bot(b, TG_WEBHOOK_URL, WEBHOOK_URL)
        sales, revenue = await get_client_payment_stats(b.id)
        resp.sales = sales
        resp.revenue = float(revenue)
        bots_resp.append(resp)
        
    return {"bots": [b.model_dump(by_alias=True) for b in bots_resp]}


@api_router.post("/api/bots")
async def create_bot(request: Request, body: BotCreateApiRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    if not body.display_name or not body.display_name.strip():
        user_bots = await get_user_bots(owner_id=user.id)
        bot_count = len(user_bots)
        body.display_name = "Мой бот" if bot_count == 0 else f"Мой бот {bot_count + 1}"

    _validate_installments(body.payment_provider, body.offer_installments)

    if body.payment_provider and body.payment_creds is not None:
        is_valid, validation_message = await validate_payment_credentials(
            body.payment_provider,
            body.payment_creds,
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=validation_message)

    tg_bot_id = None
    username = None
    token_enc = None
    if body.token:
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
            raise HTTPException(status_code=409, detail="Этот бот уже добавлен в систему.")
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
    if not body.token:
        resp = BotApiResponse.from_orm_bot(bot, TG_WEBHOOK_URL, WEBHOOK_URL)
        return resp.model_dump(by_alias=True)

    try:
        temp_bot = Bot(token=body.token, session=request.app.state.session)
        await temp_bot.set_webhook(
            url=f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/bots/{bot.id}",
            secret_token=SECRET_KEY,
            drop_pending_updates=True,
            allowed_updates=CLIENT_BOT_ALLOWED_UPDATES,
        )
    except Exception as exc:
        logger.warning("Не удалось установить webhook для нового бота %s: %s", bot.id, exc)
        try:
            await delete_bot_config(bot.id)
        except Exception as cleanup_exc:
            logger.exception(
                "Не удалось удалить черновик бота %s после сбоя webhook: %s",
                bot.id,
                cleanup_exc,
            )
        raise HTTPException(
            status_code=502,
            detail="Telegram не подтвердил подключение бота. Повторите попытку.",
        ) from exc

    resp = BotApiResponse.from_orm_bot(bot, TG_WEBHOOK_URL, WEBHOOK_URL)
    return resp.model_dump(by_alias=True)


@api_router.get("/api/bots/{bot_id}")
async def get_bot(bot_id: int, request: Request):
    bot = await get_owned_bot(bot_id, request)
    resp = BotApiResponse.from_orm_bot(bot, TG_WEBHOOK_URL, WEBHOOK_URL)
    return resp.model_dump(by_alias=True)


@api_router.patch("/api/bots/{bot_id}")
@api_router.put("/api/bots/{bot_id}")
async def update_bot(bot_id: int, request: Request, body: BotUpdateApiRequest):
    bot = await get_owned_bot(bot_id, request)
    current_user = await get_current_user(request)

    update_data = {}
    token_changed = False
    effective_provider = body.payment_provider or bot.payment_provider
    _validate_installments(
        effective_provider,
        body.offer_installments if body.offer_installments is not None else bot.offer_installments,
    )

    if body.display_name is not None:
        update_data["display_name"] = body.display_name
    if body.offer_url is not None:
        update_data["offer_url"] = body.offer_url
    if body.offer_installments is not None:
        update_data["offer_installments"] = body.offer_installments
    if body.payment_provider is not None:
        update_data["payment_provider"] = body.payment_provider
    if body.payment_creds is not None:
        provider_changed = bool(
            body.payment_provider and body.payment_provider != bot.payment_provider
        )
        merged_credentials = _merged_payment_credentials(
            bot, body.payment_creds, provider_changed
        )
        is_valid, validation_message = await validate_payment_credentials(
            effective_provider,
            merged_credentials,
        )
        if not is_valid:
            raise HTTPException(status_code=400, detail=validation_message)
        update_data["payment_creds_enc"] = crypto.encrypt(
            json.dumps(merged_credentials)
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
                url=f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/bots/{bot.id}",
                secret_token=SECRET_KEY,
                drop_pending_updates=True,
                allowed_updates=CLIENT_BOT_ALLOWED_UPDATES,
            )
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Неверный токен: {e}"
            )
        update_data["bot_token_enc"] = crypto.encrypt(body.token)
        update_data["media_sync_done"] = False
        # Keep the webhook only for the owner's /start synchronization, but do
        # not leave the replacement bot publicly serving an incomplete funnel.
        if getattr(bot, "lifecycle_status", None) != "archived" and bot.status != "archived":
            await bot_lifecycle_service.transition(bot, "paused", reason="integration")
            update_data["status"] = bot.status
            update_data["lifecycle_status"] = bot.lifecycle_status
            update_data["pause_reason"] = bot.pause_reason
        # Telegram file_id values belong to a particular bot token.  Never let
        # a new token reuse files uploaded through the previous bot.
        schema = dict(bot.funnel_schema or {})
        for node in schema.get("nodes") or []:
            if node.get("mediaFileId"):
                node["mediaFileId"] = None
                node["mediaAssetId"] = None
                node["mediaType"] = None
                node["media"] = False
        update_data["funnel_schema"] = schema
        token_changed = True

    updated_bot = await update_bot_config(bot_id, **update_data)
    resp = BotApiResponse.from_orm_bot(updated_bot or bot, TG_WEBHOOK_URL, WEBHOOK_URL)
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
    return await _toggle_client_bot(
        bot,
        request,
        action=action,
        allow_admin_entitlement_bypass=current_user.telegram_id in ADMIN_TELEGRAM_IDS,
    )


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
    is_ready, reasons = await _readiness_for_bot(bot)
    return {
        "isReady": is_ready,
        "reasons": reasons,
        "reasonDetails": _readiness_reason_details(reasons),
    }


@api_router.get("/api/bots/{bot_id}/quote")
async def get_bot_quote(bot_id: int, request: Request):
    """Return the server-authoritative v1 quote without enabling checkout."""
    bot = await get_owned_bot(bot_id, request)
    scenario_type = getattr(bot, "scenario_type", None) or BASE_SCENARIO_TYPE
    quote = bot_pricing_service.quote(scenario_type, {"telegram"})
    return {
        "scenarioType": quote.scenario_type,
        "platforms": list(quote.platforms),
        "currency": quote.currency,
        "lineItems": [
            {"code": item.code, "amountMinor": item.amount_minor}
            for item in quote.line_items
        ],
        "subtotalMinor": quote.subtotal_minor,
        "totalMinor": quote.total_minor,
        "checkoutAvailable": quote.checkout_available,
    }


@api_router.post("/api/bots/{bot_id}/chat-delivery/verify")
async def verify_chat_delivery_endpoint(
    bot_id: int, request: Request, body: ChatDeliveryVerifyRequest
):
    bot = await get_owned_bot(bot_id, request)
    connected_chats = await list_connected_chats(bot_id)
    if str(body.chat_id).strip() not in {chat.chat_id for chat in connected_chats}:
        raise HTTPException(
            status_code=422,
            detail="Выберите канал или группу из списка, подключённого через /connect.",
        )
    try:
        chat = await verify_chat_delivery(
            bot, body.chat_id, body.access_mode, request.app.state.session
        )
    except ChatAccessError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "ok", "chatTitle": chat.title or str(chat.id), "chatType": chat.type}


@api_router.get("/api/bots/{bot_id}/connected-chats")
async def get_connected_chats_endpoint(bot_id: int, request: Request):
    bot_config = await get_owned_bot(bot_id, request)
    chats = await list_connected_chats(bot_id)

    # Live verification
    from aiogram import Bot
    from aiogram.exceptions import TelegramForbiddenError, TelegramBadRequest
    from services.security import crypto
    
    token = crypto.decrypt(bot_config.bot_token_enc)
    telegram_bot = Bot(token=token, session=request.app.state.session)
    
    verified_chats = []
    for chat in chats:
        try:
            member = await telegram_bot.get_chat_member(chat.chat_id, telegram_bot.id)
            if member.status in ("left", "kicked"):
                await delete_connected_chat(bot_id, chat.chat_id)
            else:
                verified_chats.append(chat)
        except (TelegramForbiddenError, TelegramBadRequest) as e:
            # Bot was kicked, or chat no longer exists/is inaccessible
            logger.warning("Auto-removing connected chat %s for bot %s due to Telegram error: %s", chat.chat_id, bot_id, e)
            await delete_connected_chat(bot_id, chat.chat_id)
        except Exception:
            # For network timeouts or other errors, assume it's still connected
            verified_chats.append(chat)

    return {
        "chats": [
            {"id": str(chat.id), "chatId": chat.chat_id, "title": chat.title, "chatType": chat.chat_type}
            for chat in verified_chats
        ]
    }


@api_router.delete("/api/bots/{bot_id}/connected-chats/{chat_id}")
async def delete_connected_chat_endpoint(bot_id: int, chat_id: str, request: Request):
    await get_owned_bot(bot_id, request)
    success = await delete_connected_chat(bot_id, chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Чат не найден")
    return {"status": "ok"}


@api_router.put("/api/bots/{bot_id}/funnel")
@api_router.post("/api/bots/{bot_id}/funnel")
async def save_bot_funnel_endpoint(
    bot_id: int, request: Request, body: FunnelUpdateApiRequest
):
    bot = await get_owned_bot(bot_id, request)
    schema_to_save = body.as_schema().model_dump(by_alias=True)
    logger.info(
        "Сохранение воронки: bot_id=%s, nodes=%s, requested_complete=%s",
        bot_id,
        len(body.nodes),
        body.funnel_complete,
    )
    connected_chats = await list_connected_chats(bot_id)
    readiness = evaluate_funnel_readiness(
        schema_to_save,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
        connected_chat_ids={chat.chat_id for chat in connected_chats},
    )
    # The old flag is accepted for API compatibility but is no longer trusted.
    saved_bot = await update_bot_funnel(bot_id, schema_to_save, readiness.is_ready)
    stopped = False
    if saved_bot and saved_bot.status == "active" and not readiness.is_ready:
        await bot_lifecycle_service.transition(saved_bot, "paused", reason="readiness")
        await set_bot_lifecycle_state(
            bot_id, saved_bot.lifecycle_status, saved_bot.pause_reason
        )
        stopped = True
    elif saved_bot and saved_bot.status == "draft" and readiness.is_ready:
        await bot_lifecycle_service.transition(saved_bot, "ready")
        saved_bot = await set_bot_lifecycle_state(
            bot_id, saved_bot.lifecycle_status, saved_bot.pause_reason
        )
    logger.info(
        "Воронка сохранена: bot_id=%s, ready=%s, stopped=%s, reasons=%s",
        bot_id,
        readiness.is_ready,
        stopped,
        len(readiness.reasons),
    )
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


@api_router.post("/api/bots/{bot_id}/media")
async def upload_bot_media(
    bot_id: int,
    request: Request,
    node_id: str,
    file: UploadFile = File(...),
):
    """Store a Telegram file_id for one bot; raw uploads are never persisted."""
    bot = await get_owned_bot(bot_id, request)
    if not bot.media_sync_done:
        raise HTTPException(status_code=409, detail="Сначала нажмите /start в созданном боте для синхронизации.")
    content_type = (file.content_type or "").lower()
    media_type = (
        "photo" if content_type.startswith("image/")
        else "video" if content_type.startswith("video/")
        else "document" if content_type else None
    )
    if not media_type:
        raise HTTPException(status_code=415, detail="Не удалось определить тип файла.")
    schema = dict(bot.funnel_schema or {})
    nodes = list(schema.get("nodes") or [])
    target_node = next((node for node in nodes if node.get("id") == node_id), None)
    target_tariff_id: str | None = None
    if target_node is None and node_id.startswith("payment:tariff:"):
        target_tariff_id = node_id.removeprefix("payment:tariff:")
        payment_node = next((node for node in nodes if node.get("id") == "payment"), None)
        tariffs = payment_node.get("tariffs") if isinstance(payment_node, dict) else None
        if not target_tariff_id or not isinstance(tariffs, list) or not any(
            str(tariff.get("id")) == target_tariff_id for tariff in tariffs if isinstance(tariff, dict)
        ):
            target_tariff_id = None
    if target_node is None and target_tariff_id is None:
        raise HTTPException(status_code=404, detail="Блок воронки не найден")
    if target_tariff_id is not None and media_type == "document":
        raise HTTPException(status_code=415, detail="Для тарифа можно использовать только фото или видео.")
    payload = await file.read(20 * 1024 * 1024 + 1)
    if not payload or len(payload) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Размер файла должен быть не больше 20 МБ.")

    from aiogram import Bot
    from aiogram.types import BufferedInputFile
    from database.requests.media_rq import create_media_asset

    telegram_bot = Bot(token=crypto.decrypt(bot.bot_token_enc), session=request.app.state.session)
    sent_message = None
    try:
        upload = BufferedInputFile(payload, filename=file.filename or f"{node_id}.{media_type}")
        if media_type == "photo":
            sent_message = await telegram_bot.send_photo(bot.owner.telegram_id, upload, disable_notification=True)
            telegram_file_id = sent_message.photo[-1].file_id
        elif media_type == "video":
            sent_message = await telegram_bot.send_video(bot.owner.telegram_id, upload, disable_notification=True)
            telegram_file_id = sent_message.video.file_id
        else:
            sent_message = await telegram_bot.send_document(bot.owner.telegram_id, upload, disable_notification=True)
            telegram_file_id = sent_message.document.file_id
    except Exception as exc:
        logger.warning("Не удалось синхронизировать медиа для бота %s: %s", bot_id, exc)
        raise HTTPException(status_code=502, detail="Telegram не смог обработать файл. Повторите попытку.") from exc
    finally:
        if sent_message is not None:
            try:
                await telegram_bot.delete_message(bot.owner.telegram_id, sent_message.message_id)
            except Exception as exc:
                # The file_id is already received; a failed cleanup must not discard the upload.
                logger.info("Не удалось удалить временное медиа для бота %s: %s", bot_id, exc)

    current_bot = await get_bot_by_id(bot.id)
    if (
        current_bot is None
        or current_bot.bot_token_enc != bot.bot_token_enc
        or current_bot.tg_bot_id != bot.tg_bot_id
        or not current_bot.media_sync_done
    ):
        raise HTTPException(
            status_code=409,
            detail="Токен или настройки бота изменились во время загрузки. Повторите загрузку файла.",
        )

    current_schema = dict(current_bot.funnel_schema or {})
    current_nodes = list(current_schema.get("nodes") or [])
    current_node = next((node for node in current_nodes if node.get("id") == node_id), None)
    current_payment_node = next((node for node in current_nodes if node.get("id") == "payment"), None)
    current_tariff = None
    if target_tariff_id and isinstance(current_payment_node, dict):
        current_tariff = next(
            (
                tariff for tariff in (current_payment_node.get("tariffs") or [])
                if isinstance(tariff, dict) and str(tariff.get("id")) == target_tariff_id
            ),
            None,
        )
    if current_node is None and current_tariff is None:
        raise HTTPException(
            status_code=409,
            detail="Воронка была изменена. Обновите страницу и повторите загрузку.",
        )

    asset = await create_media_asset(
        current_bot.id,
        node_id,
        media_type,
        telegram_file_id,
        mime_type=content_type,
        file_name=file.filename,
    )
    media_target = current_tariff if current_tariff is not None else current_node
    assert media_target is not None
    media_target["mediaFileId"] = telegram_file_id
    media_target["mediaAssetId"] = str(asset.id)
    media_target["mediaType"] = media_type
    media_target["media"] = True
    current_schema["nodes"] = current_nodes
    await update_bot_funnel(current_bot.id, current_schema, current_bot.funnel_complete)
    return {"id": str(asset.id), "nodeId": node_id, "mediaType": media_type, "fileId": telegram_file_id}


@api_router.get("/api/bots/{bot_id}/media/{asset_id}/preview")
async def get_bot_media_preview(bot_id: int, asset_id: UUID, request: Request):
    """Stream a saved Telegram file for the owner's Mini App preview only."""
    bot = await get_owned_bot(bot_id, request)
    from aiogram import Bot
    from database.requests.media_rq import get_bot_media_asset

    asset = await get_bot_media_asset(bot.id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Файл не найден для этого бота.")
    try:
        telegram_bot = Bot(token=crypto.decrypt(bot.bot_token_enc), session=request.app.state.session)
        telegram_file = await telegram_bot.get_file(asset.telegram_file_id)
        payload = io.BytesIO()
        await telegram_bot.download_file(telegram_file.file_path, destination=payload)
    except Exception as exc:
        logger.warning("Не удалось получить preview медиа %s: %s", asset_id, exc)
        raise HTTPException(status_code=502, detail="Не удалось получить файл из Telegram.") from exc

    return Response(
        content=payload.getvalue(),
        media_type=asset.mime_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=300"},
    )


@api_router.delete("/api/bots/{bot_id}/leads")
async def reset_bot_leads(bot_id: int, request: Request):
    """Archive CRM leads without resetting history or destroying payments."""
    await get_owned_bot(bot_id, request)
    archived_count = await archive_leads_by_bot_id(bot_id)
    return {"status": "ok", "deletedCount": archived_count, "archivedCount": archived_count}


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

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    from database.requests.client_payment_rq import create_client_payment
    import uuid

    if not bot.payment_provider or not bot.payment_creds_enc:
        raise HTTPException(status_code=400, detail="Сначала подключите платёжную систему")
    batch_id = uuid.uuid4()
    payments = [
        await create_client_payment(
            bot_id=bot.id, lead_id=lead.id, provider=bot.payment_provider,
            tariff=tariff, invoice_batch_id=batch_id,
        )
        for tariff in tariffs
    ]
    try:
        token = crypto.decrypt(bot.bot_token_enc)
        telegram_bot = Bot(
            token=token,
            session=request.app.state.session,
            default=DefaultBotProperties(parse_mode="HTML"),
        )
        await telegram_bot.send_message(
            lead.telegram_id,
            "🧾 <b>Выберите товар для оплаты</b>\n\nНажмите нужный тариф — покажем описание, цену и ссылку.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text=f"{payment.tariff_snapshot.get('name', 'Тариф')} · {payment.amount:,.0f} ₽".replace(",", " "),
                    callback_data=f"manual_invoice:{payment.id}",
                )
            ] for payment in payments]),
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
    leads, total = await get_leads_by_bot_id(bot_id, limit=10000, include_archived=True)
    views = total
    clicks = sum(
        1
        for l in leads
        if l.current_step_id and l.current_step_id != "node_start"
    )
    sales, revenue = await get_client_payment_stats(bot_id)
    conversion = round((sales / views * 100), 1) if views > 0 else 0.0

    return {
        "views": views,
        "clicks": clicks,
        "sales": sales,
        "conversion": conversion,
        "revenue": revenue,
        "funnel_data": [
            {"name": "Старт", "value": views},
            {"name": "Клик", "value": clicks},
            {"name": "Дожим 1", "value": sum(1 for l in leads if l.current_step_id == "push1")},
            {"name": "Оплата", "value": sales},
        ],
        # Keep the response shape compatible without inventing a daily history.
        "chart_data": [],
        "events": [],
    }


@api_router.get("/api/bots/{bot_id}/stats/chart")
async def get_bot_chart_endpoint(
    bot_id: int,
    request: Request,
    period: str = "week",
):
    """Return daily sales + new-user counts for the chart widget."""
    await get_owned_bot(bot_id, request)
    if period not in ("week", "month"):
        period = "week"
    points = await get_chart_data(bot_id, period)
    return {"points": points}
