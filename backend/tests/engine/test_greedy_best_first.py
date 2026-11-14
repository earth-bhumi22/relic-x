"""T15: ownership tests for the greedy and best-first (Prim) solvers.

Hypothesis is not a dev dependency, so the property tests are seeded random loops.
Oracles (brute force, Kruskal, score recomputation) are written here, independent of the solver code.
"""

import itertools
import random

import pytest

from relicx.engine import build_graph
from relicx.engine.layout import DIRS, Layout, Placement
from relicx.engine.matcher import SideMatch
from relicx.engine.solvers import solve_backtracking, solve_best_first, solve_greedy

IDS4 = list("ABCD")


# ---- helpers -----------------------------------------------------------------------------------------------
def table(horizontal=(), vertical=()):
    """Compat table from (a, b, w) triples: b is right of a (sides E/W) or below a (sides S/N)."""
    c = {}
    for a, b, w in horizontal:
        c[(a, 1, b, 3)] = c[(b, 3, a, 1)] = w
    for a, b, w in vertical:
        c[(a, 2, b, 0)] = c[(b, 0, a, 2)] = w
    return c


def graph_of(ids, compat, **kw):
    ms = [SideMatch(a, sa, b, sb, w, w, w, w, w, w) for (a, sa, b, sb), w in compat.items() if a < b]
    return build_graph(ids, ms, **kw)


def random_compat(ids, rng, density=0.5):
    """Random symmetric table over all side pairs with (almost surely) distinct weights."""
    c = {}
    for a, b in itertools.combinations(ids, 2):
        for sa in range(4):
            for sb in range(4):
                if rng.random() < density:
                    c[(a, sa, b, sb)] = c[(b, sb, a, sa)] = rng.random()
    return c


def grid_score(arrangement, rows, cols, compat):
    """Score of fragments laid out row-major without rotation (independent of Layout)."""
    total = 0.0
    for r in range(rows):
        for c in range(cols):
            f = arrangement[r * cols + c]
            if c + 1 < cols:
                total += compat.get((f, 1, arrangement[r * cols + c + 1], 3), 0.0)
            if r + 1 < rows:
                total += compat.get((f, 2, arrangement[(r + 1) * cols + c], 0), 0.0)
    return total


def brute_optimum(ids, rows, cols, compat):
    return max(grid_score(p, rows, cols, compat) for p in itertools.permutations(ids))


def recompute(placements, compat):
    """Total score from placements alone: each adjacent pair once, sides via the CONTRACT rotation rule."""
    cells = {(p.row, p.col): p for p in placements}
    total = 0.0
    for (r, c), p in cells.items():
        for d in (1, 2):
            q = cells.get((r + DIRS[d][0], c + DIRS[d][1]))
            if q:
                total += compat.get((p.fragment, (d - p.rot) % 4, q.fragment, ((d + 2) - q.rot) % 4), 0.0)
    return total


