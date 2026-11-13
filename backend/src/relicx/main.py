"""Application factory.

    uvicorn relicx.main:app --reload

``create_app(settings)`` builds a fully independent app (own engine, own
storage) so tests can spin up isolated instances.
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .api.routes import artifacts, health, matching, runs
from .core.config import Settings, get_settings
from .core.errors import DomainError
from .core.logging import configure_logging
from .db.base import Base
from .db.session import make_engine, make_session_factory
from .services import LocalStorage

log = logging.getLogger("relicx")


def _error(status: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message, "details": details or {}}}
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="RELIC-X API",
        version=__version__,
        description="Interactive reconstruction of fragmented cultural artifacts — a DSA-first algorithm lab.",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)
    app.state.storage = LocalStorage(settings.storage_dir)
    if settings.auto_create_schema:
        Base.metadata.create_all(app.state.engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Response-Time-ms"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        t0 = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - t0) * 1000
        response.headers["X-Request-ID"] = rid
        response.headers["X-Response-Time-ms"] = f"{ms:.1f}"
        log.info(
            "rid=%s method=%s path=%s status=%s ms=%.1f",
            rid,
            request.method,
            request.url.path,
            response.status_code,
            ms,
        )
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError):
        return _error(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        return _error(422, "validation_error", "request validation failed", {"errors": exc.errors()})

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception):
        log.exception("unhandled error")
        return _error(500, "internal_error", "unexpected server error")

    for module in (health, artifacts, matching, runs):
        app.include_router(module.router, prefix="/api/v1")
    return app


app = create_app()
