"""Contracts for the first additive R2 bot lifecycle migration."""

import importlib.util
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database.models import BotConfig


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "database"
    / "migrations"
    / "versions"
    / "f3a1c9d2e8b4_add_bot_lifecycle_contract.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("bot_lifecycle_migration", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_bot_model_has_only_additive_nullable_r2_contract_fields():
    columns = BotConfig.__table__.columns

    assert columns["scenario_type"].nullable is True
    assert columns["scenario_payload_version"].nullable is True
    assert columns["lifecycle_status"].nullable is True
    assert columns["pause_reason"].nullable is True
    assert "status" in columns
    assert "funnel_schema" in columns


def test_lifecycle_migration_backfill_only_populates_new_columns(monkeypatch):
    migration = _migration_module()
    calls = []

    class Operations:
        def f(self, name):
            return name

        def add_column(self, table, column):
            calls.append(("add_column", table, column.name, column.nullable))

        def create_index(self, name, table, columns, unique=False):
            calls.append(("create_index", name, table, tuple(columns), unique))

        def create_check_constraint(self, name, table, condition):
            calls.append(("create_check_constraint", name, table, str(condition)))

        def execute(self, statement):
            calls.append(("execute", str(statement)))

    monkeypatch.setattr(migration, "op", Operations())
    migration.upgrade()

    added = {call[2] for call in calls if call[0] == "add_column"}
    assert added == {
        "scenario_type",
        "scenario_payload_version",
        "lifecycle_status",
        "pause_reason",
    }
    backfill = next(call[1] for call in calls if call[0] == "execute")
    assert "UPDATE bots" in backfill
    assert "scenario_type" in backfill
    assert "lifecycle_status" in backfill
    assert "SET status" not in backfill
    assert "SET funnel_schema" not in backfill
