"""add user notification settings"""
from alembic import op
import sqlalchemy as sa

revision = "c1a4e9d2b683"
down_revision = "a6d1f5c2e849"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "email" not in existing_columns:
        op.add_column("users", sa.Column("email", sa.String(length=320), nullable=True))
    if "email_receipts_enabled" not in existing_columns:
        op.add_column("users", sa.Column("email_receipts_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    if "email_billing_notifications_enabled" not in existing_columns:
        op.add_column("users", sa.Column("email_billing_notifications_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("users", "email_receipts_enabled", server_default=None)
    op.alter_column("users", "email_billing_notifications_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "email_billing_notifications_enabled")
    op.drop_column("users", "email_receipts_enabled")
    op.drop_column("users", "email")
