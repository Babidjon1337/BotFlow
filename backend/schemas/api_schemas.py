import json
from typing import Literal

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

from schemas.funnel import FunnelNodeSchema, FunnelSchemaV2


def _mask_secret(value: Any) -> str:
    text = str(value)
    if len(text) <= 4:
        return "•" * len(text)
    return f"{text[:4]}••••{text[-4:]}"


def _payment_credentials_preview(encrypted_credentials: bytes | None) -> Dict[str, str]:
    if not encrypted_credentials:
        return {}
    try:
        from services.security import crypto

        credentials = json.loads(crypto.decrypt(encrypted_credentials))
        return {str(key): _mask_secret(value) for key, value in credentials.items() if value}
    except Exception:
        return {}


class AuthRequest(BaseModel):
    telegram_id: int = Field(..., alias="telegramId")
    first_name: Optional[str] = Field(None, alias="firstName")
    username: Optional[str] = None
    auth_date: Optional[int] = Field(None, alias="authDate")
    hash: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class BillingCheckoutRequest(BaseModel):
    product: str
    email: Optional[str] = None


class NotificationSettingsRequest(BaseModel):
    email: Optional[str] = None
    email_receipts_enabled: bool = Field(default=True, alias="emailReceiptsEnabled")
    email_billing_notifications_enabled: bool = Field(default=True, alias="emailBillingNotificationsEnabled")

    model_config = ConfigDict(populate_by_name=True)


class AdminUserAccessRequest(BaseModel):
    disabled: bool
    stop_active_bots: bool = Field(default=False, alias="stopActiveBots")

    model_config = ConfigDict(populate_by_name=True)


class AdminLifetimeLicenseRequest(BaseModel):
    direction: Literal["grant", "revoke"]
    quantity: int = Field(..., ge=1, le=100)


class AdminProExtensionRequest(BaseModel):
    days: int = Field(..., ge=1, le=365)


class AdminBotActionRequest(BaseModel):
    action: Literal["start", "stop", "reinstall_webhook"]


class BillingCheckoutResponse(BaseModel):
    payment_id: str = Field(..., alias="paymentId")
    confirmation_url: str = Field(..., alias="confirmationUrl")

    model_config = ConfigDict(populate_by_name=True)


class ManualInvoiceRequest(BaseModel):
    lead_telegram_id: int = Field(..., alias="leadTelegramId")
    tariff_ids: List[str] = Field(..., min_length=1, alias="tariffIds")

    model_config = ConfigDict(populate_by_name=True)


class ChatDeliveryVerifyRequest(BaseModel):
    chat_id: str = Field(..., min_length=1, max_length=128, alias="chatId")
    access_mode: str = Field(default="member", alias="accessMode")

    model_config = ConfigDict(populate_by_name=True)


class BotCreateApiRequest(BaseModel):
    token: Optional[str] = Field(None, description="Токен бота от BotFather; для черновика не обязателен")
    display_name: str = Field(default="Мой бот", alias="displayName")
    offer_url: Optional[str] = Field(None, alias="offerUrl")
    offer_installments: bool = Field(default=False, alias="offerInstallments")
    payment_provider: Optional[str] = Field(None, alias="paymentProvider")
    payment_creds: Optional[Dict[str, Any]] = Field(default=None, alias="paymentCreds")

    model_config = ConfigDict(populate_by_name=True)


class BotUpdateApiRequest(BaseModel):
    token: Optional[str] = None
    display_name: Optional[str] = Field(None, alias="displayName")
    offer_url: Optional[str] = Field(None, alias="offerUrl")
    offer_installments: Optional[bool] = Field(None, alias="offerInstallments")
    payment_provider: Optional[str] = Field(None, alias="paymentProvider")
    payment_creds: Optional[Dict[str, Any]] = Field(None, alias="paymentCreds")

    model_config = ConfigDict(populate_by_name=True)


