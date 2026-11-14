// Owner: A (Arvind)
// Benchmark one artifact: every selected solver on the same fragments, side by side.
// The algorithms run ONE REQUEST EACH, in order (`POST /artifacts/{id}/benchmark` with a single algorithm): the real
// endpoint is all-or-nothing, so this is what makes a partial failure possible (the others still show) and gives a
// progress line during a slow backtracking run. Cancel aborts the waiting; the server may still finish the run.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getArtifact, listArtifacts, runBenchmark } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { Algorithm, RunDetail } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { isPreconditionFailed } from "../../hooks/useMatchStatus";
import { downloadCsv } from "../../lib/csv";
import { BENCH_API_FIELDS, DEFAULT_BENCH, SLOW_NODE_LIMIT, apiFieldErrors, validateBench } from "../../lib/labForms";
import type { BenchDraft, BenchField, BenchRequest } from "../../lib/labForms";
import { benchmarkRows, readResult } from "../../lib/labData";
import { ALGORITHM_INFO, RUN_LIMITS } from "../../lib/solvers";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import Loading from "../Loading";
import { MatchRequired } from "../MatchPanel";
import BenchBars from "../charts/BenchBars";
import type { FixedSize } from "../charts/ChartBox";
import { SHAPE_GLYPH } from "../charts/chartTheme";
import BenchmarkTable from "./BenchmarkTable";

export const ARTIFACT_PARAM = "artifact";
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

interface Failure {
  algorithm: Algorithm;
  error: Error;
}

