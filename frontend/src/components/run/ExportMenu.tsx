// Owner: A (Arvind)
// "Export this reconstruction": one button per format. Works for a run of any algorithm (greedy, best-first,
// Dijkstra, backtracking) because it exports that run's final layout. See lib/exportRun.ts.
import { useState } from "react";
import { exportRun, FORMAT_INFO } from "../../lib/exportRun";
import type { ExportFormat, ExportInput } from "../../lib/exportRun";

export default function ExportMenu({ input }: { input: ExportInput }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (format: ExportFormat) => {
    setBusy(format);
    setSaved(null);
    setError(null);
    try {
      setSaved(await exportRun(input, format));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card export-menu" aria-labelledby="export-heading">
      <h2 id="export-heading">Export this reconstruction</h2>
      <p className="muted">Saves the final layout of this run, exactly as the algorithm placed it.</p>
      <ul className="plain-list export-list">
        {FORMAT_INFO.map((f) => (
          <li key={f.key}>
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void go(f.key)}>
              {busy === f.key ? "Preparing…" : f.label}
            </button>
            <span className="muted">{f.hint}</span>
          </li>
        ))}
      </ul>
      <p className="export-status" role="status" aria-live="polite">
        {saved ? `Saved ${saved}` : ""}
      </p>
      {error && (
        <p className="state state-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
