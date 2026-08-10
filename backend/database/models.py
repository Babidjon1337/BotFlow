import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Sequence,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB, UUID

from loggers import logger
from config import DATABASE_URL


class Base(AsyncAttrs, DeclarativeBase):
    pass


# ==========================================
# 1. ТАБЛИЦА USERS (Владельцы ботов / Клиенты SaaS)
# ==========================================
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)

    # Подписка на SaaS и юридическое согласие
    subscription_ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    lifetime_slots: Mapped[int] = mapped_column(Integer, default=0)
    agreed_to_tos_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    subscription_auto_renew: Mapped[bool] = mapped_column(Boolean, default=False)
    subscription_payment_method_enc: Mapped[Optional[bytes]] = mapped_column(nullable=True)
    subscription_retry_count: Mapped[int] = mapped_column(Integer, default=0)
    subscription_next_retry_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    subscription_grace_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    email_receipts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_billing_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Account access may be paused by a platform administrator.  Data and
    # entitlements remain intact so that restoring access never requires a
    # destructive recovery operation.
    is_disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи (Один-ко-Многим)
    bots: Mapped[list["BotConfig"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    saas_payments: Mapped[list["SaasPayment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


# ==========================================
# 2. ТАБЛИЦА BOTS (Клиентские боты)
# ==========================================
class BotConfig(Base):
    __tablename__ = "bots"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    # Настройки Telegram бота Зашифрованный Fernet токен
    bot_token_enc: Mapped[Optional[bytes]] = mapped_column(nullable=True)
    tg_bot_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, unique=True, index=True, nullable=True
    )
    username: Mapped[Optional[str]] = mapped_column(String(255))

    # Статус и статистика
    status: Mapped[str] = mapped_column(String(20), default="draft") # draft, active, archived
    users_count: Mapped[int] = mapped_column(Integer, default=0)
    is_token_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    has_lifetime_license: Mapped[bool] = mapped_column(Boolean, default=False)
    display_name: Mapped[str] = mapped_column(String(255), default="Мой бот")
    offer_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    offer_installments: Mapped[bool] = mapped_column(Boolean, default=False)
    funnel_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    media_sync_done: Mapped[bool] = mapped_column(Boolean, default=False)

    # Настройки платежной системы (например, ЮKassa)
    payment_provider: Mapped[Optional[str]] = mapped_column(String(50))
    payment_creds_enc: Mapped[Optional[bytes]] = (
        mapped_column()
    )  # Зашифрованный JSON с ключами

    # Схема воронки (наш Pydantic JSON)
    funnel_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self):
        return f"<BotConfig(id={self.id}, tg_bot_id={self.tg_bot_id}, status={self.status}, bot_token_enc='***', payment_creds_enc='***')>"

    # Связи
    owner: Mapped["User"] = relationship(back_populates="bots")
    leads: Mapped[list["Lead"]] = relationship(
        back_populates="bot", cascade="all, delete-orphan"
    )
    client_payments: Mapped[list["ClientPayment"]] = relationship(
        back_populates="bot", cascade="all, delete-orphan"
    )


# ==========================================
# 3. ТАБЛИЦА LEADS (Подписчики внутри воронок)
# ==========================================
class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"))
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Состояние в воронке
    current_step_id: Mapped[str] = mapped_column(String(255), default="node_start")
    agreed_to_tos: Mapped[bool] = mapped_column(Boolean, default=False)

    # Метрика для аналитики (вместо отдельной таблицы Payment)
    has_purchased: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Связи
    bot: Mapped["BotConfig"] = relationship(back_populates="leads")
    tasks: Mapped[list["ScheduledTask"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    client_payments: Mapped[list["ClientPayment"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )


# ==========================================
# 4. CLIENT_PAYMENTS (orders for client bots)
# ==========================================
class ClientPayment(Base):
    """An immutable tariff snapshot and its provider payment lifecycle."""

    __tablename__ = "client_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider_order_number: Mapped[int] = mapped_column(
        BigInteger,
        Sequence("client_payment_order_number_seq"),
        unique=True,
        index=True,
    )
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    invoice_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    tariff_id: Mapped[str] = mapped_column(String(128))
    tariff_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="RUB")
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_payment_id: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True)
    idempotence_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    fulfillment_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    fulfillment_attempts: Mapped[int] = mapped_column(Integer, default=0)
    fulfillment_next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    fulfillment_error: Mapped[Optional[str]] = mapped_column(Text)
    fulfilled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    owner_notification_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    owner_notification_attempts: Mapped[int] = mapped_column(Integer, default=0)
    owner_notification_next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    owner_notification_error: Mapped[Optional[str]] = mapped_column(Text)
    owner_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    bot: Mapped["BotConfig"] = relationship(back_populates="client_payments")
    lead: Mapped["Lead"] = relationship(back_populates="client_payments")


class ChatAccessGrant(Base):
    """A single paid, bot-created invite link for a private Telegram chat."""

    __tablename__ = "chat_access_grants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    client_payment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("client_payments.id", ondelete="CASCADE"), index=True
    )
    chat_id: Mapped[str] = mapped_column(String(128), index=True)
    invite_link: Mapped[str] = mapped_column(Text, unique=True)
    access_mode: Mapped[str] = mapped_column(String(32), default="member")
    status: Mapped[str] = mapped_column(String(20), default="issued", index=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ConnectedChat(Base):
    """A channel or group explicitly connected by the bot owner via /connect."""

    __tablename__ = "connected_chats"
    __table_args__ = (UniqueConstraint("bot_id", "chat_id", name="uq_connected_chats_bot_chat"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    chat_id: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str] = mapped_column(String(255), default="Без названия")
    chat_type: Mapped[str] = mapped_column(String(32), nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MediaAsset(Base):
    """Telegram media bound to one client bot and a funnel node."""

    __tablename__ = "media_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(16))
    telegram_file_id: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128))
    file_name: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# ==========================================
# 5. ТАБЛИЦА SAAS_PAYMENTS (платежи BotFlow)
# ==========================================
class SaasPayment(Base):
    __tablename__ = "saas_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    product: Mapped[str] = mapped_column(String(32))  # license | pro_initial | pro_renewal
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="RUB")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    idempotence_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    yookassa_payment_id: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, index=True
    )
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="saas_payments")


class AdminAuditLog(Base):
    """Append-only record of administrative actions performed in BotFlow."""

    __tablename__ = "admin_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    actor_telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(32), index=True)
    target_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


# ==========================================
# 4. ТАБЛИЦА SCHEDULED_TASKS (Очередь дожимов)
# ==========================================
class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bot_id: Mapped[int] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"))
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"))

    # ID шага (например, "node_dozhim_1")
    step_to_send: Mapped[str] = mapped_column(String(255), default="node_dozhim_1")

    # Хранилище для самого куска JSON (данные внутри "node_dozhim_1")
    raw_node_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Индекс для быстрого поиска наступивших задач
    execute_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    # Связи
    lead: Mapped["Lead"] = relationship(back_populates="tasks")


engine = create_async_engine(url=DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)
async def init_models():
    """Verify database connectivity; schema changes are handled by Alembic."""
    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text("SELECT 1"))
        logger.info("✅ Подключение к БД успешно. Схема управляется Alembic.")


if __name__ == "__main__":
    import asyncio

    asyncio.run(init_models())
