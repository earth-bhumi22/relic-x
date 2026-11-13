"""Matching, similarity graph and the "Why matched?" explanation."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from ...engine import MatchConfig
from ...schemas import MatchParams, MatchSummary, SideMatchOut
from ...services import MatchingService
from ..deps import matching_service

router = APIRouter(tags=["matching"])


@router.post("/artifacts/{artifact_id}/match", response_model=MatchSummary)
def compute_matches(
    artifact_id: str, body: MatchParams | None = None, svc: MatchingService = Depends(matching_service)
):
    body = body or MatchParams()
    cfg = MatchConfig.from_dict({**body.model_dump(exclude={"weights"}), "weights": body.weights.model_dump()})
    stats = svc.compute(artifact_id, cfg)
    return MatchSummary(config=cfg.to_dict(), stats=stats)


@router.get("/artifacts/{artifact_id}/matches", response_model=list[SideMatchOut])
def list_matches(
    artifact_id: str,
    min_score: float = Query(0.0, ge=0, le=1),
    limit: int = Query(200, ge=1, le=5000),
    svc: MatchingService = Depends(matching_service),
):
    return svc.list_matches(artifact_id, min_score, limit)


@router.get("/artifacts/{artifact_id}/graph")
def similarity_graph(
    artifact_id: str,
    threshold: float = Query(0.0, ge=0, le=1),
    top_k: int | None = Query(None, ge=1, le=16),
    traversal: Literal["bfs", "dfs"] = "bfs",
    svc: MatchingService = Depends(matching_service),
):
    return svc.graph(artifact_id, threshold, top_k, traversal)


@router.get("/artifacts/{artifact_id}/explain")
def explain_pair(
    artifact_id: str,
    a: str,
    side_a: int = Query(..., ge=0, le=3),
    b: str = Query(...),
    side_b: int = Query(..., ge=0, le=3),
    svc: MatchingService = Depends(matching_service),
):
    return svc.explain(artifact_id, a, side_a, b, side_b)
