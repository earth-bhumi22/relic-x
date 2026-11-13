"""Weighted fragment graph G = (V, E) and traversals.

* V : fragments
* E : (i, j) with weight = best composite score over all side pairings
      between i and j. Edges below ``threshold`` are pruned, and each node
      keeps at most ``top_k`` strongest edges (if given).

BFS and DFS both find connected components (candidate artifact groups) in
O(V + E); both are exposed so their visit orders can be shown side by side.
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
        out, seen = [], set()
        for u, nbrs in self.adj.items():
            for v, e in nbrs.items():
                key = (min(u, v), max(u, v))
                if key not in seen:
                    seen.add(key)
                    out.append(e)
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
    best: dict[tuple[str, str], Edge] = {}
    for m in matches:
        key = (m.a, m.b) if m.a < m.b else (m.b, m.a)
        if m.composite < threshold:
            continue
        if key not in best or m.composite > best[key].weight:
            if m.a == key[0]:
                best[key] = Edge(m.a, m.b, m.composite, m.side_a, m.side_b)
            else:
                best[key] = Edge(m.b, m.a, m.composite, m.side_b, m.side_a)

    per_node: dict[str, list[Edge]] = {n: [] for n in nodes}
    for e in best.values():
        per_node[e.u].append(e)
        per_node[e.v].append(e)
    if top_k:
        # Keep an edge only if BOTH endpoints rank it in their top-k
        # ("mutual best buddies"), the usual pruning rule in jigsaw solvers.
        votes: dict[tuple[str, str], int] = {}
        for lst in per_node.values():
            lst.sort(key=lambda e: -e.weight)
            for e in lst[:top_k]:
                votes[(e.u, e.v)] = votes.get((e.u, e.v), 0) + 1
        allowed = {k for k, c in votes.items() if c == 2}
    else:
        allowed = set(best)

    g = FragmentGraph(nodes=list(nodes), adj={n: {} for n in nodes})
    for (u, v), e in best.items():
        if (u, v) in allowed:
            g.adj[u][v] = e
            g.adj[v][u] = Edge(v, u, e.weight, e.side_v, e.side_u)
    return g


def bfs_components(g: FragmentGraph, counter: OpCounter | None = None) -> tuple[list[list[str]], list[str]]:
    """Components plus the global BFS visit order."""
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
            for v in sorted(g.adj[u], key=lambda x: -g.adj[u][x].weight):
                tick(counter, "edge_visits")
                if v not in seen:
                    seen.add(v)
                    q.append(v)
        comps.append(comp)
    return comps, order


def dfs_components(g: FragmentGraph, counter: OpCounter | None = None) -> tuple[list[list[str]], list[str]]:
    """Iterative DFS (explicit stack, no recursion limit)."""
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
            # push weakest first so the strongest neighbour is explored next
            for v in sorted(g.adj[u], key=lambda x: g.adj[u][x].weight):
                tick(counter, "edge_visits")
                if v not in seen:
                    stack.append(v)
        comps.append(comp)
    return comps, order
