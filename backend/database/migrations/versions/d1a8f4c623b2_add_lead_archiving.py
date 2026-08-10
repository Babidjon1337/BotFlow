"""Retain cleared CRM leads as historical data.

Revision ID: d1a8f4c623b2
Revises: b2c8e4f9a110
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d1a8f4c623b2"
down_revision: Union[str, Sequence[str], None] = "b2c8e4f9a110"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add a non-destructive archive state to funnel leads."""
    op.add_column(
        "leads",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("leads", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_leads_is_archived", "leads", ["is_archived"])
    op.alter_column("leads", "is_archived", server_default=None)


def downgrade() -> None:
    """Remove the archive state."""
    op.drop_index("ix_leads_is_archived", table_name="leads")
    op.drop_column("leads", "archived_at")
    op.drop_column("leads", "is_archived")
