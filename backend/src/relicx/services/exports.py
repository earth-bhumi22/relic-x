"""CSV exports (T21): every table in the lab dashboard can be downloaded for the report.

Each builder returns ``(filename, fieldnames, rows)``; the route turns that into
``text/csv``. Column names are snake_case like the JSON API (CONTRACT D10).
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from ..core.errors import PreconditionFailed
from ..engine.solvers import ALGORITHMS
from ..repositories import ArtifactRepository, FragmentRepository, RunRepository
from .reconstruction import scaling_experiment

Table = tuple[str, list[str], list[dict]]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "artifact"


class ExportService:
    def __init__(self, db: Session) -> None:
        self.artifacts = ArtifactRepository(db)
        self.fragments = FragmentRepository(db)
        self.runs = RunRepository(db)

    def run_placements(self, run_id: str) -> Table:
        run = self.runs.get(run_id)
        art = self.artifacts.get(run.artifact_id)
        frags = {f.id: f for f in self.fragments.list_for(art.id)}
        cols = [
            "run_id",
            "algorithm",
            "fragment",
            "row",
            "col",
            "rot_degrees",
            "true_row",
            "true_col",
            "scramble_rot_degrees",
        ]
        rows = []
        for p in sorted(run.placements, key=lambda p: (p.cell_row, p.cell_col)):
            f = frags[p.fragment_id]
            rows.append(
                {
                    "run_id": run.id,
                    "algorithm": run.algorithm,
                    "fragment": f.label,
                    "row": p.cell_row,
                    "col": p.cell_col,
                    "rot_degrees": p.rot * 90,
                    "true_row": f.true_row,
                    "true_col": f.true_col,
                    "scramble_rot_degrees": None if f.scramble_rot is None else f.scramble_rot * 90,
                }
            )
        return f"relicx-{slug(art.name)}-{run.algorithm}-placements.csv", cols, rows

    def run_trace(self, run_id: str) -> Table:
        run = self.runs.get(run_id)
        art = self.artifacts.get(run.artifact_id)
        cols = ["step", "action", "fragment", "row", "col", "rot_degrees", "score", "message"]
        rows = [
            {
                "step": s.step_no,
                "action": s.action,
                "fragment": (s.data or {}).get("fragment"),
                "row": (s.data or {}).get("row"),
                "col": (s.data or {}).get("col"),
                "rot_degrees": None if (s.data or {}).get("rot") is None else s.data["rot"] * 90,
                "score": (s.data or {}).get("score"),
                "message": s.message,
            }
            for s in run.trace
        ]
        return f"relicx-{slug(art.name)}-{run.algorithm}-trace.csv", cols, rows

    def benchmark(self, artifact_id: str) -> Table:
        art = self.artifacts.get(artifact_id)
        latest = {}
        for r in self.runs.list_for(artifact_id):  # newest first
            latest.setdefault(r.algorithm, r)
        if not latest:
            raise PreconditionFailed("no runs yet: run at least one solver (POST /artifacts/{id}/runs or /benchmark)")
        cols = [
            "algorithm",
            "run_id",
            "created_at",
            "elapsed_ms",
            "operations_total",
            "total_score",
            "neighbour_accuracy",
            "direct_accuracy",
            "coverage",
            "truncated",
            "search_nodes",
            "conflicts",
            "node_limit",
            "threshold",
            "top_k",
        ]
        rows = []
        for algo in ALGORITHMS:
            r = latest.get(algo)
            if r is None:
                continue
            meta, params = r.meta or {}, r.params or {}
            rows.append(
                {
                    "algorithm": algo,
                    "run_id": r.id,
                    "created_at": r.created_at.isoformat(),
                    "elapsed_ms": r.elapsed_ms,
                    "operations_total": sum((r.operations or {}).values()),
                    "total_score": r.total_score,
                    "neighbour_accuracy": r.neighbour_accuracy,
                    "direct_accuracy": r.direct_accuracy,
                    "coverage": r.coverage,
                    "truncated": r.truncated,
                    "search_nodes": meta.get("nodes"),
                    "conflicts": meta.get("conflicts"),
                    "node_limit": params.get("node_limit"),
                    "threshold": params.get("threshold"),
                    "top_k": params.get("top_k"),
                }
            )
        return f"relicx-{slug(art.name)}-benchmark.csv", cols, rows


def scaling_table(body) -> Table:
    res = scaling_experiment(
        body.sample,
        body.sizes,
        list(body.algorithms),
        rotate=body.rotate,
        noise=body.noise,
        erosion=body.erosion,
        node_limit=body.node_limit,
    )
    cols = [
        "size",
        "n",
        "algorithm",
        "elapsed_ms",
        "operations",
        "total_score",
        "neighbour_accuracy",
        "direct_accuracy",
        "coverage",
        "truncated",
        "match_accuracy",
        "match_elapsed_ms",
    ]
    rows = []
    for p in res["points"]:
        for algo, run in p["runs"].items():
            rows.append(
                {
                    "size": p["size"],
                    "n": p["n"],
                    "algorithm": algo,
                    "elapsed_ms": run["elapsed_ms"],
                    "operations": run["operations"],
                    "total_score": run["total_score"],
                    "neighbour_accuracy": run["neighbour_accuracy"],
                    "direct_accuracy": run["direct_accuracy"],
                    "coverage": run["coverage"],
                    "truncated": run["truncated"],
                    "match_accuracy": p["match"].get("match_accuracy"),
                    "match_elapsed_ms": p["match"].get("elapsed_ms"),
                }
            )
    rot = "-rotated" if body.rotate else ""
    return f"relicx-scaling-{body.sample}{rot}.csv", cols, rows
