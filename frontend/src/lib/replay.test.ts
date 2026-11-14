// Owner: A (Arvind)
// Replay logic: every prefix, the shift derived from the trace, backtrack undo, capped traces, and runs captured from
// the real backend (src/test/runs-real.json).
import type { RunDetail, TraceStepOut } from "../api/types";
import { runFixture } from "../test/fixtures";
import real from "../test/runs-real.json";
import { buildReplay, droppedSteps, replayBounds } from "./replay";

const R = real.runs as unknown as Record<string, RunDetail>;
const step = (n: number, action: string, data: Record<string, unknown> = {}, message = action): TraceStepOut => ({
  step: n,
  action,
  message,
  data,
});
const at = (label: string, row: number, col: number, rot = 0) => ({ fragment_id: label, label, row, col, rot });
const sorted = (tiles: { label: string; row: number; col: number; rot: number }[]) =>
  tiles.map(({ label, row, col, rot }) => ({ label, row, col, rot })).sort((a, b) => a.label.localeCompare(b.label));

/** A tiny run: seed A at internal (0,0), B east, C south-west (negative column). */
function tinyRun(over: Partial<RunDetail> = {}): RunDetail {
  return {
    ...runFixture("greedy"),
    placements: [at("C", 1, 0, 1), at("A", 0, 1), at("B", 0, 2)],
    trace: [
      step(1, "seed", { fragment: "A", row: 0, col: 0, rot: 0 }),
      step(2, "place", { fragment: "B", row: 0, col: 1, rot: 0, score: 0.8 }),
      step(3, "place", { fragment: "C", row: 1, col: -1, rot: 1, score: 0.6 }),
    ],
    trace_dropped: {},
    truncated: false,
    ...over,
  };
}

describe("buildReplay — exact replays", () => {
  it("has one frame per step plus the empty start, and every prefix is the expected partial layout", () => {
    const rp = buildReplay(tinyRun());
    expect(rp.mode).toBe("exact");
    expect(rp.frames).toHaveLength(4);
    expect(rp.frames.map((f) => f.tiles.map((t) => t.label))).toEqual([[], ["A"], ["A", "B"], ["A", "B", "C"]]);
    expect(rp.frames[1].tiles[0]).toMatchObject({ row: 0, col: 1 }); // seed shifted from (0,0) to its final cell
    expect(rp.frames[3].tiles.find((t) => t.label === "C")).toMatchObject({ row: 1, col: 0, rot: 1 });
  });

  it("derives the shift from the trace, including negative internal coordinates", () => {
    const rp = buildReplay(tinyRun());
    expect(rp.shift).toEqual({ row: 0, col: 1 });
    expect(rp.message).toBeNull();
  });

  it("replaying the whole trace reproduces the final placements (every algorithm on the mock)", () => {
    for (const alg of ["greedy", "best_first", "dijkstra"] as const) {
      const run = runFixture(alg);
      const rp = buildReplay(run);
      expect(rp.mode).toBe("exact");
      expect(sorted(rp.frames[rp.frames.length - 1].tiles)).toEqual(sorted(run.placements));
    }
  });

  it("conflict and fallback steps place a flagged tile that keeps the step's reason", () => {
    const rp = buildReplay(runFixture("best_first"));
    const last = rp.frames[rp.frames.length - 1].tiles.find((t) => t.kind === "fallback");
    expect(last?.note).toMatch(/not attached by any join/);
    const dj = buildReplay(runFixture("dijkstra"))
      .frames.at(-1)!
      .tiles.find((t) => t.kind === "conflict");
    expect(dj?.note).toMatch(/not reachable/);
  });
});

describe("buildReplay — real backend runs", () => {
  it.each([
    ["greedy", { row: 1, col: 1 }], // internal cells run -1…+1 in both directions: shift is +1, +1
    ["bestFirstFallback", { row: 0, col: 2 }], // internal columns run -2…0
    ["dijkstraConflict", { row: 0, col: 2 }],
  ])("%s: the trace reproduces the placements after the derived shift", (name, shift) => {
    const run = R[name as string];
    const rp = buildReplay(run);
    expect(rp.mode).toBe("exact");
    expect(rp.shift).toEqual(shift);
    expect(sorted(rp.frames.at(-1)!.tiles)).toEqual(sorted(run.placements));
  });

  it("real fallback / conflict runs flag their tiles", () => {
    expect(
      buildReplay(R.bestFirstFallback)
        .frames.at(-1)!
        .tiles.filter((t) => t.kind === "fallback"),
    ).toHaveLength(7);
    expect(
      buildReplay(R.dijkstraConflict)
        .frames.at(-1)!
        .tiles.filter((t) => t.kind === "conflict"),
    ).toHaveLength(7);
  });

  it("an uncapped backtracking trace plays back its tries, then ends on the final layout", () => {
    const run = R.backtrackingFull;
    const rp = buildReplay(run);
    expect(rp.frames.at(-1)!.final || rp.mode === "exact").toBe(true);
    expect(sorted(rp.frames.at(-1)!.tiles)).toEqual(sorted(run.placements));
    expect(rp.frames.some((f) => f.backtracks > 0)).toBe(true);
  });

  it("a capped backtracking trace ends on the final layout and says how much was not recorded", () => {
    const run = R.backtrackingCapped;
    const rp = buildReplay(run);
    expect(rp.mode).toBe("final-only");
    expect(rp.dropped).toBe(droppedSteps(run));
    expect(rp.dropped).toBeGreaterThan(5000);
    expect(rp.message).toMatch(/Trace truncated: 5,503 steps were not recorded/);
    const last = rp.frames.at(-1)!;
    expect(last.final).toBe(true);
    expect(sorted(last.tiles)).toEqual(sorted(run.placements));
    expect(rp.frames).toHaveLength(run.trace.length + 2);
  });
});

