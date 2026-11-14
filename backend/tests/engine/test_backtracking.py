"""T17: ownership tests for backtracking + branch and bound.

Hypothesis is not a dev dependency, so property tests are seeded random loops. The oracles (exhaustive search,
bound re-derivation, score recomputation) are written here, independent of the solver code.
"""

import itertools
import random
import sys

import pytest

from relicx.engine import build_graph
from relicx.engine.layout import DIRS, Layout, Placement, side_facing
from relicx.engine.matcher import SideMatch
from relicx.engine.solvers import solve_backtracking, solve_best_first, solve_dijkstra, solve_greedy


# ---- helpers -----------------------------------------------------------------------------------------------
def random_compat(ids, rng, density=0.35, quantised=False):
    c = {}
    for a, b in itertools.combinations(ids, 2):
        for sa in range(4):
            for sb in range(4):
                if rng.random() < density:
                    w = rng.choice([0.25, 0.5, 0.75, 1.0]) if quantised else rng.random()
                    c[(a, sa, b, sb)] = c[(b, sb, a, sa)] = w
    return c


def graph_of(ids, compat, **kw):
    ms = [SideMatch(a, sa, b, sb, w, w, w, w, w, w) for (a, sa, b, sb), w in compat.items() if a < b]
    return build_graph(ids, ms, **kw)


def arrangement_score(at, compat):
    """at: {(row, col): (fragment, rot)}; each adjacent pair once (right and down neighbours)."""
    total = 0.0
    for (r, c), (f, rf) in at.items():
        if (r, c + 1) in at:
            g, rg = at[(r, c + 1)]
            total += compat.get((f, side_facing(1, rf), g, side_facing(3, rg)), 0.0)
        if (r + 1, c) in at:
            g, rg = at[(r + 1, c)]
            total += compat.get((f, side_facing(2, rf), g, side_facing(0, rg)), 0.0)
    return total


def exhaustive(ids, rows, cols, rots, compat):
    """Best score over every placement of all fragments into distinct cells with any rotations."""
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    best = 0.0
    for chosen in itertools.permutations(cells, len(ids)):
        for rr in itertools.product(rots, repeat=len(ids)):
            at = {cell: (f, r) for cell, f, r in zip(chosen, ids, rr, strict=True)}
            best = max(best, arrangement_score(at, compat))
    return best


def recompute(placements, compat):
    return arrangement_score({(p.row, p.col): (p.fragment, p.rot) for p in placements}, compat)


def check_valid(res, ids, rows, cols, allow_rotation=False):
    cells = [(p.row, p.col) for p in res.placements]
    frags = [p.fragment for p in res.placements]
    assert len(set(cells)) == len(cells) and len(set(frags)) == len(frags) and set(frags) <= set(ids)
    if cells:
        h, w = max(r for r, _ in cells) + 1, max(c for _, c in cells) + 1
        assert (h <= rows and w <= cols) or (allow_rotation and h <= cols and w <= rows)
        assert min(r for r, _ in cells) >= 0 and min(c for _, c in cells) >= 0
    assert all(0 <= p.rot < 4 and (allow_rotation or p.rot == 0) for p in res.placements)


def ids_of(n):
    return [f"F{i}" for i in range(n)]


