"""Add tariffs table for bot deliverables and metrics.

Revision ID: c7a8b9e0f1d2
Revises: e1f2a3b4c5d6
Create Date: 2026-09-20
"""

from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "c7a8b9e0f1d2"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tariffs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False, server_default="0.00"),
        sa.Column("payment_type", sa.String(length=32), nullable=False, server_default="one_time"),
        sa.Column("recurring_period", sa.String(length=64), nullable=True),
        sa.Column("sales_mode", sa.String(length=32), nullable=False, server_default="auto"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("deliverables", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("total_buyers", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_revenue", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.00"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("payment_type IN ('one_time', 'recurring')", name="ck_tariffs_payment_type"),
        sa.CheckConstraint("sales_mode IN ('auto', 'manual', 'hybrid')", name="ck_tariffs_sales_mode"),
        sa.CheckConstraint("price >= 0", name="ck_tariffs_price_positive"),
    )
    op.create_index(op.f("ix_tariffs_bot_id"), "tariffs", ["bot_id"], unique=False)
    op.create_index(op.f("ix_tariffs_created_at"), "tariffs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tariffs_created_at"), table_name="tariffs")
    op.drop_index(op.f("ix_tariffs_bot_id"), table_name="tariffs")
    op.drop_table("tariffs")
