"""T16: ownership tests for Dijkstra and the shortest-path-tree solver.

Hypothesis is not a dev dependency, so the property tests are seeded random loops. Oracles (Bellman-Ford, score
recomputation, brute force) are written here, independent of the solver code.
"""

import importlib
import itertools
import math
import random

import pytest

from relicx.engine import build_graph
from relicx.engine.layout import DIRS
from relicx.engine.matcher import SideMatch
from relicx.engine.solvers import best_first as best_first_module
from relicx.engine.solvers import solve_backtracking, solve_best_first, solve_dijkstra
from relicx.engine.solvers.dijkstra import dijkstra, edge_cost


# ---- helpers -----------------------------------------------------------------------------------------------
def sm(a, b, w, sa=1, sb=3):
    return SideMatch(a, sa, b, sb, w, w, w, w, w, w)


def graph(nodes, edges, **kw):
    """edges: (a, b, weight) triples."""
    return build_graph(nodes, [sm(a, b, w) for a, b, w in edges], **kw)


def table(horizontal=(), vertical=()):
    c = {}
    for a, b, w in horizontal:
        c[(a, 1, b, 3)] = c[(b, 3, a, 1)] = w
    for a, b, w in vertical:
        c[(a, 2, b, 0)] = c[(b, 0, a, 2)] = w
    return c


def graph_of(ids, compat, **kw):
    ms = [SideMatch(a, sa, b, sb, w, w, w, w, w, w) for (a, sa, b, sb), w in compat.items() if a < b]
    return build_graph(ids, ms, **kw)


def random_graph(rng, n=8, density=0.3, quantised=False):
    nodes = [f"N{i}" for i in range(n)]
    edges = []
    for a, b in itertools.combinations(nodes, 2):
        if rng.random() < density:
            edges.append((a, b, rng.choice([0.0, 0.25, 0.5, 0.75, 1.0]) if quantised else rng.random()))
    return nodes, graph(nodes, edges)


def random_compat(ids, rng, density=0.3):
    c = {}
    for a, b in itertools.combinations(ids, 2):
        for sa in range(4):
            for sb in range(4):
                if rng.random() < density:
                    c[(a, sa, b, sb)] = c[(b, sb, a, sa)] = rng.random()
    return c


def bellman_ford(g, source):
    dist = {n: math.inf for n in g.nodes}
    dist[source] = 0.0
    for _ in range(len(g.nodes)):
        changed = False
        for u in g.nodes:
            for v, e in g.adj[u].items():
                if dist[u] + (1.0 - e.weight) < dist[v] - 1e-12:
                    dist[v] = dist[u] + (1.0 - e.weight)
                    changed = True
        if not changed:
            break
    return {n: d for n, d in dist.items() if d < math.inf}


def recompute(placements, compat):
    cells = {(p.row, p.col): p for p in placements}
    total = 0.0
    for (r, c), p in cells.items():
        for d in (1, 2):
            q = cells.get((r + DIRS[d][0], c + DIRS[d][1]))
            if q:
                total += compat.get((p.fragment, (d - p.rot) % 4, q.fragment, ((d + 2) - q.rot) % 4), 0.0)
    return total


def grid_opt(ids, rows, cols, compat):
    """Best total over every injective assignment of fragments to the rows x cols cells (no rotation)."""
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    best = 0.0
    for chosen in itertools.permutations(cells, len(ids)):
        at = dict(zip(chosen, ids, strict=True))
        t = 0.0
        for (r, c), f in at.items():
            if (r, c + 1) in at:
                t += compat.get((f, 1, at[(r, c + 1)], 3), 0.0)
            if (r + 1, c) in at:
                t += compat.get((f, 2, at[(r + 1, c)], 0), 0.0)
        best = max(best, t)
    return best


# ---- dijkstra(): textbook cases ------------------------------------------------------------------------------
def test_single_node():
    dist, parent, order = dijkstra(graph(["A"], []), "A")
    assert dist == {"A": 0.0} and parent == {"A": None} and order == ["A"]


def test_path():
    g = graph(list("ABCD"), [("A", "B", 0.9), ("B", "C", 0.8), ("C", "D", 0.5)])
    dist, parent, order = dijkstra(g, "A")
    assert order == list("ABCD")
    assert dist["D"] == pytest.approx(0.1 + 0.2 + 0.5)
    assert parent == {"A": None, "B": "A", "C": "B", "D": "C"}


