// Owner: A (Arvind)
// Similarity graph page. Cytoscape needs a canvas, so the page is tested against a stub of the thin adapter
// (GraphCanvas.test.tsx covers the real adapter headlessly). Mock API only; no real network.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { POTTERY, setMockOverride } from "../api/mocks";
import type { GraphOut } from "../api/types";
import { edgeId } from "../lib/graphView";
import { ARTIFACT_ID, graphFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import GraphPage, { DEBOUNCE_MS } from "./GraphPage";

vi.mock("../components/graph/GraphCanvas", () => ({
  default: (p: {
    graph: GraphOut;
    revealed: number;
    selectedNode: string | null;
    selectedEdgeId: string | null;
    showTruth: boolean;
    onSelectNode: (l: string | null) => void;
    onSelectEdge: (e: GraphOut["edges"][number] | null) => void;
  }) => (
    <div
      data-testid="canvas-stub"
      data-revealed={p.revealed}
      data-truth={String(p.showTruth)}
      data-edge={p.selectedEdgeId}
    >
      {p.graph.nodes.map((n) => (
        <button key={n.id} type="button" onClick={() => p.onSelectNode(n.id)}>
          {`canvas node ${n.id}`}
        </button>
      ))}
      {p.graph.edges.slice(0, 3).map((e, i) => (
        <button key={i} type="button" onClick={() => p.onSelectEdge(e)}>
          {`canvas edge ${i}`}
        </button>
      ))}
    </div>
  ),
}));

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
});

const GRAPH = `/artifacts/${ARTIFACT_ID}/graph`;
const Where = () => <p data-testid="where">{useLocation().search}</p>;
const renderGraph = (id = ARTIFACT_ID, query = "", onSelectMatch?: (m: unknown) => void) =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/artifacts/:id/graph" element={<GraphPage onSelectMatch={onSelectMatch} />} />
      </Routes>
      <Where />
    </>,
    { route: `/artifacts/${id}/graph${query}` },
  );
const graphCalls = () => mockApi.calls("GET", `${GRAPH}`);
const slider = () => screen.getByLabelText("Threshold", { selector: "input[type=range]" });
const stats = () => screen.getByLabelText("Graph statistics");
const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const waitDebounce = () => sleep(DEBOUNCE_MS + 60);

/** Overrides GET /graph with the fixture computed for the request's own query, and records the calls. */
function serveGraph(opts: { delay?: (threshold: number) => number } = {}) {
  setMockOverride("GET", GRAPH, async (req) => {
    const threshold = Number(req.query.get("threshold") ?? 0);
    const traversal = (req.query.get("traversal") ?? "bfs") as "bfs" | "dfs";
    callLog.push(req.query);
    const ms = opts.delay?.(threshold) ?? 0;
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return graphFixture(threshold, traversal);
  });
}
const callLog: URLSearchParams[] = [];
beforeEach(() => callLog.splice(0));

