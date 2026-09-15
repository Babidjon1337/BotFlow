"""Per-bot subscription billing: amount, auto-renew, retries on bot_subscriptions; bot_id on saas_payments.

Revision ID: a3b5c7d9e1f2
Revises: d2f6a9c4e7b1
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a3b5c7d9e1f2"
down_revision = "d2f6a9c4e7b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bot_subscriptions",
        sa.Column("amount_rub", sa.Integer(), nullable=True),
    )
    op.add_column(
        "bot_subscriptions",
        sa.Column(
            "auto_renew",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "bot_subscriptions",
        sa.Column(
            "retry_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.add_column(
        "bot_subscriptions",
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "bot_subscriptions",
        sa.Column("grace_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "saas_payments",
        sa.Column("bot_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_saas_payments_bot_id",
        "saas_payments",
        "bots",
        ["bot_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_saas_payments_bot_id"), "saas_payments", ["bot_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saas_payments_bot_id"), table_name="saas_payments")
    op.drop_constraint("fk_saas_payments_bot_id", "saas_payments", type_="foreignkey")
    op.drop_column("saas_payments", "bot_id")
    op.drop_column("bot_subscriptions", "grace_until")
    op.drop_column("bot_subscriptions", "next_retry_at")
    op.drop_column("bot_subscriptions", "retry_count")
    op.drop_column("bot_subscriptions", "auto_renew")
    op.drop_column("bot_subscriptions", "amount_rub")
