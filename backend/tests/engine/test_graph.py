"""Fragment graph, pruning and BFS / DFS (T14).

Layout: textbook shapes -> threshold -> mutual top-k -> parallel matches and determinism -> brute-force and
property checks on seeded random graphs -> exact visit orders. Hypothesis is not a dev dependency, so the
property tests are seeded random loops (same inputs on every run).
"""

import itertools
import random

import pytest

from relicx.engine import OpCounter, bfs_components, build_graph, dfs_components
from relicx.engine.graph import FragmentGraph
from relicx.engine.matcher import SideMatch


def sm(a, b, w, sa=1, sb=3):
    """A SideMatch whose composite is ``w`` (a's side ``sa`` against b's side ``sb``)."""
    return SideMatch(a, sa, b, sb, w, w, w, w, w, w)


def norm(components):
    return sorted(sorted(c) for c in components)


def edge_set(g: FragmentGraph):
    return {(e.u, e.v): (e.weight, e.side_u, e.side_v) for e in g.edges}


def both(g):
    (bc, bo), (dc, do) = bfs_components(g), dfs_components(g)
    return bc, bo, dc, do


# --------------------------------------------------------------------------------------- textbook shapes
def test_empty_graph():
    g = build_graph([], [])
    assert g.edges == []
    assert bfs_components(g) == ([], [])
    assert dfs_components(g) == ([], [])


def test_single_node():
    g = build_graph(["A"], [])
    assert bfs_components(g) == ([["A"]], ["A"])
    assert dfs_components(g) == ([["A"]], ["A"])


def test_path():
    g = build_graph(list("ABCD"), [sm("A", "B", 0.9), sm("B", "C", 0.8), sm("C", "D", 0.7)])
    assert len(g.edges) == 3
    bc, bo, dc, do = both(g)
    assert norm(bc) == norm(dc) == [list("ABCD")]
    assert bo == do == list("ABCD")  # a path has only one traversal from an end


def test_cycle():
    g = build_graph(list("ABCD"), [sm("A", "B", 0.9), sm("B", "C", 0.8), sm("C", "D", 0.7), sm("A", "D", 0.6)])
    assert len(g.edges) == 4
    assert all(len(g.adj[n]) == 2 for n in "ABCD")
    bc, _, dc, _ = both(g)
    assert norm(bc) == norm(dc) == [list("ABCD")]


def test_star():
    leaves = list("BCDE")
    g = build_graph(["A", *leaves], [sm("A", x, 0.5 + i / 10) for i, x in enumerate(leaves)])
    assert len(g.edges) == 4
    assert len(g.adj["A"]) == 4
    bc, bo, dc, do = both(g)
    assert norm(bc) == norm(dc) == [list("ABCDE")]
    assert bo[0] == do[0] == "A"
    assert bo[1:] == ["E", "D", "C", "B"]  # strongest leaf first (weights rise with the index)
    assert do[1:] == ["E", "D", "C", "B"]  # a star has no depth, so DFS agrees with BFS


def test_disconnected_with_isolated_nodes():
    g = build_graph(list("ABCDEFG"), [sm("A", "B", 0.9), sm("B", "C", 0.8), sm("D", "E", 0.7)])
    bc, _, dc, _ = both(g)
    assert norm(bc) == norm(dc) == [["A", "B", "C"], ["D", "E"], ["F"], ["G"]]


def test_complete_graph():
    nodes = list("ABCDE")
    matches = [sm(a, b, 0.5 + 0.01 * i) for i, (a, b) in enumerate(itertools.combinations(nodes, 2))]
    g = build_graph(nodes, matches)
    assert len(g.edges) == 10
    assert all(len(g.adj[n]) == 4 for n in nodes)
    bc, bo, dc, do = both(g)
    assert norm(bc) == norm(dc) == [nodes]
    assert sorted(bo) == sorted(do) == nodes


def test_edges_returns_each_undirected_edge_once_in_canonical_form():
    g = build_graph(list("CBA"), [sm("C", "A", 0.9), sm("B", "C", 0.8), sm("A", "B", 0.7)])
    edges = g.edges
    assert [(e.u, e.v) for e in edges] == [("A", "B"), ("A", "C"), ("B", "C")]  # u < v, sorted
    assert len(edges) * 2 == sum(len(n) for n in g.adj.values())
    for u, nbrs in g.adj.items():  # adjacency is symmetric, sides mirrored
        for v, e in nbrs.items():
            back = g.adj[v][u]
            assert (back.weight, back.side_u, back.side_v) == (e.weight, e.side_v, e.side_u)
            assert (e.u, e.v) == (u, v)


def test_weight_helper():
    g = build_graph(["A", "B", "C"], [sm("A", "B", 0.9)])
    assert g.weight("A", "B") == g.weight("B", "A") == 0.9
    assert g.weight("A", "C") == 0.0


