// Owner: A (Arvind)
// Pure data transforms for the Lab page (T28): benchmark runs → table rows, best-per-column, sorting, chart series,
// scaling points → per-algorithm series with gaps, the log-log fit and the plain-language reading. No React here, so
// every rule is unit-tested without a chart.
//
// Two shapes of `operations` exist and are never mixed silently:
//   - `RunDetail.operations` (benchmark, runs): an OBJECT of counters, e.g. {heap_pushes: 35, heap_pops: 35};
//   - `ScalingRunPoint.operations` (scaling): a single NUMBER, the total.
// `totalOperations` is the one conversion helper (object → number); a number passes through unchanged.
import type { Algorithm, RunDetail, ScalingOut, ScalingPoint } from "../api/types";
import { ALGORITHM_INFO } from "./solvers";

export const algorithmLabel = (a: string): string => ALGORITHM_INFO.find((i) => i.key === a)?.label ?? a;

/** Sum of an operation-counter object (non-numeric values are ignored); a plain number is returned as is. */
export function totalOperations(ops: Record<string, unknown> | number | null | undefined): number {
  if (typeof ops === "number") return ops;
  if (!ops) return 0;
  return Object.values(ops).reduce<number>((sum, v) => sum + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
}

// ---- benchmark table ---------------------------------------------------------------------
export interface BenchRow {
  algorithm: Algorithm;
  label: string;
  runId: string;
  elapsed_ms: number;
  operations: number;
  breakdown: [string, number][];
  total_score: number;
  neighbour_accuracy: number | null;
  direct_accuracy: number | null;
  coverage: number | null;
  truncated: boolean;
}

export function benchmarkRows(runs: readonly RunDetail[]): BenchRow[] {
  return runs.map((r) => ({
    algorithm: r.algorithm as Algorithm,
    label: algorithmLabel(r.algorithm),
    runId: r.id,
    elapsed_ms: r.elapsed_ms,
    operations: totalOperations(r.operations),
    breakdown: Object.entries(r.operations ?? {})
      .filter((e): e is [string, number] => typeof e[1] === "number")
      .sort((a, b) => b[1] - a[1]),
    total_score: r.total_score,
    neighbour_accuracy: r.neighbour_accuracy ?? null,
    direct_accuracy: r.direct_accuracy ?? null,
    coverage: r.coverage ?? null,
    truncated: r.truncated,
  }));
}

export type NumericColumn =
  "elapsed_ms" | "operations" | "total_score" | "neighbour_accuracy" | "direct_accuracy" | "coverage";
export type SortKey = "algorithm" | NumericColumn | "truncated";

/** Which direction is better for a column. */
export const BETTER: Record<NumericColumn, "low" | "high"> = {
  elapsed_ms: "low",
  operations: "low",
  total_score: "high",
  neighbour_accuracy: "high",
  direct_accuracy: "high",
  coverage: "high",
};

const EPS = 1e-9;

/** Algorithms holding the best value of each column (ties share it). Empty when there is nothing to compare. */
export function bestPerColumn(rows: readonly BenchRow[]): Record<NumericColumn, Set<Algorithm>> {
  const out = {} as Record<NumericColumn, Set<Algorithm>>;
  for (const col of Object.keys(BETTER) as NumericColumn[]) {
    const values = rows
      .map((r) => ({ a: r.algorithm, v: r[col] }))
      .filter((x): x is { a: Algorithm; v: number } => x.v !== null);
    const best = new Set<Algorithm>();
    if (values.length > 1) {
      const target = (BETTER[col] === "low" ? Math.min : Math.max)(...values.map((x) => x.v));
      // A column where every value is equal has no winner.
      if (values.some((x) => Math.abs(x.v - target) > EPS))
        for (const x of values) if (Math.abs(x.v - target) <= EPS) best.add(x.a);
    }
    out[col] = best;
  }
  return out;
}

/** Stable sort; `null` always last, whichever direction. */
export function sortRows(rows: readonly BenchRow[], key: SortKey, dir: "asc" | "desc"): BenchRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (r: BenchRow): string | number | null =>
    key === "truncated" ? Number(r.truncated) : key === "algorithm" ? r.label : r[key];
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const a = value(x.r);
      const b = value(y.r);
      if (a === null && b === null) return x.i - y.i;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = typeof a === "string" ? a.localeCompare(String(b)) : a - (b as number);
      return c === 0 ? x.i - y.i : c * sign;
    })
    .map((x) => x.r);
}

