"""Add media support to broadcasts (multiple photos/videos via Telegram file_ids)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e8f0a1b2c3d4"
down_revision = "d7e9f2a4b6c8"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "broadcasts",
        sa.Column(
            "media_asset_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

def downgrade():
    op.drop_column("broadcasts", "media_asset_ids")