class GatewayConnectionCreateRequest(BaseModel):
    provider: Literal["yookassa", "robokassa", "prodamus"]
    display_name: str = Field(min_length=1, max_length=128, alias="displayName")
    credentials: Dict[str, Any]

    model_config = ConfigDict(populate_by_name=True)


class BotApiResponse(BaseModel):
    id: int
    display_name: str = Field(..., alias="displayName")
    username: Optional[str] = None
    status: str
    scenario_type: Optional[str] = Field(None, alias="scenarioType")
    scenario_version: Optional[int] = Field(None, alias="scenarioVersion")
    lifecycle_status: Optional[str] = Field(None, alias="lifecycleStatus")
    pause_reason: Optional[str] = Field(None, alias="pauseReason")
    users_count: int = Field(default=0, alias="usersCount")
    offer_url: Optional[str] = Field(None, alias="offerUrl")
    offer_installments: bool = Field(default=False, alias="offerInstallments")
    funnel_complete: bool = Field(default=False, alias="funnelComplete")
    media_sync_done: bool = Field(default=False, alias="mediaSyncDone")
    is_token_locked: bool = Field(default=False, alias="isTokenLocked")
    sales: int = Field(default=0)
    revenue: float = Field(default=0.0)
    payment_provider: Optional[str] = Field(None, alias="paymentProvider")
    has_payment_credentials: bool = Field(default=False, alias="hasPaymentCredentials")
    token_preview: Optional[str] = Field(None, alias="tokenPreview")
    payment_credentials_preview: Dict[str, str] = Field(default_factory=dict, alias="paymentCredentialsPreview")
    payment_webhook_url: Optional[str] = Field(None, alias="paymentWebhookUrl")
    webhook_url: Optional[str] = Field(None, alias="webhookUrl")
    bot_url: Optional[str] = Field(None, alias="botUrl")
    created_at: Optional[str] = Field(None, alias="createdAt")

    model_config = ConfigDict(populate_by_name=True)

    @classmethod
    def from_orm_bot(
        cls,
        bot,
        telegram_webhook_base_url: str = "",
        payment_webhook_base_url: str = "",
    ):
        bot_url = f"https://t.me/{bot.username}" if bot.username else None
        webhook_url = (
            f"{telegram_webhook_base_url.rstrip('/')}/webhook/bots/{bot.id}"
            if telegram_webhook_base_url
            else None
        )
        payment_webhook_url = (
            f"{payment_webhook_base_url.rstrip('/')}/webhook/payments/{bot.payment_provider}/{bot.tg_bot_id}"
            if payment_webhook_base_url and bot.payment_provider and bot.tg_bot_id
            else None
        )
        created_str = bot.created_at.isoformat() if hasattr(bot, "created_at") and bot.created_at else None
        token_preview = None
        try:
            from services.security import crypto

            token_preview = _mask_secret(crypto.decrypt(bot.bot_token_enc)) if bot.bot_token_enc else None
        except Exception:
            pass
        return cls(
            id=bot.id,
            display_name=getattr(bot, "display_name", "Мой бот") or "Мой бот",
            username=bot.username,
            status=bot.status,
            scenario_type=getattr(bot, "scenario_type", None),
            scenario_version=getattr(bot, "scenario_payload_version", None),
            lifecycle_status=getattr(bot, "lifecycle_status", None),
            pause_reason=getattr(bot, "pause_reason", None),
            users_count=bot.users_count,
            offer_url=getattr(bot, "offer_url", None),
            offer_installments=getattr(bot, "offer_installments", False),
            funnel_complete=getattr(bot, "funnel_complete", False),
            media_sync_done=getattr(bot, "media_sync_done", False),
            is_token_locked=getattr(bot, "is_token_locked", False),
            payment_provider=bot.payment_provider,
            has_payment_credentials=bool(getattr(bot, "payment_creds_enc", None)),
            token_preview=token_preview,
            payment_credentials_preview=_payment_credentials_preview(getattr(bot, "payment_creds_enc", None)),
            payment_webhook_url=payment_webhook_url,
            webhook_url=webhook_url,
            bot_url=bot_url,
            created_at=created_str,
        )


