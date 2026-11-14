"""Running solvers, persisting runs, benchmarking and scaling experiments."""

from __future__ import annotations

from sqlalchemy.orm import Session

from .. import samples as sample_lib
from ..core.errors import InvalidInput
from ..db.models import ReconstructionRun, RunPlacement, TraceStep
from ..engine import MatchConfig, MatchResult, SolveParams, evaluate, run_solver, synthetic_experiment
from ..engine.solvers import ALGORITHMS
from ..repositories import ArtifactRepository, FragmentRepository, RunRepository
from .matching import MatchingService, truth_of
from .storage import LocalStorage

SCALING_MAX_CELLS = 64


class ReconstructionService:
    def __init__(self, db: Session, storage: LocalStorage) -> None:
        self.db = db
        self.artifacts = ArtifactRepository(db)
        self.fragments = FragmentRepository(db)
        self.runs = RunRepository(db)
        self.matching = MatchingService(db, storage)

    def run(self, artifact_id: str, algorithm: str, params: dict, progress=None) -> ReconstructionRun:
        if algorithm not in ALGORITHMS:
            raise InvalidInput(f"algorithm must be one of {ALGORITHMS}")
        art = self.artifacts.get(artifact_id)
        labels, matches = self.matching.side_matches(art)
        frags = self.fragments.list_for(artifact_id)
        id_of = {f.label: f.id for f in frags}
        cfg = MatchConfig.from_dict(art.match_config)
        sp = SolveParams(
            algorithm=algorithm,
            threshold=float(params.get("threshold", 0.0)),
            top_k=params.get("top_k"),
            node_limit=int(params.get("node_limit", 150_000)),
        )
        res = run_solver(
            labels, MatchResult(matches, {}), art.grid_rows, art.grid_cols, cfg.allow_rotation, sp, progress=progress
        )
        truth = truth_of(frags)
        metrics = evaluate(res, truth) if truth else {"coverage": round(len(res.placements) / len(labels), 4)}
        run = ReconstructionRun(
            artifact_id=art.id,
            algorithm=algorithm,
            params={k: v for k, v in sp.__dict__.items() if k != "algorithm"},
            elapsed_ms=res.elapsed_ms,
            operations=res.operations,
            total_score=res.total_score,
            neighbour_accuracy=metrics.get("neighbour_accuracy"),
            direct_accuracy=metrics.get("direct_accuracy"),
            coverage=metrics.get("coverage"),
            truncated=res.truncated,
            meta=res.meta,
            trace_dropped=res.trace_dropped,
        )
        placements = [
            RunPlacement(fragment_id=id_of[p.fragment], cell_row=p.row, cell_col=p.col, rot=p.rot)
            for p in res.placements
        ]
        steps = [
            TraceStep(
                step_no=s["step"],
                action=s["action"],
                message=s["message"],
                data={k: v for k, v in s.items() if k not in {"step", "action", "message"}},
            )
            for s in res.trace
        ]
        return self.runs.add(run, placements, steps)

    def benchmark(self, artifact_id: str, algorithms: list[str], params: dict) -> list[ReconstructionRun]:
        return [self.run(artifact_id, a, params) for a in algorithms]

    def get(self, run_id: str) -> ReconstructionRun:
        return self.runs.get(run_id)

    def list(self, artifact_id: str) -> list[ReconstructionRun]:
        self.artifacts.get(artifact_id)
        return self.runs.list_for(artifact_id)

    def delete(self, run_id: str) -> None:
        self.runs.delete(self.runs.get(run_id))


def scaling_experiment(
    sample: str,
    sizes: list[int],
    algorithms: list[str],
    *,
    rotate: bool = False,
    noise: float = 4.0,
    erosion: float = 0.2,
    node_limit: int = 50_000,
    seed: int = 7,
) -> dict:
    """In-memory experiment: same artifact, growing n, every algorithm.

    Nothing is persisted; this produces the time-vs-n complexity chart.
    """
    if sample not in sample_lib.SAMPLES:
        raise InvalidInput(f"unknown sample {sample!r}")
    bad = [a for a in algorithms if a not in ALGORITHMS]
    if bad:
        raise InvalidInput(f"unknown algorithms {bad}")
    if any(s < 2 or s * s > SCALING_MAX_CELLS for s in sizes):
        raise InvalidInput(f"sizes must be in 2..{int(SCALING_MAX_CELLS ** 0.5)}")
    image = sample_lib.sample_array(sample)
    points = []
    for s in sorted(set(sizes)):
        out = synthetic_experiment(
            image, s, s, algorithms, rotate=rotate, noise=noise, erosion=erosion, seed=seed, node_limit=node_limit
        )
        points.append({"size": s, "n": out["n"], "match": out["match"], "runs": out["runs"]})
    return {"sample": sample, "rotate": rotate, "points": points}
