"""Add SaaS billing and permanent bot licenses.

Revision ID: b91a0df6b3a8
Revises: ca147cad79d8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b91a0df6b3a8"
down_revision: Union[str, Sequence[str], None] = "ca147cad79d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("subscription_auto_renew", sa.Boolean(), nullable=False, server_default="false")
    )
    op.add_column("users", sa.Column("subscription_payment_method_enc", sa.LargeBinary(), nullable=True))
    op.add_column(
        "users", sa.Column("subscription_retry_count", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("users", sa.Column("subscription_next_retry_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("subscription_grace_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "bots", sa.Column("has_lifetime_license", sa.Boolean(), nullable=False, server_default="false")
    )
    op.create_table(
        "saas_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="RUB"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("idempotence_key", sa.String(length=64), nullable=False, unique=True),
        sa.Column("yookassa_payment_id", sa.String(length=64), nullable=True, unique=True),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_saas_payments_idempotence_key", "saas_payments", ["idempotence_key"])
    op.create_index("ix_saas_payments_yookassa_payment_id", "saas_payments", ["yookassa_payment_id"])


def downgrade() -> None:
    op.drop_index("ix_saas_payments_yookassa_payment_id", table_name="saas_payments")
    op.drop_index("ix_saas_payments_idempotence_key", table_name="saas_payments")
    op.drop_table("saas_payments")
    op.drop_column("bots", "has_lifetime_license")
    op.drop_column("users", "subscription_next_retry_at")
    op.drop_column("users", "subscription_grace_until")
    op.drop_column("users", "subscription_retry_count")
    op.drop_column("users", "subscription_payment_method_enc")
    op.drop_column("users", "subscription_auto_renew")
