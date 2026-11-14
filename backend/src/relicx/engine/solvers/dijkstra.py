"""Dijkstra (shortest-path-tree) reconstruction.

Edge cost in the fragment graph:  cost(i, j) = 1 - weight(i, j)  (>= 0, see ``edge_cost``).
(The solver called "best-first" is the separate Prim-style one in ``best_first.py``.)

1. Run Dijkstra from the seed with a binary-heap priority queue. This gives
   each fragment its cheapest path from the seed and a *parent* edge, i.e. a
   shortest-path tree.
2. Place fragments in the order Dijkstra settles them. Each fragment is put
   in the cell its parent join dictates (the parent's side ``a`` faces some
   direction d; the child goes one step in d, rotated so its side ``b`` faces
   back).
3. If that cell is taken or breaks the grid bounds, record a *conflict* and
   fall back to the best free frontier slot for that fragment.

Unlike best-first (Prim), a fragment's parent is the neighbour that minimises the SUM of join costs from the seed,
not the neighbour with the strongest single join. A fragment with one excellent join to a far-away fragment can
therefore be hung on a nearer fragment through a mediocre join, and the error propagates down the tree: a conflicting
child is re-seated by ``_fallback`` and its own children are then placed relative to that *actual* position.

Time: O((V + E) log V) for Dijkstra + O(U * F * R) for the U conflict / unreachable fallbacks.
"""

from __future__ import annotations

import heapq
import time

from ..counters import OpCounter, tick
from ..graph import FragmentGraph
from ..layout import DIRS, Compat, Layout, Placement
from .common import SolverResult, TraceRecorder
from .greedy import pick_seed


def edge_cost(weight: float) -> float:
    """Dijkstra needs costs >= 0. Weights are composite scores in [0, 1] (CONTRACT section 2), so 1 - w >= 0; the
    clamp only guards against a weight above 1 (float noise or a custom matcher) instead of raising mid-request."""
    return max(0.0, 1.0 - weight)


def dijkstra(g: FragmentGraph, source: str, counter: OpCounter | None = None):
    """Classic Dijkstra with a binary heap and lazy deletion. Returns (dist, parent, settle_order).

    ``settle_order[0]`` is always the source (it is the only heap entry at the start). Every parent is settled before
    its child (a parent is recorded only while relaxing from a settled node), so placing in settle order is safe.
    Equal-cost ties: heap entries are ``(dist, id)`` and a not-yet-settled node keeps the smaller-id parent, so the
    result does not depend on the order of the adjacency lists. Costs that differ only by float rounding are not
    treated as ties.
    """
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
            nd = d + edge_cost(e.weight)
            cur = dist.get(v, float("inf"))
            if nd < cur:
                dist[v] = nd
                parent[v] = u
                heapq.heappush(pq, (nd, v))
            elif nd == cur and v not in done and u < (parent[v] or ""):
                parent[v] = u  # exact tie: deterministic, smaller id wins (never re-parent a settled node)
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
    trace.log(
        "seed",
        f"Seed {seed}; Dijkstra settled {len(order)} of {len(ids)} fragments",
        fragment=seed,
        row=0,
        col=0,
        rot=0,
        dist=0.0,
    )
    layout.place(Placement(seed, 0, 0, 0))
    conflicts = 0

    unreachable = [f for f in sorted(ids) if f not in dist]
    for f in order[1:] + unreachable:
        par = parent.get(f)
        placed = False
        intended, rot_ok = None, True
        if par is not None and par in layout.where:
            e = graph.adj[par][f]
            pp = layout.where[par]
            d = (e.side_u + pp.rot) % 4  # direction the parent's joining side faces
            cell = (pp.row + DIRS[d][0], pp.col + DIRS[d][1])
            rot = ((d + 2) - e.side_v) % 4  # turn child so its side faces back
            intended, rot_ok = cell, allow_rotation or rot == 0
            if rot_ok and layout.fits(cell):
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
                    dist=round(dist[f], 4),
                )
        if not placed:
            fb = _fallback(layout, f, compat, rots, counter)
            if fb is None:
                trace.log("stop", f"No free cell for {f}", fragment=f)
                continue
            (score, k), cell, rot = fb
            conflicts += 1 if par is not None else 0
            layout.place(Placement(f, cell[0], cell[1], rot))
            if par is None:
                why, extra = "not reachable in pruned graph", {}
            elif par not in layout.where or intended is None:
                why, extra = "parent was never placed", {"parent": par}
            else:
                why = (
                    "parent cell taken/out of bounds" if rot_ok else "parent join needs a rotation that is not allowed"
                )
                extra = {
                    "parent": par,
                    "intended_row": intended[0],
                    "intended_col": intended[1],
                    "dist": round(dist[f], 4),
                }
            trace.log(
                "conflict",
                f"{f}: {why}; best free slot {cell} (score {score:.3f})",
                fragment=f,
                row=cell[0],
                col=cell[1],
                rot=rot,
                score=round(score, 4),
                **extra,
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
