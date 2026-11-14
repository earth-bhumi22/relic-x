// Owner: A (Arvind)
import {
  ApiError,
  createRun,
  createSampleArtifact,
  explainMatch,
  getArtifact,
  getGraph,
  getHealth,
  getRun,
  listArtifacts,
  listFragments,
  listMatches,
  listRuns,
  matchArtifact,
  runBenchmark,
  runScalingBenchmark,
} from "./client";
import { resetMocks } from "./mocks";

const MOSAIC = "4f1c2a9e0b7d4e6f8a1b2c3d4e5f6a7b";
const POTTERY = "7b2e5d1c9a3f4c80b6d1e2f3a4b5c6d7";
const MISSING = "00000000000000000000000000000000";

describe("real mode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls fetch with the /api/v1 prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);
    await listArtifacts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/artifacts");
  });

  it("serialises query parameters and POST bodies", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await listArtifacts({ limit: 5, offset: 10 });
    await explainMatch(MOSAIC, { a: "F03", sideA: 1, b: "F11", sideB: 3 });
    await createRun(MOSAIC, { algorithm: "greedy" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/artifacts?limit=5&offset=10");
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/v1/artifacts/${MOSAIC}/explain?a=F03&side_a=1&b=F11&side_b=3`);
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/v1/artifacts/${MOSAIC}/runs`);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "POST", body: '{"algorithm":"greedy"}' });
  });

  it("turns the backend error envelope into an ApiError", async () => {
    const body = { error: { code: "precondition_failed", message: "run matching first", details: { step: "match" } } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 409 })));
    await expect(getArtifact("x")).rejects.toMatchObject({ status: 409, code: "precondition_failed", message: "run matching first", details: { step: "match" } });
  });

  it("falls back to http_error when the body is not the error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502, statusText: "Bad Gateway" })));
    await expect(getHealth()).rejects.toMatchObject({ code: "http_error", status: 502 });
  });
});

