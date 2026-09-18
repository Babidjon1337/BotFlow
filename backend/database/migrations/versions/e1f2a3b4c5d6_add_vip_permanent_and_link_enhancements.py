"""Add is_vip_permanent to users, and free_bots_count and is_permanent to access_links.

Revision ID: e1f2a3b4c5d6
Revises: a3b5c7d9e1f2
Create Date: 2026-09-18
"""

import sqlalchemy as sa
from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "a3b5c7d9e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip_permanent BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE access_links ADD COLUMN IF NOT EXISTS free_bots_count INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE access_links ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.drop_column("access_links", "is_permanent")
    op.drop_column("access_links", "free_bots_count")
    op.drop_column("users", "is_vip_permanent")
