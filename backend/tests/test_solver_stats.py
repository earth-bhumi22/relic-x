"""T32: unit tests for the pure helpers behind validation/run_benchmarks.py's solver evaluation, plus a quick
end-to-end check of the oracle matcher and the reproduction check on tiny inputs."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

VALIDATION = Path(__file__).resolve().parents[2] / "validation"
sys.path.insert(0, str(VALIDATION))

import run_benchmarks as rb  # noqa: E402
import solver_stats as ss  # noqa: E402

from relicx.engine import SolveParams, Truth, run_solver  # noqa: E402
from relicx.engine.metrics import neighbour_accuracy  # noqa: E402


def run_row(**over):
    base = {
        "scenario": "damaged",
        "rotate": False,
        "noise": 4.0,
        "erosion": 0.3,
        "size": 3,
        "n": 9,
        "sample": "mosaic-tile",
        "seed": 1,
        "solver": "greedy",
        "variant": "real",
        "neighbour_accuracy": 0.5,
        "direct_accuracy": 0.5,
        "coverage": 1.0,
        "total_score": 3.0,
        "operations_total": 10,
        "truncated": False,
        "match_accuracy": 0.9,
        "elapsed_ms": 1.0,
    }
    base.update({k: 0 for k in ss.OP_COUNTERS})
    base.update(over)
    return base


# ---- mean, sd, interval ----------------------------------------------------------------------------
def test_mean_sd_is_the_sample_standard_deviation():
    mean, sd = ss.mean_sd([2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0])
    assert mean == 5.0
    assert sd == pytest.approx(math.sqrt(32 / 7))  # n - 1 in the denominator


def test_sd_of_one_value_is_zero_and_empty_input_is_an_error():
    assert ss.mean_sd([3.0]) == (3.0, 0.0)
    with pytest.raises(ValueError):
        ss.mean_sd([])


def test_ci95_is_symmetric_and_shrinks_with_more_runs():
    lo, hi = ss.ci95(10.0, 2.0, 16)
    assert (lo, hi) == pytest.approx((10 - 1.96 * 0.5, 10 + 1.96 * 0.5))
    assert ss.ci95(10.0, 2.0, 64)[1] - ss.ci95(10.0, 2.0, 64)[0] < hi - lo


def test_clear_winner_needs_non_overlapping_intervals():
    cells = {"a": (0.90, 0.02, 12), "b": (0.50, 0.02, 12), "c": (0.60, 0.02, 12)}
    assert ss.clear_winner(cells) == "a"
    close = {"a": (0.80, 0.20, 12), "b": (0.74, 0.20, 12)}  # difference inside the spread
    assert ss.clear_winner(close) is None
    assert ss.clear_winner({"a": (1.0, 0.0, 12)}) is None
    assert ss.clear_winner({"fast": (1.0, 0.1, 12), "slow": (5.0, 0.1, 12)}, higher_is_better=False) == "fast"


def test_separated_below():
    assert ss.separated_below((0.3, 0.05, 12), (0.9, 0.05, 12))
    assert not ss.separated_below((0.8, 0.2, 12), (0.9, 0.2, 12))


# ---- aggregation ---------------------------------------------------------------------------------------
def test_aggregate_mean_sd_and_run_count():
    rows = [run_row(seed=s, neighbour_accuracy=a) for s, a in enumerate([0.2, 0.4, 0.6], start=1)]
    (cell,) = ss.aggregate(rows)
    assert cell["n_runs"] == 3 and cell["n_truncated"] == 0
    assert cell["neighbour_accuracy_mean"] == pytest.approx(0.4)
    assert cell["neighbour_accuracy_sd"] == pytest.approx(0.2)


def test_aggregate_keeps_truncated_and_complete_runs_apart():
    rows = [
        run_row(solver="backtracking", seed=1, neighbour_accuracy=1.0, truncated=False, elapsed_ms=2.0),
        run_row(solver="backtracking", seed=2, neighbour_accuracy=0.5, truncated=True, elapsed_ms=200.0),
        run_row(solver="backtracking", seed=3, neighbour_accuracy=0.7, truncated=True, elapsed_ms=220.0),
    ]
    (cell,) = ss.aggregate(rows)
    assert (cell["n_runs"], cell["n_truncated"]) == (3, 2)
    assert cell["neighbour_accuracy_complete_mean"] == 1.0
    assert cell["neighbour_accuracy_truncated_mean"] == pytest.approx(0.6)
    assert cell["elapsed_ms_complete_median"] == 2.0
    assert cell["elapsed_ms_truncated_median"] == 210.0


def test_aggregate_groups_by_scenario_size_solver_and_variant():
    rows = [run_row(), run_row(variant="oracle", elapsed_ms=None), run_row(solver="dijkstra"), run_row(size=4, n=16)]
    cells = ss.aggregate(rows)
    assert len(cells) == 4
    oracle = next(c for c in cells if c["variant"] == "oracle")
    assert oracle["elapsed_ms_mean"] is None  # the oracle is not timed


def test_aggregate_is_deterministic_apart_from_time():
    a = [run_row(seed=s, elapsed_ms=1.0 + s) for s in range(4)]
    b = [run_row(seed=s, elapsed_ms=9.0 * s) for s in range(4)]
    cols, tcols = ss.SUMMARY_COLUMNS, ss.SUMMARY_TIME_COLUMNS
    assert ss.strip_times(ss.aggregate(a), cols, tcols) == ss.strip_times(ss.aggregate(b), cols, tcols)
    assert ss.aggregate(a)[0]["elapsed_ms_mean"] != ss.aggregate(b)[0]["elapsed_ms_mean"]


# ---- CSV writer (RFC 4180) -------------------------------------------------------------------------------
def test_csv_quotes_commas_quotes_and_newlines():
    text = ss.to_csv([{"a": 'x,"y"', "b": "line1\nline2", "c": "plain"}], ["a", "b", "c"])
    assert text == 'a,b,c\r\n"x,""y""","line1\nline2",plain\r\n'


