"""Access links v2: activation limits, link lifetime and one-bot-free kind."""
from alembic import op
import sqlalchemy as sa

revision = "d2f6a9c4e7b1"
down_revision = "c1d8e5f7a2b9"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "access_links",
        sa.Column("max_activations", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "access_links",
        sa.Column("activations_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "access_links",
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
    )
    # Уже использованные одноразовые ссылки помечаем как активированные один раз,
    # чтобы счётчик отражал реальность до появления таблицы активаций.
    op.execute(
        "UPDATE access_links SET activations_count = 1 WHERE activated_by IS NOT NULL"
    )
    op.create_table(
        "access_link_activations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "link_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("access_links.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False, index=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("link_id", "telegram_id", name="uq_access_link_activation"),
    )

def downgrade():
    op.drop_table("access_link_activations")
    op.drop_column("access_links", "valid_until")
    op.drop_column("access_links", "activations_count")
    op.drop_column("access_links", "max_activations")
