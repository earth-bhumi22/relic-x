// Owner: A (Arvind)
import { SIGNALS, contributionsAddUp, editCounts, jaccard, lcsHighlights, motifHighlights, thinPairs } from "./signals";
import { explanationFixture } from "../test/fixtures";

describe("signals", () => {
  it("lists the five signals in one fixed order, each with a pattern, a label and a CSS variable", () => {
    expect(SIGNALS.map((s) => s.key)).toEqual(["color", "lcs", "edit", "motif", "hash"]);
    expect(new Set(SIGNALS.map((s) => s.pattern)).size).toBe(5);
    expect(new Set(SIGNALS.map((s) => s.cssVar)).size).toBe(5);
  });

  it("jaccard is safe for an empty union", () => {
    expect(jaccard(8, 10)).toBe(0.8);
    expect(jaccard(0, 0)).toBe(0);
  });

  it("counts edit operations", () => {
    const ops = [
      { op: "match", a: "A", b: "A" },
      { op: "sub", a: "Q", b: "R" },
      { op: "ins", a: null, b: "Z" },
      { op: "del", a: "Y", b: null },
      { op: "match", a: "B", b: "B" },
    ] as const;
    expect(editCounts([...ops])).toEqual({ match: 2, sub: 1, ins: 1, del: 1 });
  });

  it("maps LCS pairs [i, j] to edge A position i and edge B (reversed) position j", () => {
    const h = lcsHighlights([
      [3, 9],
      [9, 22],
    ]);
    expect(h.a).toEqual([
      { from: 3, to: 4, kind: "lcs" },
      { from: 9, to: 10, kind: "lcs" },
    ]);
    expect(h.b).toEqual([
      { from: 9, to: 10, kind: "lcs" },
      { from: 22, to: 23, kind: "lcs" },
    ]);
  });

  it("highlights the motif at [pos, pos + length) and nothing when there is no motif", () => {
    const m = { length: 5, pos_a: 2, pos_b: 7, motif: "ABCDE", kmp_ops: 1, rabin_karp_ops: 1 };
    expect(motifHighlights(m)).toEqual({
      a: [{ from: 2, to: 7, kind: "motif" }],
      b: [{ from: 7, to: 12, kind: "motif" }],
    });
    expect(motifHighlights({ ...m, length: 0, pos_a: -1, pos_b: -1, motif: "" })).toEqual({ a: [], b: [] });
  });

  it("thins long pair lists evenly and leaves short ones alone", () => {
    const many = Array.from({ length: 200 }, (_, i) => i);
    expect(thinPairs(many, 50)).toHaveLength(50);
    expect(thinPairs([1, 2, 3], 50)).toEqual([1, 2, 3]);
  });

  it("the mock explanation's contributions add up to its composite", () => {
    const x = explanationFixture("F01", 1, "F02", 3);
    expect(contributionsAddUp(x.contributions, x.composite)).toBe(true);
    expect(contributionsAddUp({ ...x.contributions, color: x.contributions.color + 0.2 }, x.composite)).toBe(false);
  });
});