class BotListResponse(BaseModel):
    bots: List[BotApiResponse]


class BotToggleResponse(BaseModel):
    status: str
    message: str
    bot_status: str = Field(..., alias="botStatus")
    webhook_url: Optional[str] = Field(None, alias="webhookUrl")
    bot_url: Optional[str] = Field(None, alias="botUrl")

    model_config = ConfigDict(populate_by_name=True)


class FunnelUpdateApiRequest(FunnelSchemaV2):
    funnel_complete: bool = Field(default=False, alias="funnelComplete")

    def as_schema(self) -> FunnelSchemaV2:
        return FunnelSchemaV2(version=self.version, nodes=self.nodes)


class FunnelApiResponse(FunnelSchemaV2):
    funnel_complete: bool = Field(default=False, alias="funnelComplete")


class FunnelSaveResponse(BaseModel):
    status: str
    message: str
    funnel_complete: bool = Field(default=False, alias="funnelComplete")
    readiness_reasons: List[str] = Field(default_factory=list, alias="readinessReasons")
    bot_status: str = Field(..., alias="botStatus")
    stopped: bool = False

    model_config = ConfigDict(populate_by_name=True)


class LeadApiResponse(BaseModel):
    id: int
    telegram_id: int = Field(..., alias="telegramId")
    username: Optional[str] = None
    first_name: Optional[str] = Field(None, alias="firstName")
    current_step: str = Field(..., alias="currentStep")
    has_purchased: bool = Field(default=False, alias="hasPurchased")
    created_at: Optional[str] = Field(None, alias="createdAt")

    model_config = ConfigDict(populate_by_name=True)

    @classmethod
    def from_orm_lead(cls, lead):
        created_str = lead.created_at.isoformat() if hasattr(lead, "created_at") and lead.created_at else None
        return cls(
            id=lead.id,
            telegram_id=lead.telegram_id,
            username=getattr(lead, "username", None),
            first_name=getattr(lead, "first_name", None),
            current_step=lead.current_step_id,
            has_purchased=lead.has_purchased,
            created_at=created_str,
        )


class LeadListApiResponse(BaseModel):
    leads: List[LeadApiResponse]
    total: int


# ── R7: рассылки ─────────────────────────────────────────────
AudienceFilter = Literal["all", "paid", "unpaid"]


class AudienceSummaryResponse(BaseModel):
    all: int
    paid: int
    unpaid: int


class AudienceListResponse(BaseModel):
    leads: List[LeadApiResponse]
    total: int


class BroadcastCreateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)
    audience: AudienceFilter = "all"


class BroadcastApiResponse(BaseModel):
    id: str
    status: str
    audience: str
    text: str
    platform: str = "telegram"
    total_recipients: int = Field(..., alias="totalRecipients")
    sent_count: int = Field(..., alias="sentCount")
    failed_count: int = Field(..., alias="failedCount")
    created_at: Optional[str] = Field(None, alias="createdAt")
    completed_at: Optional[str] = Field(None, alias="completedAt")
    last_error: Optional[str] = Field(None, alias="lastError")

    model_config = ConfigDict(populate_by_name=True)

    @classmethod
    def from_orm_broadcast(cls, broadcast) -> "BroadcastApiResponse":
        return cls(
            id=str(broadcast.id),
            status=broadcast.status,
            audience=broadcast.audience,
            text=broadcast.text,
            platform=broadcast.platform,
            total_recipients=broadcast.total_recipients,
            sent_count=broadcast.sent_count,
            failed_count=broadcast.failed_count,
            created_at=(
                broadcast.created_at.isoformat() if broadcast.created_at else None
            ),
            completed_at=(
                broadcast.completed_at.isoformat() if broadcast.completed_at else None
            ),
            last_error=broadcast.last_error,
        )


class BroadcastListResponse(BaseModel):
    broadcasts: List[BroadcastApiResponse]
