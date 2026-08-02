"""Do not redeliver historical payments when fulfillment retries are enabled.

Revision ID: g5b1d8e3f742
Revises: f4a9c2d7e610
Create Date: 2026-08-02
"""

from alembic import op


revision = "g5b1d8e3f742"
down_revision = "f4a9c2d7e610"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE client_payments
        SET fulfillment_status = 'succeeded',
            fulfilled_at = paid_at,
            owner_notification_status = 'succeeded',
            owner_notified_at = paid_at
        WHERE status = 'succeeded'
        """
    )


def downgrade() -> None:
    # Historical delivery cannot be reconstructed safely. Keeping these rows
    # completed prevents duplicate Telegram messages after a downgrade.
    pass
