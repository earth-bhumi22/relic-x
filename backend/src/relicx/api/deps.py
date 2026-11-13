"""FastAPI dependencies: DB session and service construction per request."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from ..core.config import Settings
from ..db.session import session_scope
from ..services import ArtifactService, LocalStorage, MatchingService, ReconstructionService


def get_db(request: Request) -> Iterator[Session]:
    yield from session_scope(request.app.state.session_factory)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_storage(request: Request) -> LocalStorage:
    return request.app.state.storage


def artifact_service(
    db: Session = Depends(get_db),
    storage: LocalStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> ArtifactService:
    return ArtifactService(db, storage, settings)


def matching_service(db: Session = Depends(get_db), storage: LocalStorage = Depends(get_storage)) -> MatchingService:
    return MatchingService(db, storage)


def reconstruction_service(
    db: Session = Depends(get_db), storage: LocalStorage = Depends(get_storage)
) -> ReconstructionService:
    return ReconstructionService(db, storage)
