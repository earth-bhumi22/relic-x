"""CSV downloads (T21)."""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ...schemas import ScalingRequest
from ...services.exports import ExportService, Table, scaling_table
from ..deps import DB, scaling_rate_limit

router = APIRouter(tags=["exports"])
CSV = {200: {"content": {"text/csv": {}}, "description": "CSV file (UTF-8, header row)"}}


def csv_response(table: Table) -> Response:
    filename, cols, rows = table
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/runs/{run_id}/export.csv", response_class=Response, responses=CSV)
def run_csv(run_id: str, db: Session = DB):
    """One row per placed fragment, with its ground-truth cell and rotation."""
    return csv_response(ExportService(db).run_placements(run_id))


@router.get("/runs/{run_id}/trace.csv", response_class=Response, responses=CSV)
def trace_csv(run_id: str, db: Session = DB):
    """Every recorded solver decision (seed / place / conflict / prune / backtrack …)."""
    return csv_response(ExportService(db).run_trace(run_id))


@router.get("/artifacts/{artifact_id}/benchmark.csv", response_class=Response, responses=CSV)
def benchmark_csv(artifact_id: str, db: Session = DB):
    """Latest run of each algorithm side by side (409 if there are no runs yet)."""
    return csv_response(ExportService(db).benchmark(artifact_id))


@router.post(
    "/benchmark/scaling.csv", response_class=Response, responses=CSV, dependencies=[Depends(scaling_rate_limit)]
)
async def scaling_csv(body: ScalingRequest):
    """Same experiment as POST /benchmark/scaling, one row per (size, algorithm)."""
    return csv_response(await run_in_threadpool(scaling_table, body))
