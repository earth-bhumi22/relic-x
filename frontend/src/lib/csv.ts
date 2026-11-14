// Owner: A (Arvind)
// CSV export (T28). The client builds the CSV from the benchmark / scaling JSON it already shows, so the file always
// matches the screen. `downloadCsv(kind, …)` is the single entry point: CSV_SOURCE below is the one-line switch to
// B's server endpoints (T21: GET /artifacts/{id}/benchmark.csv, POST /benchmark/scaling.csv).
//
// Column names and order match the server CSVs of T21 (services/exports.py), so the two sources are interchangeable.
// Differences to know: booleans are written `true` / `false` (the server writes Python's `True` / `False`), and lines
// end with CRLF (RFC 4180; the server uses LF).
import { fetchCsv } from "../api/client";
import type { ArtifactOut, RunDetail, ScalingOut, ScalingRequest } from "../api/types";
import { totalOperations } from "./labData";

export type Cell = string | number | boolean | null | undefined;
export type Row = Record<string, Cell>;

/** A spreadsheet treats a cell that starts with one of these as a formula (CSV injection, OWASP). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as RFC 4180 text: `null` → empty, formula-looking text → prefixed with `'`, quoting when needed. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus one row per record, columns in the given order, CRLF line endings. */
export function toCsv(rows: readonly Row[], columns: readonly string[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ---- datasets ---------------------------------------------------------------------------
export const BENCHMARK_COLUMNS = [
  "algorithm",
  "run_id",
  "created_at",
  "elapsed_ms",
  "operations_total",
  "total_score",
  "neighbour_accuracy",
  "direct_accuracy",
  "coverage",
  "truncated",
  "search_nodes",
  "conflicts",
  "node_limit",
  "threshold",
  "top_k",
] as const;

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function benchmarkCsvRows(runs: readonly RunDetail[]): Row[] {
  return runs.map((r) => ({
    algorithm: r.algorithm,
    run_id: r.id,
    created_at: r.created_at,
    elapsed_ms: r.elapsed_ms,
    operations_total: totalOperations(r.operations),
    total_score: r.total_score,
    neighbour_accuracy: r.neighbour_accuracy,
    direct_accuracy: r.direct_accuracy,
    coverage: r.coverage,
    truncated: r.truncated,
    search_nodes: num(r.meta?.nodes),
    conflicts: num(r.meta?.conflicts),
    node_limit: num(r.params?.node_limit),
    threshold: num(r.params?.threshold),
    top_k: num(r.params?.top_k),
  }));
}

export const SCALING_COLUMNS = [
  "size",
  "n",
  "algorithm",
  "elapsed_ms",
  "operations",
  "total_score",
  "neighbour_accuracy",
  "direct_accuracy",
  "coverage",
  "truncated",
  "match_accuracy",
  "match_elapsed_ms",
] as const;

/** One row per (size, algorithm); an algorithm the backend skipped at a size simply has no row. */
export function scalingCsvRows(out: ScalingOut): Row[] {
  return out.points.flatMap((p) =>
    Object.entries(p.runs).map(([algorithm, run]) => ({
      size: p.size,
      n: p.n,
      algorithm,
      elapsed_ms: run.elapsed_ms,
      operations: run.operations, // a single total here (not the counter object of RunDetail)
      total_score: run.total_score,
      neighbour_accuracy: run.neighbour_accuracy,
      direct_accuracy: run.direct_accuracy,
      coverage: run.coverage,
      truncated: run.truncated,
      match_accuracy: p.match.match_accuracy,
      match_elapsed_ms: p.match.elapsed_ms,
    })),
  );
}

// ---- file names and download -------------------------------------------------------------
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
const day = (d: Date) => d.toISOString().slice(0, 10);

/** `relicx-benchmark-mosaic-tile-2026-11-14.csv` */
export const benchmarkFileName = (artifactName: string, now = new Date()) =>
  `relicx-benchmark-${slug(artifactName)}-${day(now)}.csv`;
/** `relicx-scaling-mosaic-tile-2026-11-14.csv` (`-rotated` when the pieces were rotated). */
export const scalingFileName = (sample: string, rotate: boolean, now = new Date()) =>
  `relicx-scaling-${slug(sample)}${rotate ? "-rotated" : ""}-${day(now)}.csv`;

/** Saves text as a file: Blob → object URL → click → revoke. */
export function saveText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type CsvKind = "benchmark" | "scaling";

/**
 * THE one-line switch. "client" builds the file from the data on screen; "server" asks B's T21 endpoints.
 * Why "client" today: the file then always equals what the user sees, and `/benchmark/scaling.csv` would re-run the
 * whole (rate-limited, 429) experiment just to export it.
 */
export const CSV_SOURCE: Record<CsvKind, "client" | "server"> = { benchmark: "client", scaling: "client" };

export type CsvRequest =
  | { kind: "benchmark"; artifact: Pick<ArtifactOut, "id" | "name">; runs: readonly RunDetail[]; now?: Date }
  | { kind: "scaling"; request: ScalingRequest; result: ScalingOut; now?: Date };

export async function downloadCsv(
  req: CsvRequest,
  source: "client" | "server" = CSV_SOURCE[req.kind],
): Promise<string> {
  const now = req.now ?? new Date();
  if (req.kind === "benchmark") {
    const name = benchmarkFileName(req.artifact.name, now);
    const text =
      source === "server"
        ? (await fetchCsv(`/artifacts/${req.artifact.id}/benchmark.csv`)).text
        : toCsv(benchmarkCsvRows(req.runs), BENCHMARK_COLUMNS);
    saveText(text, name);
    return name;
  }
  const name = scalingFileName(req.result.sample, req.result.rotate, now);
  const text =
    source === "server"
      ? (await fetchCsv("/benchmark/scaling.csv", { method: "POST", body: JSON.stringify(req.request) })).text
      : toCsv(scalingCsvRows(req.result), SCALING_COLUMNS);
  saveText(text, name);
  return name;
}
