// Owner: A (Arvind)
// Ground-truth overlay controls and report: the toggle (off by default; disabled with an explanation when the artifact
// has no ground truth), the best global alignment, the list of wrongly placed fragments, and a side-by-side
// "ground truth" grid. Classification rules live in lib/truth.ts.
import type { FragmentOut } from "../../api/types";
import type { ReplayTile } from "../../lib/replay";
import { VERDICT_SYMBOL, VERDICT_WORD } from "../../lib/truth";
import type { Alignment, Truth, TileVerdict } from "../../lib/truth";

interface Props {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  /** Null when the artifact has no ground truth. */
  truth: ReadonlyMap<string, Truth> | null;
  tiles: readonly ReplayTile[];
  verdicts: ReadonlyMap<string, TileVerdict> | null;
  alignment: Alignment | null;
  fragments: readonly FragmentOut[];
}

export default function TruthPanel({ enabled, onToggle, truth, tiles, verdicts, alignment, fragments }: Props) {
  const wrong = verdicts ? tiles.filter((t) => verdicts.get(t.label)?.verdict === "wrong") : [];
  const partial = verdicts ? tiles.filter((t) => verdicts.get(t.label)?.verdict === "partial") : [];
  const rows = truth ? Math.max(...[...truth.values()].map((t) => t.row)) + 1 : 0;
  const cols = truth ? Math.max(...[...truth.values()].map((t) => t.col)) + 1 : 0;
  const byCell = new Map(truth ? [...truth.values()].map((t) => [`${t.row},${t.col}`, t]) : []);
  const image = new Map(fragments.map((f) => [f.label, f.image_url]));

  return (
    <section className="card" aria-labelledby="truth-heading">
      <h2 id="truth-heading">Ground truth</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled && truth !== null}
          disabled={truth === null}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Show ground-truth overlay
      </label>
      {truth === null ? (
        <p className="muted" id="truth-disabled-why">
          Not available: this artifact has no ground truth (uploaded fragments do not know where they belong).
        </p>
      ) : (
        <p className="muted">
          Compared by neighbours, not by absolute cell: a layout that is shifted or turned as a whole still counts as
          right.
        </p>
      )}

      {enabled && truth && verdicts && (
        <>
          <p>
            <span aria-hidden="true">{VERDICT_SYMBOL.correct}</span> correct ·{" "}
            <span aria-hidden="true">{VERDICT_SYMBOL.partial}</span> partly correct ·{" "}
            <span aria-hidden="true">{VERDICT_SYMBOL.wrong}</span> wrong
          </p>
          {alignment && (
            <p data-testid="alignment">
              Best global alignment ({alignment.turns * 90}° turn, shift {alignment.shiftRow}, {alignment.shiftCol}):{" "}
              <strong>
                {alignment.inPlace.size} of {truth.size}
              </strong>{" "}
              fragments in their exact true cell.
            </p>
          )}
          <h3>Wrongly placed ({wrong.length})</h3>
          {wrong.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="plain-list chip-list" aria-label="Wrongly placed fragments">
              {wrong.map((t) => (
                <li key={t.label}>
                  {VERDICT_SYMBOL.wrong} {t.label} ({verdicts.get(t.label)?.correct}/{verdicts.get(t.label)?.total} true
                  neighbours kept)
                </li>
              ))}
            </ul>
          )}
          {partial.length > 0 && (
            <p className="muted">
              Partly correct: {partial.map((t) => t.label).join(", ")} ({VERDICT_WORD.partial}).
            </p>
          )}
          <h3>Ground truth picture</h3>
          <div
            className="truth-grid"
            role="group"
            aria-label={`Ground truth: ${rows} rows by ${cols} columns`}
            style={{ "--rows": rows, "--cols": cols } as React.CSSProperties}
          >
            {Array.from({ length: rows * cols }, (_, i) => {
              const t = byCell.get(`${Math.floor(i / cols)},${i % cols}`);
              return (
                <div
                  key={i}
                  className="truth-cell"
                  title={t ? `${t.label} belongs at row ${t.row}, column ${t.col}` : "empty"}
                >
                  {t && (
                    <>
                      <img
                        src={image.get(t.label)}
                        alt=""
                        style={{ transform: `rotate(${((4 - t.rot) % 4) * 90}deg)` }}
                      />
                      <span className="recon-label">{t.label}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