def test_csv_null_is_empty_booleans_lower_case_and_header_is_first():
    text = ss.to_csv([{"a": None, "b": True, "c": False, "d": 0.1 + 0.2}], ["a", "b", "c", "d"])
    assert text.splitlines()[0] == "a,b,c,d"
    assert text.splitlines()[1] == ",true,false,0.3"


def test_csv_column_order_is_the_given_one_and_extra_keys_are_ignored():
    assert ss.to_csv([{"b": 2, "a": 1, "z": 9}], ["a", "b"]) == "a,b\r\n1,2\r\n"


def test_csv_round_trip_through_a_file(tmp_path):
    rows = [run_row(), run_row(seed=2, solver="backtracking", truncated=True, node_limit=50000, elapsed_ms=None)]
    path = tmp_path / "runs.csv"
    ss.write_csv(path, rows, ss.RUN_COLUMNS)
    assert path.read_text().splitlines()[0] == ",".join(ss.RUN_COLUMNS)
    back = ss.read_csv(path)
    assert back[1]["truncated"] is True and back[0]["truncated"] is False
    assert back[1]["elapsed_ms"] is None and back[1]["node_limit"] == 50000
    assert back[0]["neighbour_accuracy"] == 0.5 and back[0]["size"] == 3


def test_run_and_summary_columns_are_stable():
    assert ss.RUN_COLUMNS[:10] == [
        "scenario", "rotate", "noise", "erosion", "size", "n", "sample", "seed", "solver", "variant",
    ]  # fmt: skip
    assert ss.RUN_COLUMNS[-1] == "elapsed_ms" and {"elapsed_ms"} == ss.TIME_COLUMNS
    assert "n_truncated" in ss.SUMMARY_COLUMNS and "neighbour_accuracy_sd" in ss.SUMMARY_COLUMNS


# ---- table cells ---------------------------------------------------------------------------------------
def test_cells_show_mean_sd_dash_and_the_truncation_count():
    assert ss.pct_cell(0.874, 0.093) == "87 ± 9%"
    assert ss.pct_cell(None, None) == "—"
    assert ss.num_cell(1234.5, 0.25, 1) == "1,234.5 ± 0.2"
    assert ss.trunc_mark(0, 12) == ""
    assert ss.trunc_mark(2, 12) == "* (2/12 truncated)"
    assert ss.bold_if("x", True) == "**x**" and ss.bold_if("x", False) == "x"


# ---- fits ---------------------------------------------------------------------------------------------
def test_loglog_fit_recovers_a_power_law():
    ns = [4, 9, 16, 25, 36]
    slope, r2 = rb.loglog_fit(ns, [3 * n**2.5 for n in ns])
    assert slope == pytest.approx(2.5) and r2 == pytest.approx(1.0)


def test_linear_fit_known_line():
    slope, intercept, r2 = rb.linear_fit([1, 2, 3, 4], [3, 5, 7, 9])
    assert (slope, intercept, r2) == pytest.approx((2.0, 1.0, 1.0))


