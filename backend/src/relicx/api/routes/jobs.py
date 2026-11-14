"""Background solver jobs (T20; CONTRACT §5.1)."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status

from ...schemas import JobCreated, JobOut, RunCreate
from ...services import JobService
from ..deps import job_service

router = APIRouter(tags=["jobs"])


@router.post("/artifacts/{artifact_id}/jobs", response_model=JobCreated, status_code=status.HTTP_202_ACCEPTED)
def create_job(
    artifact_id: str,
    body: RunCreate,
    request: Request,
    background: BackgroundTasks,
    svc: JobService = Depends(job_service),
):
    job = svc.create(artifact_id, body.algorithm, body.model_dump(exclude={"algorithm"}))
    # Background tasks run after the response, i.e. after the job row is committed.
    background.add_task(request.app.state.jobs.submit, job.id)
    return JobCreated(job_id=job.id, status="queued", progress=0.0)


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, svc: JobService = Depends(job_service)):
    job = svc.get(job_id)
    return JobOut(job_id=job.id, status=job.status, progress=job.progress, run_id=job.run_id, error=job.error)
