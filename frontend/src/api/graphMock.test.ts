// Owner: A (Arvind)
// The mock GET /graph behaves like the backend: pruning really depends on threshold, top_k and traversal.
import { POTTERY } from "./mocks";
import { getGraph, matchArtifact } from "./client";
import { ARTIFACT_ID } from "../test/fixtures";
import { useMockApi } from "../test/mockApi";

describe("mock /graph", () => {
  useMockApi();

  it("defaults to threshold 0 / no top_k / bfs, and edges shrink as the threshold rises until none remain", async () => {
    const all = await getGraph(ARTIFACT_ID);
    expect(all.stats).toMatchObject({ threshold: 0, top_k: null });
    expect(all.traversal.method).toBe("bfs");
    const mid = await getGraph(ARTIFACT_ID, { threshold: 0.6 });
    const high = await getGraph(ARTIFACT_ID, { threshold: 1 });
    expect(mid.edges.length).toBeLessThan(all.edges.length);
    expect(mid.components.length).toBeGreaterThan(all.components.length - 1);
    expect(high.edges).toHaveLength(0);
    expect(high.components).toHaveLength(16); // every fragment isolated
    expect(all.stats.edges_before_pruning).toBe(high.stats.edges_before_pruning);
  });

  it("collapses to one edge per fragment pair, with the smaller label as source", async () => {
    const g = await getGraph(ARTIFACT_ID);
    const keys = g.edges.map((e) => `${e.source}|${e.target}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(g.edges.every((e) => e.source < e.target)).toBe(true);
  });

  it("applies mutual top-k: no fragment keeps more than k edges, and smaller k keeps fewer", async () => {
    const k1 = await getGraph(ARTIFACT_ID, { top_k: 1 });
    const k3 = await getGraph(ARTIFACT_ID, { top_k: 3 });
    const all = await getGraph(ARTIFACT_ID);
    expect(k1.edges.length).toBeLessThanOrEqual(k3.edges.length);
    expect(k3.edges.length).toBeLessThan(all.edges.length);
    const degree = new Map<string, number>();
    for (const e of k1.edges) for (const l of [e.source, e.target]) degree.set(l, (degree.get(l) ?? 0) + 1);
    expect(Math.max(0, ...degree.values())).toBeLessThanOrEqual(1);
  });

  it("BFS and DFS visit the same components in different orders", async () => {
    const bfs = await getGraph(ARTIFACT_ID, { threshold: 0.4, traversal: "bfs" });
    const dfs = await getGraph(ARTIFACT_ID, { threshold: 0.4, traversal: "dfs" });
    expect(bfs.components.map((c) => [...c].sort())).toEqual(dfs.components.map((c) => [...c].sort()));
    expect(bfs.traversal.order).not.toEqual(dfs.traversal.order);
    expect([...bfs.traversal.order].sort()).toEqual([...dfs.traversal.order].sort());
  });

  it("rejects out-of-range parameters with 422 and answers 409 until the artifact is matched", async () => {
    for (const params of [{ top_k: 0 }, { top_k: 17 }, { threshold: 1.5 }, { threshold: -0.1 }])
      await expect(getGraph(ARTIFACT_ID, params)).rejects.toMatchObject({ status: 422, code: "validation_error" });
    await expect(getGraph(POTTERY.id as string)).rejects.toMatchObject({ status: 409, code: "precondition_failed" });
    await matchArtifact(POTTERY.id as string);
    expect((await getGraph(POTTERY.id as string)).nodes).toHaveLength(16);
  });
});
