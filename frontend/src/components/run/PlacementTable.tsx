// Owner: A (Arvind)
// Accessible table of the current frame's tiles: the same facts as the canvas tooltips (cell, rotation, step,
// confidence value and how many joins were scored, ground-truth verdict), so the confidence ring is never colour-only.
import type { Confidence } from "../../lib/confidence";
import { confidenceLevel } from "../../lib/confidence";
import type { ReplayTile } from "../../lib/replay";
import { VERDICT_SYMBOL, VERDICT_WORD } from "../../lib/truth";
import type { TileVerdict } from "../../lib/truth";

interface Props {
  tiles: readonly ReplayTile[];
  confidence: ReadonlyMap<string, Confidence>;
  verdicts: ReadonlyMap<string, TileVerdict> | null;
  selected: string | null;
  onSelect: (label: string) => void;
}

export default function PlacementTable({ tiles, confidence, verdicts, selected, onSelect }: Props) {
  const sorted = [...tiles].sort((a, b) => a.row - b.row || a.col - b.col);
  return (
    <section className="card" aria-labelledby="placements-heading">
      <h2 id="placements-heading">Placements and confidence</h2>
      <p className="muted">
        Confidence is the mean composite score of a tile&apos;s joins with its placed neighbours (matches the matcher
        never scored count as 0). Low is under 0.40, high is 0.70 or more.
      </p>
      <div className="table-scroll">
        <table className="edge-table-grid">
          <caption className="sr-only">Placed fragments for the current step</caption>
          <thead>
            <tr>
              <th scope="col">Fragment</th>
              <th scope="col">Cell</th>
              <th scope="col">Rotation</th>
              <th scope="col">Step</th>
              <th scope="col">Confidence</th>
              {verdicts && <th scope="col">Ground truth</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const c = confidence.get(t.label);
              const v = verdicts?.get(t.label);
              return (
                <tr key={t.label} className={selected === t.label ? "selected" : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="link-button"
                      aria-pressed={selected === t.label}
                      onClick={() => onSelect(t.label)}
                    >
                      {t.label}
                    </button>
                  </th>
                  <td>
                    {t.row}, {t.col}
                  </td>
                  <td>{t.rot * 90}°</td>
                  <td>{t.step || "—"}</td>
                  <td>
                    {c?.value === null || c === undefined ? "—" : c.value.toFixed(2)}{" "}
                    <span className="muted">
                      ({confidenceLevel(c?.value ?? null)}, {c?.scored ?? 0}/{c?.joins.length ?? 0} joins scored)
                    </span>
                  </td>
                  {verdicts && (
                    <td>
                      {v ? (
                        <>
                          <span aria-hidden="true">{VERDICT_SYMBOL[v.verdict]}</span> {VERDICT_WORD[v.verdict]}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