describe("GraphPage states", () => {
  useMockApi();

  it("loads the graph with the API defaults and shows the stats bar and legend", async () => {
    renderGraph();
    expect(screen.getByRole("status")).toHaveTextContent("Loading graph…");
    await screen.findByTestId("canvas-stub");
    const g = graphFixture(0);
    expect(stats()).toHaveTextContent("Nodes16");
    expect(stats()).toHaveTextContent(`${g.stats.edges_before_pruning} → ${g.stats.edges_after_pruning}`);
    expect(stats()).toHaveTextContent(`Components${g.components.length}`);
    expect(stats()).toHaveTextContent(`Largest component${Math.max(...g.components.map((c) => c.length))}`);
    expect(stats()).toHaveTextContent(`BFS edge visits${g.traversal.edge_visits}`);
    expect(within(screen.getByRole("list", { name: "Components" })).getAllByRole("listitem")).toHaveLength(
      Math.min(10, g.components.length),
    );
    expect(screen.getByRole("list", { name: "Edge ground truth" })).toBeInTheDocument();
    const q = mockApi.calls("GET", GRAPH);
    expect(q).toHaveLength(0); // not overridden: served by the seeded mock
  });

  it("shows an error with retry", async () => {
    mockApi.fail("GET", GRAPH, 500, "internal_error", "graph exploded");
    renderGraph();
    expect(await screen.findByRole("alert")).toHaveTextContent("graph exploded");
    mockApi.respond("GET", GRAPH, graphFixture(0));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("canvas-stub")).toBeInTheDocument();
    expect(graphCalls()).toHaveLength(2);
  });

  it("shows the run-matching prompt on 409 and reloads the graph after matching", async () => {
    renderGraph(POTTERY.id as string);
    const prompt = await screen.findByRole("alert");
    expect(prompt).toHaveTextContent("Run matching first");
    fireEvent.click(within(prompt).getByRole("button", { name: "Run matching" }));
    expect(await screen.findByTestId("canvas-stub")).toBeInTheDocument();
    expect(stats()).toHaveTextContent("Nodes16");
  });

  it("shows the empty state when the threshold removes every edge, listing isolated nodes", async () => {
    const none = { ...graphFixture(1), edges: [], stats: { ...graphFixture(1).stats, edges_after_pruning: 0 } };
    mockApi.respond("GET", GRAPH, none);
    renderGraph();
    expect(await screen.findByText("No edges at this threshold")).toBeInTheDocument();
    expect(screen.getByText(/Every fragment is isolated \(F01/)).toBeInTheDocument();
    expect(screen.getByText("No edges to list.")).toBeInTheDocument();
  });

  it("'Lower the threshold' resets to a sensible value and reloads", async () => {
    const none = { ...graphFixture(1), edges: [], stats: { ...graphFixture(1).stats, edges_after_pruning: 0 } };
    mockApi.respond("GET", GRAPH, none);
    renderGraph();
    fireEvent.change(await screen.findByLabelText("Threshold value"), { target: { value: "0.9" } });
    await waitDebounce();
    mockApi.respond("GET", GRAPH, graphFixture(0.5));
    fireEvent.click(await screen.findByRole("button", { name: "Lower the threshold" }));
    expect(await screen.findByLabelText("Threshold value")).toHaveValue(0.5);
    await waitFor(() => expect(graphCalls().at(-1)?.query.get("threshold")).toBe("0.5"));
    expect(screen.queryByText("No edges at this threshold")).not.toBeInTheDocument();
  });
});

describe("GraphPage controls", () => {
  useMockApi();

  it("debounces the slider: a burst of changes makes one request with the final value", async () => {
    serveGraph();
    renderGraph();
    await screen.findByTestId("canvas-stub");
    expect(callLog).toHaveLength(1);
    for (const v of ["0.2", "0.4", "0.6", "0.8"]) fireEvent.change(slider(), { target: { value: v } });
    expect(callLog).toHaveLength(1); // nothing sent yet
    await waitFor(() => expect(callLog).toHaveLength(2));
    expect(callLog[1].get("threshold")).toBe("0.8");
    expect(callLog[1].has("top_k")).toBe(false);
    expect(callLog[1].get("traversal")).toBe("bfs");
    expect(slider()).toHaveAttribute("aria-valuetext", expect.stringContaining("0.80"));
  });

  it("keeps the previous graph visible while loading, and ignores a stale slow response", async () => {
    serveGraph({ delay: (t) => (t === 0.3 ? 500 : 0) }); // the 0.3 request is slow, 0.8 is instant
    renderGraph();
    await screen.findByTestId("canvas-stub");
    const edgesAt = (t: number) => graphFixture(t).edges.length;
    fireEvent.change(slider(), { target: { value: "0.3" } });
    await waitFor(() => expect(callLog.map((q) => q.get("threshold"))).toContain("0.3"));
    // slow request in flight: the old graph is still on screen, with a busy indicator
    expect(screen.getByTestId("canvas-stub")).toBeInTheDocument();
    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    expect(screen.getByTestId("graph-main")).toHaveAttribute("aria-busy", "true");
    fireEvent.change(slider(), { target: { value: "0.8" } });
    await waitFor(() => expect(stats()).toHaveTextContent(`→ ${edgesAt(0.8)}`));
    // the stale 0.3 response arrives later and must not overwrite the newer graph
    await sleep(600);
    expect(stats()).toHaveTextContent(`→ ${edgesAt(0.8)}`);
    expect(stats()).not.toHaveTextContent(`→ ${edgesAt(0.3)}`);
    expect(screen.queryByText("Updating…")).not.toBeInTheDocument();
  });

  it("top-k is off by default and sends no top_k; enabling sends it; below 1 is blocked client-side", async () => {
    serveGraph();
    renderGraph();
    await screen.findByTestId("canvas-stub");
    expect(callLog[0].has("top_k")).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /Top-k pruning/ }));
    await waitFor(() => expect(callLog).toHaveLength(2));
    expect(callLog[1].get("top_k")).toBe("3");
    fireEvent.change(screen.getByLabelText("Top-k value"), { target: { value: "0" } });
    expect(screen.getByText(/Whole number from 1 to/)).toBeInTheDocument();
    expect(screen.getByLabelText("Top-k value")).toHaveAttribute("aria-invalid", "true");
    await waitDebounce();
    expect(callLog).toHaveLength(2); // 0 was never sent
    fireEvent.change(screen.getByLabelText("Top-k value"), { target: { value: "2" } });
    await waitFor(() => expect(callLog).toHaveLength(3));
    expect(callLog[2].get("top_k")).toBe("2");
    fireEvent.click(screen.getByRole("checkbox", { name: /Top-k pruning/ }));
    await waitFor(() => expect(callLog).toHaveLength(4));
    expect(callLog[3].has("top_k")).toBe(false);
  });

  it("validates a typed threshold", async () => {
    serveGraph();
    renderGraph();
    fireEvent.change(await screen.findByLabelText("Threshold value"), { target: { value: "1.5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a number from 0 to 1.");
    await waitDebounce();
    expect(callLog).toHaveLength(1);
  });

  it("real mock: raising the threshold removes edges and top-k prunes further", async () => {
    renderGraph();
    await screen.findByTestId("canvas-stub");
    const before = Number(/→ (\d+)/.exec(stats().textContent ?? "")![1]);
    fireEvent.change(slider(), { target: { value: "0.8" } });
    await waitFor(() => expect(Number(/→ (\d+)/.exec(stats().textContent ?? "")![1])).toBeLessThan(before));
    const afterThreshold = Number(/→ (\d+)/.exec(stats().textContent ?? "")![1]);
    fireEvent.change(slider(), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Top-k pruning/ }));
    fireEvent.change(screen.getByLabelText("Top-k value"), { target: { value: "1" } });
    await waitFor(() => expect(Number(/→ (\d+)/.exec(stats().textContent ?? "")![1])).toBeLessThan(before));
    expect(afterThreshold).toBeLessThan(before);
  });

  it("the ground-truth hint can be hidden", async () => {
    renderGraph();
    await screen.findByTestId("canvas-stub");
    expect(screen.getByTestId("canvas-stub")).toHaveAttribute("data-truth", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: /ground-truth hint/ }));
    expect(screen.getByTestId("canvas-stub")).toHaveAttribute("data-truth", "false");
    expect(screen.queryByRole("list", { name: "Edge ground truth" })).not.toBeInTheDocument();
  });
});

