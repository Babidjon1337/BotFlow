"""Add sequence

Revision ID: 00deb6bf7caf
Revises: 5bd5d57cc7e5
Create Date: 2026-08-06 21:13:20.216217

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00deb6bf7caf'
down_revision: Union[str, Sequence[str], None] = '5bd5d57cc7e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(sa.schema.CreateSequence(sa.Sequence("client_payment_order_number_seq")))

def downgrade() -> None:
    """Downgrade schema."""
    op.execute(sa.schema.DropSequence(sa.Sequence("client_payment_order_number_seq")))
