"""FastAPI dependencies: DB session and service construction per request."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..db.session import session_scope
from ..services import ArtifactService, JobService, LocalStorage, MatchingService, ReconstructionService


def get_db(request: Request) -> Iterator[Session]:
    yield from session_scope(request.app.state.session_factory)


# scope="function": the session commits (or rolls back) BEFORE the response is
# sent. With the default "request" scope FastAPI sends the response first and
# commits afterwards, so a client that immediately re-reads (e.g. GET right after
# DELETE) could still see the old data. Found while verifying T01 on PostgreSQL.
DB = Depends(get_db, scope="function")


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_storage(request: Request) -> LocalStorage:
    return request.app.state.storage


def artifact_service(
    db: Session = DB,
    storage: LocalStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> ArtifactService:
    return ArtifactService(db, storage, settings)


def matching_service(db: Session = DB, storage: LocalStorage = Depends(get_storage)) -> MatchingService:
    return MatchingService(db, storage)


def reconstruction_service(db: Session = DB, storage: LocalStorage = Depends(get_storage)) -> ReconstructionService:
    return ReconstructionService(db, storage)


def job_service(db: Session = DB, storage: LocalStorage = Depends(get_storage)) -> JobService:
    return JobService(db, storage)


def scaling_rate_limit(request: Request) -> None:
    """T22: token bucket per client for the expensive scaling experiment (429 + Retry-After)."""
    client = request.client.host if request.client else "unknown"
    request.app.state.scaling_limiter.take(client)
