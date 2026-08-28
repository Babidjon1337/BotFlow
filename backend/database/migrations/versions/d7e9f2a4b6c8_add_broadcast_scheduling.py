"""Add scheduled_at to broadcasts for delayed sending."""
from alembic import op
import sqlalchemy as sa

revision = "d7e9f2a4b6c8"
down_revision = "c8b3e5a17d42"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "broadcasts",
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_broadcasts_scheduled_at", "broadcasts", ["scheduled_at"]
    )

def downgrade():
    op.drop_index("ix_broadcasts_scheduled_at", table_name="broadcasts")
    op.drop_column("broadcasts", "scheduled_at")
