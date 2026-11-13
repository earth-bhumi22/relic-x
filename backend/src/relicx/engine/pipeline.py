"""End-to-end pipeline helpers used by the API, the CLI and validation scripts.

image -> fragments -> features -> matches -> graph -> solver -> metrics
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .counters import OpCounter
from .features import EdgeFeatures, extract_features
from .fragmenter import fragment_image
from .graph import build_graph
from .matcher import MatchConfig, MatchResult, compat_table, match_all
from .metrics import Truth, direct_accuracy, match_accuracy, neighbour_accuracy
from .solvers import SolverResult, solve_backtracking, solve_best_first, solve_dijkstra, solve_greedy


@dataclass
class SolveParams:
    algorithm: str = "greedy"
    threshold: float = 0.0
    top_k: int | None = None  # graph pruning (mutual top-k), graph-based solvers
    node_limit: int = 150_000  # backtracking only
    seed: str | None = None


def run_solver(
    ids: list[str],
    match: MatchResult,
    rows: int,
    cols: int,
    allow_rotation: bool,
    params: SolveParams,
) -> SolverResult:
    compat = compat_table(match.matches)
    if params.algorithm == "greedy":
        return solve_greedy(ids, compat, rows, cols, allow_rotation, seed=params.seed)
    if params.algorithm == "best_first":
        g = build_graph(ids, match.matches, threshold=params.threshold, top_k=params.top_k)
        return solve_best_first(ids, compat, g, rows, cols, allow_rotation, seed=params.seed)
    if params.algorithm == "dijkstra":
        g = build_graph(ids, match.matches, threshold=params.threshold, top_k=params.top_k or 3)
        return solve_dijkstra(ids, compat, g, rows, cols, allow_rotation, seed=params.seed)
    if params.algorithm == "backtracking":
        greedy = solve_greedy(ids, compat, rows, cols, allow_rotation, seed=params.seed)
        res = solve_backtracking(
            ids, compat, rows, cols, allow_rotation, node_limit=params.node_limit, incumbent=greedy.placements
        )
        res.meta["incumbent_score"] = greedy.total_score
        res.meta["improved_on_incumbent"] = res.total_score > greedy.total_score + 1e-9
        return res
    raise ValueError(f"unknown algorithm {params.algorithm!r}")


def evaluate(result: SolverResult, truth: dict[str, Truth]) -> dict:
    placed = {p.fragment for p in result.placements}
    return {
        "neighbour_accuracy": round(neighbour_accuracy(result.placements, truth), 4),
        "direct_accuracy": round(direct_accuracy(result.placements, truth), 4),
        "coverage": round(len(placed & set(truth)) / len(truth), 4) if truth else 1.0,
    }


def synthetic_experiment(
    image: np.ndarray,
    rows: int,
    cols: int,
    algorithms: list[str],
    *,
    rotate: bool = False,
    noise: float = 0.0,
    erosion: float = 0.0,
    missing: int = 0,
    seed: int = 7,
    match_cfg: MatchConfig | None = None,
    node_limit: int = 150_000,
) -> dict:
    """Fully in-memory run: used by the scaling benchmark and validation/."""
    frag = fragment_image(image, rows, cols, rotate=rotate, noise=noise, erosion=erosion, missing=missing, seed=seed)
    cfg = match_cfg or MatchConfig()
    cfg.allow_rotation = rotate
    feats: dict[str, EdgeFeatures] = {}
    truth: dict[str, Truth] = {}
    for k, f in enumerate(frag.fragments):
        fid = f"F{k + 1:02d}"
        feats[fid] = extract_features(f.pixels, cfg.strip_len, cfg.levels, cfg.depth)
        truth[fid] = Truth(f.true_row, f.true_col, f.scramble_rot)
    counter = OpCounter()
    match = match_all(feats, cfg, counter)
    out = {
        "n": len(feats),
        "grid": [rows, cols],
        "match": {**match.stats, "match_accuracy": round(match_accuracy(match.matches, truth, rotate), 4)},
        "runs": {},
    }
    for algo in algorithms:
        res = run_solver(list(feats), match, rows, cols, rotate, SolveParams(algorithm=algo, node_limit=node_limit))
        out["runs"][algo] = {
            "elapsed_ms": res.elapsed_ms,
            "operations": sum(res.operations.values()),
            "total_score": res.total_score,
            "truncated": res.truncated,
            **evaluate(res, truth),
        }
    return out
