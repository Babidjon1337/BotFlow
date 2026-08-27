"""Add the nullable R2 bot scenario and lifecycle contract.

Revision ID: f3a1c9d2e8b4
Revises: e7c5d1b914f2
Create Date: 2026-08-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f3a1c9d2e8b4"
down_revision: Union[str, Sequence[str], None] = "e7c5d1b914f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add compatible fields and backfill them without touching legacy data."""
    op.add_column("bots", sa.Column("scenario_type", sa.String(length=32), nullable=True))
    op.add_column(
        "bots", sa.Column("scenario_payload_version", sa.Integer(), nullable=True)
    )
    op.add_column("bots", sa.Column("lifecycle_status", sa.String(length=20), nullable=True))
    op.add_column("bots", sa.Column("pause_reason", sa.String(length=32), nullable=True))
    op.create_index(op.f("ix_bots_lifecycle_status"), "bots", ["lifecycle_status"], unique=False)
    op.create_check_constraint(
        "ck_bots_scenario_type",
        "bots",
        "scenario_type IS NULL OR scenario_type IN ('sales_funnel')",
    )
    op.create_check_constraint(
        "ck_bots_scenario_payload_version",
        "bots",
        "scenario_payload_version IS NULL OR scenario_payload_version > 0",
    )
    op.create_check_constraint(
        "ck_bots_lifecycle_status",
        "bots",
        "lifecycle_status IS NULL OR lifecycle_status IN "
        "('draft', 'ready', 'published', 'paused', 'archived')",
    )

    # COALESCE makes the backfill safe to re-run.  Legacy status, funnel schema,
    # secrets, payment settings, and webhooks stay untouched.
    op.execute(
        sa.text(
            """
            UPDATE bots
            SET
                scenario_type = COALESCE(scenario_type, 'sales_funnel'),
                scenario_payload_version = COALESCE(
                    scenario_payload_version,
                    CASE
                        WHEN jsonb_typeof(funnel_schema -> 'version') = 'number'
                            AND (funnel_schema ->> 'version') ~ '^[0-9]+$'
                        THEN GREATEST((funnel_schema ->> 'version')::integer, 1)
                        ELSE 1
                    END
                ),
                lifecycle_status = COALESCE(
                    lifecycle_status,
                    CASE
                        WHEN status = 'archived' THEN 'archived'
                        WHEN status = 'active' THEN 'published'
                        WHEN status = 'draft' AND funnel_complete THEN 'ready'
                        ELSE 'draft'
                    END
                )
            WHERE scenario_type IS NULL
                OR scenario_payload_version IS NULL
                OR lifecycle_status IS NULL
            """
        )
    )


def downgrade() -> None:
    """Remove only the additive R2 contract fields."""
    op.drop_constraint("ck_bots_lifecycle_status", "bots", type_="check")
    op.drop_constraint("ck_bots_scenario_payload_version", "bots", type_="check")
    op.drop_constraint("ck_bots_scenario_type", "bots", type_="check")
    op.drop_index(op.f("ix_bots_lifecycle_status"), table_name="bots")
    op.drop_column("bots", "pause_reason")
    op.drop_column("bots", "lifecycle_status")
    op.drop_column("bots", "scenario_payload_version")
    op.drop_column("bots", "scenario_type")
