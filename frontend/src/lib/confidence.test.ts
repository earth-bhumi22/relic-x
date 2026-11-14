// Owner: A (Arvind)
import type { FragmentOut, RunDetail, SideMatchOut } from "../api/types";
import real from "../test/runs-real.json";
import { confidenceLevel, confidences, indexMatches, tileConfidence } from "./confidence";
import { buildReplay } from "./replay";
import type { ReplayTile } from "./replay";
import { bestAlignment, classify, rotVec, truthOf } from "./truth";

const tile = (label: string, row: number, col: number, rot = 0): ReplayTile => ({
  label,
  row,
  col,
  rot,
  step: 1,
  kind: "place",
  note: "",
  score: null,
});
const match = (a: string, side_a: number, b: string, side_b: number, composite: number): SideMatchOut =>
  ({ a, side_a, b, side_b, composite, color: 0, lcs: 0, edit: 0, motif: 0, hash: 0 }) as SideMatchOut;

describe("confidence", () => {
  it("is the mean composite of the joins with placed neighbours, with sides derived from the rotation", () => {
    // A at (0,0) rot 0, B east of it (A.E=1 touches B.W=3), C south of it (A.S=2 touches C.N=0).
    const tiles = [tile("A", 0, 0), tile("B", 0, 1), tile("C", 1, 0)];
    const c = confidences(tiles, [match("A", 1, "B", 3, 0.8), match("C", 0, "A", 2, 0.4)]);
    expect(c.get("A")?.value).toBeCloseTo(0.6);
    expect(c.get("A")?.joins.map((j) => [j.neighbour, j.side, j.neighbourSide])).toEqual([
      ["B", 1, 3],
      ["C", 2, 0],
    ]);
    expect(c.get("B")?.value).toBeCloseTo(0.8); // matches are found in either order
    expect(c.get("C")?.value).toBeCloseTo(0.4);
  });

  it("a rotated tile contributes the side that faces the neighbour: side s faces (s + rot) % 4", () => {
    // B is rotated 180°; its side facing WEST (3) is side (3 - 2) mod 4 = 1.
    const index = indexMatches([match("A", 1, "B", 1, 0.9)]);
    const c = tileConfidence(tile("B", 0, 1, 2), [tile("A", 0, 0), tile("B", 0, 1, 2)], index);
    expect(c.joins).toEqual([{ neighbour: "A", side: 1, neighbourSide: 1, composite: 0.9 }]);
    expect(c.value).toBeCloseTo(0.9);
  });

  it("counts a join the matcher did not score as 0 and reports scored / joins; a lone tile has none", () => {
    const tiles = [tile("A", 0, 0), tile("B", 0, 1)];
    const c = confidences(tiles, []);
    expect(c.get("A")).toMatchObject({ value: 0, scored: 0 });
    expect(c.get("A")?.joins).toHaveLength(1);
    expect(confidences([tile("A", 0, 0)], []).get("A")).toMatchObject({ value: null, joins: [] });
  });

  it("bands: none / low / medium / high", () => {
    expect([null, 0.1, 0.4, 0.69, 0.7, 1].map(confidenceLevel)).toEqual([
      "none",
      "low",
      "medium",
      "medium",
      "high",
      "high",
    ]);
  });

  it("matches the trace's own scores on a real run (single-neighbour join of the second placement)", () => {
    const run = real.runs.greedy as unknown as RunDetail;
    const tiles = buildReplay(run).frames[2].tiles; // seed F06 + F01, joined at 0.6019 on the real backend
    const c = confidences(tiles, real.matches as unknown as SideMatchOut[]);
    expect(c.get("F01")?.value).toBeCloseTo(0.6019, 4);
    expect(c.get("F06")?.value).toBeCloseTo(0.6019, 4);
  });
});

