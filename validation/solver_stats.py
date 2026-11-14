"""Pure helpers for the consolidated solver evaluation (T32): aggregation, spread, CSV output, table cells.

Nothing here runs a solver; ``run_benchmarks.py`` produces the raw per-run rows and calls these helpers, and the
unit tests in ``backend/tests/test_solver_stats.py`` pin their behaviour down with known data.
"""

from __future__ import annotations

import csv
import io
import math
import statistics
from collections import defaultdict
from pathlib import Path

# One row per (scenario, size, sample, seed, solver, variant). Every column except ``elapsed_ms`` is deterministic.
RUN_COLUMNS = [
    "scenario",
    "rotate",
    "noise",
    "erosion",
    "size",
    "n",
    "sample",
    "seed",
    "solver",
    "variant",
    "neighbour_accuracy",
    "direct_accuracy",
    "coverage",
    "total_score",
    "score_lookups",
    "heap_pushes",
    "heap_pops",
    "relaxations",
    "search_nodes",
    "operations_total",
    "truncated",
    "node_limit",
    "match_accuracy",
    "elapsed_ms",
]
TIME_COLUMNS = {"elapsed_ms"}
GROUP_KEYS = ["scenario", "rotate", "noise", "erosion", "size", "n", "solver", "variant"]
OP_COUNTERS = ["score_lookups", "heap_pushes", "heap_pops", "relaxations", "search_nodes"]
METRICS = ["neighbour_accuracy", "direct_accuracy", "coverage", "total_score", "operations_total", "match_accuracy"]
METRICS += OP_COUNTERS
SUMMARY_COLUMNS = (
    GROUP_KEYS
    + ["n_runs", "n_truncated"]
    + [f"{m}_{s}" for m in METRICS for s in ("mean", "sd")]
    + [
        "neighbour_accuracy_complete_mean",
        "neighbour_accuracy_truncated_mean",
        "elapsed_ms_mean",
        "elapsed_ms_sd",
        "elapsed_ms_complete_median",
        "elapsed_ms_truncated_median",
    ]
)
SUMMARY_TIME_COLUMNS = {c for c in SUMMARY_COLUMNS if c.startswith("elapsed_ms")}


# ---- statistics --------------------------------------------------------------------------------------
def mean_sd(values: list[float]) -> tuple[float, float]:
    """Mean and *sample* standard deviation (n - 1); the sd of a single value is 0."""
    if not values:
        raise ValueError("mean_sd of no values")
    return statistics.fmean(values), (statistics.stdev(values) if len(values) > 1 else 0.0)


def ci95(mean: float, sd: float, n: int) -> tuple[float, float]:
    """Normal-approximation 95 % interval of the mean (mean ± 1.96·sd/√n)."""
    half = 1.96 * sd / math.sqrt(n) if n > 0 else 0.0
    return mean - half, mean + half


def separated_below(low: tuple[float, float, int], high: tuple[float, float, int]) -> bool:
    """True when the 95 % interval of ``low`` lies entirely under that of ``high`` (cells are (mean, sd, runs))."""
    return ci95(*low)[1] < ci95(*high)[0]


def clear_winner(cells: dict[str, tuple[float, float, int]], higher_is_better: bool = True) -> str | None:
    """The solver whose 95 % interval lies strictly beyond every other solver's, or None when the spread does not
    support a ranking. ``cells`` maps name -> (mean, sd, runs)."""
    if len(cells) < 2:
        return None
    sign = 1 if higher_is_better else -1
    ranked = sorted(cells, key=lambda k: sign * cells[k][0], reverse=True)
    best = ranked[0]
    lo, hi = ci95(*cells[best])
    best_edge = lo if higher_is_better else hi
    for other in ranked[1:]:
        olo, ohi = ci95(*cells[other])
        if higher_is_better and not best_edge > ohi:
            return None
        if not higher_is_better and not best_edge < olo:
            return None
    return best


# ---- aggregation -------------------------------------------------------------------------------------
def _key(row: dict) -> tuple:
    return tuple(row[k] for k in GROUP_KEYS)


