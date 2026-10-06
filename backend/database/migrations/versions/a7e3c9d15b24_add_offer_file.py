"""Add offer file (Telegram file_id) fields to bots.

Revision ID: a7e3c9d15b24
Revises: f4b1a8c9e2d3
Create Date: 2026-10-07
"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "a7e3c9d15b24"
down_revision: Union[str, Sequence[str], None] = "f4b1a8c9e2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bots", sa.Column("offer_file_id", sa.Text(), nullable=True))
    op.add_column("bots", sa.Column("offer_file_name", sa.String(length=255), nullable=True))
    op.add_column("bots", sa.Column("offer_file_mime", sa.String(length=128), nullable=True))
    op.add_column("bots", sa.Column("offer_slug", sa.String(length=64), nullable=True))
    op.create_index("ix_bots_offer_slug", "bots", ["offer_slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_bots_offer_slug", table_name="bots")
    op.drop_column("bots", "offer_slug")
    op.drop_column("bots", "offer_file_mime")
    op.drop_column("bots", "offer_file_name")
    op.drop_column("bots", "offer_file_id")