def test_diamond_shortest_route_is_not_the_fewest_hops():
    # direct A-D is one hop (cost 0.8) but A-B-D costs 0.1 + 0.1
    g = graph(list("ABCD"), [("A", "D", 0.2), ("A", "B", 0.9), ("B", "D", 0.9), ("A", "C", 0.5), ("C", "D", 0.5)])
    dist, parent, order = dijkstra(g, "A")
    assert dist["D"] == pytest.approx(0.2) and parent["D"] == "B"
    assert order == ["A", "B", "D", "C"]


def test_unreachable_component_is_missing_from_dist():
    g = graph(list("ABCD"), [("A", "B", 0.9), ("C", "D", 0.9)])
    dist, parent, order = dijkstra(g, "A")
    assert set(dist) == set(parent) == set(order) == {"A", "B"}


def test_equal_cost_tie_picks_smaller_id_regardless_of_input_order():
    edges = [("A", "B", 0.5), ("A", "C", 0.5), ("B", "D", 0.5), ("C", "D", 0.5)]  # D is 1.0 away via B or C
    parents = set()
    for perm in itertools.permutations(edges):
        _, parent, order = dijkstra(graph(list("ABCD"), list(perm)), "A")
        parents.add((parent["D"], tuple(order)))
    assert parents == {("B", ("A", "B", "C", "D"))}


def test_zero_cost_edge_weight_one():
    g = graph(list("ABC"), [("A", "B", 1.0), ("B", "C", 1.0)])
    dist, _, order = dijkstra(g, "A")
    assert dist == {"A": 0.0, "B": 0.0, "C": 0.0} and order == list("ABC")


def test_a_zero_cost_tie_never_reparents_a_settled_node():
    # B settles at 0 with parent A; C (also cost 0 from A) then offers B a second equal-cost route
    g = graph(list("ABC"), [("A", "B", 1.0), ("A", "C", 1.0), ("B", "C", 1.0)])
    _, parent, order = dijkstra(g, "A")
    assert parent == {"A": None, "B": "A", "C": "A"}
    assert all(order.index(parent[v]) < order.index(v) for v in order[1:])


def test_weights_above_one_are_clamped_not_negative():
    assert edge_cost(1.2) == 0.0 and edge_cost(1.0) == 0.0 and edge_cost(0.25) == 0.75 and edge_cost(0.0) == 1.0
    g = graph(list("ABC"), [("A", "B", 1.2), ("B", "C", 0.5)])
    dist, _, _ = dijkstra(g, "A")
    assert dist["B"] == 0.0 and dist["C"] == pytest.approx(0.5)


def test_graph_weights_stay_in_unit_interval_for_matcher_scores():
    rng = random.Random(0)
    for _ in range(20):
        _, g = random_graph(rng, 9, 0.5)
        assert all(0.0 <= e.weight <= 1.0 for e in g.edges)


# ---- dijkstra(): oracle and properties --------------------------------------------------------------------------
def test_matches_bellman_ford_and_parents_form_a_shortest_path_tree():
    for seed in range(60):
        rng = random.Random(seed)
        nodes, g = random_graph(rng, rng.randint(2, 12), rng.choice([0.15, 0.3, 0.6]), quantised=seed % 2 == 0)
        src = rng.choice(nodes)
        dist, parent, order = dijkstra(g, src)
        oracle = bellman_ford(g, src)
        assert set(dist) == set(oracle)
        for n in oracle:
            assert dist[n] == pytest.approx(oracle[n], abs=1e-9), (seed, n)
        assert parent[src] is None
        for n in dist:  # path costs along the parent pointers equal dist; the tree reaches the root
            cost, cur, hops = 0.0, n, 0
            while parent[cur] is not None:
                cost += 1.0 - g.adj[parent[cur]][cur].weight
                cur = parent[cur]
                hops += 1
                assert hops <= len(nodes)
            assert cur == src and cost == pytest.approx(dist[n], abs=1e-9)


def test_properties_order_settled_once_no_relaxable_edge_and_counters():
    for seed in range(60):
        rng = random.Random(100 + seed)
        nodes, g = random_graph(rng, rng.randint(2, 14), rng.choice([0.15, 0.3, 0.6]))
        from relicx.engine import OpCounter

        counter = OpCounter()
        dist, parent, order = dijkstra(g, nodes[0], counter)
        assert order[0] == nodes[0]
        assert len(order) == len(set(order)) == len(dist)  # each reachable node exactly once
        assert all(dist[a] <= dist[b] + 1e-12 for a, b in zip(order, order[1:], strict=False))  # non-decreasing
        for u in dist:
            for v, e in g.adj[u].items():
                assert dist[v] <= dist[u] + (1.0 - e.weight) + 1e-12  # nothing left to relax
        assert all(order.index(parent[v]) < order.index(v) for v in order[1:])  # parent settled first
        assert counter.get("relaxations") == sum(len(g.adj[u]) for u in order)  # = 2E per component
        assert len(order) <= counter.get("heap_pops") <= 1 + counter.get("relaxations")