describe("GraphPage traversal", () => {
  useMockApi();

  it("DFS sends traversal=dfs and changes the visit order over the same components", async () => {
    serveGraph();
    renderGraph();
    await screen.findByTestId("canvas-stub");
    const bfsOrder = within(screen.getByRole("list", { name: "BFS order" }))
      .getAllByRole("listitem")
      .map((l) => l.textContent);
    fireEvent.click(screen.getByRole("radio", { name: "DFS" }));
    await waitFor(() => expect(callLog.at(-1)?.get("traversal")).toBe("dfs"));
    const dfsOrder = (await screen.findAllByRole("list", { name: "DFS order" }))[0];
    const dfs = within(dfsOrder)
      .getAllByRole("listitem")
      .map((l) => l.textContent);
    expect(dfs).not.toEqual(bfsOrder);
    expect([...dfs].sort()).toEqual([...bfsOrder].sort());
    expect(stats()).toHaveTextContent("DFS edge visits");
  });

  it("Step reveals the visit order one node at a time; Reset and Show all work", async () => {
    renderGraph();
    const canvas = await screen.findByTestId("canvas-stub");
    expect(canvas).toHaveAttribute("data-revealed", "16");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(canvas).toHaveAttribute("data-revealed", "0");
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(canvas).toHaveAttribute("data-revealed", "2");
    const items = within(screen.getByRole("list", { name: "BFS order" })).getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(screen.getByText(/Visited .*, 2 of 16/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(canvas).toHaveAttribute("data-revealed", "16");
  });

  it("Play steps through the order automatically; with reduced motion it shows the final state at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderGraph();
      const canvas = await screen.findByTestId("canvas-stub");
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      await act(() => vi.advanceTimersByTimeAsync(1900));
      expect(Number(canvas.getAttribute("data-revealed"))).toBeGreaterThanOrEqual(2);
      fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
      const paused = canvas.getAttribute("data-revealed");
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(canvas).toHaveAttribute("data-revealed", paused ?? "");

      vi.stubGlobal("matchMedia", (q: string) => ({
        matches: q.includes("reduce"),
        addEventListener() {},
        removeEventListener() {},
      }));
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(canvas).toHaveAttribute("data-revealed", "16");
    } finally {
      vi.useRealTimers();
    }
  });

  it("compares BFS and DFS orders side by side", async () => {
    renderGraph();
    await screen.findByTestId("canvas-stub");
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare BFS and DFS" }));
    expect(await screen.findByRole("heading", { name: "BFS vs DFS" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "BFS order (compare)" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "DFS order (compare)" })).toBeInTheDocument();
  });
});

