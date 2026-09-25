import asyncio
import json
import io
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone
import uuid
from uuid import UUID


from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from loggers import logger
from config import (
    ADMIN_TELEGRAM_IDS,
    ALLOW_INSECURE_DEV_AUTH,
    BILLING_ENABLED,
    SECRET_KEY,
    TG_WEBHOOK_URL,
    WEBHOOK_URL,
)
from services.security import crypto
from services.telegram_auth import TelegramAuthError, TelegramUser, validate_init_data
from services.event_bus import event_bus
from database.requests.bot_rq import (
    get_bot_by_id,
    get_bot_by_tg_id,
    create_user_if_not_exists,
    get_user_by_id,
    get_user_by_tg_id,
    get_user_bots,
    get_bot_subscription,
    get_user_bot_subscriptions,
    set_bot_subscription_auto_renew,
    create_bot_config,
    update_bot_config,
    delete_bot_config,
    set_bot_status,
    set_bot_lifecycle_state,
    assign_lifetime_license,
    apply_available_free_slot_to_bot,
    update_bot_funnel,
    set_media_sync_done,
)
from database.requests.user_rq import (
    archive_leads_by_bot_id,
    get_lead,
    get_leads_by_bot_id,
    update_user_notification_settings,
)
from database.requests.broadcast_rq import (
    cancel_broadcast,
    create_broadcast,
    get_audience_summary,
    get_broadcast,
    list_audience_leads,
    list_broadcasts,
    requeue_failed_recipients,
)
from database.requests.client_payment_rq import (
    ClientPaymentDeliveryRetryError,
    get_chart_data,
    get_client_payment_stats,
    get_bulk_client_payment_stats,
    requeue_client_payment_delivery,
)
from database.requests.billing_rq import cancel_subscription_auto_renew
from database.requests.gateway_rq import (
    create_gateway_connection,
    list_gateway_connections,
)
from database.requests.connected_chat_rq import (
    list_connected_chats,
    delete_connected_chat,
)
from database.requests.tariff_rq import (
    create_tariff,
    get_tariff_by_id,
    list_tariffs_by_bot_id,
    update_tariff,
    delete_tariff,
    get_tariff_summary_stats,
)
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
    grant_admin_bot_subscription,
    revoke_admin_bot_subscription,
    grant_admin_user_bot_subscription,
    grant_admin_user_vip,
    revoke_admin_user_vip,
)
from schemas.api_schemas import (
    BotCreateApiRequest,
    BotUpdateApiRequest,
    GatewayConnectionCreateRequest,
    BotApiResponse,
    BillingCheckoutRequest,
    BillingCancelRequest,
    BillingAutoRenewRequest,
    BillingCheckoutResponse,
    NotificationSettingsRequest,
    AdminLifetimeLicenseRequest,
    AdminProExtensionRequest,
    AdminUserVipRequest,
    AdminUserAccessRequest,
    AdminBotActionRequest,
    AdminBotSubscriptionRequest,
    AdminUserGrantBotRequest,
    ManualInvoiceRequest,
    ChatDeliveryVerifyRequest,
    FunnelApiResponse,
    FunnelUpdateApiRequest,
    LeadApiResponse,
    AudienceSummaryResponse,
    AudienceListResponse,
    BroadcastApiResponse,
    BroadcastCreateRequest,
    BroadcastListResponse,
    TariffApiResponse,
    TariffCreateRequest,
    TariffFileUploadResponse,
    TariffListResponse,
    TariffStatsResponse,
    TariffUpdateRequest,
)
from services.saas_billing import BillingError, PRODUCTS, create_checkout
from services.entitlements import (
    available_lifetime_licenses,
    is_pro_active,
    is_user_vip,
)
from services.funnel_readiness import evaluate_funnel_readiness, format_readiness_errors
from services.bot_lifecycle import BotLifecycleService
from services.bot_entitlement import BotEntitlementService
from services.bot_pricing import (
    BASE_SCENARIO_TYPE,
    BotPricingService,
    UnsupportedPlatformError,
    UnsupportedScenarioError,
)
from services.payment_link import validate_payment_credentials
from services.payment_fulfillment import process_client_payment_fulfillment
from services.chat_access import ChatAccessError, verify_chat_delivery

AUTH_ERROR_TRANSLATIONS = {
    "Telegram init data is required": "Требуется авторизация через Telegram.",
    "Server Telegram token is not configured": "Сервер Telegram временно не настроен.",
    "Telegram init data signature is missing": "Подпись данных Telegram отсутствует.",
    "Telegram init data signature is invalid": "Недействительная подпись данных Telegram.",
    "Telegram init data auth date is invalid": "Некорректное время авторизации Telegram.",
    "Telegram init data has expired": "Сессия авторизации Telegram истекла. Откройте приложение заново.",
    "Telegram user data is invalid": "Некорректные данные пользователя Telegram.",
}

api_router = APIRouter()

# Медиа рассылок не принадлежит узлам воронки: у него отдельный node_id-маркер,
# по которому upload не ищет блок в funnel_schema.
BROADCAST_MEDIA_NODE_ID = "broadcast"

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


async def _tariffs_for_bot(bot) -> list:
    if "tariffs" in getattr(bot, "__dict__", {}) and bot.__dict__["tariffs"] is not None:
        try:
            return list(bot.__dict__["tariffs"])
        except Exception:
            pass
    if hasattr(bot, "id") and isinstance(bot.id, int):
        try:
            return await list_tariffs_by_bot_id(bot.id)
        except Exception:
            return []
    return []


async def _readiness_for_bot(bot) -> tuple[bool, list[str]]:
    """Return the only publishability decision used by API endpoints."""
    connected_chats = await list_connected_chats(bot.id)
    bot_tariffs = await _tariffs_for_bot(bot)
    readiness = evaluate_funnel_readiness(
        bot.funnel_schema,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
        connected_chat_ids={chat.chat_id for chat in connected_chats},
        bot_tariffs=bot_tariffs,
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
            "code": next(
                (code for phrase, code in codes if phrase in reason),
                "configuration_invalid",
            ),
            "message": reason,
        }
        for reason in reasons
    ]


async def _connected_chat_ids_for_bot(bot) -> set[str]:
    connected_chats = await list_connected_chats(bot.id)
    return {chat.chat_id for chat in connected_chats}


