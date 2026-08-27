"""Add compatible R3 gateway and bot subscription tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a4d2e7f93c01"
down_revision = "f3a1c9d2e8b4"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("gateway_connections", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("provider", sa.String(32), nullable=False), sa.Column("display_name", sa.String(128), nullable=False), sa.Column("credentials_enc", sa.LargeBinary(), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("verified_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("bot_subscriptions", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, unique=True), sa.Column("status", sa.String(20), nullable=False), sa.Column("product_code", sa.String(64)), sa.Column("starts_at", sa.DateTime(timezone=True)), sa.Column("ends_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.add_column("bots", sa.Column("active_gateway_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gateway_connections.id", ondelete="SET NULL"), nullable=True))

def downgrade():
    op.drop_column("bots", "active_gateway_connection_id")
    op.drop_table("bot_subscriptions")
    op.drop_table("gateway_connections")
