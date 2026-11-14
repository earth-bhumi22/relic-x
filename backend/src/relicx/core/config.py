"""Runtime configuration, read once from environment variables.

Every setting has a safe development default so ``uvicorn relicx.main:app``
works with no setup (SQLite + local file storage). Production overrides
these through ``.env`` / docker-compose.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    return default if raw is None else raw.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    env: str = field(default_factory=lambda: os.getenv("RELICX_ENV", "development"))
    database_url: str = field(default_factory=lambda: os.getenv("RELICX_DATABASE_URL", "sqlite:///./relicx.db"))
    storage_dir: str = field(default_factory=lambda: os.getenv("RELICX_STORAGE_DIR", "./storage"))
    cors_origins: list[str] = field(
        default_factory=lambda: _list("RELICX_CORS_ORIGINS", "http://localhost:5173,http://localhost:8080")
    )
    # Dev convenience: create tables on startup. Production runs Alembic instead.
    auto_create_schema: bool = field(default_factory=lambda: _bool("RELICX_AUTO_CREATE_SCHEMA", True))
    max_upload_mb: int = field(default_factory=lambda: int(os.getenv("RELICX_MAX_UPLOAD_MB", "15")))
    max_fragments: int = field(default_factory=lambda: int(os.getenv("RELICX_MAX_FRAGMENTS", "64")))
    log_level: str = field(default_factory=lambda: os.getenv("RELICX_LOG_LEVEL", "INFO"))
    job_workers: int = field(default_factory=lambda: int(os.getenv("RELICX_JOB_WORKERS", "2")))
    # T22: optional shared key for write requests (unset = no key needed, the dev default).
    api_key: str | None = field(default_factory=lambda: os.getenv("RELICX_API_KEY") or None)
    # T22: max calls per client per minute to the expensive scaling experiment.
    scaling_rate_per_min: int = field(default_factory=lambda: int(os.getenv("RELICX_SCALING_RATE_PER_MIN", "10")))

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
