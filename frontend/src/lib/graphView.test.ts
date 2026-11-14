// Owner: A (Arvind)
import { graphFixture } from "../test/fixtures";
import {
  COMPONENT_PALETTE,
  GRAPH_DEFAULTS,
  componentColor,
  edgeId,
  formatWhy,
  neighboursOf,
  parseWhy,
  selectionMatches,
  selectionOf,
  suggestedThreshold,
  summarize,
  tableEdges,
  topologyKey,
  truthLabel,
} from "./graphView";

describe("defaults and palette", () => {
  it("uses the backend defaults (threshold 0, no top_k, bfs)", () => {
    expect(GRAPH_DEFAULTS).toEqual({ threshold: 0, topK: null, traversal: "bfs" });
  });
  it("has distinct palette colours that wrap around", () => {
    expect(new Set(COMPONENT_PALETTE).size).toBe(COMPONENT_PALETTE.length);
    expect(componentColor(0)).toBe(COMPONENT_PALETTE[0]);
    expect(componentColor(COMPONENT_PALETTE.length)).toBe(COMPONENT_PALETTE[0]);
  });
  it("suggests a sensible threshold when everything was pruned", () => {
    expect(suggestedThreshold(0.95)).toBe(0.5);
    expect(suggestedThreshold(0.5)).toBe(0);
    expect(suggestedThreshold(0.2)).toBe(0);
  });
});

describe("summarize", () => {
  it("reports nodes, edges before/after, components, largest and isolated nodes", () => {
    const g = graphFixture(0.5);
    const s = summarize(g);
    expect(s.nodes).toBe(16);
    expect(s.edgesAfter).toBe(g.edges.length);
    expect(s.edgesBefore).toBeGreaterThanOrEqual(s.edgesAfter);
    expect(s.components).toBe(g.components.length);
    expect(s.largest).toBe(Math.max(...g.components.map((c) => c.length)));
    expect(s.edgeVisits).toBe(g.traversal.edge_visits);
  });
  it("handles a graph with no components", () => {
    const g = { ...graphFixture(), components: [] };
    expect(summarize(g)).toMatchObject({ components: 0, largest: 0, isolated: [] });
  });
});

describe("selection contract (T26)", () => {
  const edge = graphFixture(0.5).edges[0];
  it("converts side letters to the integers /explain expects", () => {
    const sel = selectionOf({ ...edge, source: "F03", side_source: "E", target: "F11", side_target: "W" });
    expect(sel).toEqual({ a: "F03", sideA: 1, b: "F11", sideB: 3 });
  });
  it("agrees with the *_index fields the API also sends", () => {
    for (const e of graphFixture(0).edges.slice(0, 20)) {
      const sel = selectionOf(e);
      expect([sel.sideA, sel.sideB]).toEqual([e.side_source_index, e.side_target_index]);
    }
  });
  it("round-trips through the ?why= text", () => {
    const sel = { a: "F03", sideA: 1 as const, b: "F11", sideB: 3 as const };
    expect(formatWhy(sel)).toBe("F03:E:F11:W");
    expect(parseWhy("F03:E:F11:W")).toEqual(sel);
  });
  it("rejects malformed ?why= values", () => {
    for (const bad of [null, "", "F03", "F03:E:F11", "F03:X:F11:W", "F03:E:F11:W:N"]) expect(parseWhy(bad)).toBeNull();
  });
  it("matches an edge by id and never matches null", () => {
    expect(selectionMatches(selectionOf(edge), edge)).toBe(true);
    expect(selectionMatches(null, edge)).toBe(false);
    expect(selectionMatches({ ...selectionOf(edge), sideA: ((selectionOf(edge).sideA + 1) % 4) as 0 }, edge)).toBe(
      false,
    );
  });
});

describe("neighbours and table", () => {
  const g = graphFixture(0.3);
  it("lists a node's neighbours strongest first", () => {
    const label = g.edges[0].source;
    const list = neighboursOf(g, label);
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((n) => n.weight)).toEqual([...list.map((n) => n.weight)].sort((a, b) => b - a));
    expect(list.every((n) => n.label !== label)).toBe(true);
  });
  it("sorts by weight in both directions and filters by fragment", () => {
    const desc = tableEdges(g, { node: "", sort: "desc" }).map((e) => e.weight);
    const asc = tableEdges(g, { node: "", sort: "asc" }).map((e) => e.weight);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(asc).toEqual([...desc].reverse());
    const one = g.edges[0].source;
    const filtered = tableEdges(g, { node: one.toLowerCase(), sort: "desc" });
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every((e) => e.source === one || e.target === one || e.source.includes(one) || e.target.includes(one)),
    ).toBe(true);
    expect(tableEdges(g, { node: "nope", sort: "desc" })).toEqual([]);
  });
  it("gives each edge a unique id", () => {
    expect(new Set(g.edges.map(edgeId)).size).toBe(g.edges.length);
  });
  it("describes ground truth in words", () => {
    expect(truthLabel(null)).toContain("no ground truth");
    expect(truthLabel(true)).toBe("true neighbours");
    expect(truthLabel(false)).toBe("not neighbours");
  });
});

describe("topologyKey", () => {
  it("changes with the edge set and ignores weights and visit order", () => {
    const a = graphFixture(0.3, "bfs");
    const dfs = graphFixture(0.3, "dfs");
    expect(topologyKey(a)).toBe(topologyKey(dfs));
    expect(topologyKey(graphFixture(0.7))).not.toBe(topologyKey(a));
    const heavier = { ...a, edges: a.edges.map((e) => ({ ...e, weight: e.weight / 2 })) };
    expect(topologyKey(heavier)).toBe(topologyKey(a));
  });
});
