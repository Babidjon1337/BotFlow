"""Merge existing billing and funnel migration heads."""

from typing import Sequence, Union


revision: str = "0401e7b04d40"
down_revision: Union[str, Sequence[str], None] = ("b91a0df6b3a8", "7c526f9b5e18")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
