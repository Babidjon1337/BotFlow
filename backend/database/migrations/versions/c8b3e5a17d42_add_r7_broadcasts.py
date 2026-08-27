"""Add R7 broadcasts and broadcast recipients tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c8b3e5a17d42"
down_revision = "a4d2e7f93c01"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "broadcasts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, index=True),
        sa.Column("audience", sa.String(16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("total_recipients", sa.Integer(), nullable=False),
        sa.Column("sent_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )
    op.create_table(
        "broadcast_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("broadcast_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("broadcasts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, index=True),
        sa.Column("error", sa.Text()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("broadcast_id", "lead_id", name="uq_broadcast_recipient"),
    )

def downgrade():
    op.drop_table("broadcast_recipients")
    op.drop_table("broadcasts")
