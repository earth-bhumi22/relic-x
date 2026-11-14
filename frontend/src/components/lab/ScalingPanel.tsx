// Owner: A (Arvind)
// Scaling experiment: the same sample at growing grid sizes, every algorithm; time / operations / accuracy against n,
// the match stage, optional log axes and fitted growth curves. `POST /benchmark/scaling` is a LONG request: busy state
// with elapsed seconds, Cancel (the server may still finish), a warning for large sizes, error with retry.
import { useEffect, useMemo, useRef, useState } from "react";
import { listSamples, runScalingBenchmark } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { Algorithm, ScalingOut, ScalingRequest } from "../../api/types";
import { useAsync } from "../../hooks/useAsync";
import { downloadCsv } from "../../lib/csv";
import { matchRows, scalingAlgorithms } from "../../lib/labData";
import {
  SCALING_API_FIELDS,
  SCALING_LIMITS,
  apiFieldErrors,
  DEFAULT_SCALING,
  validateScaling,
} from "../../lib/labForms";
import type { ScalingDraft, ScalingField } from "../../lib/labForms";
import { ALGORITHM_INFO } from "../../lib/solvers";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import Loading from "../Loading";
import ScalingLines from "../charts/ScalingLines";
import type { FixedSize } from "../charts/ChartBox";
import { SHAPE_GLYPH } from "../charts/chartTheme";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Whole seconds since `active` became true; the interval is cleared when it turns false or the component unmounts. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    setSeconds(0);
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

