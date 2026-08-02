"""Store chats explicitly connected by client-bot owners.

Revision ID: e3f8a1c4d926
Revises: d2e7b4c9a315
Create Date: 2026-07-31
"""

from alembic import op
import sqlalchemy as sa


revision = "e3f8a1c4d926"
down_revision = "d2e7b4c9a315"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "connected_chats",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chat_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False, server_default="Без названия"),
        sa.Column("chat_type", sa.String(length=32), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("bot_id", "chat_id", name="uq_connected_chats_bot_chat"),
    )
    op.create_index("ix_connected_chats_bot_id", "connected_chats", ["bot_id"])


def downgrade() -> None:
    op.drop_index("ix_connected_chats_bot_id", table_name="connected_chats")
    op.drop_table("connected_chats")
