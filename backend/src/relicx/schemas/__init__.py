"""Request / response models (the API contract, see planning/CONTRACT.md).

FastAPI publishes these as OpenAPI; the frontend generates its TypeScript
types from that spec (``npm run gen:types``), so both sides share one source
of truth.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Algorithm = Literal["greedy", "best_first", "dijkstra", "backtracking"]


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict = {}


class ErrorResponse(BaseModel):
    error: ErrorBody


# -- fragmenting ---------------------------------------------------------------------
class FragmentParams(BaseModel):
    rows: int = Field(4, ge=2, le=8)
    cols: int = Field(4, ge=2, le=8)
    rotate: bool = False
    noise: float = Field(4.0, ge=0, le=30, description="Gaussian pixel noise sigma (0-255 scale)")
    erosion: float = Field(0.2, ge=0, le=1, description="Probability that each side is chipped")
    missing: int = Field(0, ge=0, le=6)
    seed: int = Field(7, ge=0, le=1_000_000)


class SampleArtifactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    sample: str = "mosaic-tile"
    description: str | None = Field(None, max_length=2000)
    fragment: FragmentParams = FragmentParams()


class SampleInfo(BaseModel):
    name: str
    description: str
    image_url: str


# -- artifacts / fragments -------------------------------------------------------------
class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    source_kind: str
    grid_rows: int
    grid_cols: int
    tile: int
    has_ground_truth: bool
    fragment_params: dict | None
    match_config: dict | None
    match_stats: dict | None
    created_at: datetime
    fragment_count: int = 0
    run_count: int = 0
    best_accuracy: float | None = None
    image_url: str | None = None


class FragmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    width: int
    height: int
    image_url: str
    true_row: int | None
    true_col: int | None
    scramble_rot: int | None
    edges: dict[str, str] = {}


class FragmentDetail(FragmentOut):
    strips: dict[str, list[list[float]]] = {}


# -- matching -----------------------------------------------------------------------------
class Weights(BaseModel):
    color: float = Field(0.4, ge=0)
    lcs: float = Field(0.2, ge=0)
    edit: float = Field(0.15, ge=0)
    motif: float = Field(0.15, ge=0)
    hash: float = Field(0.1, ge=0)


class MatchParams(BaseModel):
    strip_len: int = Field(24, ge=8, le=96)
    levels: int = Field(4, ge=2, le=4)
    depth: int = Field(2, ge=1, le=6)
    ngram: int = Field(3, ge=2, le=6)
    motif_method: Literal["kmp", "rabin_karp"] = "kmp"
    min_motif: int = Field(3, ge=2, le=12)
    top_k: int = Field(6, ge=1, le=64)
    color_scale: float = Field(40.0, gt=0, le=255)
    weights: Weights = Weights()


class MatchSummary(BaseModel):
    config: dict
    stats: dict


class SideMatchOut(BaseModel):
    a: str
    side_a: int
    b: str
    side_b: int
    color: float
    lcs: float
    edit: float
    motif: float
    hash: float
    composite: float


# -- runs ----------------------------------------------------------------------------------
class RunCreate(BaseModel):
    algorithm: Algorithm
    threshold: float = Field(0.0, ge=0, le=1)
    top_k: int | None = Field(None, ge=1, le=16)
    node_limit: int = Field(150_000, ge=100, le=2_000_000)


class BenchmarkCreate(BaseModel):
    algorithms: list[Algorithm] = ["greedy", "best_first", "dijkstra", "backtracking"]
    threshold: float = Field(0.0, ge=0, le=1)
    top_k: int | None = Field(None, ge=1, le=16)
    node_limit: int = Field(100_000, ge=100, le=2_000_000)


class PlacementOut(BaseModel):
    fragment_id: str
    label: str
    row: int
    col: int
    rot: int


class TraceStepOut(BaseModel):
    step: int
    action: str
    message: str
    data: dict


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    artifact_id: str
    algorithm: str
    params: dict
    elapsed_ms: float
    operations: dict
    total_score: float
    neighbour_accuracy: float | None
    direct_accuracy: float | None
    coverage: float | None
    truncated: bool
    meta: dict
    created_at: datetime


class RunDetail(RunOut):
    placements: list[PlacementOut]
    trace: list[TraceStepOut]
    trace_dropped: dict


class ScalingRequest(BaseModel):
    sample: str = "mosaic-tile"
    sizes: list[int] = Field(default_factory=lambda: [3, 4, 5, 6], min_length=1, max_length=7)
    algorithms: list[Algorithm] = ["greedy", "best_first", "dijkstra", "backtracking"]
    rotate: bool = False
    noise: float = Field(4.0, ge=0, le=30)
    erosion: float = Field(0.2, ge=0, le=1)
    node_limit: int = Field(50_000, ge=100, le=500_000)