# ---- brute-force optimality (the bounds never prune the optimum) ----------------------------------------------
@pytest.mark.parametrize(
    ("rows", "cols", "n", "rotation", "tables"),
    [
        (2, 2, 4, False, 40),
        (2, 2, 4, True, 12),
        (2, 3, 6, False, 15),
        (2, 3, 5, False, 15),  # one missing piece: an EMPTY cell
        (2, 3, 3, True, 12),  # three missing pieces and rotation
        (1, 4, 4, True, 15),
    ],
)
def test_unbounded_search_equals_exhaustive_optimum(rows, cols, n, rotation, tables):
    ids = ids_of(n)
    rots = [0, 1, 2, 3] if rotation else [0]
    for seed in range(tables):
        rng = random.Random(seed)
        compat = random_compat(ids, rng, rng.choice([0.2, 0.5]), quantised=seed % 3 == 0)
        opt = exhaustive(ids, rows, cols, rots, compat)
        plain = solve_backtracking(ids, compat, rows, cols, rotation, node_limit=10**9)
        assert not plain.truncated
        assert plain.total_score == pytest.approx(opt, abs=1e-3), (seed, "no incumbent")
        check_valid(plain, ids, rows, cols, rotation)
        assert plain.total_score == pytest.approx(recompute(plain.placements, compat), abs=1e-3)
        for inc in (
            solve_greedy(ids, compat, rows, cols, rotation).placements,
            [],  # empty incumbent
        ):
            res = solve_backtracking(ids, compat, rows, cols, rotation, node_limit=10**9, incumbent=inc)
            assert res.total_score == pytest.approx(opt, abs=1e-3), (seed, "incumbent")


# ---- bounds checked directly -----------------------------------------------------------------------------------
def bound_parts(ids, rows, cols, rots, compat):
    """Re-derivation of the solver's two bound ingredients."""
    best_side = {}
    for (f, s, _g, _t), v in compat.items():
        best_side[(f, s)] = max(best_side.get((f, s), 0.0), v)
    big_m = max(compat.values(), default=0.0)
    v_best = {
        f: max(best_side.get((f, side_facing(3, r)), 0.0) + best_side.get((f, side_facing(0, r)), 0.0) for r in rots)
        for f in ids
    }
    cells = [(r, c) for r in range(rows) for c in range(cols)]
    adj_after = [sum((c > 0) + (r > 0) for r, c in cells[k:]) for k in range(len(cells) + 1)]
    return big_m, v_best, adj_after, cells


def prefixes(ids, cells, rots, k):
    """Every partial arrangement of the first k cells (fragment+rotation or empty), all fragments distinct."""
    n_cells, n = len(cells), len(ids)
    for slots in itertools.product([None, *itertools.product(ids, rots)], repeat=k):
        used = [s[0] for s in slots if s is not None]
        empties = k - len(used)
        if len(set(used)) != len(used) or empties > n_cells - n:
            continue
        yield slots


def best_completion(slots, ids, cells, rots, compat):
    """Largest FUTURE gain (cells k.. only) over every way to finish the arrangement, by brute force."""
    k = len(slots)
    used = {s[0] for s in slots if s is not None}
    left = [f for f in ids if f not in used]
    base = {cells[i]: s for i, s in enumerate(slots) if s is not None}
    now = arrangement_score(base, compat)
    best = None
    free = cells[k:]
    for chosen in itertools.permutations(free, len(left)):
        for rr in itertools.product(rots, repeat=len(left)):
            at = dict(base)
            at.update({cell: (f, r) for cell, f, r in zip(chosen, left, rr, strict=True)})
            gain = arrangement_score(at, compat) - now
            best = gain if best is None else max(best, gain)
    return best


@pytest.mark.parametrize(
    ("rows", "cols", "n", "rotation"), [(2, 2, 4, False), (2, 2, 4, True), (2, 3, 5, False), (2, 3, 4, False)]
)
def test_both_bound_terms_are_valid_upper_bounds_on_the_future_gain(rows, cols, n, rotation):
    ids = ids_of(n)
    rots = [0, 1, 2, 3] if rotation else [0]
    for seed in range(4 if rotation else 6):
        rng = random.Random(seed)
        compat = random_compat(ids, rng, 0.5, quantised=seed % 2 == 0)
        big_m, v_best, adj_after, cells = bound_parts(ids, rows, cols, rots, compat)
        for k in range(len(cells) + 1):
            for slots in prefixes(ids, cells, rots, k):
                future = best_completion(slots, ids, cells, rots, compat)
                if future is None:  # this prefix cannot be completed (too many empties)
                    continue
                used = {s[0] for s in slots if s is not None}
                assert future <= big_m * adj_after[k] + 1e-9
                assert future <= sum(v_best[f] for f in ids if f not in used) + 1e-9