bot_lifecycle_service = BotLifecycleService(
    connected_chat_ids_for=_connected_chat_ids_for_bot,
    tariffs_for=_tariffs_for_bot,
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
    new_status = (
        "active" if action in ["start", "active", "activate", "true", "1"] else "draft"
    )

    dedicated_subscription = (
        await get_bot_subscription(bot.id) if new_status == "active" else None
    )

    if new_status == "active":
        bot_tariffs = await _tariffs_for_bot(bot)
        auto_tariffs = [
            t for t in bot_tariffs if t.is_active and t.sales_mode in {"auto", "hybrid"}
        ]
        if auto_tariffs:
            if not bot.payment_provider:
                raise HTTPException(
                    status_code=422,
                    detail="Нельзя запустить бота: Подключите платёжную систему.",
                )
            if not bot.payment_creds_enc:
                raise HTTPException(
                    status_code=422,
                    detail="Нельзя запустить бота: Сохраните рабочие реквизиты платёжной системы.",
                )

        is_vip = is_pro_active(bot.owner)
        if is_vip or allow_admin_entitlement_bypass:
            # VIP owners and platform admins can publish any bot without per-bot payment
            pass
        elif dedicated_subscription is not None:
            if not bot_entitlement_service.can_publish(dedicated_subscription):
                raise HTTPException(
                    status_code=403,
                    detail="Подписка этого бота неактивна или закончилась.",
                )
        else:
            owner_bots = await get_user_bots(bot.owner_id)
            if not bot.has_lifetime_license:
                available = available_lifetime_licenses(bot.owner, owner_bots)
                if available <= 0:
                    raise HTTPException(
                        status_code=403,
                        detail="Чтобы запустить этого бота, оплатите его подписку или используйте бесплатный доступ.",
                    )
                bot = await assign_lifetime_license(bot.id) or bot
            for owner_bot in owner_bots:
                if owner_bot.id != bot.id and owner_bot.status == "active":
                    await set_bot_lifecycle_state(
                        owner_bot.id, "paused", "subscription"
                    )

    try:
        if new_status == "active":
            await bot_lifecycle_service.transition(bot, "published")
        else:
            await bot_lifecycle_service.transition(bot, "paused", reason="manual")
    except ValueError as exc:
        msg = str(exc)
        if "Bot is not ready for this lifecycle transition: " in msg:
            raw_reasons = msg.split(
                "Bot is not ready for this lifecycle transition: ", 1
            )[1]
            reasons = [r.strip() for r in raw_reasons.split(";") if r.strip()]
            user_msg = format_readiness_errors(reasons)
        elif "Cannot transition archived or incompatible bot" in msg:
            if "archived" in msg:
                user_msg = "Нельзя запустить архивированного бота."
            else:
                user_msg = "Заполните сценарий перед запуском бота."
        elif "Unknown lifecycle status" in msg:
            user_msg = "Некорректный статус бота."
        else:
            user_msg = "Нельзя запустить бота: " + msg
        raise HTTPException(status_code=422, detail=user_msg) from exc

    if new_status == "active":
        await _install_client_bot_webhook(bot, request)
    else:
        await _remove_client_bot_webhook(bot, request)

    updated_bot = await set_bot_lifecycle_state(
        bot.id, bot.lifecycle_status, bot.pause_reason
    )
    if not updated_bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    try:
        from services.event_bus import event_bus

        owner_tg = getattr(getattr(bot, "owner", None), "telegram_id", None)
        if owner_tg:
            event_bus.publish_user(
                owner_tg,
                "bot:status_changed",
                {
                    "botId": bot.id,
                    "status": updated_bot.status,
                    "lifecycleStatus": updated_bot.lifecycle_status,
                    "pauseReason": updated_bot.pause_reason,
                },
            )
    except Exception as exc:
        logger.warning("SSE: ошибка отправки статуса бота: %s", exc)
    bot_url = f"https://t.me/{updated_bot.username}" if updated_bot.username else None
    webhook_url = f"{TG_WEBHOOK_URL.rstrip('/')}/webhook/bots/{updated_bot.id}"
    return {
        "status": "ok",
        "message": f"Бот {'запущен' if new_status == 'active' else 'остановлен'}",
        "botStatus": new_status,
        "webhookUrl": webhook_url if new_status == "active" else None,
        "botUrl": bot_url,
    }


def _merged_payment_credentials(
    bot, incoming: dict | None, provider_changed: bool
) -> dict:
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
    return (
        "active"
        if is_pro_active(user)
        else ("expired" if user.subscription_ends_at else "none")
    )


def _user_payload(user, telegram_id: int) -> dict:
    return {
        "telegram_id": telegram_id,
        "subscription_status": _subscription_status(user),
        "subscription_until": (
            user.subscription_ends_at.isoformat() if user.subscription_ends_at else None
        ),
        "slots_bought": user.lifetime_slots,
        "subscription_auto_renew": user.subscription_auto_renew,
        "subscription_retry_count": user.subscription_retry_count,
        "billing_enabled": BILLING_ENABLED,
        "email": user.email,
        "email_receipts_enabled": user.email_receipts_enabled,
        "email_billing_notifications_enabled": user.email_billing_notifications_enabled,
        "is_admin": telegram_id in ADMIN_TELEGRAM_IDS,
    }


def _get_development_user(request: Request) -> TelegramUser | None:
    """Return an explicitly enabled local-development identity, if any."""
    if not ALLOW_INSECURE_DEV_AUTH:
        return None

    telegram_id = (
        request.headers.get("X-Telegram-Id")
        or request.headers.get("X-User-Id")
        or request.query_params.get("telegram_id")
        or request.query_params.get("user_id")
    )
    if not telegram_id:
        return None
    try:
        return TelegramUser(telegram_id=int(telegram_id))
    except ValueError:
        return None


async def get_current_user(request: Request) -> TelegramUser:
    """Resolve an authenticated Telegram user for dashboard API requests with request-scoped caching."""
    state = getattr(request, "state", None)
    if state is not None:
        cached = getattr(state, "current_user", None)
        if cached is not None:
            return cached

    init_data = (
        request.headers.get("X-Telegram-Init-Data")
        or request.query_params.get("init_data")
        or request.query_params.get("initData")
    )
    if not init_data and request.method in ("POST", "PUT", "PATCH"):
        try:
            body = await request.json()
            if isinstance(body, dict):
                init_data = body.get("init_data") or body.get("initData")
        except Exception:
            pass
    if init_data:
        try:
            telegram_user = validate_init_data(init_data)
        except TelegramAuthError as exc:
            msg = AUTH_ERROR_TRANSLATIONS.get(
                str(exc),
                "Ошибка авторизации через Telegram. Откройте приложение заново.",
            )
            raise HTTPException(status_code=401, detail=msg) from exc
        await _ensure_account_is_active(telegram_user.telegram_id, request=request)
        if state is not None:
            state.current_user = telegram_user
        return telegram_user

    development_user = _get_development_user(request)
    if development_user:
        await _ensure_account_is_active(development_user.telegram_id, request=request)
        if state is not None:
            state.current_user = development_user
        return development_user

    raise HTTPException(status_code=401, detail="Требуется авторизация через Telegram.")


async def _ensure_account_is_active(
    telegram_id: int, request: Request | None = None
) -> None:
    """Reject a paused SaaS account across all authenticated Mini App routes."""
    account = await get_user_by_tg_id(telegram_id)
    if account and account.is_disabled:
        raise HTTPException(
            status_code=403,
            detail="Доступ к BotFlow временно ограничен. Свяжитесь с поддержкой.",
        )
    if request is not None and account is not None:
        state = getattr(request, "state", None)
        if state is not None:
            state.db_user = account


async def get_current_admin(request: Request) -> TelegramUser:
    """Resolve a Telegram identity and enforce the server-side admin allowlist."""
    current_user = await get_current_user(request)
    if current_user.telegram_id not in ADMIN_TELEGRAM_IDS:
        raise HTTPException(
            status_code=403, detail="Требуются права администратора платформы."
        )
    return current_user


async def get_owned_bot(bot_id: int, request: Request):
    """Load a bot only when it belongs to the authenticated dashboard user, or caller is admin."""
    current_user = await get_current_user(request)
    state = getattr(request, "state", None)
    user = getattr(state, "db_user", None) if state is not None else None
    if user is None:
        user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
        if state is not None:
            state.db_user = user
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    if bot.owner_id != user.id and current_user.telegram_id not in ADMIN_TELEGRAM_IDS:
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
            msg = AUTH_ERROR_TRANSLATIONS.get(
                str(exc),
                "Ошибка авторизации через Telegram. Откройте приложение заново.",
            )
            raise HTTPException(status_code=401, detail=msg) from exc
    else:
        development_user = _get_development_user(request)
        if not development_user:
            raise HTTPException(
                status_code=401,
                detail="Требуется авторизация через Telegram. Откройте приложение из Telegram.",
            )
        telegram_user = development_user

    await _ensure_account_is_active(telegram_user.telegram_id, request=request)
    user = await create_user_if_not_exists(
        telegram_id=telegram_user.telegram_id,
        username=telegram_user.username,
        refresh_username=True,
    )
    state = getattr(request, "state", None)
    if state is not None:
        state.db_user = user
        state.current_user = telegram_user

    bots = await get_user_bots(owner_id=user.id)
    bot_ids = [b.id for b in bots]
    payment_stats = await get_bulk_client_payment_stats(bot_ids)

    bots_resp = []
    for b in bots:
        resp = BotApiResponse.from_orm_bot(b, TG_WEBHOOK_URL, WEBHOOK_URL)
        sales, revenue = payment_stats.get(b.id, (0, 0))
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


@api_router.post("/api/admin/users/{user_id}/vip")
async def update_admin_user_vip_endpoint(
    user_id: int, request: Request, body: AdminUserVipRequest
):
    """Grant or revoke global VIP status for an owner."""
    admin = await get_current_admin(request)
    try:
        if body.action == "revoke":
            return await revoke_admin_user_vip(
                user_id=user_id,
                actor_telegram_id=admin.telegram_id,
            )
        else:
            return await grant_admin_user_vip(
                user_id=user_id,
                days=body.days,
                is_permanent=body.is_permanent,
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


@api_router.post("/api/admin/users/{user_id}/grant-bot-subscription")
async def grant_admin_user_bot_subscription_endpoint(
    user_id: int, request: Request, body: AdminUserGrantBotRequest
):
    """Grant free subscription time or lifetime license to a bot owned by user."""
    admin = await get_current_admin(request)
    try:
        return await grant_admin_user_bot_subscription(
            user_id=user_id,
            bot_id=body.bot_id,
            duration_days=body.days,
            is_lifetime=body.is_lifetime,
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
    bots, total = await list_admin_bots(
        query=query, status=status, page=page, limit=limit
    )
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


@api_router.post("/api/admin/bots/{bot_id}/subscription")
async def grant_admin_bot_subscription_endpoint(
    bot_id: int, request: Request, body: AdminBotSubscriptionRequest
):
    """Grant or extend a bot's subscription (e.g. 3 months free) from the admin panel."""
    admin = await get_current_admin(request)
    try:
        return await grant_admin_bot_subscription(
            bot_id=bot_id,
            duration_days=body.days,
            is_lifetime=body.is_lifetime,
            actor_telegram_id=admin.telegram_id,
        )
    except AdminMutationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.delete("/api/admin/bots/{bot_id}/subscription")
async def revoke_admin_bot_subscription_endpoint(bot_id: int, request: Request):
    """Revoke a bot's subscription or lifetime license from the admin panel."""
    admin = await get_current_admin(request)
    try:
        return await revoke_admin_bot_subscription(
            bot_id=bot_id,
            actor_telegram_id=admin.telegram_id,
        )
    except AdminMutationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.get("/api/admin/bots/{bot_id}/readiness")
async def admin_bot_readiness_endpoint(bot_id: int, request: Request):
    """Expose the exact launch decision to an administrator without mutating a bot."""
    await get_current_admin(request)
    bot = await get_bot_by_id(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    is_ready, reasons = await _readiness_for_bot(bot)
    return {
        "isReady": is_ready,
        "reasons": reasons,
        "summary": (
            format_readiness_errors(reasons)
            if not is_ready
            else "Воронка готова к запуску."
        ),
    }


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
    payments, total = await list_admin_saas_payments(
        status=status, page=page, limit=limit
    )
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
        event_bus.publish_user(
            admin.telegram_id,
            "operation_failed",
            {
                "operation": "payment_delivery_retry",
                "targetId": str(payment_id),
                "error": str(exc),
            },
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        result = await process_client_payment_fulfillment(
            payment_id, request.app.state.session
        )
        await write_admin_audit_log(
            actor_telegram_id=admin.telegram_id,
            action="payment_delivery_retry",
            target_type="client_payment",
            target_id=str(payment_id),
            details={**requeued, **result},
        )
        event_bus.publish_user(
            admin.telegram_id,
            "operation_completed",
            {
                "operation": "payment_delivery_retry",
                "targetId": str(payment_id),
                "details": {**requeued, **result},
            },
        )
        return {"status": "ok", **requeued, **result}
    except Exception as exc:
        event_bus.publish_user(
            admin.telegram_id,
            "operation_failed",
            {
                "operation": "payment_delivery_retry",
                "targetId": str(payment_id),
                "error": str(exc),
            },
        )
        raise


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


# ── Спец-ссылки доступа (период / бессрочно / один бот бесплатно) ──


def _access_link_payload(link) -> dict:
    return {
        "id": str(link.id),
        "token": link.token,
        "note": link.note,
        "kind": link.kind,
        "days": link.days,
        "expiresAt": link.expires_at.isoformat() if link.expires_at else None,
        "maxActivations": link.max_activations,
        "activationsCount": link.activations_count,
        "validUntil": link.valid_until.isoformat() if link.valid_until else None,
        "freeBotsCount": getattr(link, "free_bots_count", 1),
        "isPermanent": getattr(link, "is_permanent", False),
        "isActive": link.is_active,
        "activatedBy": link.activated_by,
        "activatedAt": link.activated_at.isoformat() if link.activated_at else None,
        "createdAt": link.created_at.isoformat(),
    }


def _parse_iso_datetime(raw, field: str):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=f"Некорректная дата: {field}"
        ) from exc


@api_router.get("/api/admin/access-links")
async def list_access_links_endpoint(request: Request):
    await get_current_admin(request)
    from database.requests.access_link_rq import list_access_links

    links = await list_access_links()
    return {"links": [_access_link_payload(link) for link in links]}


@api_router.post("/api/admin/access-links")
async def create_access_link_endpoint(request: Request, body: dict):
    await get_current_admin(request)
    from database.requests.access_link_rq import create_access_link

    kind = str(body.get("kind") or "period")
    days = body.get("days")
    max_activations = body.get("maxActivations") or 1
    free_bots_count = body.get("freeBotsCount") or 1
    is_permanent = bool(body.get("isPermanent", False))
    try:
        link = await create_access_link(
            kind=kind,
            days=int(days) if days else None,
            expires_at=_parse_iso_datetime(body.get("expiresAt"), "окончание доступа"),
            note=str(body.get("note") or "") or None,
            max_activations=int(max_activations),
            valid_until=_parse_iso_datetime(
                body.get("validUntil"), "срок жизни ссылки"
            ),
            free_bots_count=int(free_bots_count),
            is_permanent=is_permanent,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _access_link_payload(link)


@api_router.post("/api/admin/access-links/{link_id}/deactivate")
async def deactivate_access_link_endpoint(link_id: UUID, request: Request):
    await get_current_admin(request)
    from database.requests.access_link_rq import deactivate_access_link

    ok = await deactivate_access_link(link_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")
    return {"status": "ok"}


@api_router.post("/api/billing/checkout", response_model=BillingCheckoutResponse)
async def create_billing_checkout(request: Request, body: BillingCheckoutRequest):
    if not BILLING_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="Оплата временно недоступна — приложение на тесте. Доступ выдаёт поддержка.",
        )
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    checkout_email = body.email.strip().lower() if body.email else user.email
    if checkout_email and ("@" not in checkout_email or len(checkout_email) > 320):
        raise HTTPException(status_code=422, detail="Введите корректный email.")
    if body.email and checkout_email != user.email:
        user = (
            await update_user_notification_settings(
                user.id,
                email=checkout_email,
                email_receipts_enabled=user.email_receipts_enabled,
                email_billing_notifications_enabled=user.email_billing_notifications_enabled,
            )
            or user
        )
    try:
        # Итог берём из серверного квоута бота: база 990 ₽ + доплаты за функционал.
        quote_total_rub: int | None = None
        bot_id: int | None = None
        if body.bot_id:
            bot = await get_owned_bot(int(body.bot_id), request)
            bot_id = bot.id
            scenario_type = getattr(bot, "scenario_type", None) or BASE_SCENARIO_TYPE
            quote = bot_pricing_service.quote(scenario_type, {"telegram"})
            quote_total_rub = quote.total_minor // 100
        checkout = await create_checkout(
            user.id,
            body.product,
            receipt_email=checkout_email if user.email_receipts_enabled else None,
            amount_rub=quote_total_rub,
            bot_id=bot_id,
        )
    except (UnsupportedScenarioError, UnsupportedPlatformError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return checkout


@api_router.put("/api/profile/notification-settings")
async def update_notification_settings(
    request: Request, body: NotificationSettingsRequest
):
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
            {
                "id": "pro",
                "name": "Подписка бота",
                "price": PRODUCTS["pro"][1],
                "period": "month",
            },
        ]
    }


@api_router.get("/api/billing/status")
async def billing_status(request: Request):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    return _user_payload(user, current_user.telegram_id)


@api_router.post("/api/billing/cancel")
async def cancel_billing(request: Request, body: BillingCancelRequest | None = None):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    if body and body.bot_id:
        await get_owned_bot(int(body.bot_id), request)
        await set_bot_subscription_auto_renew(int(body.bot_id), False)
    else:
        user = await cancel_subscription_auto_renew(user.id) or user
    return _user_payload(user, current_user.telegram_id)


@api_router.post("/api/billing/auto-renew")
async def toggle_billing_auto_renew(request: Request, body: BillingAutoRenewRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    if body and body.bot_id:
        await get_owned_bot(int(body.bot_id), request)
        await set_bot_subscription_auto_renew(int(body.bot_id), body.enabled)
    else:
        if not body.enabled:
            user = await cancel_subscription_auto_renew(user.id) or user
    return _user_payload(user, current_user.telegram_id)


@api_router.get("/api/gateway-connections")
async def list_gateway_connections_api(request: Request):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    connections = await list_gateway_connections(user.id)
    return {
        "connections": [
            {
                "id": str(connection.id),
                "provider": connection.provider,
                "displayName": connection.display_name,
                "status": connection.status,
                "verifiedAt": (
                    connection.verified_at.isoformat()
                    if connection.verified_at
                    else None
                ),
                "createdAt": connection.created_at.isoformat(),
            }
            for connection in connections
        ]
    }


@api_router.post("/api/gateway-connections")
async def create_gateway_connection_api(
    request: Request, body: GatewayConnectionCreateRequest
):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    is_valid, message = await validate_payment_credentials(
        body.provider, body.credentials
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=message)
    connection = await create_gateway_connection(
        owner_id=user.id,
        provider=body.provider,
        display_name=body.display_name.strip(),
        credentials_enc=crypto.encrypt(json.dumps(body.credentials)),
    )
    return {
        "id": str(connection.id),
        "provider": connection.provider,
        "displayName": connection.display_name,
        "status": connection.status,
        "verifiedAt": None,
        "createdAt": connection.created_at.isoformat(),
    }


@api_router.get("/api/bots")
async def list_bots(request: Request):
    current_user = await get_current_user(request)
    state = getattr(request, "state", None)
    user = (
        getattr(state, "db_user", None) if state is not None else None
    ) or await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    bots = await get_user_bots(owner_id=user.id)
    subscriptions = await get_user_bot_subscriptions(owner_id=user.id)
    bot_ids = [b.id for b in bots]
    payment_stats = await get_bulk_client_payment_stats(bot_ids)

    bots_resp = []
    for b in bots:
        resp = BotApiResponse.from_orm_bot(b, TG_WEBHOOK_URL, WEBHOOK_URL)
        sales, revenue = payment_stats.get(b.id, (0, 0))
        resp.sales = sales
        resp.revenue = float(revenue)
        subscription = subscriptions.get(b.id)
        if subscription is not None:
            resp.subscription_status = subscription.status
            resp.subscription_ends_at = (
                subscription.ends_at.isoformat() if subscription.ends_at else None
            )
            resp.subscription_amount_rub = subscription.amount_rub
            resp.subscription_auto_renew = subscription.auto_renew
        bots_resp.append(resp)

    return {"bots": [b.model_dump(by_alias=True) for b in bots_resp]}


@api_router.post("/api/bots")
async def create_bot(request: Request, body: BotCreateApiRequest):
    current_user = await get_current_user(request)
    user = await create_user_if_not_exists(telegram_id=current_user.telegram_id)
    is_admin = current_user.telegram_id in ADMIN_TELEGRAM_IDS
    target_owner = user
    if getattr(body, "owner_user_id", None) and is_admin:
        owner_candidate = await get_user_by_id(body.owner_user_id)
        if not owner_candidate:
            raise HTTPException(
                status_code=404, detail="Указанный пользователь не найден."
            )
        target_owner = owner_candidate

    user_bots = await get_user_bots(owner_id=target_owner.id)
    is_vip, _, _ = is_user_vip(target_owner)
    if not is_vip and not is_admin:
        allowed_slots = max(1, getattr(user, "lifetime_slots", 0) or 0)
        active_paid_count = 0
        for b in user_bots:
            sub = await get_bot_subscription(b.id)
            if (
                sub
                and sub.status == "active"
                and (sub.ends_at is None or sub.ends_at > datetime.now(timezone.utc))
            ):
                active_paid_count += 1
        if len(user_bots) >= allowed_slots + active_paid_count:
            raise HTTPException(
                status_code=403,
                detail=f"Достигнут лимит ботов ({len(user_bots)} из {allowed_slots + active_paid_count}). Оплатите подписку или используйте специальную ссылку для создания нового бота.",
            )

    if not body.display_name or not body.display_name.strip():
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
            raise HTTPException(
                status_code=409, detail="Этот бот уже добавлен в систему."
            )
        token_enc = crypto.encrypt(body.token)
    creds_enc = (
        crypto.encrypt(json.dumps(body.payment_creds)) if body.payment_creds else None
    )

    bot = await create_bot_config(
        owner_id=target_owner.id,
        display_name=body.display_name,
        tg_bot_id=tg_bot_id,
        username=username,
        bot_token_enc=token_enc,
        payment_provider=body.payment_provider,
        payment_creds_enc=creds_enc,
        offer_url=body.offer_url,
        offer_installments=body.offer_installments,
    )

    available_slots = (getattr(target_owner, "lifetime_slots", 0) or 0) - sum(
        1 for b in user_bots if getattr(b, "has_lifetime_license", False)
    )
    if available_slots > 0 and not is_vip and getattr(bot, "id", None):
        await apply_available_free_slot_to_bot(target_owner.telegram_id, bot.id)
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
        logger.warning(
            "Не удалось установить webhook для нового бота %s: %s", bot.id, exc
        )
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
        (
            body.offer_installments
            if body.offer_installments is not None
            else bot.offer_installments
        ),
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
            raise HTTPException(status_code=400, detail=f"Неверный токен: {e}")
        update_data["bot_token_enc"] = crypto.encrypt(body.token)
        update_data["media_sync_done"] = False
        # Keep the webhook only for the owner's /start synchronization, but do
        # not leave the replacement bot publicly serving an incomplete funnel.
        if (
            getattr(bot, "lifecycle_status", None) != "archived"
            and bot.status != "archived"
        ):
            await bot_lifecycle_service.transition(bot, "paused", reason="integration")
            update_data["status"] = bot.status
            update_data["lifecycle_status"] = bot.lifecycle_status
            update_data["pause_reason"] = bot.pause_reason
        # Telegram file_id values belong to a particular bot token.  Never let
        # a new token reuse files uploaded through the previous bot.
        schema = dict(bot.funnel_schema or {})
        for node in schema.get("nodes") or []:
            if node.get("mediaFileId") or node.get("mediaAssets"):
                node["mediaFileId"] = None
                node["mediaAssetId"] = None
                node["mediaType"] = None
                node["media"] = False
                node["mediaAssets"] = []
            for tariff in node.get("tariffs") or []:
                if isinstance(tariff, dict) and tariff.get("mediaFileId"):
                    tariff["mediaFileId"] = None
                    tariff["mediaAssetId"] = None
                    tariff["mediaType"] = None
                    tariff["media"] = False
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
        logger.warning(f"Ошибка удаления вебхука при удалении бота {bot_id}: {e}")

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
        "summary": (
            format_readiness_errors(reasons)
            if not is_ready
            else "Воронка готова к запуску."
        ),
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
    return {
        "status": "ok",
        "chatTitle": chat.title or str(chat.id),
        "chatType": chat.type,
    }


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
            logger.warning(
                "Auto-removing connected chat %s for bot %s due to Telegram error: %s",
                chat.chat_id,
                bot_id,
                e,
            )
            await delete_connected_chat(bot_id, chat.chat_id)
        except Exception:
            # For network timeouts or other errors, assume it's still connected
            verified_chats.append(chat)

    return {
        "chats": [
            {
                "id": str(chat.id),
                "chatId": chat.chat_id,
                "title": chat.title,
                "chatType": chat.chat_type,
            }
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


# =====================================================================
# TARIFFS & DELIVERABLES ENDPOINTS
# =====================================================================

MAX_TARIFF_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


@api_router.get("/api/bots/{bot_id}/tariffs", response_model=TariffListResponse)
async def list_bot_tariffs_endpoint(bot_id: int, request: Request):
    """List all tariffs configured for a bot, along with summary statistics."""
    await get_owned_bot(bot_id, request)
    tariffs = await list_tariffs_by_bot_id(bot_id)
    stats = await get_tariff_summary_stats(bot_id)
    return {
        "tariffs": [
            TariffApiResponse.from_orm_tariff(t).model_dump(by_alias=True)
            for t in tariffs
        ],
        "total": len(tariffs),
        "stats": {
            "totalTariffs": stats["total_tariffs"],
            "totalCount": stats["total_tariffs"],
            "activeCount": stats["active_count"],
            "activeInFunnelCount": stats["active_count"],
            "totalBuyers": stats["total_buyers"],
            "buyersCount": stats["total_buyers"],
            "totalRevenue": float(stats["total_revenue"]),
        },
    }


@api_router.get("/api/bots/{bot_id}/tariffs/stats", response_model=TariffStatsResponse)
@api_router.get(
    "/api/bots/{bot_id}/tariffs/summary", response_model=TariffStatsResponse
)
async def get_bot_tariffs_stats_endpoint(bot_id: int, request: Request):
    """Return summary statistics for bot tariffs (total, active, buyers, revenue)."""
    await get_owned_bot(bot_id, request)
    stats = await get_tariff_summary_stats(bot_id)
    return {
        "totalTariffs": stats["total_tariffs"],
        "totalCount": stats["total_tariffs"],
        "activeCount": stats["active_count"],
        "activeInFunnelCount": stats["active_count"],
        "totalBuyers": stats["total_buyers"],
        "buyersCount": stats["total_buyers"],
        "totalRevenue": float(stats["total_revenue"]),
    }


@api_router.post(
    "/api/bots/{bot_id}/tariffs/upload", response_model=TariffFileUploadResponse
)
@api_router.post(
    "/api/bots/{bot_id}/tariffs/upload-file", response_model=TariffFileUploadResponse
)
@api_router.post("/api/bots/{bot_id}/upload", response_model=TariffFileUploadResponse)
async def upload_tariff_deliverable_file_endpoint(
    bot_id: int,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload any file type as a deliverable for a tariff (up to 100MB)."""
    await get_owned_bot(bot_id, request)

    payload = await file.read(MAX_TARIFF_FILE_SIZE + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="Файл пуст.")
    if len(payload) > MAX_TARIFF_FILE_SIZE:
        raise HTTPException(
            status_code=413, detail="Размер файла не должен превышать 100 МБ."
        )

    file_uuid = uuid.uuid4()
    orig_name = file.filename or "deliverable_file"
    base_name = os.path.basename(orig_name).replace(" ", "_")
    safe_name = f"{file_uuid.hex[:12]}_{base_name}"

    upload_dir = Path(__file__).resolve().parent / "uploads" / "tariffs" / str(bot_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    target_path = upload_dir / safe_name

    with open(target_path, "wb") as f:
        f.write(payload)

    rel_path = f"/uploads/tariffs/{bot_id}/{safe_name}"
    return {
        "id": str(file_uuid),
        "path": rel_path,
        "filePath": rel_path,
        "url": rel_path,
        "fileUrl": rel_path,
        "filename": orig_name,
        "fileName": orig_name,
        "originalName": orig_name,
        "size": len(payload),
        "sizeBytes": len(payload),
    }


@api_router.get("/api/bots/{bot_id}/tariffs/files/{filename}")
async def get_tariff_deliverable_file_endpoint(
    bot_id: int,
    filename: str,
    request: Request,
):
    """Download a previously uploaded tariff deliverable file."""
    await get_owned_bot(bot_id, request)
    safe_filename = os.path.basename(filename)
    file_path = (
        Path(__file__).resolve().parent
        / "uploads"
        / "tariffs"
        / str(bot_id)
        / safe_filename
    )
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Файл не найден.")
    return FileResponse(path=file_path, filename=safe_filename)


@api_router.post("/api/bots/{bot_id}/tariffs", response_model=TariffApiResponse)
async def create_tariff_endpoint(
    bot_id: int,
    request: Request,
    body: TariffCreateRequest,
):
    """Create a new tariff belonging to the user's bot."""
    await get_owned_bot(bot_id, request)

    deliverables_data = [d.model_dump(by_alias=True) for d in body.deliverables]
    tariff = await create_tariff(
        bot_id=bot_id,
        name=body.name,
        description=body.description,
        price=body.price,
        old_price=body.old_price,
        payment_type=body.payment_type,
        recurring_period=body.recurring_period,
        sales_mode=body.sales_mode,
        manager_url=body.manager_url,
        button_text=body.button_text,
        is_active=body.is_active,
        deliverables=deliverables_data,
        media_assets=body.media_assets,
    )
    return TariffApiResponse.from_orm_tariff(tariff).model_dump(by_alias=True)


@api_router.get(
    "/api/bots/{bot_id}/tariffs/{tariff_id}", response_model=TariffApiResponse
)
async def get_tariff_endpoint(
    bot_id: int,
    tariff_id: str,
    request: Request,
):
    """Get a single tariff by ID, ensuring it belongs to the user's bot."""
    await get_owned_bot(bot_id, request)
    tariff = await get_tariff_by_id(tariff_id)
    if not tariff or tariff.bot_id != bot_id:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    return TariffApiResponse.from_orm_tariff(tariff).model_dump(by_alias=True)


@api_router.put(
    "/api/bots/{bot_id}/tariffs/{tariff_id}", response_model=TariffApiResponse
)
async def update_tariff_endpoint(
    bot_id: int,
    tariff_id: str,
    request: Request,
    body: TariffUpdateRequest,
):
    """Update a tariff, ensuring it belongs to the user's bot."""
    await get_owned_bot(bot_id, request)
    tariff = await get_tariff_by_id(tariff_id)
    if not tariff or tariff.bot_id != bot_id:
        raise HTTPException(status_code=404, detail="Тариф не найден")

    deliverables_data = (
        [d.model_dump(by_alias=True) for d in body.deliverables]
        if body.deliverables is not None
        else None
    )
    updated = await update_tariff(
        tariff.id,
        name=body.name,
        description=body.description,
        price=body.price,
        old_price=body.old_price,
        payment_type=body.payment_type,
        recurring_period=body.recurring_period,
        sales_mode=body.sales_mode,
        manager_url=body.manager_url,
        button_text=body.button_text,
        is_active=body.is_active,
        deliverables=deliverables_data,
        media_assets=body.media_assets,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    return TariffApiResponse.from_orm_tariff(updated).model_dump(by_alias=True)


@api_router.delete("/api/bots/{bot_id}/tariffs/{tariff_id}")
async def delete_tariff_endpoint(
    bot_id: int,
    tariff_id: str,
    request: Request,
):
    """Delete a tariff, ensuring it belongs to the user's bot."""
    await get_owned_bot(bot_id, request)
    tariff = await get_tariff_by_id(tariff_id)
    if not tariff or tariff.bot_id != bot_id:
        raise HTTPException(status_code=404, detail="Тариф не найден")

    await delete_tariff(tariff.id)
    return {"status": "ok", "message": "Тариф удален", "tariffId": str(tariff.id)}




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
    bot_tariffs = await _tariffs_for_bot(bot)
    readiness = evaluate_funnel_readiness(
        schema_to_save,
        has_payment_provider=bool(bot.payment_provider),
        has_payment_credentials=bool(bot.payment_creds_enc),
        connected_chat_ids={chat.chat_id for chat in connected_chats},
        bot_tariffs=bot_tariffs,
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
        "message": "Воронка сохранена",
        "funnelComplete": readiness.is_ready,
        "readinessReasons": list(readiness.reasons),
        "readinessSummary": "Воронка сохранена",
        "botStatus": "draft" if stopped else getattr(saved_bot, "status", bot.status),
        "stopped": stopped,
    }


@api_router.post("/api/bots/{bot_id}/media-sync")
async def sync_bot_media(bot_id: int, request: Request):
    bot = await get_owned_bot(bot_id, request)
    from database.requests.bot_rq import set_media_sync_done
    await set_media_sync_done(bot.id, True)

    current_user = getattr(request.state, "user", None)
    owner_tg_id = getattr(getattr(bot, "owner", None), "telegram_id", None)
    current_tg_id = getattr(current_user, "telegram_id", None) if current_user else None

    if owner_tg_id:
        event_bus.publish_user(
            owner_tg_id,
            "bot:media_sync_done",
            {"botId": bot_id, "mediaSyncDone": True},
        )
    if current_tg_id and current_tg_id != owner_tg_id:
        event_bus.publish_user(
            current_tg_id,
            "bot:media_sync_done",
            {"botId": bot_id, "mediaSyncDone": True},
        )
    await event_bus.publish_bot(
        bot_id,
        "bot:media_sync_done",
        {"botId": bot_id, "mediaSyncDone": True},
    )
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
        raise HTTPException(
            status_code=409,
            detail="Сначала нажмите /start в созданном боте для синхронизации.",
        )
    content_type = (file.content_type or "").lower()
    media_type = (
        "photo"
        if content_type.startswith("image/")
        else (
            "video"
            if content_type.startswith("video/")
            else "document" if content_type else None
        )
    )
    if not media_type:
        raise HTTPException(status_code=415, detail="Не удалось определить тип файла.")
    # Медиа рассылки не принадлежит узлу воронки: это самостоятельный ассет бота,
    # который затем передаётся в media_asset_ids конкретной рассылки.
    is_broadcast_media = node_id == BROADCAST_MEDIA_NODE_ID
    if is_broadcast_media and media_type == "document":
        raise HTTPException(
            status_code=415,
            detail="В рассылке можно отправить только фото или видео.",
        )
    schema = dict(bot.funnel_schema or {})
    nodes = list(schema.get("nodes") or [])
    target_node = (
        None
        if is_broadcast_media
        else next((node for node in nodes if node.get("id") == node_id), None)
    )
    target_tariff_id: str | None = None
    is_tariff_media = (
        not is_broadcast_media
        and target_node is None
        and (node_id.startswith("payment:tariff:") or node_id.startswith("tariff:"))
    )
    if is_tariff_media:
        target_tariff_id = node_id.removeprefix("payment:tariff:").removeprefix("tariff:")

    if not is_broadcast_media and target_node is None and target_tariff_id is None:
        raise HTTPException(status_code=404, detail="Блок воронки не найден")
    if target_tariff_id is not None and media_type == "document":
        raise HTTPException(
            status_code=415,
            detail="Для тарифа можно использовать только фото или видео.",
        )
    payload = await file.read(20 * 1024 * 1024 + 1)
    if not payload or len(payload) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="Размер файла должен быть не больше 20 МБ."
        )

    from aiogram import Bot
    from aiogram.types import BufferedInputFile
    from database.requests.media_rq import create_media_asset

    telegram_bot = Bot(
        token=crypto.decrypt(bot.bot_token_enc), session=request.app.state.session
    )
    sent_message = None
    successful_chat_id = None
    thumbnail_file_id = None

    current_user = getattr(request.state, "user", None)
    current_tg_id = getattr(current_user, "telegram_id", None) if current_user else None
    owner_tg_id = getattr(getattr(bot, "owner", None), "telegram_id", None)

    candidate_chat_ids = []
    if current_tg_id:
        candidate_chat_ids.append(current_tg_id)
    if owner_tg_id and owner_tg_id not in candidate_chat_ids:
        candidate_chat_ids.append(owner_tg_id)

    try:
        last_error = None
        for chat_id in candidate_chat_ids:
            try:
                upload = BufferedInputFile(
                    payload, filename=file.filename or f"{node_id}.{media_type}"
                )
                if media_type == "photo":
                    sent_message = await telegram_bot.send_photo(
                        chat_id, upload, disable_notification=True
                    )
                    telegram_file_id = sent_message.photo[-1].file_id
                elif media_type == "video":
                    sent_message = await telegram_bot.send_video(
                        chat_id, upload, disable_notification=True
                    )
                    telegram_file_id = sent_message.video.file_id
                    if sent_message.video and sent_message.video.thumbnail:
                        thumbnail_file_id = sent_message.video.thumbnail.file_id
                else:
                    sent_message = await telegram_bot.send_document(
                        chat_id, upload, disable_notification=True
                    )
                    telegram_file_id = sent_message.document.file_id
                successful_chat_id = chat_id
                break
            except Exception as e:
                last_error = e
                logger.info(
                    "Попытка отправить временное медиа в chat_id=%s не удалась: %s",
                    chat_id,
                    e,
                )
                continue

        if sent_message is None:
            if last_error:
                raise last_error
            raise HTTPException(
                status_code=400,
                detail="Для загрузки медиа нажмите /start в боте (владелец или администратор).",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Не удалось синхронизировать медиа для бота %s: %s", bot_id, exc)
        raise HTTPException(
            status_code=502,
            detail="Telegram не смог обработать файл. Убедитесь, что вы нажали /start в боте.",
        ) from exc
    finally:
        if sent_message is not None and successful_chat_id is not None:
            try:
                await telegram_bot.delete_message(
                    successful_chat_id, sent_message.message_id
                )
            except Exception as exc:
                # The file_id is already received; a failed cleanup must not discard the upload.
                logger.info(
                    "Не удалось удалить временное медиа для бота %s: %s", bot_id, exc
                )

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
    current_node = (
        None
        if is_broadcast_media
        else next((node for node in current_nodes if node.get("id") == node_id), None)
    )
    current_payment_node = next(
        (node for node in current_nodes if node.get("id") == "payment"), None
    )
    current_tariff = None
    if target_tariff_id and isinstance(current_payment_node, dict):
        current_tariff = next(
            (
                tariff
                for tariff in (current_payment_node.get("tariffs") or [])
                if isinstance(tariff, dict)
                and str(tariff.get("id")) == target_tariff_id
            ),
            None,
        )
    if not is_broadcast_media and not is_tariff_media and current_node is None and current_tariff is None:
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

    if thumbnail_file_id:
        try:
            await create_media_asset(
                current_bot.id,
                f"thumb:{asset.id}",
                "photo",
                thumbnail_file_id,
                mime_type="image/jpeg",
                file_name=f"thumb_{asset.id}.jpg",
            )
        except Exception as err:
            logger.warning("Не удалось сохранить thumbnail для %s: %s", asset.id, err)

    # Медиа рассылки не пишется в воронку: рассылка ссылается на ассет по id.
    if is_broadcast_media:
        return {
            "id": str(asset.id),
            "nodeId": node_id,
            "mediaType": media_type,
            "fileId": telegram_file_id,
        }

    media_target = current_tariff if current_tariff is not None else current_node
    if is_tariff_media and media_target is None:
        if target_tariff_id:
            try:
                from database.requests.tariff_rq import get_tariff_by_id, update_tariff
                db_tariff = await get_tariff_by_id(target_tariff_id)
                if db_tariff:
                    existing_assets = list(getattr(db_tariff, "media_assets", []) or [])
                    new_asset_entry = {
                        "mediaFileId": telegram_file_id,
                        "mediaAssetId": str(asset.id),
                        "mediaType": media_type,
                    }
                    merged_assets = [a for a in existing_assets if isinstance(a, dict) and str(a.get("mediaAssetId")) != str(asset.id)]
                    merged_assets.append(new_asset_entry)
                    await update_tariff(
                        db_tariff.id,
                        media_assets=merged_assets[-10:],
                        media_file_id=telegram_file_id,
                        media_asset_id=str(asset.id),
                        media_type=media_type,
                    )
            except Exception as e:
                logger.debug("Could not link media to db tariff: %s", e)

        return {
            "id": str(asset.id),
            "nodeId": node_id,
            "mediaType": media_type,
            "fileId": telegram_file_id,
            "mediaAssets": [
                {
                    "mediaFileId": telegram_file_id,
                    "mediaAssetId": str(asset.id),
                    "mediaType": media_type,
                }
            ],
        }

    assert media_target is not None

    existing_asset_id = media_target.get("mediaAssetId")
    existing_file_id = media_target.get("mediaFileId")
    existing_type = media_target.get("mediaType") or "photo"

    assets_list = media_target.get("mediaAssets")
    if not isinstance(assets_list, list) or len(assets_list) == 0:
        assets_list = []
        if (
            existing_asset_id
            and existing_file_id
            and str(existing_asset_id) != str(asset.id)
        ):
            assets_list.append(
                {
                    "mediaFileId": existing_file_id,
                    "mediaAssetId": str(existing_asset_id),
                    "mediaType": existing_type,
                }
            )

    # Заменяем прежнюю одиночную запись в массиве (если была) на новую.
    assets_list = [
        a
        for a in assets_list
        if isinstance(a, dict) and str(a.get("mediaAssetId")) != str(asset.id)
    ]
    assets_list.append(
        {
            "mediaFileId": telegram_file_id,
            "mediaAssetId": str(asset.id),
            "mediaType": media_type,
        }
    )
    media_target["mediaAssets"] = assets_list[-10:]
    media_target["mediaFileId"] = media_target["mediaAssets"][0]["mediaFileId"]
    media_target["mediaAssetId"] = media_target["mediaAssets"][0]["mediaAssetId"]
    media_target["mediaType"] = media_target["mediaAssets"][0]["mediaType"]
    media_target["media"] = True
    current_schema["nodes"] = current_nodes
    await update_bot_funnel(current_bot.id, current_schema, current_bot.funnel_complete)
    return {
        "id": str(asset.id),
        "nodeId": node_id,
        "mediaType": media_type,
        "fileId": telegram_file_id,
        "mediaAssets": media_target["mediaAssets"],
    }


@api_router.post("/api/bots/{bot_id}/media-upload-session")
async def create_large_media_session(bot_id: int, request: Request):
    """Create a temporary session for uploading large media via the user's Telegram bot."""
    bot = await get_owned_bot(bot_id, request)
    body = await request.json()
    node_id = (body.get("node_id") or "").strip()
    if not node_id:
        raise HTTPException(status_code=422, detail="node_id обязателен")

    bot_username = (bot.username or "").lstrip("@")
    if not bot_username and bot.bot_token_enc:
        try:
            from aiogram import Bot

            token = crypto.decrypt(bot.bot_token_enc)
            temp_bot = Bot(token=token, session=request.app.state.session)
            me = await temp_bot.get_me()
            if me and me.username:
                bot_username = me.username.lstrip("@")
                from database.requests.bot_rq import update_bot_config

                await update_bot_config(bot.id, username=bot_username)
        except Exception as exc:
            logger.warning(
                "Не удалось определить username бота %s через Telegram API: %s",
                bot.id,
                exc,
            )

    if not bot_username:
        raise HTTPException(
            status_code=400,
            detail="Не удалось определить username бота. Убедитесь, что токен бота указан и валиден.",
        )

    from services.media_upload_session import (
        create_upload_session,
        get_node_human_title,
    )

    node_title = get_node_human_title(node_id, bot.funnel_schema)
    owner_tg_id = bot.owner.telegram_id if getattr(bot, "owner", None) else bot.owner_id
    session = create_upload_session(
        bot_id=bot.id,
        tg_bot_id=bot.tg_bot_id or 0,
        owner_tg_id=owner_tg_id,
        node_id=node_id,
        node_title=node_title,
    )
    return {
        "sessionId": session.id,
        "botUsername": bot_username,
        "deepLink": f"https://t.me/{bot_username}?start=up_{session.id}",
        "nodeTitle": session.node_title,
    }


@api_router.get("/api/bots/{bot_id}/media-upload-session/{session_id}")
async def get_large_media_session_status(
    bot_id: int, session_id: str, request: Request
):
    """Check status and newly uploaded assets of a large media upload session."""
    bot = await get_owned_bot(bot_id, request)
    from services.media_upload_session import get_upload_session

    session = get_upload_session(session_id)
    if not session or session.bot_id != bot.id:
        return {
            "sessionId": session_id,
            "nodeId": "",
            "isCompleted": True,
            "isCancelled": False,
            "mediaAssets": [],
        }
    return {
        "sessionId": session.id,
        "nodeId": session.node_id,
        "isCompleted": session.is_completed,
        "isCancelled": session.is_cancelled,
        "mediaAssets": session.media_assets,
    }


@api_router.get("/api/bots/{bot_id}/media/{asset_id}/preview")
async def get_bot_media_preview(bot_id: int, asset_id: UUID, request: Request):
    """Stream a saved Telegram file for the owner's Mini App preview only."""
    bot = await get_owned_bot(bot_id, request)
    from aiogram import Bot
    from database.requests.media_rq import (
        get_bot_media_asset,
        get_thumbnail_media_asset,
    )

    asset = await get_bot_media_asset(bot.id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Файл не найден для этого бота.")

    thumb_asset = None
    if asset.media_type == "video":
        thumb_asset = await get_thumbnail_media_asset(bot.id, asset.id)

    target_asset = thumb_asset if thumb_asset else asset

    try:
        telegram_bot = Bot(
            token=crypto.decrypt(bot.bot_token_enc), session=request.app.state.session
        )
        telegram_file = await telegram_bot.get_file(target_asset.telegram_file_id)
        payload = io.BytesIO()
        await telegram_bot.download_file(telegram_file.file_path, destination=payload)
    except Exception as exc:
        logger.warning("Не удалось получить preview медиа %s: %s", asset_id, exc)
        raise HTTPException(
            status_code=502, detail="Не удалось получить файл из Telegram."
        ) from exc

    return Response(
        content=payload.getvalue(),
        media_type=target_asset.mime_type
        or (
            "image/jpeg"
            if thumb_asset
            else (asset.mime_type or "application/octet-stream")
        ),
        headers={"Cache-Control": "private, max-age=300"},
    )


@api_router.delete("/api/bots/{bot_id}/leads")
async def reset_bot_leads(bot_id: int, request: Request):
    """Archive CRM leads without resetting history or destroying payments."""
    await get_owned_bot(bot_id, request)
    archived_count = await archive_leads_by_bot_id(bot_id)
    return {
        "status": "ok",
        "deletedCount": archived_count,
        "archivedCount": archived_count,
    }


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

    target_ids = set(str(t_id) for t_id in body.tariff_ids)
    db_tariffs = await list_tariffs_by_bot_id(bot.id)
    tariffs = []

    for dt in db_tariffs:
        if str(dt.id) in target_ids:
            tariffs.append(
                {
                    "id": str(dt.id),
                    "name": dt.name,
                    "price": dt.price,
                    "payment_type": dt.payment_type,
                    "billing_period": dt.recurring_period,
                    "deliverables": dt.deliverables or [],
                }
            )
            target_ids.discard(str(dt.id))

    if target_ids:
        for tariff in available:
            if str(tariff.get("id")) in target_ids:
                tariffs.append(tariff)
                target_ids.discard(str(tariff.get("id")))

    if not tariffs:
        raise HTTPException(
            status_code=400, detail="Выберите действующий тариф"
        )

    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    from database.requests.client_payment_rq import create_client_payment
    from services.funnel_message import to_telegram_html
    import uuid

    has_paid = any(float(t.get("price", 0) or 0) > 0 for t in tariffs)
    if has_paid and (not bot.payment_provider or not bot.payment_creds_enc):
        raise HTTPException(
            status_code=400, detail="Сначала подключите платёжную систему для платных тарифов"
        )
    batch_id = uuid.uuid4()
    payments = [
        await create_client_payment(
            bot_id=bot.id,
            lead_id=lead.id,
            provider="free" if float(tariff.get("price", 0) or 0) <= 0 else (bot.payment_provider or "free"),
            tariff=tariff,
            invoice_batch_id=batch_id,
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
        if len(payments) == 1:
            p = payments[0]
            t_name = p.tariff_snapshot.get("name", "Тариф")
            t_desc = p.tariff_snapshot.get("description", "")
            amt = float(p.amount)
            if amt > 0:
                price_str = f"{amt:,.0f} ₽".replace(",", " ")
                btn_text = f"💳 Оплатить {price_str}"
            else:
                price_str = "Бесплатно"
                btn_text = "🎁 Получить доступ"
            msg = f"🧾 <b>Вам выставлен счёт: {escape(str(t_name))}</b>\n\nСумма: <b>{price_str}</b>"
            if t_desc:
                msg += f"\n\n{to_telegram_html(t_desc)}"
            msg += "\n\nНажмите кнопку ниже для перехода:"
            markup = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=btn_text,
                            callback_data=f"manual_invoice:{p.id}",
                        )
                    ]
                ]
            )
        else:
            msg = "🧾 <b>Вам выставлен счёт</b>\n\nВыберите подходящий тариф для оформления:"
            markup = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=f"{payment.tariff_snapshot.get('name', 'Тариф')} · {payment.amount:,.0f} ₽".replace(
                                ",", " "
                            ),
                            callback_data=f"manual_invoice:{payment.id}",
                        )
                    ]
                    for payment in payments
                ]
            )
        await telegram_bot.send_message(
            lead.telegram_id,
            msg,
            reply_markup=markup,
        )
    except Exception as exc:
        logger.exception("Не удалось отправить ручной счёт")
        raise HTTPException(
            status_code=502, detail="Не удалось отправить счёт в Telegram"
        ) from exc
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
        LeadApiResponse.from_orm_lead(l).model_dump(by_alias=True) for l in leads
    ]
    return {"leads": leads_resp, "total": total}


@api_router.get("/api/bots/{bot_id}/stats")
async def get_bot_stats_endpoint(bot_id: int, request: Request):
    await get_owned_bot(bot_id, request)
    leads, total = await get_leads_by_bot_id(bot_id, limit=10000, include_archived=True)
    views = total
    clicks = sum(
        1 for l in leads if l.current_step_id and l.current_step_id != "node_start"
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
            {
                "name": "Дожим 1",
                "value": sum(1 for l in leads if l.current_step_id == "push1"),
            },
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


# ── R7: аудитория и рассылки ─────────────────────────────────


@api_router.get(
    "/api/bots/{bot_id}/audience/summary", response_model=AudienceSummaryResponse
)
async def get_audience_summary_endpoint(bot_id: int, request: Request):
    """Честные счётчики активной аудитории бота по фильтрам рассылок."""
    await get_owned_bot(bot_id, request)
    return await get_audience_summary(bot_id)


@api_router.get("/api/bots/{bot_id}/audience", response_model=AudienceListResponse)
async def list_audience_endpoint(
    bot_id: int,
    request: Request,
    audience: str = "all",
    search: str = None,
    page: int = 1,
    limit: int = 20,
):
    """Страница аудитории с фильтром все/оплатившие/неоплатившие."""
    await get_owned_bot(bot_id, request)
    leads, total = await list_audience_leads(
        bot_id, audience=audience, page=page, limit=limit, search=search
    )

    lead_ids = [l.id for l in leads]
    payments_by_lead = {}
    if lead_ids:
        from database.models import ClientPayment, async_session
        from sqlalchemy import select

        async with async_session() as session:
            payments = await session.scalars(
                select(ClientPayment)
                .where(
                    ClientPayment.bot_id == bot_id,
                    ClientPayment.lead_id.in_(lead_ids),
                    ClientPayment.status == "succeeded",
                )
                .order_by(ClientPayment.created_at.desc())
            )
            for p in payments:
                payments_by_lead.setdefault(p.lead_id, []).append(p)

    return {
        "leads": [
            LeadApiResponse.from_orm_lead(
                l, payments=payments_by_lead.get(l.id, [])
            ).model_dump(by_alias=True)
            for l in leads
        ],
        "total": total,
    }


@api_router.get("/api/bots/{bot_id}/leads/{lead_id}")
async def get_lead_detail_endpoint(bot_id: int, lead_id: int, request: Request):
    """Детальная карточка клиента: профиль, купленные тарифы, история оплат и права доступа."""
    bot = await get_owned_bot(bot_id, request)
    from database.models import ClientPayment, ChatAccessGrant, Lead, async_session
    from sqlalchemy import select

    async with async_session() as session:
        lead = await session.scalar(
            select(Lead).where(Lead.id == lead_id, Lead.bot_id == bot.id)
        )
        if not lead:
            raise HTTPException(status_code=404, detail="Клиент не найден")

        payments = list(
            await session.scalars(
                select(ClientPayment)
                .where(
                    ClientPayment.lead_id == lead.id,
                    ClientPayment.bot_id == bot.id,
                )
                .order_by(ClientPayment.created_at.desc())
            )
        )
        payment_ids = [p.id for p in payments]
        grants = []
        if payment_ids:
            grants = list(
                await session.scalars(
                    select(ChatAccessGrant).where(
                        ChatAccessGrant.client_payment_id.in_(payment_ids)
                    )
                )
            )
        grants_by_payment = {}
        for g in grants:
            grants_by_payment.setdefault(g.client_payment_id, []).append(g)

        total_paid = sum(
            float(p.amount) for p in payments if p.status == "succeeded"
        )
        payments_data = []
        for p in payments:
            snap = dict(p.tariff_snapshot or {})
            p_grants = grants_by_payment.get(p.id, [])
            payments_data.append(
                {
                    "id": str(p.id),
                    "tariffId": str(p.tariff_id),
                    "name": snap.get("name") or "Тариф",
                    "amount": float(p.amount),
                    "currency": p.currency,
                    "provider": p.provider,
                    "status": p.status,
                    "paidAt": p.paid_at.isoformat() if p.paid_at else None,
                    "createdAt": p.created_at.isoformat() if p.created_at else None,
                    "paymentType": snap.get("payment_type")
                    or snap.get("paymentType")
                    or "one_time",
                    "billingPeriod": snap.get("billing_period")
                    or snap.get("billingPeriod"),
                    "autoRenew": snap.get("auto_renew", True),
                    "deliverables": snap.get("deliverables") or [],
                    "grants": [
                        {
                            "id": str(g.id),
                            "chatId": g.chat_id,
                            "status": g.status,
                            "inviteLink": g.invite_link,
                            "expiresAt": g.expires_at.isoformat()
                            if g.expires_at
                            else None,
                        }
                        for g in p_grants
                    ],
                }
            )

        return {
            "lead": {
                "id": lead.id,
                "botId": lead.bot_id,
                "telegramId": lead.telegram_id,
                "username": lead.username,
                "firstName": lead.first_name,
                "currentStep": lead.current_step_id,
                "hasPurchased": lead.has_purchased or len(payments_data) > 0,
                "createdAt": lead.created_at.isoformat() if lead.created_at else None,
                "totalPaid": round(total_paid, 2),
            },
            "payments": payments_data,
        }


@api_router.post("/api/bots/{bot_id}/leads/{lead_id}/payments/{payment_id}/refund")
async def refund_client_payment_endpoint(
    bot_id: int, lead_id: int, payment_id: UUID, request: Request
):
    """Оформление возврата по платежу клиента с отзывом доступа."""
    bot = await get_owned_bot(bot_id, request)
    from database.models import (
        ClientPayment,
        ChatAccessGrant,
        Tariff,
        Lead,
        async_session,
    )
    from sqlalchemy import select, func
    from decimal import Decimal

    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .where(
                ClientPayment.id == payment_id,
                ClientPayment.lead_id == lead_id,
                ClientPayment.bot_id == bot.id,
            )
            .with_for_update()
        )
        if not payment:
            raise HTTPException(status_code=404, detail="Платёж не найден")
        if payment.status != "succeeded":
            raise HTTPException(
                status_code=400,
                detail="Возврат можно оформить только для успешно оплаченного платежа",
            )

        payment.status = "refunded"
        snap = dict(payment.tariff_snapshot or {})
        snap["refunded_at"] = datetime.now(timezone.utc).isoformat()
        payment.tariff_snapshot = snap

        # Отзываем выданные доступы к чатам
        grants = list(
            await session.scalars(
                select(ChatAccessGrant).where(
                    ChatAccessGrant.client_payment_id == payment.id
                )
            )
        )
        token = None
        if bot.bot_token_enc:
            try:
                token = crypto.decrypt(bot.bot_token_enc)
            except Exception:
                pass

        lead_row = await session.get(Lead, lead_id)
        for grant in grants:
            grant.status = "revoked"
            if token and grant.chat_id and lead_row and lead_row.telegram_id:
                try:
                    from aiogram import Bot

                    tg_bot = Bot(token=token, session=request.app.state.session)
                    try:
                        await tg_bot.ban_chat_member(
                            chat_id=int(grant.chat_id),
                            user_id=lead_row.telegram_id,
                            until_date=timedelta(seconds=60),
                        )
                    except Exception as e:
                        logger.warning("Telegram kick on refund error: %s", e)
                except Exception as ex:
                    logger.warning("Telegram bot on refund error: %s", ex)

        # Обновляем статистику тарифа
        if payment.tariff_id:
            try:
                t_uuid = UUID(str(payment.tariff_id))
                t_item = await session.get(Tariff, t_uuid)
                if t_item:
                    t_item.total_buyers = max(0, t_item.total_buyers - 1)
                    t_item.total_revenue = max(
                        Decimal("0.00"),
                        (t_item.total_revenue or Decimal("0.00")) - payment.amount,
                    )
            except Exception:
                pass

        # Проверяем оставшиеся активные оплаты
        other_active = await session.scalar(
            select(func.count(ClientPayment.id)).where(
                ClientPayment.lead_id == lead_id,
                ClientPayment.bot_id == bot.id,
                ClientPayment.id != payment.id,
                ClientPayment.status == "succeeded",
            )
        )
        if lead_row and (not other_active or other_active == 0):
            lead_row.has_purchased = False

        await session.commit()

    return {"status": "ok", "message": "Возврат успешно оформлен, доступ отозван"}


@api_router.post(
    "/api/bots/{bot_id}/leads/{lead_id}/payments/{payment_id}/cancel-subscription"
)
async def cancel_lead_subscription_endpoint(
    bot_id: int, lead_id: int, payment_id: UUID, request: Request
):
    """Отмена автопродления подписки у клиента."""
    bot = await get_owned_bot(bot_id, request)
    from database.models import ClientPayment, async_session
    from sqlalchemy import select

    async with async_session() as session:
        payment = await session.scalar(
            select(ClientPayment)
            .where(
                ClientPayment.id == payment_id,
                ClientPayment.lead_id == lead_id,
                ClientPayment.bot_id == bot.id,
            )
            .with_for_update()
        )
        if not payment:
            raise HTTPException(status_code=404, detail="Платёж не найден")

        snap = dict(payment.tariff_snapshot or {})
        snap["auto_renew"] = False
        snap["auto_renew_cancelled_at"] = datetime.now(timezone.utc).isoformat()
        payment.tariff_snapshot = snap
        await session.commit()

    return {"status": "ok", "message": "Автосписание успешно отменено"}


@api_router.post("/api/bots/{bot_id}/broadcasts", response_model=BroadcastApiResponse)
async def create_broadcast_endpoint(
    bot_id: int, request: Request, body: BroadcastCreateRequest
):
    """Создаёт рассылку со снимком получателей; дата в будущем — scheduled."""
    bot = await get_owned_bot(bot_id, request)
    try:
        broadcast = await create_broadcast(
            bot.id,
            body.text,
            body.audience,
            scheduled_at=body.scheduled_at,
            media_asset_ids=body.media_asset_ids,
            button=body.button,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    owner_tg_id = getattr(getattr(bot, "owner", None), "telegram_id", None)
    if owner_tg_id:
        event_bus.publish_user(
            owner_tg_id,
            "broadcast:status_changed",
            {
                "botId": bot.id,
                "broadcastId": str(broadcast.id),
                "status": broadcast.status,
            },
        )
    else:
        await event_bus.publish_bot(
            bot.id,
            "broadcast:status_changed",
            {
                "botId": bot.id,
                "broadcastId": str(broadcast.id),
                "status": broadcast.status,
            },
        )
    return BroadcastApiResponse.from_orm_broadcast(broadcast).model_dump(by_alias=True)


@api_router.get("/api/bots/{bot_id}/broadcasts", response_model=BroadcastListResponse)
async def list_broadcasts_endpoint(bot_id: int, request: Request):
    await get_owned_bot(bot_id, request)
    broadcasts = await list_broadcasts(bot_id)
    return {
        "broadcasts": [
            BroadcastApiResponse.from_orm_broadcast(b).model_dump(by_alias=True)
            for b in broadcasts
        ]
    }


async def _get_owned_broadcast(broadcast_id: UUID, request: Request):
    """Загружает рассылку только когда её бот принадлежит пользователю."""
    broadcast = await get_broadcast(broadcast_id)
    if broadcast is None:
        raise HTTPException(status_code=404, detail="Рассылка не найдена")
    await get_owned_bot(broadcast.bot_id, request)
    return broadcast


@api_router.get("/api/broadcasts/{broadcast_id}", response_model=BroadcastApiResponse)
async def get_broadcast_endpoint(broadcast_id: UUID, request: Request):
    broadcast = await _get_owned_broadcast(broadcast_id, request)
    return BroadcastApiResponse.from_orm_broadcast(broadcast).model_dump(by_alias=True)


@api_router.post(
    "/api/broadcasts/{broadcast_id}/retry", response_model=BroadcastApiResponse
)
async def retry_broadcast_endpoint(broadcast_id: UUID, request: Request):
    """Повторяет только неудачные доставки; успешные не дублируются."""
    try:
        broadcast = await _get_owned_broadcast(broadcast_id, request)
        requeued = await requeue_failed_recipients(broadcast.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if requeued == 0:
        raise HTTPException(
            status_code=400, detail="Нет неудачных доставок для повтора"
        )
    await event_bus.publish_bot(
        broadcast.bot_id,
        "broadcast:status_changed",
        {
            "botId": broadcast.bot_id,
            "broadcastId": str(broadcast.id),
            "status": "queued",
        },
    )
    return BroadcastApiResponse.from_orm_broadcast(broadcast).model_dump(by_alias=True)


@api_router.post(
    "/api/broadcasts/{broadcast_id}/cancel", response_model=BroadcastApiResponse
)
async def cancel_broadcast_endpoint(broadcast_id: UUID, request: Request):
    """Отменяет рассылку, которая ещё не начала отправляться."""
    broadcast = await _get_owned_broadcast(broadcast_id, request)
    try:
        await cancel_broadcast(broadcast.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    updated = await get_broadcast(broadcast.id)
    if updated:
        await event_bus.publish_bot(
            broadcast.bot_id,
            "broadcast:status_changed",
            {
                "botId": broadcast.bot_id,
                "broadcastId": str(updated.id),
                "status": updated.status,
            },
        )
    return BroadcastApiResponse.from_orm_broadcast(updated).model_dump(by_alias=True)


@api_router.api_route("/api/events", methods=["GET", "POST"])
async def sse_events_endpoint(request: Request):
    """Server-Sent Events stream for real-time notifications (upload completion, media sync, broadcasts)."""
    current_user = await get_current_user(request)
    user_tg_id = current_user.telegram_id

    async def event_generator():
        queue = await event_bus.subscribe(user_tg_id)
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                try:
                    if await request.is_disconnected():
                        break
                except Exception:
                    pass
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    event_type = event.get("type", "message")
                    payload = json.dumps(event.get("data", {}), ensure_ascii=False)
                    yield f"event: {event_type}\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        except Exception as exc:
            logger.debug("SSE client disconnected (%s): %s", user_tg_id, exc)
        finally:
            await event_bus.unsubscribe(user_tg_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
