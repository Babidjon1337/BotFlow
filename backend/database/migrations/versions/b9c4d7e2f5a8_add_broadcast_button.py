"""Add optional inline button config to broadcasts (tariff / consultation link)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b9c4d7e2f5a8"
down_revision = "e8f0a1b2c3d4"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "broadcasts",
        sa.Column("button", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

def downgrade():
    op.drop_column("broadcasts", "button")
