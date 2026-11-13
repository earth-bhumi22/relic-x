"""Migrations must build exactly the schema the ORM models describe."""

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from relicx.db import models  # noqa: F401
from relicx.db.base import Base

ROOT = Path(__file__).resolve().parents[1]


def test_upgrade_downgrade_and_no_drift(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path}/m.db"
    monkeypatch.setenv("RELICX_DATABASE_URL", url)
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    command.upgrade(cfg, "head")
    with create_engine(url).connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == [], diff
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
