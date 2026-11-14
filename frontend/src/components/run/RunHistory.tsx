// Owner: A (Arvind)
// The artifact's run history: open a past run (its id goes in `?run=`), delete one, and compare two by switching.
import { useState } from "react";
import type { RunOut } from "../../api/types";
import { ALGORITHM_INFO } from "../../lib/solvers";

const label = (alg: string) => ALGORITHM_INFO.find((a) => a.key === alg)?.label ?? alg;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);

interface Props {
  runs: readonly RunOut[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function RunHistory({ runs, selectedId, onOpen, onDelete }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (run: RunOut) => {
    setDeleting(run.id);
    setError(null);
    try {
      await onDelete(run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run could not be deleted.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="card" aria-labelledby="history-heading">
      <h2 id="history-heading">Run history ({runs.length})</h2>
      <p className="muted">Open a run to replay it. Open two in turn to compare them.</p>
      <ul className="plain-list run-list">
        {runs.map((r) => (
          <li key={r.id} className={r.id === selectedId ? "run-item selected" : "run-item"}>
            <button
              type="button"
              className="run-open"
              aria-current={r.id === selectedId ? "true" : undefined}
              onClick={() => onOpen(r.id)}
            >
              <strong>{label(r.algorithm)}</strong>
              <span>
                score {r.total_score.toFixed(2)} · neighbours {pct(r.neighbour_accuracy)} · direct{" "}
                {pct(r.direct_accuracy)}
              </span>
              <span className="muted">
                {r.elapsed_ms} ms{r.truncated ? " · truncated" : ""} · {new Date(r.created_at).toLocaleTimeString()}
              </span>
            </button>
            <button
              type="button"
              className="btn"
              disabled={deleting === r.id}
              aria-label={`Delete ${label(r.algorithm)} run from ${new Date(r.created_at).toLocaleTimeString()}`}
              onClick={() => void remove(r)}
            >
              {deleting === r.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