def test_sv_fit_skips_truncated_sizes_and_needs_three_points():
    def cell(size, ops, truncated):
        return {
            "scenario": "damaged",
            "size": size,
            "solver": "greedy",
            "variant": "real",
            "noise": 4.0,
            "erosion": 0.3,
            "n_truncated": 1 if truncated else 0,
            "operations_total_mean": float(ops),
        }

    cells = [cell(s, s**4, False) for s in (2, 3, 4, 5)] + [cell(6, 10, True)]  # n = size**2, so ops = n**2
    idx = rb.SvIndex(cells)
    slope, r2, points = rb.sv_fit(idx, "damaged", "greedy", [2, 3, 4, 5, 6], "operations_total")
    assert (round(slope, 6), round(r2, 6), points) == (2.0, 1.0, 4)  # the truncated size 6 is left out
    assert rb.sv_fit(idx, "damaged", "greedy", [2, 3, 6], "operations_total") is None


# ---- oracle matcher -------------------------------------------------------------------------------------
def test_oracle_match_lists_exactly_the_true_adjacencies():
    truth = {f"F{r * 2 + c + 1:02d}": Truth(r, c, 0) for r in range(2) for c in range(2)}
    match = rb.oracle_match(truth)
    assert len(match.matches) == 4  # 2×2 grid: 2 horizontal + 2 vertical pairs
    assert {(m.side_a, m.side_b) for m in match.matches} == {(1, 3), (2, 0)}
    assert all(m.composite == 1.0 for m in match.matches)


def test_oracle_with_rotation_uses_the_scrambled_sides():
    truth = {"F01": Truth(0, 0, 1), "F02": Truth(0, 1, 2)}
    (m,) = rb.oracle_match(truth).matches
    # east side of F01 (turned once) is now side 2; west side of F02 (turned twice) is now side (3 + 2) % 4 = 1
    assert (m.a, m.side_a, m.b, m.side_b) == ("F01", 2, "F02", 1)


def test_every_solver_is_perfect_with_the_oracle_on_a_small_grid():
    inst = rb.sv_instance(
        "mosaic-tile", 3, "damaged", False, 4.0, 0.3, 1, rb.SvConfig([3], [1], [], 5000, 1, 3, [], [])
    )
    oracle = [r for r in inst if r["variant"] == "oracle"]
    assert len(oracle) == 4 and all(r["neighbour_accuracy"] == 1.0 for r in oracle)
    assert all(r["elapsed_ms"] is None for r in oracle) and all(r["match_accuracy"] == 1.0 for r in oracle)
    real = [r for r in inst if r["variant"] == "real"]
    assert all(r["elapsed_ms"] > 0 for r in real)
    assert neighbour_accuracy is not None and run_solver is not None and SolveParams is not None  # engine API in use


# ---- determinism and the reproduction check --------------------------------------------------------------
def test_instances_are_deterministic_apart_from_time():
    cfg = rb.SvConfig([3], [1], [], 2000, 1, 3, [], [])
    a = rb.sv_instance("pottery-band", 3, "damaged + rotation", True, 4.0, 0.3, 2, cfg)
    b = rb.sv_instance("pottery-band", 3, "damaged + rotation", True, 4.0, 0.3, 2, cfg)
    cols = [c for c in ss.RUN_COLUMNS if c not in ss.TIME_COLUMNS]
    assert ss.strip_times(a, ss.RUN_COLUMNS, ss.TIME_COLUMNS) == ss.strip_times(b, ss.RUN_COLUMNS, ss.TIME_COLUMNS)
    assert len(cols) == len(ss.RUN_COLUMNS) - 1


def test_quick_configuration_is_a_subset_of_the_full_one():
    quick, full = rb.SV_QUICK, rb.SV_FULL
    assert set(quick.sizes) <= set(full.sizes) and set(quick.seeds) <= set(full.seeds)
    assert set(quick.noises) <= set(full.noises) and set(quick.erosions) <= set(full.erosions)
    assert quick.node_limit == full.node_limit and quick.sweep_size == full.sweep_size


def test_committed_results_reproduce(capsys):
    """The reproduction check: regenerates the quick set and compares its deterministic columns with the committed
    solver_runs.csv, re-aggregates the summary, and re-renders results.md and the charts from the committed CSVs."""
    code = rb.sv_check()
    assert code == 0, capsys.readouterr().out