describe("GraphPage selection", () => {
  useMockApi();

  it("selecting an edge in the canvas exposes {a, sideA, b, sideB} with integer sides and writes ?why=", async () => {
    const onSelect = vi.fn();
    renderGraph(ARTIFACT_ID, "", onSelect);
    await screen.findByTestId("canvas-stub");
    const edge = graphFixture(0).edges[0];
    fireEvent.click(screen.getByRole("button", { name: "canvas edge 0" }));
    expect(onSelect).toHaveBeenCalledWith({
      a: edge.source,
      sideA: edge.side_source_index,
      b: edge.target,
      sideB: edge.side_target_index,
    });
    expect(typeof onSelect.mock.calls[0][0].sideA).toBe("number");
    expect(screen.getByTestId("where")).toHaveTextContent(
      `why=${edge.source}%3A${edge.side_source}%3A${edge.target}%3A${edge.side_target}`,
    );
    expect(screen.getByTestId("canvas-stub")).toHaveAttribute("data-edge", edgeId(edge));
    const card = screen.getByRole("heading", {
      name: new RegExp(`${edge.source} ${edge.side_source} ↔ ${edge.target} ${edge.side_target}`),
    });
    expect(card).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Why matched?" })).toBeDisabled();
  });

  it("the accessible edge table lists the same edges as the canvas and selects from a row", async () => {
    const onSelect = vi.fn();
    renderGraph(ARTIFACT_ID, "", onSelect);
    await screen.findByTestId("canvas-stub");
    const g = graphFixture(0);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(g.edges.length + 1);
    const e = [...g.edges].sort((a, b) => b.weight - a.weight)[0];
    fireEvent.click(
      within(table).getByRole("button", {
        name: `Select ${e.source} ${e.side_source} to ${e.target} ${e.side_target}, weight ${e.weight.toFixed(2)}`,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ a: e.source, b: e.target, sideA: e.side_source_index }),
    );
    expect(within(table).getByRole("button", { pressed: true })).toBeInTheDocument();
  });

  it("the table sorts by weight and filters by fragment", async () => {
    renderGraph();
    await screen.findByTestId("canvas-stub");
    const weights = () =>
      within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((r) => Number(within(r).getAllByRole("cell")[2].textContent));
    const desc = weights();
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    fireEvent.click(screen.getByRole("button", { name: /Weight/ }));
    expect(weights()).toEqual([...desc].reverse());
    expect(screen.getByRole("columnheader", { name: /Weight/ })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.change(screen.getByLabelText("Filter by fragment"), { target: { value: "F01" } });
    expect(weights().length).toBeLessThan(desc.length);
    fireEvent.change(screen.getByLabelText("Filter by fragment"), { target: { value: "zzz" } });
    expect(screen.getByText("No edges to list.")).toBeInTheDocument();
  });

  it("restores a selection from a ?why= deep link", async () => {
    const e = graphFixture(0).edges[0];
    renderGraph(ARTIFACT_ID, `?why=${e.source}:${e.side_source}:${e.target}:${e.side_target}`);
    await screen.findByTestId("canvas-stub");
    expect(screen.getByTestId("canvas-stub")).toHaveAttribute("data-edge", edgeId(e));
    expect(screen.getByRole("heading", { name: new RegExp(`${e.source} ${e.side_source}`) })).toBeInTheDocument();
  });

  it("clicking a node lists its neighbours with weights; a neighbour can be selected as a match", async () => {
    const onSelect = vi.fn();
    renderGraph(ARTIFACT_ID, "", onSelect);
    await screen.findByTestId("canvas-stub");
    const g = graphFixture(0);
    const label = g.edges[0].source;
    fireEvent.click(screen.getByRole("button", { name: `canvas node ${label}` }));
    const list = screen.getByRole("list", { name: `Neighbours of ${label}` });
    expect(within(list).getAllByRole("listitem").length).toBe(
      g.edges.filter((e) => e.source === label || e.target === label).length,
    );
    expect(list).toHaveTextContent(/weight 0\.\d\d/);
    fireEvent.click(within(list).getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("GraphPage layout", () => {
  useMockApi();
  it("links back to the gallery", async () => {
    renderGraph();
    expect(screen.getByRole("link", { name: /Gallery/ })).toHaveAttribute("href", `/artifacts/${ARTIFACT_ID}/gallery`);
    await screen.findByTestId("canvas-stub");
  });
});
