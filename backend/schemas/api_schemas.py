from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class AuthRequest(BaseModel):
    telegram_id: int = Field(..., alias="telegramId")
    first_name: Optional[str] = Field(None, alias="firstName")
    username: Optional[str] = None
    auth_date: Optional[int] = Field(None, alias="authDate")
    hash: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class BotCreateApiRequest(BaseModel):
    token: str = Field(..., description="Токен бота от BotFather")
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


class BotApiResponse(BaseModel):
    id: int
    display_name: str = Field(..., alias="displayName")
    username: Optional[str] = None
    status: str
    users_count: int = Field(default=0, alias="usersCount")
    offer_url: Optional[str] = Field(None, alias="offerUrl")
    offer_installments: bool = Field(default=False, alias="offerInstallments")
    funnel_complete: bool = Field(default=False, alias="funnelComplete")
    media_sync_done: bool = Field(default=False, alias="mediaSyncDone")
    is_token_locked: bool = Field(default=False, alias="isTokenLocked")
    payment_provider: Optional[str] = Field(None, alias="paymentProvider")
    webhook_url: Optional[str] = Field(None, alias="webhookUrl")
    bot_url: Optional[str] = Field(None, alias="botUrl")
    created_at: Optional[str] = Field(None, alias="createdAt")

    model_config = ConfigDict(populate_by_name=True)

    @classmethod
    def from_orm_bot(cls, bot, webhook_base_url: str = ""):
        bot_url = f"https://t.me/{bot.username}" if bot.username else None
        webhook_url = f"{webhook_base_url}/webhook/bots/{bot.id}" if webhook_base_url else None
        created_str = bot.created_at.isoformat() if hasattr(bot, "created_at") and bot.created_at else None
        return cls(
            id=bot.id,
            display_name=getattr(bot, "display_name", "Мой бот") or "Мой бот",
            username=bot.username,
            status=bot.status,
            users_count=bot.users_count,
            offer_url=getattr(bot, "offer_url", None),
            offer_installments=getattr(bot, "offer_installments", False),
            funnel_complete=getattr(bot, "funnel_complete", False),
            media_sync_done=getattr(bot, "media_sync_done", False),
            is_token_locked=getattr(bot, "is_token_locked", False),
            payment_provider=bot.payment_provider,
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


class FunnelUpdateApiRequest(BaseModel):
    version: int = 2
    nodes: List[Dict[str, Any]] = []
    funnel_complete: bool = Field(default=False, alias="funnelComplete")

    model_config = ConfigDict(populate_by_name=True)


class FunnelApiResponse(BaseModel):
    version: int = 2
    nodes: List[Dict[str, Any]] = []
    funnel_complete: bool = Field(default=False, alias="funnelComplete")

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