// ---- benchmark chart series --------------------------------------------------------------
export type BenchMeasure = NumericColumn;

export const MEASURE_LABEL: Record<BenchMeasure, string> = {
  elapsed_ms: "Time (ms)",
  operations: "Operations",
  total_score: "Total score",
  neighbour_accuracy: "Neighbour accuracy",
  direct_accuracy: "Direct accuracy",
  coverage: "Coverage",
};

/** A log axis cannot show 0 or negatives: they become gaps (null), never a fake value. */
export const logSafe = (v: number | null | undefined): number | null => (typeof v === "number" && v > 0 ? v : null);

/** One category per measure, one key per algorithm (so bars are grouped by measure and coloured by algorithm). */
export interface MeasureDatum {
  measure: BenchMeasure;
  label: string;
  [algorithm: string]: string | number | null;
}

export function barSeries(
  rows: readonly BenchRow[],
  measures: readonly BenchMeasure[],
  logScale = false,
): MeasureDatum[] {
  return measures.map((m) => {
    const d: MeasureDatum = { measure: m, label: MEASURE_LABEL[m] };
    for (const r of rows) d[r.algorithm] = logScale ? logSafe(r[m]) : r[m];
    return d;
  });
}

// ---- reading of the result ---------------------------------------------------------------
const f = (v: number, d = 2) => v.toLocaleString("en", { maximumFractionDigits: d });
const pct = (v: number) => `${f(v * 100, 1)}%`;

/** Plain-language sentences computed from the rows, never fixed text. */
export function readResult(rows: readonly BenchRow[]): string[] {
  const out: string[] = [];
  if (rows.length === 0) return out;
  if (rows.length > 1) {
    const byTime = [...rows].sort((a, b) => a.elapsed_ms - b.elapsed_ms);
    const fast = byTime[0];
    const slow = byTime[byTime.length - 1];
    out.push(
      fast.elapsed_ms > 0
        ? `${fast.label} was fastest (${f(fast.elapsed_ms)} ms); ${slow.label} took ${f(slow.elapsed_ms / fast.elapsed_ms, 1)}× as long (${f(slow.elapsed_ms)} ms).`
        : `${fast.label} was fastest; ${slow.label} took ${f(slow.elapsed_ms)} ms.`,
    );
  }
  const greedy = rows.find((r) => r.algorithm === "greedy");
  const bt = rows.find((r) => r.algorithm === "backtracking");
  if (greedy && bt) {
    const d = bt.total_score - greedy.total_score;
    const slower = greedy.elapsed_ms > 0 ? ` and took ${f(bt.elapsed_ms / greedy.elapsed_ms, 1)}× as long` : "";
    out.push(
      Math.abs(d) <= 1e-6
        ? `Backtracking matched greedy's total score (${f(bt.total_score, 3)})${slower}.`
        : `Backtracking scored ${f(Math.abs(d), 3)} ${d > 0 ? "above" : "below"} greedy (${f(bt.total_score, 3)} vs ${f(greedy.total_score, 3)})${slower}.`,
    );
  } else if (rows.length > 1) {
    const top = [...rows].sort((a, b) => b.total_score - a.total_score);
    out.push(
      top[0].total_score - top[top.length - 1].total_score <= 1e-6
        ? `All solvers reached the same total score (${f(top[0].total_score, 3)}).`
        : `${top[0].label} had the highest total score (${f(top[0].total_score, 3)}).`,
    );
  }
  const withAcc = rows.filter((r) => r.direct_accuracy !== null);
  if (withAcc.length === 0) out.push("No ground truth: accuracy is not available for this artifact.");
  else {
    const best = Math.max(...withAcc.map((r) => r.direct_accuracy as number));
    const names = withAcc.filter((r) => r.direct_accuracy === best).map((r) => r.label);
    out.push(`Highest direct accuracy: ${names.join(", ")} (${pct(best)}).`);
  }
  for (const r of rows.filter((x) => x.truncated))
    out.push(`${r.label} hit its node limit: its layout is the best found, not guaranteed optimal.`);
  return out;
}

