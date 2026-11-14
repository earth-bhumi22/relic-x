// Owner: A (Arvind)
// Matching panel: has matching run for this artifact, a "Run matching" button with optional advanced parameters,
// progress, the resulting stats, and the API error on failure. Also exports <MatchRequired>, the prompt other pages
// (graph, explain, reconstruct) show instead of a dead 409 `precondition_failed` error.
import { useState } from "react";
import type { FormEvent } from "react";
import type { MatchRequest } from "../api/client";
import type { MatchSummary } from "../api/types";
import { ApiError } from "../api/errors";
import { useMatchRunner } from "../hooks/useMatchStatus";
import ErrorState from "./ErrorState";

interface PanelProps {
  artifactId: string;
  /** Stats from the artifact (`match_stats`), or null if matching has not run. */
  stats: MatchSummary["stats"] | null;
  config?: Record<string, unknown> | null;
  /** Called with the summary after a successful run. */
  onMatched?: (summary: MatchSummary) => void;
  running?: boolean;
  error?: Error | null;
  run?: (params: MatchRequest) => void;
}

const fmt = (n: number) => n.toLocaleString("en-GB");
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

interface Draft {
  strip_len: string;
  levels: string;
  top_k: string;
  allow_rotation: boolean;
}
// Defaults mirror MatchParams in the OpenAPI schema (strip_len 24, levels 4, top_k 6); rotation is off by default.
export const MATCH_DEFAULTS: Draft = { strip_len: "24", levels: "4", top_k: "6", allow_rotation: false };
const RANGES = { strip_len: [8, 96], levels: [2, 4], top_k: [1, 64] } as const;

/** Validates the advanced fields; returns field errors and the request body (only changed-from-default values sent). */
export function validateMatchDraft(d: Draft): { errors: Partial<Record<keyof Draft, string>>; params: MatchRequest } {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const params: MatchRequest = {};
  for (const key of ["strip_len", "levels", "top_k"] as const) {
    const [lo, hi] = RANGES[key];
    const n = Number(d[key]);
    if (d[key].trim() === "" || !Number.isInteger(n) || n < lo || n > hi)
      errors[key] = `Whole number from ${lo} to ${hi}.`;
    else params[key] = n;
  }
  if (d.allow_rotation) params.allow_rotation = true;
  return { errors, params };
}

export function MatchStatsList({ stats }: { stats: MatchSummary["stats"] }) {
  const rows: [string, string][] = [
    ["Fragments", fmt(stats.fragments)],
    ["Side pairs", fmt(stats.side_pairs_total)],
    ["Scored", fmt(stats.side_pairs_scored)],
    ["Skipped", fmt(stats.side_pairs_skipped)],
    ["Cache hits", fmt(stats.cache_hits)],
    ["Elapsed", `${stats.elapsed_ms.toFixed(1)} ms`],
    ["Match accuracy", pct(stats.match_accuracy)],
  ];
  return (
    <dl className="artifact-facts match-stats">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function MatchPanel({ artifactId, stats, onMatched, running, error, run, config }: PanelProps) {
  const own = useMatchRunner(artifactId, onMatched);
  const doRun = run ?? own.run;
  const isRunning = running ?? own.running;
  const err = error === undefined ? own.error : error;
  const [draft, setDraft] = useState<Draft>(MATCH_DEFAULTS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isRunning) return;
    const v = validateMatchDraft(draft);
    setErrors(v.errors);
    if (Object.keys(v.errors).length === 0) doRun(v.params);
  };
  const set = (key: keyof Draft, value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }));
  const field = (key: "strip_len" | "levels" | "top_k", label: string) => (
    <div className="field" key={key}>
      <label htmlFor={`match-${key}`}>{label}</label>
      <input
        id={`match-${key}`}
        type="number"
        inputMode="numeric"
        value={draft[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `match-${key}-err` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {errors[key] && (
        <span className="field-error" id={`match-${key}-err`}>
          {errors[key]}
        </span>
      )}
    </div>
  );

  return (
    <section className="card match-panel" aria-labelledby="match-heading">
      <div className="match-head">
        <h2 id="match-heading">Matching</h2>
        <span className={`badge ${stats ? "badge-ok" : ""}`} data-testid="match-state">
          {stats ? "Matched" : "Not matched yet"}
        </span>
      </div>
      <p className="muted">
        {stats
          ? "Matching has run. The graph, explanation and reconstruction pages can use these results."
          : "The graph, explanation and reconstruction pages need matching first. Run it here."}
      </p>
      {stats && <MatchStatsList stats={stats} />}
      {stats && config && typeof config.strip_len === "number" && (
        <p className="muted">
          Config: strip length {String(config.strip_len)}, levels {String(config.levels)}, top-k {String(config.top_k)}.
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <button
          type="button"
          className="btn btn-link"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced"}
        </button>
        {showAdvanced && (
          <fieldset className="match-advanced" disabled={isRunning}>
            <legend className="sr-only">Advanced matching parameters</legend>
            <div className="field-row">
              {field("strip_len", "Strip length")}
              {field("levels", "Levels")}
              {field("top_k", "Top-k per side")}
            </div>
            <label className="choice-inline">
              <input
                type="checkbox"
                checked={draft.allow_rotation}
                onChange={(e) => set("allow_rotation", e.target.checked)}
              />
              <span>Allow rotation</span>
            </label>
          </fieldset>
        )}
        <div className="match-actions">
          <button type="submit" className="btn btn-primary" disabled={isRunning}>
            {isRunning ? "Matching…" : stats ? "Run matching again" : "Run matching"}
          </button>
        </div>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {isRunning ? "Running matching…" : ""}
      </p>
      {err && <ErrorState error={err} />}
    </section>
  );
}

/**
 * Drop-in replacement for a dead error when a request returns 409 `precondition_failed`:
 *   if (isPreconditionFailed(error)) return <MatchRequired artifactId={id} onMatched={reload} />;
 */
export function MatchRequired({
  artifactId,
  error,
  onMatched,
}: {
  artifactId: string;
  error?: Error | null;
  onMatched?: (summary: MatchSummary) => void;
}) {
  const { running, error: runError, run } = useMatchRunner(artifactId, onMatched);
  return (
    <div className="state state-match-required" role="alert">
      <p className="state-title">Run matching first</p>
      <p>
        {error instanceof ApiError ? error.message : "This page needs matching results."} Matching compares every pair
        of edges and takes a moment.
      </p>
      <button type="button" className="btn btn-primary" disabled={running} onClick={() => run({})}>
        {running ? "Matching…" : "Run matching"}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {running ? "Running matching…" : ""}
      </p>
      {runError && <ErrorState error={runError} />}
    </div>
  );
}