# ------------------------------------------------------------------------------------------- threshold
def test_threshold_equal_to_an_edge_weight_keeps_it():
    matches = [sm("A", "B", 0.5), sm("B", "C", 0.4999)]
    g = build_graph(list("ABC"), matches, threshold=0.5)
    assert edge_set(g).keys() == {("A", "B")}  # '<' prunes, so equal survives


def test_threshold_zero_keeps_everything():
    matches = [sm("A", "B", 0.0), sm("B", "C", 0.3)]
    assert len(build_graph(list("ABC"), matches, threshold=0).edges) == 2


def test_threshold_above_every_weight_leaves_isolated_nodes():
    g = build_graph(list("ABC"), [sm("A", "B", 0.9), sm("B", "C", 0.8)], threshold=0.95)
    assert g.edges == []
    bc, bo, dc, do = both(g)
    assert norm(bc) == norm(dc) == [["A"], ["B"], ["C"]]
    assert bo == do == ["A", "B", "C"]


# ---------------------------------------------------------------------------------------- mutual top-k
def test_top_k_one_gives_a_matching():
    nodes = list("ABCDEF")
    rng = random.Random(3)
    matches = [sm(a, b, round(rng.random(), 3)) for a, b in itertools.combinations(nodes, 2)]
    g = build_graph(nodes, matches, top_k=1)
    assert all(len(g.adj[n]) <= 1 for n in nodes)  # no node has two best buddies
    # every surviving edge really is the strongest edge of both endpoints
    for e in g.edges:
        assert e.weight == max(m.composite for m in matches if e.u in (m.a, m.b))
        assert e.weight == max(m.composite for m in matches if e.v in (m.a, m.b))


def test_large_top_k_equals_no_pruning():
    nodes = list("ABCDE")
    matches = [sm(a, b, 0.3 + 0.05 * i) for i, (a, b) in enumerate(itertools.combinations(nodes, 2))]
    assert edge_set(build_graph(nodes, matches, top_k=4)) == edge_set(build_graph(nodes, matches))
    assert edge_set(build_graph(nodes, matches, top_k=64)) == edge_set(build_graph(nodes, matches))


def test_edge_strong_for_one_endpoint_only_is_dropped():
    # C is the hub: its top-1 is C-D (0.9). Leaf A's top-1 is C-A, but C does not rank C-A in its top-1.
    matches = [sm("C", "D", 0.9), sm("A", "C", 0.6), sm("B", "C", 0.5)]
    g = build_graph(list("ABCD"), matches, top_k=1)
    assert edge_set(g).keys() == {("C", "D")}
    # k=2: the hub now keeps C-D and C-A, but its third edge (C-B) is still not in its top-2
    assert edge_set(build_graph(list("ABCD"), matches, top_k=2)).keys() == {("C", "D"), ("A", "C")}
    assert edge_set(build_graph(list("ABCD"), matches, top_k=3)).keys() == {("C", "D"), ("A", "C"), ("B", "C")}


def test_top_k_ranks_only_edges_that_survived_the_threshold():
    matches = [sm("A", "B", 0.9), sm("A", "C", 0.8), sm("B", "C", 0.1)]
    # without the threshold, B's top-1 is A-B, C's top-1 is A-C, A's top-1 is A-B -> only A-B survives
    assert edge_set(build_graph(list("ABC"), matches, top_k=1)).keys() == {("A", "B")}
    assert edge_set(build_graph(list("ABC"), matches, threshold=0.5, top_k=1)).keys() == {("A", "B")}


@pytest.mark.parametrize("bad", [0, -1])
def test_top_k_below_one_is_rejected(bad):
    # Previously `if top_k:` silently treated 0 as "no pruning"; the API already requires top_k >= 1.
    with pytest.raises(ValueError, match="top_k"):
        build_graph(["A", "B"], [sm("A", "B", 0.5)], top_k=bad)


def test_top_k_none_means_no_pruning():
    assert len(build_graph(["A", "B"], [sm("A", "B", 0.5)], top_k=None).edges) == 1


@pytest.mark.parametrize("k", [1, 2, 3])
def test_mutual_top_k_edge_bound(k):
    """Each node keeps at most k edges, so E <= k*V/2 (every edge needs a slot at both ends)."""
    rng = random.Random(k)
    nodes = [f"N{i:02d}" for i in range(14)]
    matches = [sm(a, b, round(rng.random(), 2)) for a, b in itertools.combinations(nodes, 2)]
    g = build_graph(nodes, matches, top_k=k)
    assert all(len(g.adj[n]) <= k for n in nodes)
    assert len(g.edges) <= k * len(nodes) / 2


