"""Weighted fragment graph G = (V, E) and traversals.

* V : fragments
* E : (i, j) with weight = best composite score over all side pairings
      between i and j (the winning side pair is kept on the edge). Edges
      below ``threshold`` are pruned (an edge equal to the threshold is kept),
      and with ``top_k`` an edge survives only if BOTH endpoints rank it among
      their own k strongest edges ("mutual best buddies").

BFS and DFS both find connected components (candidate artifact groups) in
O(V + E) plus the cost of ordering each node's neighbours by weight
(O(sum deg log deg)); both are exposed so their visit orders can be shown
side by side. Everything is deterministic: ties in weight are broken by
fragment id (then side pair), never by the order of the input.

Complexity (M side matches, V fragments, E surviving edges): see
docs/ALGORITHMS.md section 9.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from .counters import OpCounter, tick
from .matcher import SideMatch


@dataclass
class Edge:
    u: str
    v: str
    weight: float
    side_u: int
    side_v: int


@dataclass
class FragmentGraph:
    nodes: list[str]
    adj: dict[str, dict[str, Edge]] = field(default_factory=dict)

    @property
    def edges(self) -> list[Edge]:
        """Each undirected edge exactly once, oriented ``u < v``, sorted by ``(u, v)``."""
        out = [e for u, nbrs in self.adj.items() for v, e in nbrs.items() if u < v]
        out.sort(key=lambda e: (e.u, e.v))
        return out

    def weight(self, u: str, v: str) -> float:
        e = self.adj.get(u, {}).get(v)
        return e.weight if e else 0.0


def build_graph(
    nodes: list[str],
    matches: list[SideMatch],
    threshold: float = 0.0,
    top_k: int | None = None,
) -> FragmentGraph:
    """Build the pruned graph. ``top_k=None`` means no top-k pruning; otherwise it must be >= 1.

    Time O(M + E log E) (the sort only runs when ``top_k`` is set), space O(V + E).
    """
    if top_k is not None and top_k < 1:
        raise ValueError(f"top_k must be None or >= 1, got {top_k}")
    known = set(nodes)

    # 1. Collapse the side matches to one edge per fragment pair: the best composite, keeping its side pair.
    #    Stored as (u, v) with u < v. Ties on weight prefer the smaller (side_u, side_v), so the result does
    #    not depend on the order of ``matches``.
    best: dict[tuple[str, str], Edge] = {}
    for m in matches:
        if m.a == m.b or m.composite < threshold:
            continue  # a fragment never matches itself; below-threshold edges are pruned (equal is kept)
        if m.a not in known or m.b not in known:
            raise ValueError(f"match {m.a!r}-{m.b!r} refers to a fragment that is not in nodes")
        cand = (
            Edge(m.a, m.b, m.composite, m.side_a, m.side_b)
            if m.a < m.b
            else Edge(m.b, m.a, m.composite, m.side_b, m.side_a)
        )
        cur = best.get((cand.u, cand.v))
        if cur is None or (cand.weight, -cand.side_u, -cand.side_v) > (cur.weight, -cur.side_u, -cur.side_v):
            best[(cand.u, cand.v)] = cand

    # 2. Optional mutual top-k pruning.
    if top_k is not None:
        per_node: dict[str, list[Edge]] = {n: [] for n in nodes}
        for e in best.values():
            per_node[e.u].append(e)
            per_node[e.v].append(e)
        votes: dict[tuple[str, str], int] = {}
        for n, lst in per_node.items():
            # strongest first; equal weights ordered by the neighbour's id
            lst.sort(key=lambda e, n=n: (-e.weight, e.v if e.u == n else e.u))
            for e in lst[:top_k]:
                votes[(e.u, e.v)] = (
                    votes.get((e.u, e.v), 0) + 1
                )  # each edge sits in two lists: at most one vote per endpoint
        allowed = {k for k, c in votes.items() if c == 2}
    else:
        allowed = set(best)

    g = FragmentGraph(nodes=list(nodes), adj={n: {} for n in nodes})
    for (u, v), e in best.items():
        if (u, v) in allowed:
            g.adj[u][v] = e
            g.adj[v][u] = Edge(v, u, e.weight, e.side_v, e.side_u)
    return g


def _neighbours_strongest_first(g: FragmentGraph, u: str) -> list[str]:
    """Neighbours of ``u`` by descending weight; ties by id. O(deg log deg)."""
    nbrs = g.adj[u]
    return sorted(nbrs, key=lambda x: (-nbrs[x].weight, x))


def bfs_components(g: FragmentGraph, counter: OpCounter | None = None) -> tuple[list[list[str]], list[str]]:
    """Components plus the global BFS visit order.

    Start nodes are taken in sorted order; neighbours strongest first. ``edge_visits`` counts every adjacency
    entry scanned (= 2E in total). Time O(V + E + sum deg log deg), queue O(V).
    """
    seen: set[str] = set()
    comps, order = [], []
    for s in sorted(g.nodes):
        if s in seen:
            continue
        comp, q = [], deque([s])
        seen.add(s)
        while q:
            u = q.popleft()
            comp.append(u)
            order.append(u)
            for v in _neighbours_strongest_first(g, u):
                tick(counter, "edge_visits")
                if v not in seen:
                    seen.add(v)
                    q.append(v)
        comps.append(comp)
    return comps, order


def dfs_components(g: FragmentGraph, counter: OpCounter | None = None) -> tuple[list[list[str]], list[str]]:
    """Iterative DFS (explicit stack, no recursion limit). Same conventions as ``bfs_components``.

    Time O(V + E + sum deg log deg); the stack can hold up to O(E) entries (see comment below).
    """
    seen: set[str] = set()
    comps, order = [], []
    for s in sorted(g.nodes):
        if s in seen:
            continue
        comp, stack = [], [s]
        while stack:
            u = stack.pop()
            if u in seen:
                continue
            seen.add(u)
            comp.append(u)
            order.append(u)
            # Push weakest first so the strongest neighbour is popped (explored) next. Nodes are marked seen
            # when POPPED, not pushed, which makes the order identical to recursive DFS; the price is that a
            # node can sit on the stack several times, so the stack holds up to O(E) entries.
            for v in reversed(_neighbours_strongest_first(g, u)):
                tick(counter, "edge_visits")
                if v not in seen:
                    stack.append(v)
        comps.append(comp)
    return comps, order
