"""Add bot-scoped Telegram media assets."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a6d1f5c2e849"
down_revision = "85cf3a71df92"
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("media_assets"):
        op.create_table("media_assets",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
            sa.Column("node_id", sa.String(length=64), nullable=False),
            sa.Column("media_type", sa.String(length=16), nullable=False),
            sa.Column("telegram_file_id", sa.Text(), nullable=False),
            sa.Column("mime_type", sa.String(length=128), nullable=True),
            sa.Column("file_name", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    existing_indexes = {
        index["name"] for index in sa.inspect(bind).get_indexes("media_assets")
    }
    if "ix_media_assets_bot_id" not in existing_indexes:
        op.create_index("ix_media_assets_bot_id", "media_assets", ["bot_id"])

def downgrade():
    op.drop_table("media_assets")