# ------------------------------------------------------------------------ parallel matches, determinism
def test_parallel_matches_keep_the_best_with_its_side_pair():
    matches = [sm("A", "B", 0.4, 1, 3), sm("A", "B", 0.9, 2, 0), sm("A", "B", 0.6, 0, 2)]
    e = build_graph(["A", "B"], matches).edges[0]
    assert (e.u, e.v, e.weight, e.side_u, e.side_v) == ("A", "B", 0.9, 2, 0)


def test_orientation_is_independent_of_the_a_b_order_of_the_input():
    forward = build_graph(["A", "B"], [sm("A", "B", 0.9, 2, 0)])
    reverse = build_graph(["A", "B"], [sm("B", "A", 0.9, 0, 2)])  # same physical match, written the other way
    assert edge_set(forward) == edge_set(reverse) == {("A", "B"): (0.9, 2, 0)}
    assert (reverse.adj["B"]["A"].side_u, reverse.adj["B"]["A"].side_v) == (0, 2)  # B's view of the same edge
    mixed = build_graph(["A", "B"], [sm("B", "A", 0.5, 0, 2), sm("A", "B", 0.9, 2, 0), sm("B", "A", 0.7, 3, 1)])
    assert edge_set(mixed) == {("A", "B"): (0.9, 2, 0)}


def test_equal_weight_parallel_matches_prefer_the_smaller_side_pair_in_any_order():
    ms = [sm("A", "B", 0.7, 3, 1), sm("A", "B", 0.7, 1, 3), sm("A", "B", 0.7, 2, 0)]
    for perm in itertools.permutations(ms):
        assert edge_set(build_graph(["A", "B"], list(perm))) == {("A", "B"): (0.7, 1, 3)}


def test_self_matches_are_ignored():
    g = build_graph(["A", "B"], [sm("A", "A", 0.99), sm("A", "B", 0.5)], top_k=1)
    assert edge_set(g).keys() == {("A", "B")}
    assert "A" not in g.adj["A"]


def test_match_referencing_an_unknown_fragment_is_rejected():
    with pytest.raises(ValueError, match="not in nodes"):
        build_graph(["A"], [sm("A", "Z", 0.9)])


def test_ties_are_resolved_by_id_not_by_input_order():
    """Equal weights must give the same graph and the same traversals for every input order."""
    nodes = list("ABCDE")
    matches = [sm(a, b, 0.5) for a, b in itertools.combinations(nodes, 2)]  # complete graph, all weights tied
    rng = random.Random(11)
    reference = None
    for _ in range(25):
        rng.shuffle(matches)
        g = build_graph(nodes, matches, top_k=2)
        result = (edge_set(g), bfs_components(g), dfs_components(g))
        reference = reference or result
        assert result == reference
    assert max(len(n) for n in build_graph(nodes, matches, top_k=2).adj.values()) <= 2


def test_neighbour_order_with_tied_weights_is_by_id():
    g = build_graph(list("ABCD"), [sm("A", "D", 0.5), sm("A", "B", 0.5), sm("A", "C", 0.5)])
    assert bfs_components(g)[1] == ["A", "B", "C", "D"]
    assert dfs_components(g)[1] == ["A", "B", "C", "D"]


# ------------------------------------------------------------------- brute force and property checks
def random_instance(rng: random.Random):
    n = rng.randint(0, 14)
    nodes = [f"N{i:02d}" for i in range(n)]
    weights = [round(x / 10, 1) for x in range(11)]  # coarse grid -> plenty of ties
    matches = []
    for a, b in itertools.combinations(nodes, 2):
        if rng.random() < rng.choice([0.1, 0.3, 0.6]):
            for _ in range(rng.randint(1, 3)):  # parallel matches on different side pairs
                x, y = (a, b) if rng.random() < 0.5 else (b, a)
                matches.append(sm(x, y, rng.choice(weights), rng.randint(0, 3), rng.randint(0, 3)))
    rng.shuffle(matches)
    return nodes, matches, rng.choice(weights), rng.choice([None, 1, 2, 3])