def test_pruned_nodes_never_hide_a_better_solution_even_with_a_tie_heavy_table():
    ids = ids_of(4)
    for seed in range(30):
        compat = random_compat(ids, random.Random(seed), 0.6, quantised=True)  # many exact ties
        opt = exhaustive(ids, 2, 2, [0], compat)
        res = solve_backtracking(
            ids, compat, 2, 2, node_limit=10**9, incumbent=solve_greedy(ids, compat, 2, 2).placements
        )
        assert res.total_score == pytest.approx(opt, abs=1e-3)


def test_pruning_on_ties_may_return_a_different_but_equally_scored_layout():
    # every join scores 1.0: all complete arrangements with the same adjacency count tie
    ids = ids_of(4)
    compat = {}
    for a, b in itertools.combinations(ids, 2):
        for sa in range(4):
            for sb in range(4):
                compat[(a, sa, b, sb)] = compat[(b, sb, a, sa)] = 1.0
    plain = solve_backtracking(ids, compat, 2, 2)
    inc = [Placement(f, i // 2, i % 2) for i, f in enumerate(reversed(ids))]
    seeded = solve_backtracking(ids, compat, 2, 2, incumbent=inc)
    assert plain.total_score == seeded.total_score == 4.0
    assert {(p.fragment, p.row, p.col) for p in seeded.placements} == {(p.fragment, p.row, p.col) for p in inc}
    assert seeded.meta["nodes"] < plain.meta["nodes"]


def test_a_zero_score_solution_is_accepted():
    res = solve_backtracking(ids_of(4), {}, 2, 2)
    assert len(res.placements) == 4 and res.total_score == 0.0 and not res.truncated


# ---- missing pieces ---------------------------------------------------------------------------------------------
@pytest.mark.parametrize(("n", "rows", "cols"), [(1, 2, 2), (3, 2, 2), (5, 2, 3), (1, 1, 1), (2, 3, 3)])
def test_fewer_fragments_than_cells_leaves_empty_cells(n, rows, cols):
    ids = ids_of(n)
    compat = random_compat(ids, random.Random(n), 0.5) if n > 1 else {}
    res = solve_backtracking(ids, compat, rows, cols, node_limit=10**9)
    assert sorted(p.fragment for p in res.placements) == sorted(ids)  # every fragment is placed
    check_valid(res, ids, rows, cols)
    if n * 2 <= 6:
        assert res.total_score == pytest.approx(exhaustive(ids, rows, cols, [0], compat), abs=1e-3)


def test_more_fragments_than_cells_raises():
    with pytest.raises(ValueError, match="do not fit"):
        solve_backtracking(ids_of(5), {}, 2, 2)


# ---- incumbent ---------------------------------------------------------------------------------------------------
def test_worse_incumbent_is_improved_and_optimal_incumbent_is_kept_and_prunes():
    ids = ids_of(6)
    found, fewer = False, 0
    for seed in range(30):
        compat = random_compat(ids, random.Random(seed), 0.3)
        greedy = solve_greedy(ids, compat, 2, 3)
        plain = solve_backtracking(ids, compat, 2, 3, node_limit=10**9)
        seeded = solve_backtracking(ids, compat, 2, 3, node_limit=10**9, incumbent=greedy.placements)
        assert seeded.total_score == pytest.approx(plain.total_score, abs=1e-3)
        assert plain.total_score >= greedy.total_score - 1e-3
        assert seeded.meta["nodes"] <= plain.meta["nodes"]
        if plain.total_score > greedy.total_score + 1e-3:
            found = True  # a worse incumbent was improved
        optimal = solve_backtracking(ids, compat, 2, 3, node_limit=10**9, incumbent=plain.placements)
        assert optimal.total_score == pytest.approx(plain.total_score, abs=1e-3)
        assert {(p.fragment, p.row, p.col) for p in optimal.placements} == {
            (p.fragment, p.row, p.col) for p in plain.placements
        }  # nothing beats it, so it comes back unchanged
        assert optimal.meta["nodes"] <= plain.meta["nodes"]
        fewer += optimal.meta["nodes"] < plain.meta["nodes"]
        assert any(t["action"] == "incumbent" for t in optimal.trace)
        assert not any(t["action"] == "best" for t in optimal.trace)  # no float-noise "improvement"
    assert found and fewer > 0


def test_incumbent_that_does_not_fit_is_ignored():
    ids = ids_of(4)
    compat = random_compat(ids, random.Random(1), 0.5)
    tall = [Placement(f, i, 0) for i, f in enumerate(ids)]  # 4 x 1 does not fit 2 x 2
    plain = solve_backtracking(ids, compat, 2, 2)
    res = solve_backtracking(ids, compat, 2, 2, incumbent=tall)
    assert res.placements == plain.placements and res.meta["nodes"] == plain.meta["nodes"]
    assert not any(t["action"] == "incumbent" for t in res.trace)


def test_incumbent_score_is_computed_like_the_search_accumulates_it():
    for seed in range(15):
        ids = ids_of(6)
        compat = random_compat(ids, random.Random(seed), 0.4)
        greedy = solve_greedy(ids, compat, 2, 3, allow_rotation=True)
        res = solve_backtracking(ids, compat, 2, 3, True, node_limit=1, incumbent=greedy.placements)
        # with the limit hit immediately the incumbent comes back, scored identically by both paths
        if res.truncated and all(t["action"] != "best" for t in res.trace):
            assert res.total_score == pytest.approx(greedy.total_score, abs=1e-3)


# ---- truncation --------------------------------------------------------------------------------------------------
def test_truncated_run_is_a_valid_complete_layout_never_empty():
    ids = ids_of(9)
    compat = random_compat(ids, random.Random(2), 0.4)
    for limit in (1, 5, 10, 50):
        res = solve_backtracking(ids, compat, 3, 3, node_limit=limit)
        assert res.truncated
        assert len(res.placements) == 9  # the first descent always completes (cells + 1 nodes)
        check_valid(res, ids, 3, 3)
        assert res.total_score == pytest.approx(recompute(res.placements, compat), abs=1e-3)
        assert res.meta["nodes"] <= max(limit, 10) + 1  # only the first descent can exceed the limit


def test_limit_equal_to_the_full_search_is_not_truncated_and_one_less_is():
    ids = ids_of(5)
    compat = random_compat(ids, random.Random(4), 0.4)
    full = solve_backtracking(ids, compat, 2, 3, node_limit=10**9)
    n = full.meta["nodes"]
    assert not solve_backtracking(ids, compat, 2, 3, node_limit=n).truncated
    cut = solve_backtracking(ids, compat, 2, 3, node_limit=n - 1)
    assert cut.truncated and cut.total_score <= full.total_score + 1e-9


def test_truncated_with_incumbent_returns_it_at_least():
    ids = ids_of(9)
    compat = random_compat(ids, random.Random(5), 0.4)
    greedy = solve_greedy(ids, compat, 3, 3)
    res = solve_backtracking(ids, compat, 3, 3, node_limit=1, incumbent=greedy.placements)
    assert res.truncated and res.total_score >= greedy.total_score - 1e-3
    acts = [t["action"] for t in res.trace]
    assert acts[0] == "incumbent" and "limit" in acts


def test_milestone_trace_steps_survive_the_cap():
    ids = ids_of(7)
    compat = random_compat(ids, random.Random(6), 0.5)
    inc = solve_greedy(ids, compat, 2, 4).placements
    full = solve_backtracking(ids, compat, 2, 4, node_limit=3000, trace_cap=100_000, incumbent=inc)
    capped = solve_backtracking(ids, compat, 2, 4, node_limit=3000, trace_cap=5, incumbent=inc)
    milestones = lambda r: [t["action"] for t in r.trace if t["action"] in ("best", "incumbent", "limit")]  # noqa: E731
    assert milestones(capped) == milestones(full) and "incumbent" in milestones(capped)
    assert len([t for t in capped.trace if t["action"] not in ("best", "incumbent", "limit")]) <= 5
    assert sum(capped.trace_dropped.values()) > 0 and "best" not in capped.trace_dropped
    assert capped.total_score == full.total_score


def test_prune_steps_carry_the_bound_and_the_incumbent_value():
    ids = ids_of(6)
    compat = random_compat(ids, random.Random(3), 0.3)
    res = solve_backtracking(ids, compat, 2, 3, incumbent=solve_greedy(ids, compat, 2, 3).placements)
    prunes = [t for t in res.trace if t["action"] == "prune"]
    assert prunes and all(t["bound"] <= t["best"] + 1e-9 for t in prunes)


# ---- determinism, validity, recursion limit --------------------------------------------------------------------
def test_deterministic_and_valid():
    for seed in range(15):
        rng = random.Random(seed)
        ids = ids_of(6)
        compat = random_compat(ids, rng, 0.3)
        rotation = seed % 2 == 0
        a = solve_backtracking(ids, compat, 2, 3, rotation, node_limit=2000)
        b = solve_backtracking(ids, compat, 2, 3, rotation, node_limit=2000)
        assert a.placements == b.placements and a.trace == b.trace and a.operations == b.operations
        check_valid(a, ids, 2, 3, rotation)
        assert a.total_score == pytest.approx(recompute(a.placements, compat), abs=1e-3)


def test_recursion_limit_is_restored_also_after_an_exception():
    class Exploding(dict):
        calls = 0

        def get(self, key, default=None):
            Exploding.calls += 1
            if Exploding.calls > 20:
                raise RuntimeError("boom")
            return super().get(key, default)

    before = sys.getrecursionlimit()
    solve_backtracking(ids_of(4), random_compat(ids_of(4), random.Random(0)), 2, 2)
    assert sys.getrecursionlimit() == before
    compat = Exploding(random_compat(ids_of(6), random.Random(0), 0.6))
    with pytest.raises(RuntimeError):
        solve_backtracking(ids_of(6), compat, 2, 3)
    assert sys.getrecursionlimit() == before


# ---- properties --------------------------------------------------------------------------------------------------
def test_backtracking_is_never_worse_than_the_other_solvers_and_node_count_is_bounded():
    for seed in range(25):
        rng = random.Random(seed)
        rows, cols = rng.choice([(2, 2), (2, 3), (1, 5), (2, 4)])
        ids = ids_of(rows * cols)
        compat = random_compat(ids, rng, 0.3)
        g = graph_of(ids, compat)
        bt = solve_backtracking(ids, compat, rows, cols, node_limit=10**7)
        assert not bt.truncated
        others = [
            solve_greedy(ids, compat, rows, cols),
            solve_best_first(ids, compat, g, rows, cols),
            solve_dijkstra(ids, compat, g, rows, cols),
        ]
        assert all(bt.total_score >= o.total_score - 1e-3 for o in others), seed
        n = len(ids)
        unbounded = sum(_falling(n, k) for k in range(n + 1))  # nodes of the full permutation tree, no bounding
        assert bt.meta["nodes"] <= unbounded
        assert bt.meta["pruned"] < bt.meta["nodes"]


def _falling(n, k):
    out = 1
    for i in range(k):
        out *= n - i
    return out


def test_layout_class_agrees_with_the_search_scoring_on_rotations():
    # a 1x2 pair joined by A's east side to B's north side needs B turned 270°; both scorers must agree
    compat = {("A", 1, "B", 0): 0.9, ("B", 0, "A", 1): 0.9}
    res = solve_backtracking(["A", "B"], compat, 1, 2, True)
    assert res.total_score == 0.9
    lay = Layout(1, 2, True)
    for p in res.placements:
        lay.place(Placement(p.fragment, p.row, p.col, p.rot))
    assert lay.total_score(compat) == 0.9 and DIRS[1] == (0, 1)
