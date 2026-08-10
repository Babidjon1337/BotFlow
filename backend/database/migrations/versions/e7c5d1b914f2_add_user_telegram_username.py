"""Store the current Telegram username for administrator lookup.

Revision ID: e7c5d1b914f2
Revises: d1a8f4c623b2
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e7c5d1b914f2"
down_revision: Union[str, Sequence[str], None] = "d1a8f4c623b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Persist the optional username provided by signed Telegram init data."""
    op.add_column("users", sa.Column("username", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)


def downgrade() -> None:
    """Remove the administrator lookup field."""
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_column("users", "username")
