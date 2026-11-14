// Owner: A (Arvind)
// One edge string drawn as a row of colour beads. Reused by the gallery (T24), the graph (T25) and the
// "Why matched?" drawer (T26).
//
// Props
//   edge        the edge string, e.g. "AAQQRbb…" (CONTRACT §6.2). Empty string -> "(empty edge)".
//   reversed    draw it right-to-left (edge B is compared reversed, CONTRACT §3 / D12).
//   highlight   ranges to outline, [from, to) in the string AS GIVEN (before any `reversed` flip), tagged with a
//               `kind` ("lcs" | "motif" | "mismatch" | any string -> class `bead-hl-<kind>`).
//   size        "sm" | "md" | "lg" bead size (default "md").
//   label       accessible name, e.g. "North edge of F07"; the string itself is appended for screen readers.
//   side        N/E/S/W: outlines the strip with that side's --bead-* token.
//   levels      quantisation levels the strings were made with (default 4, see lib/beads.ts).
//   showSymbols print the symbol character inside each bead (default: only md/lg sizes show it on hover/title).
// Beads are never colour-only: every bead carries `title="<symbol>"`, unknown symbols show a visible "?" marker,
// and the strip is a role="img" whose label contains the whole string.
import { symbolColor, rgbCss, sampleCss, DEFAULT_LEVELS } from "../lib/beads";
import type { SideLetter } from "../api/sides";

export interface BeadHighlight {
  from: number;
  to: number;
  kind: string;
}

export interface EdgeBeadsProps {
  edge: string;
  reversed?: boolean;
  highlight?: ReadonlyArray<BeadHighlight>;
  size?: "sm" | "md" | "lg";
  label?: string;
  side?: SideLetter;
  levels?: number;
  showSymbols?: boolean;
}

export default function EdgeBeads({
  edge,
  reversed = false,
  highlight = [],
  size = "md",
  label = "Edge",
  side,
  levels = DEFAULT_LEVELS,
  showSymbols = false,
}: EdgeBeadsProps) {
  const symbols = Array.from(edge);
  const items = symbols.map((symbol, index) => ({ symbol, index }));
  if (reversed) items.reverse();
  const kindAt = (index: number) => highlight.find((h) => index >= h.from && index < h.to)?.kind;
  const description = `${label}${reversed ? " (reversed)" : ""}: ${symbols.length ? edge : "empty"}`;

  return (
    <div
      className={`beads beads-${size}${side ? ` beads-side-${side.toLowerCase()}` : ""}`}
      role="img"
      aria-label={description}
    >
      {items.length === 0 && (
        <span className="beads-empty" aria-hidden="true">
          (empty edge)
        </span>
      )}
      {items.map(({ symbol, index }) => {
        const color = symbolColor(symbol, levels);
        const kind = kindAt(index);
        const classes = ["bead", color ? "" : "bead-unknown", kind ? `bead-hl bead-hl-${kind}` : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <span
            key={index}
            className={classes}
            title={color ? symbol : `${symbol} (not in the ${levels}-level palette)`}
            data-symbol={symbol}
            data-kind={kind}
            style={color ? { backgroundColor: rgbCss(color) } : undefined}
            aria-hidden="true"
          >
            {color ? (showSymbols ? symbol : "") : "?"}
          </span>
        );
      })}
    </div>
  );
}

/** The numeric strip (`FragmentDetail.strips[side]`, [r, g, b] samples) as swatches, before quantisation. */
export function StripSwatches({
  strip,
  label,
  size = "md",
}: {
  strip: ReadonlyArray<ReadonlyArray<number>>;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const text = strip.map((s) => s.map((v) => Math.round(v)).join(",")).join(" ");
  return (
    <div className={`beads beads-${size} beads-swatches`} role="img" aria-label={`${label}: ${text || "empty"}`}>
      {strip.length === 0 && (
        <span className="beads-empty" aria-hidden="true">
          (no samples)
        </span>
      )}
      {strip.map((sample, i) => (
        <span
          key={i}
          className="bead bead-swatch"
          title={`rgb(${sample.map((v) => Math.round(v)).join(", ")})`}
          style={{ backgroundColor: sampleCss(sample) }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
