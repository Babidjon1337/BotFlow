"""Add reversible owner access pause state.

Revision ID: b2c8e4f9a110
Revises: 9a71c2d43b10
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b2c8e4f9a110"
down_revision: Union[str, Sequence[str], None] = "9a71c2d43b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add non-destructive account pause fields for SaaS owners."""
    op.add_column(
        "users",
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("users", "is_disabled", server_default=None)


def downgrade() -> None:
    """Remove the account pause fields."""
    op.drop_column("users", "disabled_at")
    op.drop_column("users", "is_disabled")
