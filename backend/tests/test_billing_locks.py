"""Regression tests for PostgreSQL-safe billing row locks."""

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from database.models import SaasPayment, User


def _postgresql_sql(statement) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))


def test_saas_payment_lock_does_not_join_nullable_user_relation():
    statement = (
        select(SaasPayment)
        .where(SaasPayment.yookassa_payment_id == "provider-id")
        .with_for_update(of=SaasPayment)
    )

    sql = _postgresql_sql(statement)

    assert " JOIN " not in sql.upper()
    assert "FOR UPDATE OF saas_payments" in sql


def test_user_entitlement_is_locked_separately():
    statement = select(User).where(User.id == 7).with_for_update(of=User)

    sql = _postgresql_sql(statement)

    assert "FOR UPDATE OF users" in sql
