"""Best-first reconstruction (Prim-style maximum spanning tree growth).

Dijkstra ranks a fragment by the SUM of costs along its path from the seed.
Best-first ranks it by the strength of the SINGLE join that would attach it
to the already-assembled piece - exactly Prim's algorithm on the weighted
fragment graph, with a max-heap priority queue.

    heap <- all edges from the seed
    while heap not empty:
        pop strongest edge (placed u -> unplaced v)
        if v already placed            : skip   (lazy deletion)
        if v's target cell is invalid  : record conflict, skip
        else place v, push v's edges

A conflicting join is dropped for good (it is never retried, because the cell it wants only gets more crowded as
the layout grows; the fragment may still be attached by another, weaker join). Fragments never attached (pruned
edges / all joins conflicted) are placed at the end in their best free slot. Only graph edges are used, so
threshold / top-k pruning changes this solver's result; greedy reads the full compat table and ignores the graph.

Time: O(E log E) heap work + O(V * F * R) fallbacks.
"""

from __future__ import annotations

import heapq
import time

from ..counters import OpCounter, tick
from ..graph import FragmentGraph
from ..layout import DIRS, Compat, Layout, Placement
from .common import SolverResult, TraceRecorder
from .dijkstra import _fallback
from .greedy import pick_seed


def solve_best_first(
    ids: list[str],
    compat: Compat,
    graph: FragmentGraph,
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
    trace.log("seed", f"Seed {seed}", fragment=seed, row=0, col=0, rot=0)

    heap: list[tuple[float, str, str]] = []

    def push_edges(u: str) -> None:
        for v, e in graph.adj[u].items():
            if v not in layout.where:
                tick(counter, "heap_pushes")
                heapq.heappush(heap, (-e.weight, u, v))

    push_edges(seed)
    conflicts = 0
    while heap:
        negw, u, v = heapq.heappop(heap)
        tick(counter, "heap_pops")
        if v in layout.where:
            continue
        e = graph.adj[u][v]
        pu = layout.where[u]
        d = (e.side_u + pu.rot) % 4
        cell = (pu.row + DIRS[d][0], pu.col + DIRS[d][1])
        rot = ((d + 2) - e.side_v) % 4
        if not (allow_rotation or rot == 0) or not layout.fits(cell):
            conflicts += 1
            trace.log(
                "conflict",
                f"Join {u}->{v} ({-negw:.3f}) wants {cell}: occupied, out of bounds or needs rotation; skip",
                fragment=v,
                row=cell[0],
                col=cell[1],
                rot=rot,
                parent=u,
                score=round(-negw, 4),
            )
            continue
        layout.place(Placement(v, cell[0], cell[1], rot))
        trace.log(
            "place",
            f"Place {v} at {cell} via strongest open join {u}->{v} ({-negw:.3f})",
            fragment=v,
            row=cell[0],
            col=cell[1],
            rot=rot,
            parent=u,
            score=round(-negw, 4),
        )
        push_edges(v)

    for f in sorted(set(ids) - set(layout.where)):
        fb = _fallback(layout, f, compat, rots, counter)
        if fb is None:
            trace.log("stop", f"No free cell for {f}", fragment=f)
            continue
        (score, _k), cell, rot = fb
        layout.place(Placement(f, cell[0], cell[1], rot))
        trace.log(
            "fallback",
            f"{f} not attached by any join; best free slot {cell} ({score:.3f})",
            fragment=f,
            row=cell[0],
            col=cell[1],
            rot=rot,
            score=round(score, 4),
        )

    return SolverResult(
        algorithm="best_first",
        placements=layout.normalised(),
        total_score=round(layout.total_score(compat), 4),
        elapsed_ms=round((time.perf_counter() - t0) * 1000, 2),
        operations=dict(counter.counts),
        trace=trace.steps,
        trace_dropped=trace.dropped,
        meta={"seed": seed, "conflicts": conflicts, "unplaced": sorted(set(ids) - set(layout.where))},
    )
