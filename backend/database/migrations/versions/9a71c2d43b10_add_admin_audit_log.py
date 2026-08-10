"""Add append-only audit log for administrative actions.

Revision ID: 9a71c2d43b10
Revises: 34f42fe6499f
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "9a71c2d43b10"
down_revision: Union[str, Sequence[str], None] = "34f42fe6499f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the append-only administrative audit table."""
    op.create_table(
        "admin_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=128), nullable=True),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_audit_log_actor_telegram_id"),
        "admin_audit_log",
        ["actor_telegram_id"],
        unique=False,
    )
    op.create_index(op.f("ix_admin_audit_log_action"), "admin_audit_log", ["action"], unique=False)
    op.create_index(op.f("ix_admin_audit_log_target_type"), "admin_audit_log", ["target_type"], unique=False)
    op.create_index(op.f("ix_admin_audit_log_created_at"), "admin_audit_log", ["created_at"], unique=False)


def downgrade() -> None:
    """Drop the administrative audit table."""
    op.drop_index(op.f("ix_admin_audit_log_created_at"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_target_type"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_action"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_actor_telegram_id"), table_name="admin_audit_log")
    op.drop_table("admin_audit_log")