# ---- solve_dijkstra(): validity -----------------------------------------------------------------------------------
@pytest.mark.parametrize("allow_rotation", [False, True])
def test_output_is_a_valid_layout_and_scores_add_up(allow_rotation):
    for seed in range(30):
        rng = random.Random(seed)
        rows, cols = rng.choice([(2, 2), (2, 3), (3, 3), (1, 5)])
        ids = [f"F{i}" for i in range(rows * cols - rng.choice([0, 0, 1]))]
        compat = random_compat(ids, rng, 0.25)
        res = solve_dijkstra(ids, compat, graph_of(ids, compat), rows, cols, allow_rotation)
        cells = [(p.row, p.col) for p in res.placements]
        frags = [p.fragment for p in res.placements]
        assert len(set(cells)) == len(cells) and len(set(frags)) == len(frags)
        assert set(frags) | set(res.meta["unplaced"]) == set(ids) and not set(frags) & set(res.meta["unplaced"])
        h, w = max(r for r, _ in cells) + 1, max(c for _, c in cells) + 1
        assert (h <= rows and w <= cols) or (allow_rotation and h <= cols and w <= rows)
        assert all(0 <= p.rot < 4 and (allow_rotation or p.rot == 0) for p in res.placements)
        assert res.total_score == pytest.approx(recompute(res.placements, compat), abs=1e-3)


def test_same_input_gives_identical_output():
    ids = [f"F{i}" for i in range(9)]
    compat = random_compat(ids, random.Random(3), 0.3)
    g = graph_of(ids, compat)
    a, b = solve_dijkstra(ids, compat, g, 3, 3), solve_dijkstra(ids, compat, g, 3, 3)
    assert a.placements == b.placements and a.trace == b.trace and a.operations == b.operations


def test_meta_counts_match_the_trace():
    for seed in range(30):
        rng = random.Random(seed)
        ids = [f"F{i}" for i in range(9)]
        compat = random_compat(ids, rng, 0.06)
        res = solve_dijkstra(ids, compat, graph_of(ids, compat, threshold=rng.choice([0.0, 0.3])), 3, 3, True)
        conflicts = [t for t in res.trace if t["action"] == "conflict"]
        with_parent = [t for t in conflicts if "parent" in t or t.get("parent")]
        no_parent = [t for t in conflicts if "not reachable" in t["message"]]
        assert res.meta["conflicts"] == len(conflicts) - len(no_parent) == len(with_parent)
        assert res.meta["unreachable"] >= len(no_parent)  # equal unless the grid had no free cell
        assert len([t for t in res.trace if t["action"] == "place"]) + len(conflicts) + 1 == len(res.placements)


# ---- fallback paths ----------------------------------------------------------------------------------------------
def test_parent_cell_taken_records_conflict_and_still_places_the_child():
    compat = table(horizontal=[("A", "B", 0.9), ("A", "C", 0.8)])  # B and C both want the cell east of A
    res = solve_dijkstra(list("ABC"), compat, graph_of(list("ABC"), compat), 2, 2, seed="A")
    assert res.meta["conflicts"] == 1 and not res.meta["unplaced"]
    c = next(t for t in res.trace if t["action"] == "conflict")
    assert c["fragment"] == "C" and c["parent"] == "A"
    assert (c["intended_row"], c["intended_col"]) == (0, 1)
    assert (c["row"], c["col"]) != (0, 1)
    assert "parent cell taken" in c["message"]


def test_rotation_disabled_makes_a_rotating_join_a_conflict():
    compat = {("A", 1, "B", 0): 0.9, ("B", 0, "A", 1): 0.9}  # A east meets B north: B needs a 270° turn
    res = solve_dijkstra(["A", "B"], compat, graph_of(["A", "B"], compat), 1, 2, False, seed="A")
    assert (
        res.meta["conflicts"] == 1
        and "not allowed" in next(t for t in res.trace if t["action"] == "conflict")["message"]
    )
    assert all(p.rot == 0 for p in res.placements)
    on = solve_dijkstra(["A", "B"], compat, graph_of(["A", "B"], compat), 1, 2, True, seed="A")
    assert on.meta["conflicts"] == 0 and {p.fragment: p.rot for p in on.placements}["B"] == 3


