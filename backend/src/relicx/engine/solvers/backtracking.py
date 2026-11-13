"""Backtracking with branch-and-bound.

State space: fill the rows x cols cells in row-major order. At each cell
choose (fragment, rotation) or EMPTY (only while more cells than fragments
remain, i.e. for missing pieces). A cell's contribution is its compatibility
with the already-filled LEFT and TOP neighbours, so every adjacency is
counted exactly once.

Search: depth-first. Candidates at each cell are tried best-local-score first,
so the first complete solution is already a greedy-quality incumbent.

Bound (prune a branch when it cannot beat the incumbent):
    current + min( M * remaining_adjacencies ,  sum over unplaced f of v(f) )
where M is the highest compatibility of any join, and v(f) is the best
possible LEFT+TOP contribution fragment f could ever make. Both terms are
valid upper bounds, so their minimum is too.

Worst case: O((n * R)^n) nodes - exponential. ``node_limit`` caps the search;
if it is hit, the best solution so far is returned with ``truncated=True``.
This is the practical limit the dashboard's scaling chart makes visible.
"""

from __future__ import annotations

import sys
import time

from ..counters import OpCounter
from ..layout import Compat, Layout, Placement, side_facing
from .common import SolverResult, TraceRecorder

EMPTY = None


def solve_backtracking(
    ids: list[str],
    compat: Compat,
    rows: int,
    cols: int,
    allow_rotation: bool = False,
    node_limit: int = 150_000,
    trace_cap: int = 400,
    incumbent: list[Placement] | None = None,
) -> SolverResult:
    t0 = time.perf_counter()
    counter, trace = OpCounter(), TraceRecorder(cap=trace_cap)
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    n_cells, n = len(cells), len(ids)
    if n > n_cells:
        raise ValueError(f"{n} fragments do not fit a {rows}x{cols} grid")
    rots = [0, 1, 2, 3] if allow_rotation else [0]
    ids = sorted(ids)

    def c(f, s, g, t):
        return compat.get((f, s, g, t), 0.0)

    # Best possible score for each (fragment, side) -> used by the bound.
    best_side: dict[tuple[str, int], float] = {}
    for (f, s, _g, _t), v in compat.items():
        if v > best_side.get((f, s), 0.0):
            best_side[(f, s)] = v
    M = max(compat.values(), default=0.0)
    v_best = {
        f: max(best_side.get((f, side_facing(3, r)), 0.0) + best_side.get((f, side_facing(0, r)), 0.0) for r in rots)
        for f in ids
    }
    # number of LEFT/TOP adjacencies from cell k to the end
    adj_after = [0] * (n_cells + 1)
    for k in range(n_cells - 1, -1, -1):
        r, col = cells[k]
        adj_after[k] = adj_after[k + 1] + (1 if col > 0 else 0) + (1 if r > 0 else 0)

    grid: list[tuple[str, int] | None] = [EMPTY] * n_cells
    used: set[str] = set()
    state = {"best": -1.0, "best_grid": None, "nodes": 0, "truncated": False, "pruned": 0}

    def local(k: int, f: str, r: int) -> float:
        row, col = cells[k]
        s = 0.0
        if col > 0 and grid[k - 1] is not EMPTY:
            g, gr = grid[k - 1]
            s += c(f, side_facing(3, r), g, side_facing(1, gr))  # my W  <-> its E
        if row > 0 and grid[k - cols] is not EMPTY:
            g, gr = grid[k - cols]
            s += c(f, side_facing(0, r), g, side_facing(2, gr))  # my N <-> its S
        counter.add("score_lookups", 2)
        return s

    def dfs(k: int, score: float, empties_left: int) -> None:
        if state["truncated"]:
            return
        state["nodes"] += 1
        counter.add("search_nodes")
        if state["nodes"] > node_limit:
            state["truncated"] = True
            trace.log("limit", f"Node limit {node_limit} reached — returning best solution found")
            return
        if k == n_cells:
            if score > state["best"]:
                state["best"] = score
                state["best_grid"] = list(grid)
                trace.log("best", f"New best complete arrangement, score {score:.3f}", score=round(score, 4))
            return
        remaining = n - len(used)
        bound_adj = M * adj_after[k]
        bound_frag = sum(v_best[f] for f in ids if f not in used)
        if score + min(bound_adj, bound_frag) <= state["best"]:
            state["pruned"] += 1
            trace.log(
                "prune",
                f"Prune at cell {cells[k]}: bound cannot beat {state['best']:.3f}",
                row=cells[k][0],
                col=cells[k][1],
            )
            return
        options = [(local(k, f, r), f, r) for f in ids if f not in used for r in rots]
        options.sort(key=lambda t: (-t[0], t[1], t[2]))
        for s, f, r in options:
            grid[k] = (f, r)
            used.add(f)
            trace.log(
                "place",
                f"Try {f} at {cells[k]} rot {r * 90}° (+{s:.3f})",
                fragment=f,
                row=cells[k][0],
                col=cells[k][1],
                rot=r,
                score=round(s, 4),
            )
            dfs(k + 1, score + s, empties_left)
            used.discard(f)
            grid[k] = EMPTY
            if state["truncated"]:
                return
            trace.log("backtrack", f"Undo {f} at {cells[k]}", fragment=f, row=cells[k][0], col=cells[k][1])
        if empties_left > 0 and remaining < n_cells - k:
            trace.log("place", f"Leave cell {cells[k]} empty (missing fragment)", row=cells[k][0], col=cells[k][1])
            dfs(k + 1, score, empties_left - 1)

    # Seed the bound with a heuristic solution (e.g. greedy). Branch-and-bound
    # only explores branches that could BEAT it, so a good incumbent prunes
    # most of the tree. If the search never improves, the incumbent is returned.
    if incumbent:
        grid_inc = _incumbent_grid(incumbent, rows, cols)
        if grid_inc is not None:
            inc_layout = Layout(rows, cols, allow_rotation)
            for k, slot in enumerate(grid_inc):
                if slot is not EMPTY:
                    inc_layout.place(Placement(slot[0], cells[k][0], cells[k][1], slot[1]))
            state["best"] = inc_layout.total_score(compat)
            state["best_grid"] = grid_inc
            trace.log(
                "incumbent", f"Start from heuristic solution, score {state['best']:.3f}", score=round(state["best"], 4)
            )

    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, n_cells * 4 + 100))
    try:
        dfs(0, 0.0, n_cells - n)
    finally:
        sys.setrecursionlimit(old_limit)

    layout = Layout(rows, cols, allow_rotation)
    for k, slot in enumerate(state["best_grid"] or []):
        if slot is not EMPTY:
            layout.place(Placement(slot[0], cells[k][0], cells[k][1], slot[1]))

    return SolverResult(
        algorithm="backtracking",
        placements=layout.normalised(),
        total_score=round(layout.total_score(compat), 4),
        elapsed_ms=round((time.perf_counter() - t0) * 1000, 2),
        operations=dict(counter.counts),
        trace=trace.steps,
        trace_dropped=trace.dropped,
        truncated=state["truncated"],
        meta={"nodes": state["nodes"], "pruned": state["pruned"], "node_limit": node_limit},
    )


def _incumbent_grid(placements: list[Placement], rows: int, cols: int):
    """Map a heuristic layout into the rows x cols grid (row-major), if it fits."""
    if not placements:
        return None
    if max(p.row for p in placements) >= rows or max(p.col for p in placements) >= cols:
        return None  # e.g. a transposed layout; skip rather than distort it
    grid: list[tuple[str, int] | None] = [EMPTY] * (rows * cols)
    for p in placements:
        grid[p.row * cols + p.col] = (p.fragment, p.rot)
    return grid
