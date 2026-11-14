// Owner: A (Arvind)
// Algorithm picker (one line + complexity each), run parameters with validation against the API's bounds, the Run
// button, and the busy state with Cancel. Parameters are strings in a draft so half-typed values do not fight the user.
import { ALGORITHM_INFO, RUN_LIMITS, validateDraft } from "../../lib/solvers";
import type { RunDraft, RunField, RunRequest } from "../../lib/solvers";

interface Props {
  draft: RunDraft;
  onDraft: (d: RunDraft) => void;
  /** Messages from the server (422 field errors), shown next to the same fields. */
  serverErrors?: Partial<Record<RunField, string>>;
  busy: boolean;
  onRun: (request: RunRequest) => void;
  onCancel: () => void;
}

export default function RunControls({ draft, onDraft, serverErrors = {}, busy, onRun, onCancel }: Props) {
  const { errors, request } = validateDraft(draft);
  const shown = { ...serverErrors, ...errors };
  const set = (patch: Partial<RunDraft>) => onDraft({ ...draft, ...patch });
  const backtracking = draft.algorithm === "backtracking";

  return (
    <form
      className="card run-controls"
      noValidate
      aria-labelledby="run-controls-heading"
      onSubmit={(e) => {
        e.preventDefault();
        if (request && !busy) onRun(request);
      }}
    >
      <h2 id="run-controls-heading">Run an algorithm</h2>
      <fieldset className="algo-picker" disabled={busy}>
        <legend>Algorithm</legend>
        {ALGORITHM_INFO.map((a) => (
          <label key={a.key} className={`algo-option${draft.algorithm === a.key ? " selected" : ""}`}>
            <input
              type="radio"
              name="algorithm"
              value={a.key}
              checked={draft.algorithm === a.key}
              onChange={() => set({ algorithm: a.key })}
            />
            <span className="algo-name">{a.label}</span>
            <span className="algo-summary">{a.summary}</span>
            <span className="algo-complexity">{a.complexity}</span>
          </label>
        ))}
      </fieldset>

      <div className="run-params">
        <label>
          Threshold (0–1)
          <input
            type="number"
            inputMode="decimal"
            min={RUN_LIMITS.threshold.min}
            max={RUN_LIMITS.threshold.max}
            step="any"
            value={draft.threshold}
            disabled={busy}
            aria-invalid={Boolean(shown.threshold)}
            aria-describedby={shown.threshold ? "err-threshold" : undefined}
            onChange={(e) => set({ threshold: e.target.value })}
          />
        </label>
        {shown.threshold && (
          <p id="err-threshold" className="field-error">
            {shown.threshold}
          </p>
        )}
        <label>
          Top-k (empty = no limit)
          <input
            type="number"
            inputMode="numeric"
            min={RUN_LIMITS.topK.min}
            max={RUN_LIMITS.topK.max}
            step="1"
            value={draft.topK}
            disabled={busy}
            aria-invalid={Boolean(shown.topK)}
            aria-describedby={shown.topK ? "err-topk" : undefined}
            onChange={(e) => set({ topK: e.target.value })}
          />
        </label>
        {shown.topK && (
          <p id="err-topk" className="field-error">
            {shown.topK}
          </p>
        )}
        {backtracking && (
          <>
            <label>
              Node limit (backtracking)
              <input
                type="number"
                inputMode="numeric"
                min={RUN_LIMITS.nodeLimit.min}
                max={RUN_LIMITS.nodeLimit.max}
                step="1"
                value={draft.nodeLimit}
                disabled={busy}
                aria-invalid={Boolean(shown.nodeLimit)}
                aria-describedby="node-limit-help err-nodelimit"
                onChange={(e) => set({ nodeLimit: e.target.value })}
              />
            </label>
            <p id="node-limit-help" className="muted">
              The search stops after this many nodes and returns the best layout found. A small limit keeps the run
              quick; a run that hits it is marked truncated and may not be optimal.
            </p>
            {shown.nodeLimit && (
              <p id="err-nodelimit" className="field-error">
                {shown.nodeLimit}
              </p>
            )}
          </>
        )}
      </div>

      <div className="run-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || request === null}>
          {busy ? "Running…" : "Run"}
        </button>
        {busy && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? "Running the solver…" : ""}
      </p>
      {busy && (
        <p className="muted" data-testid="run-busy">
          Working… the request runs on the server and has no progress yet. Cancel stops waiting, but the server may
          still finish the run; if it does, it appears in the history.
        </p>
      )}
    </form>
  );
}