describe("buildReplay — backtracking", () => {
  const bt = (trace: TraceStepOut[], placements = [at("A", 0, 0), at("B", 0, 1)], dropped = {}): RunDetail => ({
    ...runFixture("backtracking"),
    placements,
    trace,
    trace_dropped: dropped,
  });

  it("backtrack undoes the last try, so the canvas shows the current partial arrangement", () => {
    const rp = buildReplay(
      bt([
        step(1, "incumbent", { score: 1 }),
        step(2, "place", { fragment: "B", row: 0, col: 0, rot: 0 }),
        step(3, "prune", { row: 0, col: 1 }),
        step(4, "backtrack", { fragment: "B", row: 0, col: 0 }),
        step(5, "place", { fragment: "A", row: 0, col: 0, rot: 0 }),
        step(6, "place", { fragment: "B", row: 0, col: 1, rot: 0 }),
        step(7, "stop"),
      ]),
    );
    expect(rp.mode).toBe("exact");
    expect(rp.frames.map((f) => f.tiles.map((t) => t.label).join(""))).toEqual(["", "", "B", "B", "", "A", "AB", "AB"]);
    expect(rp.frames[3].prunes).toBe(1);
    expect(rp.frames[4].backtracks).toBe(1);
  });

  it("a re-try of the same fragment moves its tile instead of duplicating it", () => {
    const rp = buildReplay(
      bt([
        step(1, "place", { fragment: "A", row: 0, col: 1, rot: 0 }),
        step(2, "place", { fragment: "A", row: 0, col: 0, rot: 0 }),
        step(3, "place", { fragment: "B", row: 0, col: 1, rot: 0 }),
      ]),
    );
    expect(rp.frames[2].tiles).toHaveLength(1);
    expect(rp.frames[2].tiles[0]).toMatchObject({ row: 0, col: 0 });
  });

  it("a capped trace that does not reach the final layout still ends on it", () => {
    const rp = buildReplay(
      bt(
        [step(1, "place", { fragment: "A", row: 0, col: 0, rot: 0 }), step(2, "limit", { nodes: 2000 })],
        [at("A", 0, 0), at("B", 0, 1)],
        { place: 10, prune: 4 },
      ),
    );
    expect(rp.mode).toBe("final-only");
    expect(rp.frames.at(-1)!.final).toBe(true);
    expect(
      rp.frames
        .at(-1)!
        .tiles.map((t) => t.label)
        .sort(),
    ).toEqual(["A", "B"]);
    expect(rp.frames.at(-2)!.nodes).toBe(2000);
    expect(rp.message).toMatch(/Trace truncated: 14 steps were not recorded/);
  });
});

describe("buildReplay — traces that cannot be replayed", () => {
  it("says so (and draws the placements) when the trace disagrees with the final layout", () => {
    const run = tinyRun({ placements: [at("A", 0, 0), at("B", 3, 3, 2), at("C", 1, 0, 1)] });
    const rp = buildReplay(run);
    expect(rp.mode).toBe("inconsistent");
    expect(rp.message).toMatch(/does not reproduce/);
    expect(rp.frames).toHaveLength(1);
    expect(rp.frames[0].final).toBe(true);
    expect(rp.frames[0].tiles).toHaveLength(3);
  });

  it("rejects a rotation mismatch even when positions agree", () => {
    expect(buildReplay(tinyRun({ placements: [at("A", 0, 1), at("B", 0, 2), at("C", 1, 0, 3)] })).mode).toBe(
      "inconsistent",
    );
  });

  it("an empty trace is reported, not drawn as a blank", () => {
    const rp = buildReplay(tinyRun({ trace: [] }));
    expect(rp.mode).toBe("empty");
    expect(rp.message).toMatch(/no trace/);
    expect(rp.frames.at(-1)!.final).toBe(true);
  });

  it("a placing step without coordinates marks the replay inconsistent instead of throwing", () => {
    const rp = buildReplay(tinyRun({ trace: [step(1, "seed", { fragment: "A" })] }));
    expect(rp.mode).toBe("inconsistent");
  });
});

describe("replayBounds", () => {
  it("is sized from the placements, so a layout wider than the artifact grid fits", () => {
    const run = tinyRun({ placements: [at("A", 0, 0), at("B", 0, 5), at("C", 1, 2)] });
    run.trace = [
      step(1, "seed", { fragment: "A", row: 0, col: 0 }),
      step(2, "place", { fragment: "B", row: 0, col: 5 }),
      step(3, "place", { fragment: "C", row: 1, col: 2 }),
    ];
    expect(replayBounds(buildReplay(run))).toEqual({ minRow: 0, minCol: 0, rows: 2, cols: 6 });
  });

  it("is empty with no tiles", () => {
    expect(replayBounds(buildReplay(tinyRun({ trace: [], placements: [] })))).toEqual({
      minRow: 0,
      minCol: 0,
      rows: 0,
      cols: 0,
    });
  });
});
