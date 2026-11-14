// Owner: A (Arvind)
// Mock behaviour the Lab page relies on: benchmark (all four solvers, truncation, 409) and the scaling experiment.
import { POTTERY } from "./mocks";
import { matchArtifact, runBenchmark, runScalingBenchmark } from "./client";
import { ApiError } from "./errors";
import { totalOperations } from "../lib/labData";
import { ARTIFACT_ID } from "../test/fixtures";
import { useMockApi } from "../test/mockApi";

describe("mock benchmark", () => {
  useMockApi();

  it("runs all four algorithms, backtracking truncated at a small node limit", async () => {
    const runs = await runBenchmark(ARTIFACT_ID, {
      algorithms: ["greedy", "best_first", "dijkstra", "backtracking"],
      node_limit: 100,
    });
    expect(runs.map((r) => r.algorithm)).toEqual(["greedy", "best_first", "dijkstra", "backtracking"]);
    expect(runs.find((r) => r.algorithm === "backtracking")?.truncated).toBe(true);
    expect(runs.find((r) => r.algorithm === "greedy")?.truncated).toBe(false);
    expect(runs.every((r) => totalOperations(r.operations) > 0)).toBe(true);
  });

  it("answers 409 until the artifact is matched, then works", async () => {
    const id = POTTERY.id as string;
    await expect(runBenchmark(id, { algorithms: ["greedy"] })).rejects.toMatchObject({ status: 409 });
    await matchArtifact(id, {});
    expect(await runBenchmark(id, { algorithms: ["greedy"] })).toHaveLength(1);
  });

  it("honours an AbortSignal", async () => {
    const c = new AbortController();
    const p = runBenchmark(ARTIFACT_ID, { algorithms: ["greedy"] }, { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("mock scaling", () => {
  useMockApi();

  it("uses the API defaults and returns time growing with n, backtracking steeply", async () => {
    const out = await runScalingBenchmark({});
    expect(out.sample).toBe("mosaic-tile");
    expect(out.points.map((p) => p.size)).toEqual([3, 4, 5, 6]);
    const time = (alg: "greedy" | "backtracking") => out.points.map((p) => p.runs[alg]?.elapsed_ms ?? 0);
    expect(time("greedy")).toEqual([...time("greedy")].sort((a, b) => a - b));
    const g = time("greedy");
    const b = time("backtracking");
    expect(b[3] / b[0]).toBeGreaterThan(g[3] / g[0]);
    expect(typeof out.points[0].runs.greedy?.operations).toBe("number"); // scaling points carry a NUMBER, not an object
  });

  it("truncates backtracking at the larger sizes under the default node limit", async () => {
    const out = await runScalingBenchmark({ sizes: [3, 6], algorithms: ["backtracking"] });
    expect(out.points[0].runs.backtracking?.truncated).toBe(false);
    expect(out.points[1].runs.backtracking?.truncated).toBe(true);
  });

  it("validates like the server: sizes 2..8, at most 7, unknown sample", async () => {
    await expect(runScalingBenchmark({ sizes: [1] })).rejects.toBeInstanceOf(ApiError);
    await expect(runScalingBenchmark({ sizes: [2, 3, 4, 5, 6, 7, 8, 9] })).rejects.toMatchObject({ status: 422 });
    await expect(runScalingBenchmark({ sample: "nope" })).rejects.toMatchObject({ status: 422 });
  });

  it("is slow on purpose (so Cancel can be exercised) and honours an AbortSignal", async () => {
    vi.useFakeTimers();
    try {
      const c = new AbortController();
      const p = runScalingBenchmark({}, { signal: c.signal });
      const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
      c.abort();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
