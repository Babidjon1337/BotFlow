"""Add subscriptions and payment_attempts tables for recurring payments.

Revision ID: f4b1a8c9e2d3
Revises: c7a8b9e0f1d2
Create Date: 2026-09-28
"""

from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "f4b1a8c9e2d3"
down_revision: Union[str, Sequence[str], None] = "c7a8b9e0f1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("tariff_id", sa.String(length=128), nullable=True),
        sa.Column("tariff_snapshot", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("initial_payment_id", UUID(as_uuid=True), sa.ForeignKey("client_payments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_subscription_id", sa.String(length=128), nullable=True),
        sa.Column("provider_payment_method_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="RUB"),
        sa.Column("next_charge_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_charge_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(op.f("ix_subscriptions_bot_id"), "subscriptions", ["bot_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_lead_id"), "subscriptions", ["lead_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_user_id"), "subscriptions", ["user_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_initial_payment_id"), "subscriptions", ["initial_payment_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_provider_subscription_id"), "subscriptions", ["provider_subscription_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_provider_payment_method_id"), "subscriptions", ["provider_payment_method_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_status"), "subscriptions", ["status"], unique=False)
    op.create_index(op.f("ix_subscriptions_next_charge_at"), "subscriptions", ["next_charge_at"], unique=False)

    op.create_table(
        "payment_attempts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=128), nullable=True),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="RUB"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index(op.f("ix_payment_attempts_subscription_id"), "payment_attempts", ["subscription_id"], unique=False)
    op.create_index(op.f("ix_payment_attempts_provider_payment_id"), "payment_attempts", ["provider_payment_id"], unique=False)
    op.create_index(op.f("ix_payment_attempts_idempotency_key"), "payment_attempts", ["idempotency_key"], unique=True)
    op.create_index(op.f("ix_payment_attempts_status"), "payment_attempts", ["status"], unique=False)


def downgrade() -> None:
    op.drop_table("payment_attempts")
    op.drop_table("subscriptions")
