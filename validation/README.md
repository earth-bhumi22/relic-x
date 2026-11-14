# Validation

Reproducible experiments with fixed seeds. Run from the repo root after `pip install -e backend`.

| Script | Owner | Output |
|---|---|---|
| `run_benchmarks.py` | A | Solver evaluation (accuracy, time, operations vs n; T32) and the T14–T17 sections → `results.md`, `solver_*.svg`, `solver_runs.csv`, `solver_summary.csv` |
| `matcher_experiments.py` | B | Strings & Matching experiments (T10–T13, consolidated in T31) → `matcher_results.md` + `matcher_*.svg` |

## Solver evaluation (T32)

```bash
python validation/run_benchmarks.py                  # everything: results.md, every chart, both CSVs
python validation/run_benchmarks.py --solvers-only   # only the consolidated solver evaluation (T32) and its CSVs
python validation/run_benchmarks.py --quick          # small set; writes to validation/_quick/ (git-ignored), not the committed files
python validation/run_benchmarks.py --check          # reproduction check of the committed numbers (about 15 s)
python validation/run_benchmarks.py --graph-only | --greedy-bf-only | --dijkstra-only | --backtracking-only   # T14 / T15 / T16 / T17 sections
```

| Run | Time on the reference machine (Apple silicon laptop, Python 3.14) |
|---|---|
| `--solvers-only` (full) | about 4 minutes (372 instances × 4 solvers × real/oracle) |
| `--quick` | about 15 seconds |
| `--check` | about 15 seconds |
| default run (T32 + T14–T17 sections) | about 276 s (4 min 36 s) on the development laptop, Python 3.14 |

What is run: grids 2×2 … 8×8; scenarios `clean`, `damaged` (noise 4, erosion 0.3) and `damaged + rotation`; a noise sweep
and an erosion sweep at 5×5; three samples × four seeds (N = 12 runs per cell); backtracking always with a node limit
(50,000). Every instance is solved twice: with the real matcher, and with an **oracle** matcher that contains exactly the
true adjacent side pairs, so a low solver accuracy can be attributed to the solver (the oracle result) or to the matcher
(the drop from oracle to real).

### How to read a cell

- `87 ± 9%` is the **mean ± standard deviation over the N runs** of that cell (samples × seeds).
- A **bold** value is the only one whose 95 % interval (mean ± 1.96·sd/√N) lies above every other solver's. Without bold,
  the spread does not support a ranking.
- `* (2/12 truncated)` (backtracking only): 2 of the 12 runs hit the node limit and returned their best-so-far. The
  separate "truncated vs. complete runs" table reports the two kinds apart.
- `—` means no value (for example no complete backtracking run at that n).
- `a% → b%` in the oracle tables is neighbour accuracy with the real matcher → with the ground-truth adjacency.
- Time columns are machine-dependent (best of 3 solver runs); everything else is deterministic.

### CSV files

Both are RFC 4180 (CRLF, a header row, fields quoted only when needed, `null` as an empty cell, booleans as `true` /
`false`), in a stable column order, and committed together with the run that produced them.

- `solver_runs.csv` — one row per (scenario, size, sample, seed, solver, variant). Columns: `scenario, rotate, noise,
  erosion, size, n, sample, seed, solver, variant, neighbour_accuracy, direct_accuracy, coverage, total_score,
  score_lookups, heap_pushes, heap_pops, relaxations, search_nodes, operations_total, truncated, node_limit,
  match_accuracy, elapsed_ms`. `variant` is `real` or `oracle` (oracle rows have no time). Only `elapsed_ms` varies
  between runs.
- `solver_summary.csv` — the aggregate per (scenario, noise, erosion, size, solver, variant): `n_runs`, `n_truncated`, and
  mean and sd of every metric, plus complete-run and truncated-run accuracy and time separately.

The Lab page's CSV export (T28) uses the same metric names (`neighbour_accuracy`, `direct_accuracy`, `coverage`,
`truncated`, the counters), so the two can be compared column by column.

### Reproduction check

`--check` (also run by `backend/tests/test_solver_stats.py`) (1) re-runs the quick configuration, which is a subset of the
full one, and compares every deterministic column with the committed `solver_runs.csv`; (2) recomputes
`solver_summary.csv` from the committed runs; (3) re-renders the T32 block of `results.md` and the charts from the
committed CSVs and compares them with the committed files. Time columns are never compared. It exits with status 1 and
lists the differences when anything is out of date; refresh with `--solvers-only` and commit the result.
