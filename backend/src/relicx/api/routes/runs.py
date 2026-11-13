"""Reconstruction runs, benchmarks and the scaling experiment."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from starlette.concurrency import run_in_threadpool

from ...schemas import BenchmarkCreate, RunCreate, RunDetail, RunOut, ScalingRequest
from ...services import ReconstructionService, scaling_experiment
from ..deps import reconstruction_service
from ..presenters import run_detail, run_out

router = APIRouter(tags=["reconstruction"])


def _labels(svc: ReconstructionService, artifact_id: str) -> dict[str, str]:
    return {f.id: f.label for f in svc.fragments.list_for(artifact_id)}


@router.post("/artifacts/{artifact_id}/runs", response_model=RunDetail, status_code=status.HTTP_201_CREATED)
def create_run(artifact_id: str, body: RunCreate, svc: ReconstructionService = Depends(reconstruction_service)):
    run = svc.run(artifact_id, body.algorithm, body.model_dump(exclude={"algorithm"}))
    return run_detail(run, _labels(svc, artifact_id))


@router.get("/artifacts/{artifact_id}/runs", response_model=list[RunOut])
def list_runs(artifact_id: str, svc: ReconstructionService = Depends(reconstruction_service)):
    return [run_out(r) for r in svc.list(artifact_id)]


@router.post("/artifacts/{artifact_id}/benchmark", response_model=list[RunDetail])
def benchmark(artifact_id: str, body: BenchmarkCreate, svc: ReconstructionService = Depends(reconstruction_service)):
    runs = svc.benchmark(artifact_id, body.algorithms, body.model_dump(exclude={"algorithms"}))
    labels = _labels(svc, artifact_id)
    return [run_detail(r, labels) for r in runs]


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run(run_id: str, svc: ReconstructionService = Depends(reconstruction_service)):
    run = svc.get(run_id)
    return run_detail(run, _labels(svc, run.artifact_id))


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(run_id: str, svc: ReconstructionService = Depends(reconstruction_service)):
    svc.delete(run_id)
    return Response(status_code=204)


@router.post("/benchmark/scaling")
async def scaling(body: ScalingRequest):
    # CPU-bound and stateless: run off the event loop.
    return await run_in_threadpool(
        scaling_experiment,
        body.sample,
        body.sizes,
        list(body.algorithms),
        rotate=body.rotate,
        noise=body.noise,
        erosion=body.erosion,
        node_limit=body.node_limit,
    )
