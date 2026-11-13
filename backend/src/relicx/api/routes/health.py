from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import text

from ... import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request):
    db_ok = True
    try:
        with request.app.state.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "version": __version__}