def aggregate(rows: list[dict]) -> list[dict]:
    """Mean and sd over the samples and seeds of each (scenario, size, solver, variant) cell, plus how many runs were
    truncated and the neighbour accuracy of truncated and complete runs kept apart."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[_key(r)].append(r)
    out = []
    for key, rs in groups.items():
        s = dict(zip(GROUP_KEYS, key, strict=True))
        s["n_runs"] = len(rs)
        s["n_truncated"] = sum(1 for r in rs if r["truncated"])
        for m in METRICS:
            vals = [r[m] for r in rs if r[m] is not None]
            s[f"{m}_mean"], s[f"{m}_sd"] = mean_sd(vals) if vals else (None, None)
        done = [r["neighbour_accuracy"] for r in rs if not r["truncated"]]
        cut = [r["neighbour_accuracy"] for r in rs if r["truncated"]]
        s["neighbour_accuracy_complete_mean"] = statistics.fmean(done) if done else None
        s["neighbour_accuracy_truncated_mean"] = statistics.fmean(cut) if cut else None
        times = [r["elapsed_ms"] for r in rs if r["elapsed_ms"] is not None]
        s["elapsed_ms_mean"], s["elapsed_ms_sd"] = mean_sd(times) if times else (None, None)
        tdone = [r["elapsed_ms"] for r in rs if r["elapsed_ms"] is not None and not r["truncated"]]
        tcut = [r["elapsed_ms"] for r in rs if r["elapsed_ms"] is not None and r["truncated"]]
        s["elapsed_ms_complete_median"] = statistics.median(tdone) if tdone else None
        s["elapsed_ms_truncated_median"] = statistics.median(tcut) if tcut else None
        out.append(s)
    return out


# ---- CSV (RFC 4180) ----------------------------------------------------------------------------------
def csv_cell(value: object) -> object:
    """None -> empty cell, booleans in lower case, floats rounded to 6 places (stable text)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return repr(round(value, 6))
    return value


def to_csv(rows: list[dict], columns: list[str]) -> str:
    """Header row, CRLF line ends, fields quoted only when they contain a comma, a quote or a line break."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(columns)
    for r in rows:
        w.writerow([csv_cell(r.get(c)) for c in columns])
    return buf.getvalue()


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        fh.write(to_csv(rows, columns))


_INT = {"size", "n", "seed", "score_lookups", "heap_pushes", "heap_pops", "relaxations", "search_nodes"}
_INT |= {"operations_total", "node_limit", "n_runs", "n_truncated"}
_FLOAT = {"noise", "erosion", "neighbour_accuracy", "direct_accuracy", "coverage", "total_score", "match_accuracy"}
_FLOAT |= {"elapsed_ms"}


def _parse(column: str, text: str) -> object:
    if text == "":
        return None
    if column in ("rotate", "truncated"):
        return text == "true"
    if column in _INT:
        return int(text)
    if column in _FLOAT or column.endswith(("_mean", "_sd", "_median")):
        return float(text)
    return text


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return [{c: _parse(c, v) for c, v in row.items()} for row in csv.DictReader(fh)]


# ---- table cells -------------------------------------------------------------------------------------
def pct_cell(mean: float | None, sd: float | None) -> str:
    """``87 ± 9%`` (whole percent points); ``—`` for a missing value."""
    if mean is None:
        return "—"
    return f"{mean * 100:.0f} ± {(sd or 0.0) * 100:.0f}%"


def num_cell(mean: float | None, sd: float | None, digits: int = 1) -> str:
    if mean is None:
        return "—"
    return f"{mean:,.{digits}f} ± {(sd or 0.0):,.{digits}f}"


def trunc_mark(n_truncated: int, n_runs: int) -> str:
    """``*`` plus the count (``2/12``) when any run hit the node limit, else an empty string."""
    return f"* ({n_truncated}/{n_runs} truncated)" if n_truncated else ""


def bold_if(text: str, winner: bool) -> str:
    return f"**{text}**" if winner else text


def strip_times(rows: list[dict], columns: list[str], time_columns: set[str]) -> list[tuple]:
    """Rows reduced to their deterministic columns (the reproduction check compares these)."""
    keep = [c for c in columns if c not in time_columns]
    return [tuple(csv_cell(r.get(c)) for c in keep) for r in rows]
