// Owner: A (Arvind)
// Ground-truth overlay (T27). Absolute cells are NOT comparable: metrics ignore a global shift and quarter-turn
// (backend `engine/metrics.py`, ALGORITHMS §14). So this is a port of the same two measures:
//
//  * neighbour check (`classify`): for every truly adjacent pair (f, g) (g right of / below f in the original
//    picture) the pair is correct in the layout when both are placed, their net orientations agree
//    (`scramble_rot + rot` mod 4) and g sits where f's true direction points after that rotation. A tile is
//    "correct" when all its true adjacencies are right, "wrong" when none is, "partial" when some are, and
//    "unknown" when it has no true neighbour (a 1×1 picture).
//  * best alignment (`bestAlignment`): the global quarter-turn and shift that put the most fragments exactly in their
//    true cell with the right orientation (the `direct_accuracy` idea), and which fragments those are.
import type { FragmentOut } from "../api/types";
import { mod4 } from "./confidence";
import type { ReplayTile } from "./replay";

export interface Truth {
  label: string;
  row: number;
  col: number;
  /** Clockwise quarter turns applied when the fragment was scrambled. */
  rot: number;
}

/** Truth for every fragment, or null when the artifact has none (uploaded fragments: `true_row` is null). */
export function truthOf(fragments: readonly FragmentOut[]): Map<string, Truth> | null {
  const out = new Map<string, Truth>();
  for (const f of fragments) {
    if (f.true_row === null || f.true_col === null) return null;
    out.set(f.label, { label: f.label, row: f.true_row, col: f.true_col, rot: f.scramble_rot ?? 0 });
  }
  return out.size ? out : null;
}

/** Rotates a grid vector clockwise by k quarter turns: (dr, dc) -> (dc, -dr). */
export function rotVec(dr: number, dc: number, k: number): [number, number] {
  let r = dr;
  let c = dc;
  for (let i = 0; i < mod4(k); i++) [r, c] = [c, -r];
  return [r + 0, c + 0]; // + 0 turns -0 into 0
}

export type Verdict = "correct" | "partial" | "wrong" | "unknown";
export interface TileVerdict {
  verdict: Verdict;
  correct: number;
  total: number;
}

export const VERDICT_SYMBOL: Record<Verdict, string> = { correct: "✓", partial: "◐", wrong: "✗", unknown: "·" };
export const VERDICT_WORD: Record<Verdict, string> = {
  correct: "correct",
  partial: "partly correct",
  wrong: "wrong",
  unknown: "no ground truth neighbours",
};

export function classify(tiles: readonly ReplayTile[], truth: ReadonlyMap<string, Truth>): Map<string, TileVerdict> {
  const placed = new Map(tiles.map((t) => [t.label, t]));
  const byCell = new Map([...truth.values()].map((t) => [`${t.row},${t.col}`, t.label]));
  const tally = new Map<string, { correct: number; total: number }>();
  const bump = (label: string, ok: boolean) => {
    const e = tally.get(label) ?? { correct: 0, total: 0 };
    e.total += 1;
    if (ok) e.correct += 1;
    tally.set(label, e);
  };
  for (const [f, t] of truth)
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const g = byCell.get(`${t.row + dr},${t.col + dc}`);
      if (g === undefined) continue;
      const pf = placed.get(f);
      const pg = placed.get(g);
      let ok = false;
      if (pf && pg) {
        const nf = mod4(t.rot + pf.rot);
        const ng = mod4(truth.get(g)!.rot + pg.rot);
        const [er, ec] = rotVec(dr, dc, nf);
        ok = nf === ng && pg.row - pf.row === er && pg.col - pf.col === ec;
      }
      bump(f, ok);
      bump(g, ok);
    }
  const out = new Map<string, TileVerdict>();
  for (const tile of tiles) {
    const e = tally.get(tile.label) ?? { correct: 0, total: 0 };
    const verdict: Verdict =
      e.total === 0 ? "unknown" : e.correct === e.total ? "correct" : e.correct === 0 ? "wrong" : "partial";
    out.set(tile.label, { verdict, ...e });
  }
  return out;
}

export interface Alignment {
  /** Global clockwise quarter turns and the shift that give the most exact cells. */
  turns: number;
  shiftRow: number;
  shiftCol: number;
  /** Labels in their exact true cell with the right orientation under that alignment. */
  inPlace: Set<string>;
}

export function bestAlignment(tiles: readonly ReplayTile[], truth: ReadonlyMap<string, Truth>): Alignment {
  let best: Alignment = { turns: 0, shiftRow: 0, shiftCol: 0, inPlace: new Set() };
  for (let g = 0; g < 4; g++) {
    const votes = new Map<string, { row: number; col: number; labels: string[] }>();
    for (const p of tiles) {
      const t = truth.get(p.label);
      if (!t || mod4(t.rot + p.rot) !== g) continue;
      const [ur, uc] = rotVec(p.row, p.col, -g); // undo the global rotation
      const shift = { row: t.row - ur, col: t.col - uc };
      const id = `${shift.row},${shift.col}`;
      const v = votes.get(id) ?? { ...shift, labels: [] };
      v.labels.push(p.label);
      votes.set(id, v);
    }
    for (const v of votes.values())
      if (v.labels.length > best.inPlace.size)
        best = { turns: g, shiftRow: v.row, shiftCol: v.col, inPlace: new Set(v.labels) };
  }
  return best;
}
