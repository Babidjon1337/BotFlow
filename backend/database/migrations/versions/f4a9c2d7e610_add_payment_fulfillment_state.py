"""Add durable client-payment fulfillment and provider order numbers.

Revision ID: f4a9c2d7e610
Revises: e3f8a1c4d926
Create Date: 2026-08-02
"""

from alembic import op
import sqlalchemy as sa


revision = "f4a9c2d7e610"
down_revision = "e3f8a1c4d926"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE client_payment_order_number_seq")
    op.add_column(
        "client_payments",
        sa.Column(
            "provider_order_number",
            sa.BigInteger(),
            server_default=sa.text("nextval('client_payment_order_number_seq')"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_client_payments_provider_order_number",
        "client_payments",
        ["provider_order_number"],
        unique=True,
    )

    for name, column_type, default in (
        ("fulfillment_status", sa.String(length=20), "pending"),
        ("fulfillment_attempts", sa.Integer(), "0"),
        ("owner_notification_status", sa.String(length=20), "pending"),
        ("owner_notification_attempts", sa.Integer(), "0"),
    ):
        op.add_column(
            "client_payments",
            sa.Column(name, column_type, server_default=default, nullable=False),
        )

    for name in (
        "fulfillment_next_retry_at",
        "fulfilled_at",
        "owner_notification_next_retry_at",
        "owner_notified_at",
    ):
        op.add_column(
            "client_payments",
            sa.Column(name, sa.DateTime(timezone=True), nullable=True),
        )
    op.add_column(
        "client_payments",
        sa.Column("fulfillment_error", sa.Text(), nullable=True),
    )
    op.add_column(
        "client_payments",
        sa.Column("owner_notification_error", sa.Text(), nullable=True),
    )

    for name in (
        "fulfillment_status",
        "fulfillment_next_retry_at",
        "owner_notification_status",
        "owner_notification_next_retry_at",
    ):
        op.create_index(f"ix_client_payments_{name}", "client_payments", [name])


def downgrade() -> None:
    for name in (
        "owner_notification_next_retry_at",
        "owner_notification_status",
        "fulfillment_next_retry_at",
        "fulfillment_status",
        "provider_order_number",
    ):
        op.drop_index(f"ix_client_payments_{name}", table_name="client_payments")
    for name in (
        "owner_notified_at",
        "owner_notification_error",
        "owner_notification_next_retry_at",
        "owner_notification_attempts",
        "owner_notification_status",
        "fulfilled_at",
        "fulfillment_error",
        "fulfillment_next_retry_at",
        "fulfillment_attempts",
        "fulfillment_status",
        "provider_order_number",
    ):
        op.drop_column("client_payments", name)
    op.execute("DROP SEQUENCE client_payment_order_number_seq")
