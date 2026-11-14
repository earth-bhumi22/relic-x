// Owner: A (Arvind)
// The assembled picture: a CSS grid sized from the PLACEMENTS (a layout can be wider or taller than the artifact grid,
// e.g. when the whole picture came out turned 90°, CONTRACT §3), each fragment drawn at its (row, col) and rotated
// `rot × 90°` clockwise around its centre (CONTRACT D13). Empty cells stay empty; fragments with no tile go to a tray.
//
// Confidence ring (see lib/confidence.ts): the tile border is banded low / medium / high and the number is printed on
// the tile, in the tooltip and in the placement table, so the ring is never colour-only. With the ground-truth overlay
// on, each tile also carries a symbol: ✓ correct, ◐ partly correct, ✗ wrong (lib/truth.ts).
import { useState } from "react";
import { confidenceLevel } from "../lib/confidence";
import type { Confidence } from "../lib/confidence";
import type { ReplayTile } from "../lib/replay";
import { VERDICT_SYMBOL, VERDICT_WORD } from "../lib/truth";
import type { TileVerdict } from "../lib/truth";

export interface CanvasFragment {
  label: string;
  image_url: string;
}

interface Props {
  tiles: readonly ReplayTile[];
  /** Layout extents (rows, cols, and the smallest row / col so negative cells still fit). */
  bounds: { minRow: number; minCol: number; rows: number; cols: number };
  fragments: readonly CanvasFragment[];
  confidence?: ReadonlyMap<string, Confidence>;
  verdicts?: ReadonlyMap<string, TileVerdict> | null;
  /** Labels with no tile in this frame (shown in the tray, with a count). */
  unplaced?: readonly string[];
  selected?: string | null;
  onSelect?: (label: string) => void;
}

const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(2));

export function describeTile(t: ReplayTile, c?: Confidence, v?: TileVerdict): string {
  const parts = [
    `${t.label} at row ${t.row}, column ${t.col}`,
    `rotated ${t.rot * 90}° clockwise`,
    t.step ? `placed at step ${t.step}` : "from the final layout",
    c ? `confidence ${fmt(c.value)} (${c.scored} of ${c.joins.length} joins scored)` : "",
    v ? `ground truth: ${VERDICT_WORD[v.verdict]}` : "",
    t.note,
  ];
  return parts.filter(Boolean).join(", ");
}

export default function ReconstructionCanvas({
  tiles,
  bounds,
  fragments,
  confidence,
  verdicts,
  unplaced = [],
  selected = null,
  onSelect,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const image = new Map(fragments.map((f) => [f.label, f.image_url]));
  const active = tiles.find((t) => t.label === (hover ?? selected)) ?? null;
  const empty = bounds.rows === 0;
  return (
    <div className="recon">
      {empty ? (
        <p className="muted">Nothing is placed yet. Step forward to watch the layout grow.</p>
      ) : (
        <div
          className="recon-grid"
          role="group"
          aria-label={`Reconstruction: ${bounds.rows} rows by ${bounds.cols} columns, ${tiles.length} tiles placed`}
          style={{ "--rows": bounds.rows, "--cols": bounds.cols } as React.CSSProperties}
          data-rows={bounds.rows}
          data-cols={bounds.cols}
        >
          {tiles.map((t) => {
            const c = confidence?.get(t.label);
            const v = verdicts?.get(t.label);
            const level = confidenceLevel(c?.value ?? null);
            const label = describeTile(t, c, v);
            const flagged = t.kind === "conflict" || t.kind === "fallback";
            return (
              <button
                key={t.label}
                type="button"
                className={`recon-tile ring-${level}${flagged ? " recon-flagged" : ""}${
                  selected === t.label ? " recon-selected" : ""
                }${v ? ` verdict-${v.verdict}` : ""}`}
                style={{ gridRow: t.row - bounds.minRow + 1, gridColumn: t.col - bounds.minCol + 1 }}
                data-row={t.row}
                data-col={t.col}
                data-rot={t.rot}
                data-testid="recon-tile"
                aria-label={label}
                aria-pressed={selected === t.label}
                title={label}
                onClick={() => onSelect?.(t.label)}
                onMouseEnter={() => setHover(t.label)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(t.label)}
                onBlur={() => setHover(null)}
              >
                <img
                  src={image.get(t.label)}
                  alt=""
                  draggable={false}
                  style={{ transform: `rotate(${t.rot * 90}deg)` }}
                />
                <span className="recon-label">{t.label}</span>
                <span className="recon-conf" aria-hidden="true">
                  {fmt(c?.value ?? null)}
                </span>
                {t.kind !== "place" && (
                  <span className="recon-flag" aria-hidden="true">
                    {t.kind === "seed" ? "S" : t.kind === "fallback" ? "F" : "!"}
                  </span>
                )}
                {v && (
                  <span className="recon-verdict" aria-hidden="true">
                    {VERDICT_SYMBOL[v.verdict]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <p className="recon-details" role="status" aria-live="polite">
        {active
          ? describeTile(active, confidence?.get(active.label), verdicts?.get(active.label))
          : "Hover or focus a tile for details."}
      </p>
      {unplaced.length > 0 && (
        <section className="recon-tray" aria-label={`Unplaced fragments (${unplaced.length})`}>
          <h3>Unplaced ({unplaced.length})</h3>
          <ul className="plain-list tray-list">
            {unplaced.map((label) => (
              <li key={label} title={`${label} is not in this layout`}>
                <img src={image.get(label)} alt="" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