// ---- scaling ----------------------------------------------------------------------------
export type ScalingMeasure = "elapsed_ms" | "operations" | "neighbour_accuracy" | "direct_accuracy";

export interface ScalingDatum {
  n: number;
  size: number;
  /** One key per algorithm: the value, or `null` for a gap (the backend skipped it, or a log axis cannot show it). */
  [algorithm: string]: number | boolean | null;
}

/** Truncation flags live under `trunc:<algorithm>` so a chart can draw a hollow marker for them. */
export const truncKey = (a: string) => `trunc:${a}`;

export function scalingSeries(
  points: readonly ScalingPoint[],
  measure: ScalingMeasure,
  algorithms: readonly Algorithm[],
  logY = false,
): ScalingDatum[] {
  return [...points]
    .sort((a, b) => a.n - b.n)
    .map((p) => {
      const d: ScalingDatum = { n: p.n, size: p.size };
      for (const a of algorithms) {
        const run = p.runs[a];
        const v = run ? run[measure] : null;
        d[a] = logY ? logSafe(v) : (v ?? null);
        d[truncKey(a)] = run?.truncated ?? false;
      }
      return d;
    });
}

/** Algorithms that appear in any point, in the canonical order. */
export function scalingAlgorithms(out: ScalingOut): Algorithm[] {
  const seen = new Set<string>();
  for (const p of out.points) for (const a of Object.keys(p.runs)) seen.add(a);
  return ALGORITHM_INFO.map((i) => i.key).filter((k) => seen.has(k));
}

export interface Fit {
  /** y ≈ coefficient · x^exponent */
  exponent: number;
  coefficient: number;
  r2: number;
  points: number;
}

/**
 * Least-squares line through (ln x, ln y). Needs 3 or more positive points; returns null otherwise.
 * The caller decides which points count (the Lab drops truncated ones: a capped search stops growing).
 */
export function fitLogLog(pts: readonly { x: number; y: number }[]): Fit | null {
  const p = pts.filter((q) => q.x > 0 && q.y > 0 && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (p.length < 3) return null;
  const xs = p.map((q) => Math.log(q.x));
  const ys = p.map((q) => Math.log(q.y));
  const n = p.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { exponent: slope, coefficient: Math.exp(intercept), r2, points: n };
}

/** Fit of one algorithm's measure against n, over its non-truncated points. */
export function fitSeries(
  points: readonly ScalingPoint[],
  algorithm: Algorithm,
  measure: "elapsed_ms" | "operations",
): Fit | null {
  return fitLogLog(
    points.flatMap((p) => {
      const run = p.runs[algorithm];
      return run && !run.truncated ? [{ x: p.n, y: run[measure] }] : [];
    }),
  );
}

export const fitValue = (fit: Fit, x: number) => fit.coefficient * x ** fit.exponent;

export interface MatchRow {
  size: number;
  n: number;
  elapsed_ms: number;
  scored: number;
  skipped: number;
  total: number;
  accuracy: number | null;
}

export function matchRows(points: readonly ScalingPoint[]): MatchRow[] {
  return [...points]
    .sort((a, b) => a.n - b.n)
    .map((p) => ({
      size: p.size,
      n: p.n,
      elapsed_ms: p.match.elapsed_ms,
      scored: p.match.side_pairs_scored,
      skipped: p.match.side_pairs_skipped,
      total: p.match.side_pairs_total,
      accuracy: p.match.match_accuracy ?? null,
    }));
}
