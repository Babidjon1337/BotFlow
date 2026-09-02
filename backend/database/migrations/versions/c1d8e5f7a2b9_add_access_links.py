"""Add admin access links (special /start links granting free access)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c1d8e5f7a2b9"
down_revision = "b9c4d7e2f5a8"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "access_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("token", sa.String(32), nullable=False, unique=True, index=True),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False, server_default="period"),
        sa.Column("days", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("activated_by", sa.BigInteger(), nullable=True, index=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

def downgrade():
    op.drop_table("access_links")