export default function BenchmarkPanel({ chartSize }: { chartSize?: FixedSize }) {
  const [params, setParams] = useSearchParams();
  const artifactId = params.get(ARTIFACT_PARAM) ?? "";
  const artifacts = useAsync(() => listArtifacts({ limit: 200 }), []);
  const known = artifacts.status === "success" ? artifacts.data.find((a) => a.id === artifactId) : undefined;
  // An id in the URL that the list does not contain: ask for it directly, so a deleted artifact says "not found".
  const lookup = useAsync(
    () => (artifactId && artifacts.status === "success" && !known ? getArtifact(artifactId) : Promise.resolve(null)),
    [artifactId, artifacts.status, Boolean(known)],
  );

  const [draft, setDraft] = useState<BenchDraft>(DEFAULT_BENCH);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<RunDetail[] | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [fatal, setFatal] = useState<Error | null>(null);
  const [needsMatch, setNeedsMatch] = useState<Error | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<BenchField, string>>>({});
  const [logOps, setLogOps] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const { errors, request, warnings } = validateBench(draft);
  const shownErrors = { ...serverErrors, ...errors };
  const backtracking = draft.algorithms.includes("backtracking");
  const artifactName = known?.name ?? lookup.data?.name ?? artifactId;

  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set(ARTIFACT_PARAM, id);
    else next.delete(ARTIFACT_PARAM);
    setParams(next, { replace: true });
    setResults(null);
    setFailures([]);
    setFatal(null);
    setNeedsMatch(null);
  };
  const toggle = (a: Algorithm) =>
    setDraft((d) => ({
      ...d,
      algorithms: d.algorithms.includes(a) ? d.algorithms.filter((x) => x !== a) : [...d.algorithms, a],
    }));

  const start = async (req: BenchRequest) => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setResults(null);
    setFailures([]);
    setFatal(null);
    setNeedsMatch(null);
    setServerErrors({});
    setCsvError(null);
    const done: RunDetail[] = [];
    const failed: Failure[] = [];
    try {
      for (const [i, algorithm] of req.algorithms.entries()) {
        setProgress(
          `Running ${ALGORITHM_INFO.find((a) => a.key === algorithm)?.label ?? algorithm} (${i + 1} of ${req.algorithms.length})…`,
        );
        try {
          const body = {
            algorithms: [algorithm],
            ...(algorithm === "backtracking" && req.node_limit ? { node_limit: req.node_limit } : {}),
          };
          const [run] = await runBenchmark(artifactId, body, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (run) done.push(run);
          else failed.push({ algorithm, error: new Error("The server returned no result for this algorithm.") });
        } catch (e) {
          if (controller.signal.aborted || isAbort(e)) return;
          const err = e instanceof Error ? e : new Error(String(e));
          // Whole-request problems stop the loop; anything else is one algorithm's failure and the rest carry on.
          if (isPreconditionFailed(err) || (err instanceof ApiError && (err.status === 404 || err.status === 422))) {
            if (err instanceof ApiError && err.status === 422) {
              const mapped = apiFieldErrors(err.details, BENCH_API_FIELDS);
              setServerErrors(mapped);
              if (Object.keys(mapped).length === 0) setFatal(err);
            } else if (isPreconditionFailed(err)) setNeedsMatch(err);
            else setFatal(err);
            return;
          }
          failed.push({ algorithm, error: err });
        }
      }
      setResults(done);
      setFailures(failed);
    } finally {
      if (abort.current === controller) abort.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        setProgress("");
      }
    }
  };
  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setProgress("");
  };

  const rows = useMemo(() => (results ? benchmarkRows(results) : []), [results]);
  const reading = useMemo(() => readResult(rows), [rows]);
  const ready = artifactId !== "" && (known || lookup.data);

  let picker;
  if (artifacts.status === "loading") picker = <Loading label="Loading artifacts…" />;
  else if (artifacts.status === "error") picker = <ErrorState error={artifacts.error} onRetry={artifacts.reload} />;
  else if (artifacts.data.length === 0 && !artifactId)
    picker = (
      <EmptyState
        title="No artifacts yet"
        message="Create an artifact first, then benchmark the solvers on it."
        action={
          <Link className="btn btn-primary" to="/">
            Go to Projects
          </Link>
        }
      />
    );
  else
    picker = (
      <label className="lab-field">
        Artifact
        <select value={artifactId} onChange={(e) => choose(e.target.value)} disabled={busy}>
          <option value="">Choose an artifact…</option>
          {artifacts.data.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.fragment_count ?? "?"} fragments)
            </option>
          ))}
          {artifactId && !known && lookup.data && <option value={artifactId}>{lookup.data.name}</option>}
        </select>
      </label>
    );

  const notFound =
    artifactId !== "" && lookup.status === "error" && lookup.error instanceof ApiError && lookup.error.status === 404;

  return (
    <section aria-labelledby="bench-heading" className="lab-section">
      <h2 id="bench-heading">Benchmark an artifact</h2>
      <p className="muted">Run the solvers on the same fragments and compare time, operations, score and accuracy.</p>
      {picker}
      {notFound && (
        <EmptyState
          title="Artifact not found"
          message="This artifact does not exist (it may have been deleted). Choose another one."
          action={
            <button type="button" className="btn" onClick={() => choose("")}>
              Clear selection
            </button>
          }
        />
      )}

      {artifacts.status === "success" && !notFound && (
        <form
          className="card lab-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (request && ready && !busy) void start(request);
          }}
        >
          <fieldset disabled={busy}>
            <legend>Algorithms</legend>
            <div className="lab-checks">
              {ALGORITHM_INFO.map((a) => (
                <label key={a.key} className="check" title={a.summary}>
                  <input type="checkbox" checked={draft.algorithms.includes(a.key)} onChange={() => toggle(a.key)} />
                  <span aria-hidden="true">{SHAPE_GLYPH[a.key]}</span> {a.label}
                </label>
              ))}
            </div>
            {shownErrors.algorithms && (
              <p className="field-error" role="alert">
                {shownErrors.algorithms}
              </p>
            )}
            {backtracking && (
              <>
                <label className="lab-field">
                  Node limit (backtracking)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={RUN_LIMITS.nodeLimit.min}
                    max={RUN_LIMITS.nodeLimit.max}
                    step="1"
                    value={draft.nodeLimit}
                    aria-invalid={Boolean(shownErrors.nodeLimit)}
                    aria-describedby="bench-node-help"
                    onChange={(e) => setDraft({ ...draft, nodeLimit: e.target.value })}
                  />
                </label>
                <p id="bench-node-help" className="muted">
                  Backtracking stops after this many search nodes and returns the best layout found. Small limits stay
                  quick; above {SLOW_NODE_LIMIT.toLocaleString("en")} it can be slow.
                </p>
                {shownErrors.nodeLimit && <p className="field-error">{shownErrors.nodeLimit}</p>}
                {warnings.map((w) => (
                  <p key={w} className="state state-warning" role="status">
                    {w}
                  </p>
                ))}
              </>
            )}
          </fieldset>
          <div className="run-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !request || !ready}>
              {busy ? "Running…" : "Run benchmark"}
            </button>
            {busy && (
              <button type="button" className="btn" onClick={cancel}>
                Cancel
              </button>
            )}
            {!ready && <span className="muted">Choose an artifact to run a benchmark.</span>}
          </div>
          <p className="muted" role="status" aria-live="polite" data-testid="bench-status">
            {busy ? `${progress} Cancel stops waiting, but the server may still finish the run.` : ""}
          </p>
        </form>
      )}

      {needsMatch && (
        <MatchRequired
          artifactId={artifactId}
          error={needsMatch}
          onMatched={() => {
            setNeedsMatch(null);
            if (request) void start(request);
          }}
        />
      )}
      {fatal && <ErrorState error={fatal} onRetry={request ? () => void start(request) : undefined} />}
      {failures.length > 0 && (
        <div className="state state-error" role="alert" data-testid="bench-failures">
          <p className="state-title">
            {failures.length === 1 ? "One algorithm failed" : `${failures.length} algorithms failed`}; the others are
            shown below
          </p>
          <ul>
            {failures.map((f) => (
              <li key={f.algorithm}>
                {ALGORITHM_INFO.find((a) => a.key === f.algorithm)?.label}: {f.error.message}
                {f.error instanceof ApiError && <code> {f.error.code}</code>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!results && !busy && !needsMatch && !fatal && ready && (
        <EmptyState
          title="Nothing run yet"
          message="Choose an artifact and run a benchmark to compare the algorithms."
        />
      )}

      {results && rows.length > 0 && (
        <div aria-live="polite">
          <h3>Results for {artifactName}</h3>
          <ul className="reading" aria-label="Reading of the result">
            {reading.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <BenchmarkTable rows={rows} />
          <div className="run-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setCsvError(null);
                downloadCsv({
                  kind: "benchmark",
                  artifact: { id: artifactId, name: artifactName },
                  runs: results,
                }).catch((e: unknown) =>
                  setCsvError(e instanceof Error ? e.message : "The CSV could not be downloaded."),
                );
              }}
            >
              Download CSV
            </button>
            <label className="check">
              <input type="checkbox" checked={logOps} onChange={(e) => setLogOps(e.target.checked)} />
              Log scale for operations
            </label>
          </div>
          {csvError && (
            <p className="field-error" role="alert">
              {csvError}
            </p>
          )}
          <div className="chart-grid">
            <BenchBars
              title="Time"
              description="Wall-clock milliseconds per solver."
              rows={rows}
              measures={["elapsed_ms"]}
              fixedSize={chartSize}
            />
            <BenchBars
              title="Operations"
              description="Sum of each solver's own counters."
              rows={rows}
              measures={["operations"]}
              logY={logOps}
              format={(v) => v.toLocaleString("en")}
              fixedSize={chartSize}
            />
            <BenchBars title="Total score" rows={rows} measures={["total_score"]} fixedSize={chartSize} />
            <BenchBars
              title="Accuracy"
              description="Share of correct neighbours and cells (— when there is no ground truth)."
              rows={rows}
              measures={["neighbour_accuracy", "direct_accuracy", "coverage"]}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              fixedSize={chartSize}
            />
          </div>
        </div>
      )}
    </section>
  );
}
