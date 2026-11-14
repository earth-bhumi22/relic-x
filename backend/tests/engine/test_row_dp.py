"""T17: row-profile DP for 2 x n strips must equal the exhaustive optimum and un-truncated backtracking."""

import random

import pytest
from test_backtracking import check_valid, exhaustive, ids_of, random_compat, recompute

from relicx.engine.solvers import solve_backtracking
from relicx.engine.solvers.row_dp import solve_row_dp


@pytest.mark.parametrize(("cols", "rotation", "tables"), [(2, False, 25), (2, True, 8), (3, False, 12), (3, True, 3)])
def test_dp_equals_exhaustive_and_backtracking(cols, rotation, tables):
    ids = ids_of(2 * cols)
    rots = [0, 1, 2, 3] if rotation else [0]
    for seed in range(tables):
        rng = random.Random(seed)
        compat = random_compat(ids, rng, rng.choice([0.2, 0.5]), quantised=seed % 3 == 0)
        dp = solve_row_dp(ids, compat, cols, rotation)
        bt = solve_backtracking(ids, compat, 2, cols, rotation, node_limit=10**9)
        assert dp.total_score == pytest.approx(bt.total_score, abs=1e-3), seed
        if cols == 2 or (cols == 3 and not rotation):
            assert dp.total_score == pytest.approx(exhaustive(ids, 2, cols, rots, compat), abs=1e-3)
        check_valid(dp, ids, 2, cols, rotation)
        assert dp.total_score == pytest.approx(recompute(dp.placements, compat), abs=1e-3)
        assert len(dp.placements) == 2 * cols


def test_dp_equals_backtracking_on_2x4_seeded():
    ids = ids_of(8)
    for seed in range(6):
        compat = random_compat(ids, random.Random(seed), 0.3)
        dp = solve_row_dp(ids, compat, 4)
        bt = solve_backtracking(ids, compat, 2, 4, node_limit=10**9)
        assert dp.total_score == pytest.approx(bt.total_score, abs=1e-3)


def test_dp_is_deterministic_and_counts_states():
    ids = ids_of(6)
    compat = random_compat(ids, random.Random(1), 0.4)
    a, b = solve_row_dp(ids, compat, 3), solve_row_dp(ids, compat, 3)
    assert a.placements == b.placements and a.meta == b.meta
    assert a.meta["states_stored"] > 0 and a.algorithm == "row_dp"


def test_dp_rejects_wrong_fragment_count_and_state_blowup():
    with pytest.raises(ValueError):
        solve_row_dp(ids_of(5), {}, 3)
    with pytest.raises(ValueError, match="state limit"):
        solve_row_dp(ids_of(8), {}, 4, max_states=10)


def test_dp_is_not_registered_as_a_solver():
    from relicx.engine.solvers import ALGORITHMS

    assert "row_dp" not in ALGORITHMS
