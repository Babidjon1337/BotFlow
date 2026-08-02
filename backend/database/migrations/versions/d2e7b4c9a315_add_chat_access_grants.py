"""Add issued private-chat access records.

Revision ID: d2e7b4c9a315
Revises: c1a4e9d2b683
Create Date: 2026-07-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d2e7b4c9a315"
down_revision = "c1a4e9d2b683"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_access_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("client_payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chat_id", sa.String(length=128), nullable=False),
        sa.Column("invite_link", sa.Text(), nullable=False),
        sa.Column("access_mode", sa.String(length=32), nullable=False, server_default="member"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="issued"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("client_payment_id"),
        sa.UniqueConstraint("invite_link"),
    )
    op.create_index("ix_chat_access_grants_bot_id", "chat_access_grants", ["bot_id"])
    op.create_index("ix_chat_access_grants_lead_id", "chat_access_grants", ["lead_id"])
    op.create_index("ix_chat_access_grants_status", "chat_access_grants", ["status"])


def downgrade() -> None:
    op.drop_index("ix_chat_access_grants_status", table_name="chat_access_grants")
    op.drop_index("ix_chat_access_grants_lead_id", table_name="chat_access_grants")
    op.drop_index("ix_chat_access_grants_bot_id", table_name="chat_access_grants")
    op.drop_table("chat_access_grants")
