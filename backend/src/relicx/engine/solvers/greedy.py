"""Greedy reconstruction (baseline).

1. Seed = fragment with the strongest total best-edge weight.
2. Repeat: over every empty frontier cell, every unplaced fragment and every
   allowed rotation, pick the single placement with the highest score
   (sum of compatibilities with the already-placed neighbours). Commit it.
   Never undo.

Greedy-choice property: each step is locally optimal. It is NOT globally
optimal - one early wrong placement can push others into wrong cells
(that is exactly what the backtracking solver can recover from).

Time: O(n * F * n * R) score evaluations, F = frontier size (<= 4n),
R = rotations (1 or 4)  ->  O(n^3) for a fixed rotation count.
"""

from __future__ import annotations

import time

from ..counters import OpCounter
from ..layout import Compat, Layout, Placement
from .common import SolverResult, TraceRecorder


def pick_seed(ids: list[str], compat: Compat) -> str:
    """Fragment whose four sides have the strongest best matches."""
    best_side: dict[tuple[str, int], float] = {}
    for (i, a, _j, _b), s in compat.items():
        if s > best_side.get((i, a), 0.0):
            best_side[(i, a)] = s
    return max(sorted(ids), key=lambda f: sum(best_side.get((f, s), 0.0) for s in range(4)))


def best_single_placement(layout: Layout, unplaced, compat, rots, counter):
    best = None
    for cell in layout.frontier():
        for f in unplaced:
            for r in rots:
                score, k = layout.placement_score(f, cell, r, compat, counter)
                # tie-break: more neighbours, then deterministic order
                key = (score, k)
                if best is None or key > best[0]:
                    best = (key, f, cell, r)
    return best


def solve_greedy(
    ids: list[str],
    compat: Compat,
    rows: int,
    cols: int,
    allow_rotation: bool = False,
    seed: str | None = None,
    trace_cap: int = 400,
) -> SolverResult:
    t0 = time.perf_counter()
    counter, trace = OpCounter(), TraceRecorder(cap=trace_cap)
    layout = Layout(rows, cols, allow_rotation)
    rots = [0, 1, 2, 3] if allow_rotation else [0]

    seed = seed or pick_seed(ids, compat)
    layout.place(Placement(seed, 0, 0, 0))
    trace.log("seed", f"Seed {seed}: strongest total edge weight", fragment=seed, row=0, col=0, rot=0)
    unplaced = sorted(set(ids) - {seed})

    while unplaced:
        best = best_single_placement(layout, unplaced, compat, rots, counter)
        if best is None:
            trace.log("stop", "No free cell fits the artifact grid; remaining fragments left unplaced")
            break
        (score, k), f, cell, r = best
        layout.place(Placement(f, cell[0], cell[1], r))
        unplaced.remove(f)
        trace.log(
            "place",
            f"Place {f} at {cell} rot {r * 90}° — best local score {score:.3f} from {k} neighbour(s)",
            fragment=f,
            row=cell[0],
            col=cell[1],
            rot=r,
            score=round(score, 4),
        )

    return SolverResult(
        algorithm="greedy",
        placements=layout.normalised(),
        total_score=round(layout.total_score(compat), 4),
        elapsed_ms=round((time.perf_counter() - t0) * 1000, 2),
        operations=dict(counter.counts),
        trace=trace.steps,
        trace_dropped=trace.dropped,
        meta={"seed": seed, "unplaced": unplaced},
    )