def test_fragment_unreachable_in_pruned_graph_is_placed_by_fallback():
    compat = table(horizontal=[("A", "B", 0.9), ("B", "C", 0.3)])
    res = solve_dijkstra(list("ABC"), compat, graph_of(list("ABC"), compat, threshold=0.5), 1, 3, seed="A")
    assert res.meta["unreachable"] == 1 and res.meta["conflicts"] == 0 and not res.meta["unplaced"]
    c = next(t for t in res.trace if t["action"] == "conflict")
    assert c["fragment"] == "C" and "not reachable in pruned graph" in c["message"]


def test_no_free_cell_gives_stop_and_unplaced():
    compat = table(horizontal=[("A", "B", 0.9), ("B", "C", 0.8)])
    res = solve_dijkstra(list("ABC"), compat, graph_of(list("ABC"), compat), 1, 2, seed="A")
    assert res.trace[-1]["action"] == "stop" and res.meta["unplaced"] == ["C"] and len(res.placements) == 2


def test_a_reseated_child_becomes_the_parent_of_its_own_children_at_its_actual_cell():
    # B and C both want east of A; C loses and is re-seated elsewhere; D hangs east of C and follows C's ACTUAL cell
    compat = table(horizontal=[("A", "B", 0.9), ("A", "C", 0.8), ("C", "D", 0.7)])
    res = solve_dijkstra(list("ABCD"), compat, graph_of(list("ABCD"), compat), 2, 4, seed="A")
    at = {p.fragment: (p.row, p.col) for p in res.placements}
    assert at["C"] != (at["A"][0], at["A"][1] + 1)  # not where its join intended
    assert at["D"] == (at["C"][0], at["C"][1] + 1)  # but D is still placed relative to C's real position
    assert at["D"] != (at["A"][0], at["A"][1] + 2)  # so the intended picture A C D is not recovered


# ---- counterexample: path-sum vs single join ----------------------------------------------------------------------
# Written out in docs/ALGORITHMS.md section 12. B has one excellent join (to C, 0.60) and one mediocre join (to the
# seed A, 0.25). Hanging B on A costs 0.75; going through C costs 0.65 + 0.40 = 1.05, so the shortest-path tree uses
# the mediocre join. Prim takes the strongest crossing edge each time and uses the excellent one.
COUNTEREXAMPLE = table(horizontal=[("B", "A", 0.25), ("C", "B", 0.60)], vertical=[("C", "A", 0.35)])
CX_IDS = ["A", "B", "C"]


def test_dijkstra_counterexample_underperforms_best_first_and_the_optimum():
    g = graph_of(CX_IDS, COUNTEREXAMPLE)
    dist, parent, order = dijkstra(g, "A")
    assert order == ["A", "C", "B"]
    assert dist["C"] == pytest.approx(0.65) and dist["B"] == pytest.approx(0.75)
    assert parent["B"] == "A"  # mediocre 0.25 join chosen over the 0.60 join to C
    d = solve_dijkstra(CX_IDS, COUNTEREXAMPLE, g, 2, 2, seed="A")
    b = solve_best_first(CX_IDS, COUNTEREXAMPLE, g, 2, 2, seed="A")
    opt = grid_opt(CX_IDS, 2, 2, COUNTEREXAMPLE)
    assert d.total_score == pytest.approx(0.25 + 0.35)
    assert b.total_score == pytest.approx(0.35 + 0.60) == pytest.approx(opt)
    assert d.total_score < b.total_score - 0.3
    assert {t["fragment"]: t.get("parent") for t in b.trace if t["action"] == "place"}["B"] == "C"
    exact = solve_backtracking(CX_IDS, COUNTEREXAMPLE, 2, 2)
    assert exact.total_score == pytest.approx(opt)


# ---- _fallback is shared with best-first ----------------------------------------------------------------------------
def test_fallback_is_shared_and_still_drives_best_first():
    assert best_first_module._fallback is importlib.import_module("relicx.engine.solvers.dijkstra")._fallback
    compat = table(horizontal=[("A", "B", 0.9), ("B", "C", 0.8)])
    pruned = graph_of(list("ABC"), compat, threshold=0.95)  # no edges: every fragment goes through _fallback
    res = solve_best_first(list("ABC"), compat, pruned, 1, 3, seed="A")
    assert [t["action"] for t in res.trace] == ["seed", "fallback", "fallback"]
    assert not res.meta["unplaced"] and res.total_score == pytest.approx(0.9 + 0.8)
    assert [p.fragment for p in sorted(res.placements, key=lambda p: p.col)] == list("ABC")
