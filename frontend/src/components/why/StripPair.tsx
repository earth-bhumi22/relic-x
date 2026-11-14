// Owner: A (Arvind)
// Edge A above edge B *reversed*, aligned bead for bead, optionally with SVG connector lines between paired
// positions (LCS). `pairs` are `[i, j]`: i indexes edge A, j indexes edge B reversed (as the API sends them).
import EdgeBeads from "../EdgeBeads";
import type { BeadHighlight } from "../EdgeBeads";
import type { SideLetter } from "../../api/sides";
import { thinPairs } from "../../lib/signals";

interface Props {
  edgeA: string;
  edgeBReversed: string;
  labelA: string;
  labelB: string;
  sideA?: SideLetter;
  sideB?: SideLetter;
  highlightA?: ReadonlyArray<BeadHighlight>;
  highlightB?: ReadonlyArray<BeadHighlight>;
  pairs?: ReadonlyArray<readonly [number, number]>;
  /** Draws the symbol inside each bead (useful where positions matter). */
  showSymbols?: boolean;
}

export default function StripPair({
  edgeA,
  edgeBReversed,
  labelA,
  labelB,
  sideA,
  sideB,
  highlightA,
  highlightB,
  pairs,
  showSymbols = false,
}: Props) {
  const n = Math.max(edgeA.length, edgeBReversed.length, 1);
  const drawn = pairs ? thinPairs(pairs) : [];
  return (
    <div className="why-pair" style={{ "--n": n } as React.CSSProperties}>
      <EdgeBeads edge={edgeA} label={labelA} side={sideA} highlight={highlightA} showSymbols={showSymbols} />
      {pairs && (
        <svg
          className="why-links"
          viewBox={`0 0 ${n} 10`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="lcs-links"
          data-links={drawn.length}
        >
          {drawn.map(([i, j]) => (
            <line key={`${i}-${j}`} x1={i + 0.5} y1={0} x2={j + 0.5} y2={10} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
      <EdgeBeads edge={edgeBReversed} label={labelB} side={sideB} highlight={highlightB} showSymbols={showSymbols} />
    </div>
  );
}