export default function ScalingPanel({ chartSize }: { chartSize?: FixedSize }) {
  const samples = useAsync(() => listSamples(), []);
  const [draft, setDraft] = useState<ScalingDraft>(DEFAULT_SCALING);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ request: ScalingRequest; data: ScalingOut } | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<ScalingField, string>>>({});
  const [logY, setLogY] = useState(false);
  const [logX, setLogX] = useState(false);
  const [showFit, setShowFit] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const elapsed = useElapsedSeconds(busy);
  useEffect(() => () => abort.current?.abort(), []);

  const { errors, request, warnings } = validateScaling(draft);
  const shown = { ...serverErrors, ...errors };
  const set = (patch: Partial<ScalingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (a: Algorithm) =>
    set({
      algorithms: draft.algorithms.includes(a) ? draft.algorithms.filter((x) => x !== a) : [...draft.algorithms, a],
    });

  const start = async (req: Required<ScalingRequest>) => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setServerErrors({});
    setCsvError(null);
    try {
      const data = await runScalingBenchmark(req, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult({ request: req, data });
    } catch (e) {
      if (controller.signal.aborted || isAbort(e)) return;
      if (e instanceof ApiError && e.status === 422) {
        const mapped = apiFieldErrors(e.details, SCALING_API_FIELDS);
        setServerErrors(mapped);
        // "invalid_input" (a size outside 2..8, an unknown sample) has no field: show it as the error.
        if (Object.keys(mapped).length === 0) setError(e);
      } else setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (abort.current === controller) abort.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  };

  const algorithms = useMemo(() => (result ? scalingAlgorithms(result.data) : []), [result]);
  const points = useMemo(() => result?.data.points ?? [], [result]);
  const match = useMemo(() => matchRows(points), [points]);
  const sampleOptions = samples.status === "success" ? samples.data : [];

  return (
    <section aria-labelledby="scaling-heading" className="lab-section">
      <h2 id="scaling-heading">Scaling: time vs n</h2>
      <p className="muted">
        Generate the same sample at growing grid sizes (a size s makes s×s = n fragments), match it, and run every
        algorithm.
      </p>
      {samples.status === "loading" && <Loading label="Loading samples…" />}
      {samples.status === "error" && <ErrorState error={samples.error} onRetry={samples.reload} />}

      <form
        className="card lab-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (request && !busy) void start(request);
        }}
      >
        <fieldset disabled={busy}>
          <legend>Experiment</legend>
          <label className="lab-field">
            Sample
            <select value={draft.sample} onChange={(e) => set({ sample: e.target.value })}>
              {!sampleOptions.some((s) => s.name === draft.sample) && (
                <option value={draft.sample}>{draft.sample}</option>
              )}
              {sampleOptions.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {shown.sample && <p className="field-error">{shown.sample}</p>}
          <label className="lab-field">
            Grid sizes (comma separated)
            <input
              type="text"
              inputMode="numeric"
              value={draft.sizes}
              aria-invalid={Boolean(shown.sizes)}
              aria-describedby="sizes-help"
              onChange={(e) => set({ sizes: e.target.value })}
            />
          </label>
          <p id="sizes-help" className="muted">
            Up to {SCALING_LIMITS.sizes.count} sizes, each {SCALING_LIMITS.sizes.min}–{SCALING_LIMITS.sizes.max}. The
            API default is 3, 4, 5, 6.
          </p>
          {shown.sizes && <p className="field-error">{shown.sizes}</p>}
          <div className="lab-checks" role="group" aria-label="Algorithms">
            {ALGORITHM_INFO.map((a) => (
              <label key={a.key} className="check" title={a.summary}>
                <input type="checkbox" checked={draft.algorithms.includes(a.key)} onChange={() => toggle(a.key)} />
                <span aria-hidden="true">{SHAPE_GLYPH[a.key]}</span> {a.label}
              </label>
            ))}
          </div>
          {shown.algorithms && <p className="field-error">{shown.algorithms}</p>}
          <label className="check">
            <input type="checkbox" checked={draft.rotate} onChange={(e) => set({ rotate: e.target.checked })} />
            Rotate fragments
          </label>
          <div className="lab-row">
            <label className="lab-field">
              Noise ({SCALING_LIMITS.noise.min}–{SCALING_LIMITS.noise.max})
              <input
                type="number"
                step="any"
                value={draft.noise}
                aria-invalid={Boolean(shown.noise)}
                onChange={(e) => set({ noise: e.target.value })}
              />
            </label>
            <label className="lab-field">
              Erosion ({SCALING_LIMITS.erosion.min}–{SCALING_LIMITS.erosion.max})
              <input
                type="number"
                step="any"
                value={draft.erosion}
                aria-invalid={Boolean(shown.erosion)}
                onChange={(e) => set({ erosion: e.target.value })}
              />
            </label>
            <label className="lab-field">
              Node limit (backtracking)
              <input
                type="number"
                step="1"
                value={draft.nodeLimit}
                aria-invalid={Boolean(shown.nodeLimit)}
                onChange={(e) => set({ nodeLimit: e.target.value })}
              />
            </label>
          </div>
          {shown.noise && <p className="field-error">{shown.noise}</p>}
          {shown.erosion && <p className="field-error">{shown.erosion}</p>}
          {shown.nodeLimit && <p className="field-error">{shown.nodeLimit}</p>}
          {warnings.map((w) => (
            <p key={w} className="state state-warning" role="status">
              {w}
            </p>
          ))}
        </fieldset>
        <div className="run-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !request}>
            {busy ? "Running…" : "Run scaling"}
          </button>
          {busy && (
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
        <p className="muted" role="status" aria-live="polite" data-testid="scaling-status">
          {busy
            ? `Running the experiment… ${elapsed} s elapsed. This can take a while; Cancel stops waiting, but the server may still finish.`
            : ""}
        </p>
      </form>

      {error && <ErrorState error={error} onRetry={request ? () => void start(request) : undefined} />}
      {!result && !busy && !error && (
        <EmptyState
          title="Nothing run yet"
          message="Choose the sizes and run the scaling experiment to see time against n."
        />
      )}

      {result && points.length > 0 && (
        <div aria-live="polite">
          <h3>
            {result.data.sample}
            {result.data.rotate ? " (rotated)" : ""}: {points.length} sizes
          </h3>
          <div className="run-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setCsvError(null);
                downloadCsv({ kind: "scaling", request: result.request, result: result.data }).catch((e: unknown) =>
                  setCsvError(e instanceof Error ? e.message : "The CSV could not be downloaded."),
                );
              }}
            >
              Download CSV
            </button>
            <label className="check">
              <input type="checkbox" checked={logY} onChange={(e) => setLogY(e.target.checked)} />
              Log y axis
            </label>
            <label className="check">
              <input type="checkbox" checked={logX} onChange={(e) => setLogX(e.target.checked)} />
              Log x axis (log-log)
            </label>
            <label className="check">
              <input type="checkbox" checked={showFit} onChange={(e) => setShowFit(e.target.checked)} />
              Show fitted growth curves
            </label>
          </div>
          {csvError && (
            <p className="field-error" role="alert">
              {csvError}
            </p>
          )}
          <div className="chart-grid">
            <ScalingLines
              title="Time vs n"
              description="Milliseconds per solver run."
              points={points}
              algorithms={algorithms}
              measure="elapsed_ms"
              logY={logY}
              logX={logX}
              showFit={showFit}
              fixedSize={chartSize}
            />
            <ScalingLines
              title="Operations vs n"
              description="Total operation counter of each run (a single number per run here)."
              points={points}
              algorithms={algorithms}
              measure="operations"
              logY={logY}
              logX={logX}
              showFit={showFit}
              format={(v) => v.toLocaleString("en")}
              fixedSize={chartSize}
            />
            <ScalingLines
              title="Direct accuracy vs n"
              description="Share of fragments in their exact true cell."
              points={points}
              algorithms={algorithms}
              measure="direct_accuracy"
              logX={logX}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              fixedSize={chartSize}
            />
          </div>
          <section aria-labelledby="match-stage-heading" className="card">
            <h3 id="match-stage-heading">Match stage</h3>
            <div className="table-scroll">
              <table className="edge-table-grid">
                <caption className="sr-only">Matching cost and accuracy for each size</caption>
                <thead>
                  <tr>
                    <th scope="col">n (size)</th>
                    <th scope="col">Time (ms)</th>
                    <th scope="col">Side pairs scored</th>
                    <th scope="col">Skipped</th>
                    <th scope="col">Match accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {match.map((m) => (
                    <tr key={m.n}>
                      <th scope="row">
                        {m.n} ({m.size}×{m.size})
                      </th>
                      <td>{m.elapsed_ms.toLocaleString("en")}</td>
                      <td>
                        {m.scored.toLocaleString("en")} of {m.total.toLocaleString("en")}
                      </td>
                      <td>{m.skipped.toLocaleString("en")}</td>
                      <td>{m.accuracy === null ? "—" : `${(m.accuracy * 100).toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