describe("ground-truth overlay", () => {
  const frag = (label: string, row: number, col: number, rot = 0) =>
    ({ label, true_row: row, true_col: col, scramble_rot: rot }) as FragmentOut;
  // True picture: A B / C D
  const truth = truthOf([frag("A", 0, 0), frag("B", 0, 1), frag("C", 1, 0), frag("D", 1, 1)])!;
  const grid = (cells: [string, number, number, number?][]) => cells.map(([l, r, c, rot]) => tile(l, r, c, rot ?? 0));

  it("is disabled (null) when any fragment has no ground truth", () => {
    expect(truthOf([frag("A", 0, 0), { ...frag("B", 0, 1), true_row: null } as FragmentOut])).toBeNull();
    expect(truthOf([])).toBeNull();
  });

  it("a perfect layout is all correct", () => {
    const v = classify(
      grid([
        ["A", 0, 0],
        ["B", 0, 1],
        ["C", 1, 0],
        ["D", 1, 1],
      ]),
      truth,
    );
    expect([...v.values()].map((x) => x.verdict)).toEqual(["correct", "correct", "correct", "correct"]);
  });

  it("is invariant to a global shift and to a global quarter-turn", () => {
    const shifted = grid([
      ["A", 5, 3],
      ["B", 5, 4],
      ["C", 6, 3],
      ["D", 6, 4],
    ]);
    expect([...classify(shifted, truth).values()].every((x) => x.verdict === "correct")).toBe(true);
    // The whole picture turned 90° clockwise: cell (r, c) -> (c, -r), every tile rot 1.
    const turned = grid([
      ["A", 0, 0, 1],
      ["B", 1, 0, 1],
      ["C", 0, -1, 1],
      ["D", 1, -1, 1],
    ]);
    expect([...classify(turned, truth).values()].every((x) => x.verdict === "correct")).toBe(true);
    expect(rotVec(0, 1, 1)).toEqual([1, 0]);
  });

  it("flags swapped tiles wrong or partial, with counts", () => {
    // B and C swapped: A B / C D becomes A C / B D
    const v = classify(
      grid([
        ["A", 0, 0],
        ["C", 0, 1],
        ["B", 1, 0],
        ["D", 1, 1],
      ]),
      truth,
    );
    expect(v.get("A")).toEqual({ verdict: "wrong", correct: 0, total: 2 });
    expect(v.get("D")?.verdict).toBe("wrong");
    // Only D moved: A B / C then D far away
    const partial = classify(
      grid([
        ["A", 0, 0],
        ["B", 0, 1],
        ["C", 1, 0],
        ["D", 3, 3],
      ]),
      truth,
    );
    expect(partial.get("B")).toEqual({ verdict: "partial", correct: 1, total: 2 });
    expect(partial.get("D")).toEqual({ verdict: "wrong", correct: 0, total: 2 });
  });

  it("a rotated neighbour breaks the join (orientations must agree)", () => {
    const v = classify(
      grid([
        ["A", 0, 0],
        ["B", 0, 1, 2],
      ]),
      truth,
    );
    expect(v.get("A")?.verdict).toBe("wrong");
  });

  it("an unplaced true neighbour counts against the tile", () => {
    expect(classify(grid([["A", 0, 0]]), truth).get("A")).toEqual({ verdict: "wrong", correct: 0, total: 2 });
  });

  it("best alignment finds the shift and turn that put the most fragments in their true cell", () => {
    const a = bestAlignment(
      grid([
        ["A", 5, 3],
        ["B", 5, 4],
        ["C", 6, 3],
        ["D", 0, 0],
      ]),
      truth,
    );
    expect(a.turns).toBe(0);
    expect([...a.inPlace].sort()).toEqual(["A", "B", "C"]);
    expect(a).toMatchObject({ shiftRow: -5, shiftCol: -3 });
    const turned = bestAlignment(
      grid([
        ["A", 0, 0, 1],
        ["B", 1, 0, 1],
        ["C", 0, -1, 1],
        ["D", 1, -1, 1],
      ]),
      truth,
    );
    expect(turned.inPlace.size).toBe(4);
    expect(turned.turns).toBe(1);
  });

  it("agrees with the backend: a real run with neighbour accuracy 1.0 classifies every tile correct", () => {
    const run = real.runs.greedy as unknown as RunDetail;
    const t = truthOf(real.fragments as unknown as FragmentOut[])!;
    const tiles = buildReplay(run).frames.at(-1)!.tiles;
    expect([...classify(tiles, t).values()].every((x) => x.verdict === "correct")).toBe(true);
    expect(bestAlignment(tiles, t).inPlace.size).toBe(9);
  });
});
