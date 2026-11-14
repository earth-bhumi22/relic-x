// Owner: A (Arvind)
// Lab data transforms as pure functions (no chart, no DOM). Real payloads come from the running API (lab-real.json).
import type { Algorithm, RunDetail, ScalingOut } from "../api/types";
import { runFixture } from "../test/fixtures";
import real from "../test/lab-real.json";
import {
  barSeries,
  benchmarkRows,
  bestPerColumn,
  fitLogLog,
  fitSeries,
  logSafe,
  matchRows,
  readResult,
  scalingAlgorithms,
  scalingSeries,
  sortRows,
  totalOperations,
  truncKey,
} from "./labData";
import type { BenchRow } from "./labData";

const realRuns = real.benchmark as unknown as RunDetail[];
const realScaling = real.scaling as unknown as ScalingOut;

const row = (algorithm: Algorithm, over: Partial<BenchRow> = {}): BenchRow => ({
  algorithm,
  label: algorithm,
  runId: algorithm,
  elapsed_ms: 1,
  operations: 10,
  breakdown: [],
  total_score: 5,
  neighbour_accuracy: 1,
  direct_accuracy: 1,
  coverage: 1,
  truncated: false,
  ...over,
});

describe("totalOperations (the two operations shapes)", () => {
  it("sums an object of counters", () => {
    expect(totalOperations({ heap_pushes: 35, heap_pops: 35 })).toBe(70);
    expect(totalOperations({ score_lookups: 4, junk: "x", nope: null })).toBe(4);
  });
  it("passes a single number through (scaling points) and treats nothing as 0", () => {
    expect(totalOperations(150197)).toBe(150197);
    expect(totalOperations(undefined)).toBe(0);
    expect(totalOperations({})).toBe(0);
  });
});

describe("benchmarkRows", () => {
  it("turns real RunDetail[] into rows with summed operations and a sorted breakdown", () => {
    const rows = benchmarkRows(realRuns);
    expect(rows.map((r) => r.algorithm)).toEqual(["greedy", "best_first", "dijkstra", "backtracking"]);
    const dijkstra = rows[2];
    expect(dijkstra.operations).toBe(10 + 24 + 6);
    expect(dijkstra.breakdown[0]).toEqual(["relaxations", 24]);
    expect(rows[3].operations).toBe(194 + 386);
    expect(rows[0].label).toBe("Greedy");
  });
  it("keeps null accuracies as null", () => {
    const run = { ...runFixture("greedy"), neighbour_accuracy: null, direct_accuracy: null, coverage: null };
    const [r] = benchmarkRows([run as RunDetail]);
    expect([r.neighbour_accuracy, r.direct_accuracy, r.coverage]).toEqual([null, null, null]);
  });
});

describe("bestPerColumn", () => {
  const rows = [
    row("greedy", { elapsed_ms: 5, total_score: 4, direct_accuracy: 0.5 }),
    row("best_first", { elapsed_ms: 2, total_score: 6, direct_accuracy: 1 }),
    row("backtracking", { elapsed_ms: 90, total_score: 6, direct_accuracy: null }),
  ];
  it("lowest time, highest score (ties share), nulls ignored", () => {
    const best = bestPerColumn(rows);
    expect([...best.elapsed_ms]).toEqual(["best_first"]);
    expect([...best.total_score].sort()).toEqual(["backtracking", "best_first"]);
    expect([...best.direct_accuracy]).toEqual(["best_first"]);
  });
  it("marks nothing when every value is equal, or when there is a single row", () => {
    expect(bestPerColumn([row("greedy"), row("dijkstra")]).total_score.size).toBe(0);
    expect(bestPerColumn([row("greedy")]).elapsed_ms.size).toBe(0);
  });
});

describe("sortRows", () => {
  const rows = [
    row("greedy", { label: "Greedy", elapsed_ms: 5, direct_accuracy: null }),
    row("dijkstra", { label: "Dijkstra", elapsed_ms: 1, direct_accuracy: 0.4 }),
    row("backtracking", { label: "Backtracking", elapsed_ms: 9, direct_accuracy: 0.9 }),
  ];
  it("sorts numbers both ways", () => {
    expect(sortRows(rows, "elapsed_ms", "asc").map((r) => r.algorithm)).toEqual(["dijkstra", "greedy", "backtracking"]);
    expect(sortRows(rows, "elapsed_ms", "desc").map((r) => r.algorithm)).toEqual([
      "backtracking",
      "greedy",
      "dijkstra",
    ]);
  });
  it("puts null last in either direction", () => {
    expect(sortRows(rows, "direct_accuracy", "asc").map((r) => r.algorithm)).toEqual([
      "dijkstra",
      "backtracking",
      "greedy",
    ]);
    expect(sortRows(rows, "direct_accuracy", "desc").map((r) => r.algorithm)).toEqual([
      "backtracking",
      "dijkstra",
      "greedy",
    ]);
  });
  it("sorts by name and does not mutate its input", () => {
    expect(sortRows(rows, "algorithm", "asc").map((r) => r.label)).toEqual(["Backtracking", "Dijkstra", "Greedy"]);
    expect(rows[0].algorithm).toBe("greedy");
  });
});

describe("chart series", () => {
  it("groups by measure with one key per algorithm", () => {
    const d = barSeries(
      [row("greedy", { elapsed_ms: 3 }), row("dijkstra", { elapsed_ms: 7 })],
      ["elapsed_ms", "total_score"],
    );
    expect(d).toEqual([
      { measure: "elapsed_ms", label: "Time (ms)", greedy: 3, dijkstra: 7 },
      { measure: "total_score", label: "Total score", greedy: 5, dijkstra: 5 },
    ]);
  });
  it("turns 0 into a gap on a log axis (never a fake value)", () => {
    expect(logSafe(0)).toBeNull();
    expect(logSafe(-3)).toBeNull();
    expect(logSafe(null)).toBeNull();
    expect(logSafe(0.08)).toBe(0.08);
    const d = barSeries([row("greedy", { operations: 0 })], ["operations"], true);
    expect(d[0].greedy).toBeNull();
  });
});