def union_find_components(nodes, edges):
    parent = {n: n for n in nodes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for u, v in edges:
        parent[find(u)] = find(v)
    groups: dict[str, list[str]] = {}
    for n in nodes:
        groups.setdefault(find(n), []).append(n)
    return list(groups.values())


def recursive_dfs_order(g: FragmentGraph):
    """Textbook recursive DFS with the same neighbour order (strongest first, ties by id)."""
    seen, order = set(), []

    def visit(u):
        seen.add(u)
        order.append(u)
        for v in sorted(g.adj[u], key=lambda x: (-g.adj[u][x].weight, x)):
            if v not in seen:
                visit(v)

    for s in sorted(g.nodes):
        if s not in seen:
            visit(s)
    return order


def test_brute_force_union_find_agrees_with_bfs_and_dfs():
    rng = random.Random(2024)
    for _ in range(400):
        nodes, matches, threshold, top_k = random_instance(rng)
        g = build_graph(nodes, matches, threshold=threshold, top_k=top_k)
        expected = norm(union_find_components(nodes, [(e.u, e.v) for e in g.edges]))
        bc, _, dc, _ = both(g)
        assert norm(bc) == expected
        assert norm(dc) == expected


def test_components_without_top_k_match_an_oracle_built_from_the_raw_matches():
    """Independent of build_graph: threshold the raw matches and union them."""
    rng = random.Random(77)
    for _ in range(300):
        nodes, matches, threshold, _ = random_instance(rng)
        oracle = union_find_components(nodes, [(m.a, m.b) for m in matches if m.composite >= threshold])
        g = build_graph(nodes, matches, threshold=threshold)
        assert norm(bfs_components(g)[0]) == norm(oracle) == norm(dfs_components(g)[0])


def test_properties_hold_on_random_graphs():
    rng = random.Random(5)
    for _ in range(300):
        nodes, matches, threshold, top_k = random_instance(rng)
        g = build_graph(nodes, matches, threshold=threshold, top_k=top_k)
        bc, bo, dc, do = both(g)
        # same set of components, whatever the traversal
        assert norm(bc) == norm(dc)
        for comps, order in ((bc, bo), (dc, do)):
            flat = [n for c in comps for n in c]
            assert sorted(flat) == sorted(nodes) and len(flat) == len(set(flat))  # exactly one component each
            assert sorted(order) == sorted(nodes)  # visit order is a permutation
            assert order == flat  # components are listed in visit order
        assert do == recursive_dfs_order(g)  # iterative DFS == recursive DFS order
        # every component is connected via real edges (no node reached through a non-edge)
        for comp in bc:
            assert len(union_find_components(comp, [(e.u, e.v) for e in g.edges if e.u in comp])) == 1


def test_edge_visits_equal_twice_the_edges():
    rng = random.Random(8)
    for _ in range(100):
        nodes, matches, threshold, top_k = random_instance(rng)
        g = build_graph(nodes, matches, threshold=threshold, top_k=top_k)
        for traverse in (bfs_components, dfs_components):
            counter = OpCounter()
            traverse(g, counter)
            assert counter.get("edge_visits") == 2 * len(g.edges)


def test_raising_the_threshold_never_adds_edges_or_merges_components():
    rng = random.Random(21)
    for _ in range(150):
        nodes, matches, _, _ = random_instance(rng)
        previous_edges, previous_comps = None, None
        for threshold in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]:
            g = build_graph(nodes, matches, threshold=threshold)
            edges, comps = set(edge_set(g)), [set(c) for c in bfs_components(g)[0]]
            if previous_edges is not None:
                assert edges <= previous_edges
                assert all(
                    any(c <= p for p in previous_comps) for c in comps
                )  # each new component is inside an old one
                assert len(comps) >= len(previous_comps)
            previous_edges, previous_comps = edges, comps


def test_dfs_does_not_hit_the_recursion_limit():
    n = 5000  # a path far longer than Python's default recursion limit (1000)
    nodes = [f"N{i:05d}" for i in range(n)]
    g = build_graph(nodes, [sm(nodes[i], nodes[i + 1], 0.9) for i in range(n - 1)])
    comps, order = dfs_components(g)
    assert len(comps) == 1 and order == nodes


# ------------------------------------------------------------------------------------- visit orders
def test_exact_bfs_and_dfs_orders_on_a_hand_drawn_graph():
    #        A --0.9-- B --0.6-- E
    #        | \
    #      0.8  0.7        BFS goes level by level, DFS dives down the strongest branch first.
    #        |     \
    #        C      D
    #        |
    #       0.5
    #        |
    #        F
    matches = [sm("A", "B", 0.9), sm("A", "C", 0.8), sm("A", "D", 0.7), sm("B", "E", 0.6), sm("C", "F", 0.5)]
    g = build_graph(list("ABCDEF"), matches)
    bfs_comps, bfs_order = bfs_components(g)
    dfs_comps, dfs_order = dfs_components(g)
    assert bfs_order == ["A", "B", "C", "D", "E", "F"]
    assert dfs_order == ["A", "B", "E", "C", "F", "D"]
    assert bfs_order != dfs_order  # what the Graph page shows side by side
    assert norm(bfs_comps) == norm(dfs_comps) == [list("ABCDEF")]


def test_traversal_starts_from_sorted_nodes_regardless_of_input_order():
    nodes = ["Z", "M", "A"]
    g = build_graph(nodes, [sm("M", "Z", 0.9)])
    assert bfs_components(g)[1] == ["A", "M", "Z"]
    assert dfs_components(g)[1] == ["A", "M", "Z"]
