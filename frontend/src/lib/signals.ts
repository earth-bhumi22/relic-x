// Owner: A (Arvind)
// The matcher's five signals, defined once so every page draws them in the same order and colours
// ("Why matched?" drawer in T26, charts in T28). Colours are CSS custom properties (`--sig-*`, defined for both
// themes in styles.css, Okabe–Ito based). Colour is never the only cue: each signal also has a fill pattern
// (`sig-pattern-*` classes) and a short text label.
import type { Explanation, Weights } from "../api/types";

export type SignalKey = keyof Weights;

export interface SignalInfo {
  key: SignalKey;
  label: string;
  /** Initial shown inside score-bar segments. */
  short: string;
  cssVar: string;
  pattern: "solid" | "stripes" | "dots" | "cross" | "diagonal";
  /** One plain-language line, shown under the signal's heading. */
  blurb: string;
}

/** Order matters: it is the stacking order of the score bar and the order of the sections. */
export const SIGNALS: readonly SignalInfo[] = [
  {
    key: "color",
    label: "Colour",
    short: "C",
    cssVar: "--sig-color",
    pattern: "solid",
    blurb: "How close the two edges are in actual colour, sample by sample, before quantising.",
  },
  {
    key: "lcs",
    label: "LCS",
    short: "L",
    cssVar: "--sig-lcs",
    pattern: "stripes",
    blurb: "Longest common subsequence: symbols that appear in the same order in both edges, gaps allowed.",
  },
  {
    key: "edit",
    label: "Edit distance",
    short: "E",
    cssVar: "--sig-edit",
    pattern: "dots",
    blurb: "How many substitutions, insertions or deletions turn one edge into the other.",
  },
  {
    key: "motif",
    label: "Shared motif",
    short: "M",
    cssVar: "--sig-motif",
    pattern: "cross",
    blurb: "The longest run of symbols that both edges contain unbroken (found with KMP / Rabin-Karp).",
  },
  {
    key: "hash",
    label: "Hash overlap",
    short: "H",
    cssVar: "--sig-hash",
    pattern: "diagonal",
    blurb: "How many n-gram fingerprints the edges share, as a share of all n-grams (Jaccard).",
  },
];

export const signalInfo = (key: SignalKey): SignalInfo => SIGNALS.find((s) => s.key === key)!;

/** Jaccard ratio shared / union; 0 when the union is empty (no n-grams at all). */
export const jaccard = (shared: number, union: number): number => (union > 0 ? shared / union : 0);

export type EditOpKind = Explanation["edit"]["ops"][number]["op"];

export function editCounts(ops: Explanation["edit"]["ops"]): Record<EditOpKind, number> {
  const counts: Record<EditOpKind, number> = { match: 0, sub: 0, ins: 0, del: 0 };
  for (const o of ops) counts[o.op] += 1;
  return counts;
}

export const contributionSum = (c: Weights): number => SIGNALS.reduce((sum, s) => sum + c[s.key], 0);

/** True when the contributions add up to the composite within the 4-decimal rounding of the API. */
export const contributionsAddUp = (c: Weights, composite: number, tolerance = 0.001): boolean =>
  Math.abs(contributionSum(c) - composite) <= tolerance;

/**
 * LCS pairs are `[i, j]`: `i` indexes `edge_a`, `j` indexes `edge_b_reversed` (verified against the backend:
 * `edge_a[i] === edge_b_reversed[j]` for every pair). Returns one-bead ranges for each strip.
 */
export function lcsHighlights(pairs: ReadonlyArray<readonly [number, number]>) {
  return {
    a: pairs.map(([i]) => ({ from: i, to: i + 1, kind: "lcs" })),
    b: pairs.map(([, j]) => ({ from: j, to: j + 1, kind: "lcs" })),
  };
}

/** The shared motif as `[pos, pos + length)` in each strip; empty when there is none (`length` 0, pos -1). */
export function motifHighlights(m: Explanation["motif"]) {
  if (m.length <= 0 || m.pos_a < 0 || m.pos_b < 0) return { a: [], b: [] };
  return {
    a: [{ from: m.pos_a, to: m.pos_a + m.length, kind: "motif" }],
    b: [{ from: m.pos_b, to: m.pos_b + m.length, kind: "motif" }],
  };
}

/** Keeps at most `max` evenly spaced pairs so a long LCS does not draw hundreds of connector lines. */
export function thinPairs<T>(pairs: readonly T[], max = 48): T[] {
  if (pairs.length <= max) return [...pairs];
  const step = pairs.length / max;
  return Array.from({ length: max }, (_, k) => pairs[Math.floor(k * step)]);
}

export const percent = (ratio: number): string => `${(ratio * 100).toFixed(0)}%`;
