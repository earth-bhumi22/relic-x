// Owner: A (Arvind)
// The REAL Cytoscape adapter, mounted headlessly (jsdom has no canvas, so no renderer; everything else runs).
import { act, render, screen } from "@testing-library/react";
import type { Core } from "cytoscape";
import { edgeId } from "../../lib/graphView";
import { MOSAIC, graph } from "../../api/mocks";
import { buildArtifact } from "../../api/mocks/data";
import { graphFixture } from "../../test/fixtures";
import { ThemeProvider, useTheme } from "../../theme";
import GraphCanvas from "./GraphCanvas";
import type { GraphCanvasProps } from "./GraphCanvas";

const base = (over: Partial<GraphCanvasProps> = {}): GraphCanvasProps => {
  const graph = graphFixture(0.5);
  return {
    graph,
    order: graph.traversal.order,
    revealed: graph.traversal.order.length,
    selectedNode: null,
    selectedEdgeId: null,
    showTruth: true,
    onSelectNode: vi.fn(),
    onSelectEdge: vi.fn(),
    headless: true,
    ...over,
  };
};

function mount(props: GraphCanvasProps) {
  let cy!: Core;
  const ui = (p: GraphCanvasProps) => (
    <ThemeProvider>
      <GraphCanvas {...p} onReady={(c) => (cy = c)} />
    </ThemeProvider>
  );
  const view = render(ui(props));
  return { cy: () => cy, view, rerender: (p: GraphCanvasProps) => view.rerender(ui(p)) };
}

describe("GraphCanvas (real Cytoscape, headless)", () => {
  it("draws one node per fragment and one edge per match, coloured by component", () => {
    const p = base();
    const { cy } = mount(p);
    expect(cy().elements("node")).toHaveLength(16);
    expect(cy().elements("edge")).toHaveLength(p.graph.edges.length);
    const node = p.graph.nodes[0];
    expect(cy().$id(node.id).data("component")).toBe(node.component);
    expect(cy().$id(node.id).data("color")).toMatch(/^#/);
  });

  it("encodes weight in edge width/opacity and ground truth in a class", () => {
    const p = base();
    const { cy } = mount(p);
    const e = p.graph.edges[0];
    const el = cy().$id(edgeId(e));
    expect(el.data("width")).toBeCloseTo(1 + 5 * e.weight);
    expect(el.data("opacity")).toBeCloseTo(0.25 + 0.7 * e.weight);
    expect(el.hasClass(e.true_neighbours ? "truth-true" : "truth-false")).toBe(true);
  });

  it("hides the ground-truth hint when switched off", () => {
    const { cy, rerender } = mount(base());
    rerender(base({ showTruth: false }));
    expect(cy().elements("edge.truth-true, edge.truth-false")).toHaveLength(0);
  });

  it("reports taps on nodes, edges and the background", () => {
    const p = base();
    const { cy } = mount(p);
    const node = p.graph.nodes[0].id;
    act(() => cy().$id(node).emit("tap"));
    expect(p.onSelectNode).toHaveBeenCalledWith(node);
    const edge = p.graph.edges[0];
    act(() => cy().$id(edgeId(edge)).emit("tap"));
    expect(p.onSelectEdge).toHaveBeenCalledWith(edge);
    act(() => cy().emit("tap"));
    expect(p.onSelectNode).toHaveBeenLastCalledWith(null);
    expect(p.onSelectEdge).toHaveBeenLastCalledWith(null);
  });

  it("numbers revealed nodes by visit order and dims the rest", () => {
    const p = base();
    const [first, second] = p.graph.traversal.order;
    const { cy } = mount({ ...p, revealed: 2 });
    expect(cy().$id(first).data("display")).toBe(`${first} · 1`);
    expect(cy().$id(second).data("display")).toBe(`${second} · 2`);
    const third = p.graph.traversal.order[2];
    expect(cy().$id(third).data("display")).toBe(third);
    expect(cy().$id(third).hasClass("pending")).toBe(true);
    expect(cy().$id(second).hasClass("current")).toBe(true);
  });

  it("highlights the selected node, its incident edges and the selected edge", () => {
    const p = base();
    const edge = p.graph.edges[0];
    const { cy } = mount({ ...p, selectedNode: edge.source, selectedEdgeId: edgeId(edge) });
    expect(cy().$id(edge.source).hasClass("selected")).toBe(true);
    expect(cy().$id(edgeId(edge)).hasClass("selected")).toBe(true);
    expect(cy().elements("edge.incident").length).toBeGreaterThan(0);
  });

  it("keeps node positions when only the traversal changes (layout runs on topology changes only)", () => {
    const bfs = graphFixture(0.5, "bfs");
    const dfs = graphFixture(0.5, "dfs");
    const { cy, rerender } = mount(base({ graph: bfs, order: bfs.traversal.order }));
    const before = cy()
      .nodes()
      .map((n) => [n.id(), n.position().x, n.position().y]);
    rerender(base({ graph: dfs, order: dfs.traversal.order }));
    expect(
      cy()
        .nodes()
        .map((n) => [n.id(), n.position().x, n.position().y]),
    ).toEqual(before);
    rerender(base({ graph: graphFixture(0.9) })); // topology changed
    expect(cy().elements("edge").length).toBe(graphFixture(0.9).edges.length);
  });

  it("is deterministic: the same graph gets the same layout twice", () => {
    const positions = () => {
      const { cy, view } = mount(base());
      const out = cy()
        .nodes()
        .map((n) => [n.id(), Math.round(n.position().x), Math.round(n.position().y)]);
      view.unmount();
      return out;
    };
    expect(positions()).toEqual(positions());
  });

  it("copes with an empty graph and with a theme switch", () => {
    const empty = { ...graphFixture(1), nodes: [], edges: [], components: [] };
    const { cy } = mount(base({ graph: empty, order: [] }));
    expect(cy().elements()).toHaveLength(0);

    let toggle!: () => void;
    function Toggle() {
      toggle = useTheme().toggleTheme;
      return null;
    }
    const p = base();
    let inst!: Core;
    render(
      <ThemeProvider>
        <Toggle />
        <GraphCanvas {...p} onReady={(c) => (inst = c)} />
      </ThemeProvider>,
    );
    expect(() => act(() => toggle())).not.toThrow();
    expect(inst.elements("node")).toHaveLength(16);
  });

  it("destroys the Cytoscape instance on unmount", () => {
    const { cy, view } = mount(base());
    const instance = cy();
    expect(instance.destroyed()).toBe(false);
    view.unmount();
    expect(instance.destroyed()).toBe(true);
  });

  it("describes the graph for assistive technology", () => {
    mount(base());
    expect(screen.getByRole("img")).toHaveAccessibleName(/16 fragments.*edge table below/);
  });

  it("stays fast on an 8×8 = 64 fragment graph (layout under 3 s, then cheap in-place updates)", () => {
    const big = graph(buildArtifact({ ...MOSAIC, rows: 8, cols: 8 }, true), new URLSearchParams({ threshold: "0.3" }));
    expect(big.nodes).toHaveLength(64);
    const t0 = performance.now();
    const { cy, rerender } = mount(base({ graph: big, order: big.traversal.order, revealed: 0 }));
    expect(cy().elements("node")).toHaveLength(64);
    expect(performance.now() - t0).toBeLessThan(3000);
    const t1 = performance.now();
    for (let i = 1; i <= 64; i += 8) rerender(base({ graph: big, order: big.traversal.order, revealed: i }));
    expect(performance.now() - t1).toBeLessThan(1500);
  });
});
