"""Add durable orders for payments to client bots."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "85cf3a71df92"
down_revision: Union[str, Sequence[str], None] = "0401e7b04d40"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("client_payments"):
        op.create_table(
            "client_payments",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("bot_id", sa.Integer(), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
            sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
            sa.Column("invoice_batch_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("tariff_id", sa.String(length=128), nullable=False),
            sa.Column("tariff_snapshot", postgresql.JSONB(), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="RUB"),
            sa.Column("provider", sa.String(length=32), nullable=False),
            sa.Column("provider_payment_id", sa.String(length=128), nullable=True, unique=True),
            sa.Column("idempotence_key", sa.String(length=64), nullable=False, unique=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    existing_indexes = {
        index["name"] for index in sa.inspect(bind).get_indexes("client_payments")
    }
    for name, column in (
        ("ix_client_payments_bot_id", "bot_id"),
        ("ix_client_payments_lead_id", "lead_id"),
        ("ix_client_payments_invoice_batch_id", "invoice_batch_id"),
        ("ix_client_payments_provider_payment_id", "provider_payment_id"),
        ("ix_client_payments_idempotence_key", "idempotence_key"),
        ("ix_client_payments_status", "status"),
    ):
        if name not in existing_indexes:
            op.create_index(name, "client_payments", [column])


def downgrade() -> None:
    op.drop_table("client_payments")
