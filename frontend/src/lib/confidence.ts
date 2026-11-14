// Owner: A (Arvind)
// Placement confidence (T27). `PlacementOut` carries no confidence, so it is derived here from ONE source:
//
//   confidence(tile) = the mean composite score of the tile's joins with its currently placed neighbours,
//                      read from `GET /artifacts/{id}/matches` (integer sides, CONTRACT §5).
//
// A join is one of the tile's four sides touching a placed neighbour. With a tile at rotation `rot`, its side `s`
// faces direction `(s + rot) % 4` (0=N, 1=E, 2=S, 3=W; CONTRACT §3), so the side facing direction `d` is
// `(d - rot) mod 4`; the neighbour's facing side is `(d + 2 - nbRot) mod 4`. The pair is looked up in either order.
// A join the matcher never scored (the pre-filter skipped it as hopeless) counts as 0; it is not invented, and the
// `scored` / `joins` counts are shown next to the value. A tile with no placed neighbour (the seed on its own) has no
// confidence (`null`, shown as "—"). The numeric value is always shown (tooltip, focus label and the table), so the
// ring is never colour-only.
import type { SideMatchOut } from "../api/types";
import type { ReplayTile } from "./replay";

/** Row / column offsets for N, E, S, W. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];
export const mod4 = (n: number) => ((n % 4) + 4) % 4;

export interface Join {
  neighbour: string;
  /** This tile's side (0–3) and the neighbour's side that touch. */
  side: number;
  neighbourSide: number;
  composite: number | null;
}

export interface Confidence {
  /** Mean composite over the joins (unscored joins count as 0); null when the tile has no placed neighbour. */
  value: number | null;
  joins: Join[];
  scored: number;
}

export type MatchIndex = Map<string, number>;

const k = (a: string, sa: number, b: string, sb: number) => `${a}|${sa}|${b}|${sb}`;

export function indexMatches(matches: readonly SideMatchOut[]): MatchIndex {
  const index: MatchIndex = new Map();
  for (const m of matches) {
    index.set(k(m.a, m.side_a, m.b, m.side_b), m.composite);
    index.set(k(m.b, m.side_b, m.a, m.side_a), m.composite);
  }
  return index;
}

export function tileConfidence(tile: ReplayTile, tiles: readonly ReplayTile[], index: MatchIndex): Confidence {
  const at = new Map(tiles.map((t) => [`${t.row},${t.col}`, t]));
  const joins: Join[] = [];
  DIRS.forEach(([dr, dc], d) => {
    const nb = at.get(`${tile.row + dr},${tile.col + dc}`);
    if (!nb) return;
    const side = mod4(d - tile.rot);
    const neighbourSide = mod4(d + 2 - nb.rot);
    joins.push({
      neighbour: nb.label,
      side,
      neighbourSide,
      composite: index.get(k(tile.label, side, nb.label, neighbourSide)) ?? null,
    });
  });
  const scored = joins.filter((j) => j.composite !== null).length;
  const sum = joins.reduce((s, j) => s + (j.composite ?? 0), 0);
  return { value: joins.length ? sum / joins.length : null, joins, scored };
}

export function confidences(tiles: readonly ReplayTile[], matches: readonly SideMatchOut[]): Map<string, Confidence> {
  const index = indexMatches(matches);
  return new Map(tiles.map((t) => [t.label, tileConfidence(t, tiles, index)]));
}

/** Ring bands, so the ring shows level as well as a number: low < 0.4 <= medium < 0.7 <= high. */
export type ConfidenceLevel = "none" | "low" | "medium" | "high";
export const CONFIDENCE_BANDS = { medium: 0.4, high: 0.7 } as const;
export function confidenceLevel(value: number | null): ConfidenceLevel {
  if (value === null) return "none";
  if (value >= CONFIDENCE_BANDS.high) return "high";
  if (value >= CONFIDENCE_BANDS.medium) return "medium";
  return "low";
}