describe("scalingSeries", () => {
  it("builds one series per algorithm, ordered by n, from the real payload", () => {
    const s = scalingSeries(realScaling.points, "elapsed_ms", scalingAlgorithms(realScaling));
    expect(s.map((d) => d.n)).toEqual([9, 16, 25, 36]);
    expect(s[3].backtracking).toBe(realScaling.points[3].runs.backtracking?.elapsed_ms);
    expect(s[2][truncKey("backtracking")]).toBe(true);
    expect(s[0][truncKey("greedy")]).toBe(false);
  });
  it("uses the numeric operations of scaling points as they are", () => {
    const s = scalingSeries(realScaling.points, "operations", ["backtracking"]);
    expect(s[2].backtracking).toBe(150197);
  });
  it("leaves a gap (null), not zero, where an algorithm has no run at a size", () => {
    const points = structuredClone(realScaling.points);
    delete points[1].runs.dijkstra;
    const s = scalingSeries(points, "elapsed_ms", ["dijkstra"]);
    expect(s[1].dijkstra).toBeNull();
    expect(s[0].dijkstra).not.toBeNull();
  });
  it("guards log scale against zeros", () => {
    const points = structuredClone(realScaling.points);
    points[0].runs.greedy!.elapsed_ms = 0;
    expect(scalingSeries(points, "elapsed_ms", ["greedy"], true)[0].greedy).toBeNull();
    expect(scalingSeries(points, "elapsed_ms", ["greedy"], false)[0].greedy).toBe(0);
  });
  it("lists the algorithms present, in canonical order", () => {
    expect(scalingAlgorithms(realScaling)).toEqual(["greedy", "best_first", "dijkstra", "backtracking"]);
  });
});

describe("fitLogLog", () => {
  it("recovers an exact power law with R² = 1", () => {
    const fit = fitLogLog([4, 9, 16, 25].map((x) => ({ x, y: 3 * x ** 2 })));
    expect(fit?.exponent).toBeCloseTo(2, 10);
    expect(fit?.coefficient).toBeCloseTo(3, 10);
    expect(fit?.r2).toBeCloseTo(1, 10);
  });
  it("gives R² below 1 for scattered data", () => {
    const fit = fitLogLog([
      { x: 1, y: 1 },
      { x: 2, y: 8 },
      { x: 4, y: 5 },
      { x: 8, y: 30 },
    ]);
    expect(fit!.r2).toBeGreaterThan(0);
    expect(fit!.r2).toBeLessThan(0.95);
  });
  it("needs three positive points", () => {
    expect(
      fitLogLog([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBeNull();
    expect(
      fitLogLog([
        { x: 1, y: 0 },
        { x: 2, y: 2 },
        { x: 3, y: 0 },
      ]),
    ).toBeNull();
    expect(
      fitLogLog([
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
      ]),
    ).toBeNull();
  });
  it("fits a real series and excludes truncated points", () => {
    const all = fitSeries(realScaling.points, "backtracking", "elapsed_ms");
    expect(all).toBeNull(); // n = 25 and 36 were truncated; only 2 points are left, so no fit
    const greedy = fitSeries(realScaling.points, "greedy", "elapsed_ms");
    expect(greedy?.points).toBe(4);
    expect(greedy!.exponent).toBeGreaterThan(0.5);
  });
});

describe("matchRows", () => {
  it("reads the match stage of each point", () => {
    const rows = matchRows(realScaling.points);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ n: 9, size: 3, scored: realScaling.points[0].match.side_pairs_scored });
  });
});

describe("readResult (computed from the numbers)", () => {
  it("states the speed ratio and the score difference from the data", () => {
    const lines = readResult([
      row("greedy", { label: "Greedy", elapsed_ms: 2, total_score: 5 }),
      row("backtracking", { label: "Backtracking", elapsed_ms: 50, total_score: 5.5 }),
    ]);
    expect(lines[0]).toBe("Greedy was fastest (2 ms); Backtracking took 25× as long (50 ms).");
    expect(lines[1]).toBe("Backtracking scored 0.5 above greedy (5.5 vs 5) and took 25× as long.");
  });
  it("says 'below' when backtracking scored less, and 'matched' when equal", () => {
    expect(readResult([row("greedy", { total_score: 6 }), row("backtracking", { total_score: 5 })])[1]).toMatch(
      /below greedy/,
    );
    expect(readResult([row("greedy"), row("backtracking")])[1]).toMatch(/matched greedy's total score/);
  });
  it("names the most accurate solver, or says accuracy is unavailable", () => {
    expect(
      readResult([row("greedy", { direct_accuracy: 0.5 }), row("dijkstra", { direct_accuracy: 0.75 })]).join(" "),
    ).toMatch(/Highest direct accuracy: dijkstra \(75%\)/);
    expect(readResult([row("greedy", { direct_accuracy: null })]).join(" ")).toMatch(/No ground truth/);
  });
  it("flags a truncated run and never invents a comparison for a single row", () => {
    const lines = readResult([row("backtracking", { label: "Backtracking", truncated: true })]);
    expect(lines.some((l) => /hit its node limit/.test(l))).toBe(true);
    expect(lines.some((l) => /fastest/.test(l))).toBe(false);
  });
  it("is empty for no rows", () => {
    expect(readResult([])).toEqual([]);
  });
});