describe("mock mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_USE_MOCKS", "true");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("fetch must not be called in mock mode"))));
    resetMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never calls fetch and lists at least 2 artifacts", async () => {
    const artifacts = await listArtifacts();
    expect(artifacts.length).toBeGreaterThanOrEqual(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves the CONTRACT §6.1 artifact", async () => {
    const a = await getArtifact(MOSAIC);
    expect(a).toMatchObject({ name: "Mughal tile panel", grid_rows: 4, grid_cols: 4, fragment_count: 16, source_kind: "sample", has_ground_truth: true });
  });

  it("rejects an unknown id with ApiError not_found", async () => {
    const err = await getArtifact(MISSING).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: "not_found" });
  });

  it("returns 16 fragments for the 4×4 grid, each with four edges", async () => {
    const frags = await listFragments(MOSAIC);
    expect(frags).toHaveLength(16);
    expect(new Set(frags.map((f) => f.label)).size).toBe(16);
    expect(new Set(frags.map((f) => `${f.true_row},${f.true_col}`)).size).toBe(16);
    for (const f of frags) expect(Object.keys(f.edges).sort()).toEqual(["E", "N", "S", "W"]);
  });

  it("returns 409 precondition_failed until the artifact is matched", async () => {
    await expect(listMatches(POTTERY)).rejects.toMatchObject({ status: 409, code: "precondition_failed" });
    await expect(getGraph(POTTERY)).rejects.toMatchObject({ code: "precondition_failed" });
    await expect(createRun(POTTERY, { algorithm: "greedy" })).rejects.toMatchObject({ code: "precondition_failed" });
    const summary = await matchArtifact(POTTERY);
    expect(summary.stats.fragments).toBe(16);
    expect((await listMatches(POTTERY)).length).toBeGreaterThan(0);
  });

  it("returns matches best-first with integer sides, filtered by min_score and limit", async () => {
    const all = await listMatches(MOSAIC);
    expect(all.length).toBeGreaterThan(24);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].composite).toBeGreaterThanOrEqual(all[i].composite);
    expect(Number.isInteger(all[0].side_a)).toBe(true);
    expect((await listMatches(MOSAIC, { min_score: 0.7 })).every((m) => m.composite >= 0.7)).toBe(true);
    expect(await listMatches(MOSAIC, { limit: 3 })).toHaveLength(3);
  });

  it("returns a graph with letter sides, honours threshold/top_k and traversal", async () => {
    const g = await getGraph(MOSAIC, { threshold: 0.7 });
    expect(g.nodes).toHaveLength(16);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges.every((e) => e.weight >= 0.7)).toBe(true);
    expect(["N", "E", "S", "W"]).toContain(g.edges[0].side_source);
    expect(g.traversal.order).toHaveLength(16);
    expect(g.traversal.method).toBe("bfs");
    const topOne = await getGraph(MOSAIC, { threshold: 0, top_k: 1, traversal: "dfs" });
    expect(topOne.traversal.method).toBe("dfs");
    expect(topOne.edges.length).toBeLessThanOrEqual(8);
    expect(topOne.stats.edges_before_pruning).toBeGreaterThan(topOne.stats.edges_after_pruning);
  });

  it("explains a match with letters in the response and rejects letter query params", async () => {
    const best = (await listMatches(MOSAIC, { limit: 1 }))[0];
    const ex = await explainMatch(MOSAIC, { a: best.a, sideA: best.side_a as 0 | 1 | 2 | 3, b: best.b, sideB: best.side_b as 0 | 1 | 2 | 3 });
    expect(ex.composite).toBe(best.composite);
    expect(ex.side_a).toMatch(/^[NESW]$/);
    expect(ex.edge_a).toHaveLength(24);
    expect(ex.ground_truth_neighbours).toBe(true);
    const sumContrib = Object.values(ex.contributions).reduce((s, v) => s + v, 0);
    expect(sumContrib).toBeCloseTo(ex.composite, 3);
    // the real API answers 422 validation_error for "N"; the mock must match
    const raw = await import("./client").then((m) => m.api(`/artifacts/${MOSAIC}/explain?a=F01&side_a=N&b=F02&side_b=3`)).catch((e: unknown) => e);
    expect(raw).toMatchObject({ status: 422, code: "validation_error" });
  });

  it("creates, lists and fetches runs with placements and trace", async () => {
    const before = (await listRuns(MOSAIC)).length;
    const run = await createRun(MOSAIC, { algorithm: "backtracking" });
    expect(run.placements).toHaveLength(16);
    expect(run.trace[0].action).toBe("seed");
    expect(run.direct_accuracy).toBe(1);
    expect(await listRuns(MOSAIC)).toHaveLength(before + 1);
    expect((await listRuns(MOSAIC))[0]).not.toHaveProperty("placements");
    expect(await getRun(run.id)).toMatchObject({ id: run.id, algorithm: "backtracking" });
    await expect(getRun(MISSING)).rejects.toMatchObject({ code: "not_found" });
    await expect(createRun(MOSAIC, { algorithm: "magic" as "greedy" })).rejects.toMatchObject({ code: "validation_error" });
  });

  it("benchmarks several algorithms and scaling", async () => {
    const runs = await runBenchmark(MOSAIC, { algorithms: ["greedy", "dijkstra"] });
    expect(runs.map((r) => r.algorithm)).toEqual(["greedy", "dijkstra"]);
    expect(new Set(runs.map((r) => r.id)).size).toBe(2);
    const scaling = await runScalingBenchmark({ sizes: [2, 3], algorithms: ["greedy"] });
    expect(scaling.points.map((p) => p.n)).toEqual([4, 9]);
    expect(typeof scaling.points[0].runs.greedy?.operations).toBe("number");
  });

  it("creates a sample artifact and validates input", async () => {
    const a = await createSampleArtifact({ name: "My panel", sample: "manuscript", fragment: { rows: 3, cols: 2, rotate: false, noise: 4, erosion: 0.2, missing: 0, seed: 1 } });
    expect(a).toMatchObject({ name: "My panel", fragment_count: 6, grid_rows: 3, grid_cols: 2, run_count: 0, match_config: null });
    expect(await getArtifact(a.id)).toMatchObject({ id: a.id });
    expect((await listArtifacts()).some((x) => x.id === a.id)).toBe(true);
    await expect(createSampleArtifact({ name: "x", sample: "nope" })).rejects.toMatchObject({ status: 422, code: "invalid_input" });
    await expect(createSampleArtifact({ name: "  " })).rejects.toMatchObject({ status: 422, code: "validation_error" });
  });

  it("does not let callers mutate the store", async () => {
    const a = await getArtifact(MOSAIC);
    a.name = "hacked";
    expect((await getArtifact(MOSAIC)).name).toBe("Mughal tile panel");
  });

  it("serves health", async () => {
    expect(await getHealth()).toMatchObject({ status: "ok", database: true });
  });
});
