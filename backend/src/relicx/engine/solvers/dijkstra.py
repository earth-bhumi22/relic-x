"""Dijkstra / best-first reconstruction.

Edge cost in the fragment graph:  cost(i, j) = 1 - weight(i, j)  (>= 0).

1. Run Dijkstra from the seed with a binary-heap priority queue. This gives
   each fragment its cheapest path from the seed and a *parent* edge, i.e. a
   shortest-path tree.
2. Place fragments in the order Dijkstra settles them. Each fragment is put
   in the cell its parent join dictates (the parent's side ``a`` faces some
   direction d; the child goes one step in d, rotated so its side ``b`` faces
   back).
3. If that cell is taken or breaks the grid bounds, record a *conflict* and
   fall back to the best free frontier slot for that fragment.

Unlike greedy, placement order is driven by *path* cost from the seed, so a
fragment reachable only through a chain of strong joins is preferred over
one with a single medium join.

Time: O((V + E) log V) for Dijkstra + O(V * F * R) for conflict fallbacks.
"""

from __future__ import annotations

import heapq
import time

from ..counters import OpCounter, tick
from ..graph import FragmentGraph
from ..layout import DIRS, Compat, Layout, Placement
from .common import SolverResult, TraceRecorder
from .greedy import pick_seed


def dijkstra(g: FragmentGraph, source: str, counter: OpCounter | None = None):
    """Classic Dijkstra. Returns (dist, parent, settle_order)."""
    dist = {source: 0.0}
    parent: dict[str, str | None] = {source: None}
    order: list[str] = []
    done: set[str] = set()
    pq = [(0.0, source)]
    while pq:
        d, u = heapq.heappop(pq)
        tick(counter, "heap_pops")
        if u in done:
            continue
        done.add(u)
        order.append(u)
        for v, e in g.adj[u].items():
            tick(counter, "relaxations")
            nd = d + (1.0 - e.weight)
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                parent[v] = u
                heapq.heappush(pq, (nd, v))
    return dist, parent, order


def _fallback(layout: Layout, f: str, compat: Compat, rots, counter):
    best = None
    for cell in layout.frontier():
        for r in rots:
            score, k = layout.placement_score(f, cell, r, compat, counter)
            if best is None or (score, k) > best[0]:
                best = ((score, k), cell, r)
    return best


def solve_dijkstra(
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

    dist, parent, order = dijkstra(graph, seed, counter)
    trace.log("seed", f"Seed {seed}; Dijkstra settled {len(order)} of {len(ids)} fragments", fragment=seed)
    layout.place(Placement(seed, 0, 0, 0))
    conflicts = 0

    unreachable = [f for f in sorted(ids) if f not in dist]
    for f in order[1:] + unreachable:
        par = parent.get(f)
        placed = False
        if par is not None and par in layout.where:
            e = graph.adj[par][f]
            pp = layout.where[par]
            d = (e.side_u + pp.rot) % 4  # direction the parent's joining side faces
            cell = (pp.row + DIRS[d][0], pp.col + DIRS[d][1])
            rot = ((d + 2) - e.side_v) % 4  # turn child so its side faces back
            if (allow_rotation or rot == 0) and layout.fits(cell):
                layout.place(Placement(f, cell[0], cell[1], rot))
                placed = True
                trace.log(
                    "place",
                    f"Place {f} at {cell} via parent {par} (path cost {dist[f]:.3f}, join {e.weight:.3f})",
                    fragment=f,
                    row=cell[0],
                    col=cell[1],
                    rot=rot,
                    parent=par,
                    score=e.weight,
                )
        if not placed:
            fb = _fallback(layout, f, compat, rots, counter)
            if fb is None:
                trace.log("stop", f"No free cell for {f}", fragment=f)
                continue
            (score, k), cell, rot = fb
            conflicts += 1 if par is not None else 0
            layout.place(Placement(f, cell[0], cell[1], rot))
            why = "parent cell taken/out of bounds" if par is not None else "not reachable in pruned graph"
            trace.log(
                "conflict",
                f"{f}: {why}; best free slot {cell} (score {score:.3f})",
                fragment=f,
                row=cell[0],
                col=cell[1],
                rot=rot,
                score=round(score, 4),
            )

    placed_ids = set(layout.where)
    return SolverResult(
        algorithm="dijkstra",
        placements=layout.normalised(),
        total_score=round(layout.total_score(compat), 4),
        elapsed_ms=round((time.perf_counter() - t0) * 1000, 2),
        operations=dict(counter.counts),
        trace=trace.steps,
        trace_dropped=trace.dropped,
        meta={
            "seed": seed,
            "conflicts": conflicts,
            "unreachable": len(unreachable),
            "unplaced": sorted(set(ids) - placed_ids),
        },
    )