def kruskal_max(ids, edges):
    parent = {i: i for i in ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    chosen = set()
    for e in sorted(edges, key=lambda e: -e.weight):
        ru, rv = find(e.u), find(e.v)
        if ru != rv:
            parent[ru] = rv
            chosen.add(frozenset((e.u, e.v)))
    return chosen


def joins(res):
    return {frozenset((t["parent"], t["fragment"])) for t in res.trace if t["action"] == "place"}


def truth_compat(rows, cols, rots, rng):
    """Consistent table for a rows x cols picture whose pieces sit with the given rotations."""
    ids = [f"F{r * cols + c:02d}" for r in range(rows) for c in range(cols)]
    rot = dict(zip(ids, rots, strict=True))
    c = {}
    for r in range(rows):
        for k in range(cols):
            a = ids[r * cols + k]
            for d, (dr, dc) in enumerate(DIRS):
                if d in (0, 3) or not (0 <= r + dr < rows and 0 <= k + dc < cols):
                    continue
                b = ids[(r + dr) * cols + k + dc]
                sa, sb = (d - rot[a]) % 4, ((d + 2) - rot[b]) % 4
                c[(a, sa, b, sb)] = c[(b, sb, a, sa)] = 0.5 + rng.random() / 2
    return ids, c


# ---- textbook / tiny cases ---------------------------------------------------------------------------------
@pytest.mark.parametrize("solve", ["greedy", "best_first"])
def test_single_fragment(solve):
    res = run(solve, ["A"], {}, 1, 1)
    assert [(p.fragment, p.row, p.col, p.rot) for p in res.placements] == [("A", 0, 0, 0)]
    assert res.total_score == 0.0


def run(solve, ids, compat, rows, cols, allow_rotation=False, graph=None, **kw):
    if solve == "greedy":
        return solve_greedy(ids, compat, rows, cols, allow_rotation, **kw)
    return solve_best_first(ids, compat, graph or graph_of(ids, compat), rows, cols, allow_rotation, **kw)


@pytest.mark.parametrize("solve", ["greedy", "best_first"])
def test_one_by_two(solve):
    res = run(solve, ["A", "B"], table(horizontal=[("A", "B", 0.9)]), 1, 2)
    assert {p.fragment: (p.row, p.col) for p in res.placements} == {"A": (0, 0), "B": (0, 1)}
    assert res.total_score == 0.9


@pytest.mark.parametrize("solve", ["greedy", "best_first"])
def test_two_by_two_known_answer(solve):
    # A B / C D with strong true joins, weak distractors
    c = table(
        horizontal=[("A", "B", 0.9), ("C", "D", 0.8), ("B", "A", 0.2)],
        vertical=[("A", "C", 0.85), ("B", "D", 0.95), ("D", "A", 0.1)],
    )
    res = run(solve, IDS4, c, 2, 2)
    assert {p.fragment: (p.row, p.col) for p in res.placements} == {"A": (0, 0), "B": (0, 1), "C": (1, 0), "D": (1, 1)}
    assert res.total_score == pytest.approx(0.9 + 0.8 + 0.85 + 0.95)


@pytest.mark.parametrize("solve", ["greedy", "best_first"])
def test_strip_one_by_n(solve):
    ids = ["P", "Q", "R", "S", "T", "U"]  # true left-to-right order
    c = table(horizontal=[(a, b, 0.9 - 0.05 * i) for i, (a, b) in enumerate(zip(ids, ids[1:], strict=False))])
    res = run(solve, ids, c, 1, 6)
    assert [p.fragment for p in sorted(res.placements, key=lambda p: p.col)] == ids
    assert {p.row for p in res.placements} == {0}


# ---- greedy ------------------------------------------------------------------------------------------------
def candidates(placed, unplaced, rows, cols, rots, compat):
    """Every (score, neighbours, fragment, cell, rot) the greedy could pick next, by independent brute force."""
    lay = Layout(rows, cols, allow_rotation=len(rots) > 1)
    for p in placed:
        lay.place(p)
    out = []
    for cell in lay.frontier():
        for f in unplaced:
            for r in rots:
                s, k = 0.0, 0
                for d, (dr, dc) in enumerate(DIRS):
                    nb = lay.cells.get((cell[0] + dr, cell[1] + dc))
                    if nb is not None:
                        k += 1
                        s += compat.get((f, (d - r) % 4, nb.fragment, ((d + 2) - nb.rot) % 4), 0.0)
                out.append((s, k, f, cell, r))
    return out


@pytest.mark.parametrize("allow_rotation", [False, True])
def test_greedy_every_step_is_a_global_maximum(allow_rotation):
    rots = [0, 1, 2, 3] if allow_rotation else [0]
    for seed in range(12):
        rng = random.Random(seed)
        ids = [f"F{i}" for i in range(6)]
        compat = random_compat(ids, rng, 0.4)
        res = solve_greedy(ids, compat, 2, 3, allow_rotation)
        steps = [t for t in res.trace if t["action"] in ("seed", "place")]
        placed = [Placement(steps[0]["fragment"], 0, 0, 0)]
        for t in steps[1:]:
            cands = candidates(placed, [f for f in ids if f not in {p.fragment for p in placed}], 2, 3, rots, compat)
            top = max((s, k) for s, k, *_ in cands)
            chosen = [x for x in cands if x[2:] == (t["fragment"], (t["row"], t["col"]), t["rot"])]
            assert len(chosen) == 1
            assert (chosen[0][0], chosen[0][1]) == pytest.approx(top), (seed, t)
            assert chosen[0][0] == pytest.approx(t["score"], abs=1e-4)
            placed.append(Placement(t["fragment"], t["row"], t["col"], t["rot"]))


def test_greedy_is_deterministic():
    compat = random_compat([f"F{i}" for i in range(9)], random.Random(3), 0.3)
    ids = [f"F{i}" for i in range(9)]
    a, b = solve_greedy(ids, compat, 3, 3), solve_greedy(ids, compat, 3, 3)
    assert a.placements == b.placements and a.total_score == b.total_score and a.operations == b.operations
    assert a.trace == b.trace


def test_pick_seed_all_zero_scores_takes_smallest_id_and_still_places_everything():
    ids = ["C", "A", "B"]
    res = solve_greedy(ids, {}, 1, 3)
    assert res.meta["seed"] == "A"
    assert len(res.placements) == 3 and res.total_score == 0.0
    assert [t["fragment"] for t in res.trace] == ["A", "B", "C"]  # ties resolve in sorted order


# ---- best-first --------------------------------------------------------------------------------------------
def test_best_first_places_a_tree_in_pop_order_rooted_at_the_seed():
    for seed in range(10):
        ids = [f"F{i}" for i in range(9)]
        compat = random_compat(ids, random.Random(seed), 0.2)
        res = solve_best_first(ids, compat, graph_of(ids, compat), 3, 3)
        placed = {res.trace[0]["fragment"]}
        cells = {res.trace[0]["fragment"]: (0, 0)}
        for t in res.trace:
            if t["action"] != "place":
                continue
            assert t["parent"] in placed  # parent was committed earlier
            pr, pc = cells[t["parent"]]
            assert abs(t["row"] - pr) + abs(t["col"] - pc) == 1  # adjacent to its parent
            placed.add(t["fragment"])
            cells[t["fragment"]] = (t["row"], t["col"])


def test_best_first_heap_accounting():
    for seed in range(10):
        ids = [f"F{i}" for i in range(8)]
        compat = random_compat(ids, random.Random(seed), 0.2)
        g = graph_of(ids, compat)
        ops = solve_best_first(ids, compat, g, 2, 4).operations
        assert ops.get("heap_pops", 0) <= ops.get("heap_pushes", 0) <= 2 * len(g.edges)


def test_best_first_without_rotation_never_rotates():
    for seed in range(15):
        ids = [f"F{i}" for i in range(9)]
        compat = random_compat(ids, random.Random(seed), 0.3)
        res = solve_best_first(ids, compat, graph_of(ids, compat), 3, 3, allow_rotation=False)
        assert all(p.rot == 0 for p in res.placements)


def test_rotation_rule_matches_layout_convention():
    # A's east side (1) matches B's NORTH side (0): B must be turned so its N faces west -> rot 3 (270° cw)
    compat = table()
    compat[("A", 1, "B", 0)] = compat[("B", 0, "A", 1)] = 0.9
    on = solve_best_first(["A", "B"], compat, graph_of(["A", "B"], compat), 1, 2, allow_rotation=True)
    assert {p.fragment: (p.col, p.rot) for p in on.placements} == {"A": (0, 0), "B": (1, 3)}
    assert on.total_score == 0.9
    off = solve_best_first(["A", "B"], compat, graph_of(["A", "B"], compat), 1, 2, allow_rotation=False)
    assert off.meta["conflicts"] == 1 and any(t["action"] == "conflict" for t in off.trace)
    assert all(p.rot == 0 for p in off.placements)


def test_best_first_recovers_a_consistent_rotated_picture():
    # every graph edge is a true neighbour and mutually consistent -> no conflicts, full score, any rotations
    for seed in range(20):
        rng = random.Random(seed)
        ids, compat = truth_compat(3, 3, [rng.randrange(4) for _ in range(9)], rng)
        res = solve_best_first(ids, compat, graph_of(ids, compat), 3, 3, allow_rotation=True)
        assert res.meta["conflicts"] == 0 and not res.meta["unplaced"]
        assert res.total_score == pytest.approx(sum(compat.values()) / 2, abs=1e-3)


def test_conflicting_join_is_dropped_but_fragment_is_still_placed_by_fallback():
    # A's east side matches both B (0.9) and C (0.8): both want cell (0,1). The weaker join is dropped for good.
    compat = table(horizontal=[("A", "B", 0.9), ("A", "C", 0.8)])
    res = solve_best_first(list("ABC"), compat, graph_of(list("ABC"), compat), 2, 2, seed="A")
    assert res.meta["conflicts"] == 1
    kinds = [(t["action"], t["fragment"]) for t in res.trace]
    assert ("conflict", "C") in kinds and ("fallback", "C") in kinds
    assert not res.meta["unplaced"]


def test_pruned_graph_changes_best_first_but_not_greedy():
    ids = ["A", "B", "C"]
    compat = table(horizontal=[("A", "B", 0.9), ("B", "C", 0.8)])
    full = solve_best_first(ids, compat, graph_of(ids, compat), 1, 3)
    pruned = solve_best_first(ids, compat, graph_of(ids, compat, threshold=0.95), 1, 3)
    assert all(t["action"] != "fallback" for t in full.trace) and full.operations.get("heap_pops", 0) > 0
    assert pruned.operations.get("heap_pops", 0) == 0
    assert sum(t["action"] == "fallback" for t in pruned.trace) == 2  # nothing attached by a join
    # greedy takes no graph at all: same inputs, same output
    assert solve_greedy(ids, compat, 1, 3).placements == solve_greedy(ids, compat, 1, 3).placements


def test_heap_ties_are_broken_by_ids_deterministically():
    compat = table(horizontal=[("A", "B", 0.5), ("A", "C", 0.5)])  # same weight: B and C both want (0,1)
    runs = [solve_best_first(list("ABC"), compat, graph_of(list("ABC"), compat), 1, 3, seed="A") for _ in range(3)]
    assert all(r.placements == runs[0].placements for r in runs)
    first = next(t for t in runs[0].trace if t["action"] == "place")
    assert first["fragment"] == "B"  # (-w, 'A', 'B') < (-w, 'A', 'C')


def test_unplaced_when_grid_is_too_small():
    compat = table(horizontal=[("A", "B", 0.9), ("B", "C", 0.8)])
    g = solve_greedy(list("ABC"), compat, 1, 2)
    assert len(g.placements) == 2 and len(g.meta["unplaced"]) == 1 and g.trace[-1]["action"] == "stop"
    b = solve_best_first(list("ABC"), compat, graph_of(list("ABC"), compat), 1, 2)
    assert len(b.placements) == 2 and len(b.meta["unplaced"]) == 1 and b.trace[-1]["action"] == "stop"


# ---- Prim equivalence --------------------------------------------------------------------------------------
def test_best_first_equals_maximum_spanning_tree_on_a_clean_strip():
    rng = random.Random(5)
    ids = list("PQRSTUVW")
    compat = table(horizontal=[(a, b, 0.9 - 0.01 * i) for i, (a, b) in enumerate(zip(ids, ids[1:], strict=False))])
    for a, b in itertools.combinations(ids, 2):  # weaker distractors between every pair on random sides
        compat.setdefault((a, rng.randrange(4), b, rng.randrange(4)), rng.random() * 0.4)
    g = graph_of(ids, compat)
    res = solve_best_first(ids, compat, g, 1, 8)
    assert not res.meta["conflicts"] and all(t["action"] != "fallback" for t in res.trace)
    assert joins(res) == kruskal_max(ids, g.edges) == {frozenset(p) for p in zip(ids, ids[1:], strict=False)}


def test_best_first_equals_mst_unless_a_conflict_or_fallback_explains_it():
    same = differ = 0
    for seed in range(120):
        ids = [f"F{i}" for i in range(6)]
        compat = random_compat(ids, random.Random(seed), 0.03)
        g = graph_of(ids, compat)
        if len(g.edges) < 2:
            continue
        res = solve_best_first(ids, compat, g, 3, 3, allow_rotation=True)
        reachable = bfs_reach(g, res.meta["seed"])
        # Prim only spans the seed's component, so compare with the MST of that component
        mst = kruskal_max(sorted(reachable), [e for e in g.edges if e.u in reachable])
        explained = res.meta["conflicts"] > 0 or any(t["action"] in ("fallback", "stop") for t in res.trace)
        if joins(res) == mst:
            same += 1
        else:
            differ += 1
            assert explained, seed
    assert same > 5 and differ > 0


def bfs_reach(g, start):
    seen, todo = {start}, [start]
    while todo:
        for v in g.adj[todo.pop()]:
            if v not in seen:
                seen.add(v)
                todo.append(v)
    return seen


# ---- brute force / counterexample --------------------------------------------------------------------------
@pytest.mark.parametrize(("rows", "cols"), [(2, 2), (2, 3)])
def test_neither_solver_beats_the_brute_force_optimum(rows, cols):
    ids = [f"F{i}" for i in range(rows * cols)]
    hit = {"greedy": 0, "best_first": 0}
    for seed in range(40):
        compat = random_compat(ids, random.Random(seed), 0.35)
        opt = brute_optimum(ids, rows, cols, compat)
        for name in hit:
            res = run(name, ids, compat, rows, cols)
            assert res.total_score <= opt + 1e-3, (name, seed)
            hit[name] += res.total_score >= opt - 1e-3
    assert hit["greedy"] > 0 and hit["best_first"] > 0


# The counterexample written out in docs/ALGORITHMS.md §10: one strong join (C over B, 0.85) is taken first,
# but the optimum uses two other joins (D over C 0.8 and D left of A 0.6 = 1.4) and never the 0.85 one.
COUNTEREXAMPLE = table(
    horizontal=[("B", "A", 0.15), ("D", "A", 0.6)],
    vertical=[("C", "B", 0.85), ("D", "A", 0.05), ("D", "C", 0.8)],
)


def test_greedy_counterexample_is_strictly_suboptimal():
    greedy = solve_greedy(IDS4, COUNTEREXAMPLE, 2, 2)
    assert greedy.meta["seed"] == "C"
    assert greedy.total_score == pytest.approx(0.85 + 0.15 + 0.05)
    assert brute_optimum(IDS4, 2, 2, COUNTEREXAMPLE) == pytest.approx(1.4)
    assert greedy.total_score < 1.4 - 0.3
    exact = solve_backtracking(IDS4, COUNTEREXAMPLE, 2, 2)
    assert exact.total_score == pytest.approx(1.4)
    # D A / C B
    assert {p.fragment: (p.row, p.col) for p in exact.placements} == {
        "D": (0, 0),
        "A": (0, 1),
        "C": (1, 0),
        "B": (1, 1),
    }


# ---- properties --------------------------------------------------------------------------------------------
@pytest.mark.parametrize("solve", ["greedy", "best_first"])
@pytest.mark.parametrize("allow_rotation", [False, True])
def test_output_is_a_valid_layout_and_scores_add_up(solve, allow_rotation):
    for seed in range(25):
        rng = random.Random(seed)
        rows, cols = rng.choice([(2, 2), (2, 3), (3, 3), (1, 5)])
        ids = [f"F{i}" for i in range(rows * cols - rng.choice([0, 0, 1]))]
        compat = random_compat(ids, rng, 0.25)
        res = run(solve, ids, compat, rows, cols, allow_rotation)
        cells = [(p.row, p.col) for p in res.placements]
        frags = [p.fragment for p in res.placements]
        assert len(set(cells)) == len(cells) and len(set(frags)) == len(frags)
        assert set(frags) | set(res.meta["unplaced"]) == set(ids) and not set(frags) & set(res.meta["unplaced"])
        assert all(p.row >= 0 and p.col >= 0 for p in res.placements)
        h, w = max(r for r, _ in cells) + 1, max(c for _, c in cells) + 1
        assert (h <= rows and w <= cols) or (allow_rotation and h <= cols and w <= rows)
        assert all(0 <= p.rot < 4 and (allow_rotation or p.rot == 0) for p in res.placements)
        assert res.total_score == pytest.approx(recompute(res.placements, compat), abs=1e-3)


@pytest.mark.parametrize("solve", ["greedy", "best_first"])
def test_trace_cap_and_dropped_counts(solve):
    ids = [f"F{i}" for i in range(9)]
    compat = random_compat(ids, random.Random(4), 0.3)
    full = run(solve, ids, compat, 3, 3, trace_cap=1000)
    assert full.trace_dropped == {}
    for cap in (1, 3, 5):
        res = run(solve, ids, compat, 3, 3, trace_cap=cap)
        assert len(res.trace) == cap
        assert len(res.trace) + sum(res.trace_dropped.values()) == len(full.trace)
        assert [t["action"] for t in res.trace] == [t["action"] for t in full.trace[:cap]]
