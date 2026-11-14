"""Background solver jobs (T20; CONTRACT §5.1).

    POST /artifacts/{id}/jobs -> 202 {job_id, status: queued, progress: 0.0}
    GET  /jobs/{id}           -> {job_id, status, progress, run_id, error}

Design
- ``JobService`` (request scope) validates and creates the job row. The route
  hands the id to ``JobRunner`` through a FastAPI background task, which runs
  only AFTER the request's session has committed (``Depends(get_db,
  scope="function")``), so the worker thread always finds the row.
- ``JobRunner`` owns a small thread pool. Each job opens its OWN sessions:
  SQLAlchemy sessions must never be shared between threads.
- Progress (backtracking only: nodes / node_limit) is written in short separate
  transactions, at most every ``PROGRESS_INTERVAL_S`` seconds.
- On startup, jobs left queued/running by a previous process are marked failed,
  so a client never polls a job that can no longer finish.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from ..core.errors import InvalidInput, NotFound
from ..db.models import Job
from ..db.session import transaction
from ..engine.solvers import ALGORITHMS
from .matching import MatchingService
from .reconstruction import ReconstructionService
from .storage import LocalStorage

log = logging.getLogger("relicx.jobs")
PROGRESS_INTERVAL_S = 0.25


def _now() -> datetime:
    return datetime.now(UTC)


class JobService:
    def __init__(self, db: Session, storage: LocalStorage) -> None:
        self.db = db
        self.storage = storage

    def create(self, artifact_id: str, algorithm: str, params: dict) -> Job:
        if algorithm not in ALGORITHMS:
            raise InvalidInput(f"algorithm must be one of {ALGORITHMS}")
        matching = MatchingService(self.db, self.storage)
        matching.side_matches(matching.artifacts.get(artifact_id))  # 404 / 409 now, not inside the worker
        job = Job(artifact_id=artifact_id, algorithm=algorithm, params=params)
        self.db.add(job)
        self.db.flush()
        return job

    def get(self, job_id: str) -> Job:
        job = self.db.get(Job, job_id)
        if job is None:
            raise NotFound(f"job {job_id} not found")
        return job


class JobRunner:
    def __init__(self, factory: sessionmaker[Session], storage: LocalStorage, workers: int = 2) -> None:
        self.factory = factory
        self.storage = storage
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="relicx-job")

    def submit(self, job_id: str):
        return self.pool.submit(self._run, job_id)

    def shutdown(self) -> None:
        self.pool.shutdown(wait=False, cancel_futures=True)

    def recover_orphans(self) -> int:
        """Mark jobs that a previous process never finished as failed."""
        with transaction(self.factory) as db:
            res = db.execute(
                update(Job)
                .where(Job.status.in_(("queued", "running")))
                .values(status="failed", error="server restarted before the job finished", finished_at=_now())
            )
            return res.rowcount or 0

    # -- worker thread ---------------------------------------------------------
    def _set(self, job_id: str, **values) -> None:
        with transaction(self.factory) as db:
            db.execute(update(Job).where(Job.id == job_id).values(**values))

    def _run(self, job_id: str) -> None:
        with transaction(self.factory) as db:
            job = db.get(Job, job_id)
            if job is None or job.status != "queued":
                return
            artifact_id, algorithm, params = job.artifact_id, job.algorithm, dict(job.params or {})
        self._set(job_id, status="running", started_at=_now())
        last = [0.0]

        def report(fraction: float) -> None:
            now = time.monotonic()
            if now - last[0] >= PROGRESS_INTERVAL_S:
                last[0] = now
                self._set(job_id, progress=round(max(0.0, min(fraction, 0.99)), 4))

        try:
            with transaction(self.factory) as db:
                run = ReconstructionService(db, self.storage).run(artifact_id, algorithm, params, progress=report)
                run_id = run.id
            self._set(job_id, status="done", progress=1.0, run_id=run_id, finished_at=_now())
        except Exception as exc:  # report every failure to the client, never leave a job "running"
            log.exception("job %s failed", job_id)
            self._set(job_id, status="failed", error=str(exc)[:500] or type(exc).__name__, finished_at=_now())
