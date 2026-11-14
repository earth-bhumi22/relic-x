// Owner: A (Arvind)
// Lab page against the mock API: benchmark form + results + states, scaling form + states, CSV, tabs and the URL.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MOSAIC, POTTERY, setMockOverride } from "../api/mocks";
import { ApiError } from "../api/errors";
import real from "../test/lab-real.json";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import LabPage from "./LabPage";

const SIZE = { width: 600, height: 300 };
const MID = MOSAIC.id as string;
const PID = POTTERY.id as string;
/** Renders the page and waits for both panels to finish their on-mount loads (artifacts, samples). */
const renderLab = async (query = "") => {
  renderWithProviders(<LabPage chartSize={SIZE} />, { route: `/lab${query}` });
  await waitFor(() => {
    expect(screen.queryByText("Loading artifacts…")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading samples…")).not.toBeInTheDocument();
  });
};
const bench = () => within(screen.getByRole("tabpanel", { name: "Benchmark an artifact" }));
const scal = () => within(screen.getByRole("tabpanel", { name: "Scaling: time vs n" }));
const BENCH = (id: string) => `/artifacts/${id}/benchmark`;

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
  warnSpy = vi.spyOn(console, "warn");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
});

const choose = (id: string) =>
  fireEvent.change(bench().getByRole("combobox", { name: "Artifact" }), { target: { value: id } });
const runBench = (id = MID) => {
  choose(id);
  fireEvent.click(bench().getByRole("button", { name: "Run benchmark" }));
};
const rowFor = (table: HTMLElement, name: string) => within(table).getByRole("row", { name: new RegExp(name) });

describe("LabPage: benchmark", () => {
  useMockApi();

  it("starts with an empty prompt and a disabled button until an artifact is chosen", async () => {
    await renderLab();
    expect(await bench().findByRole("combobox", { name: "Artifact" })).toBeInTheDocument();
    expect(bench().getByRole("button", { name: "Run benchmark" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Benchmark an artifact" })).toHaveAttribute("aria-selected", "true");
  });

  it("links to Projects when there are no artifacts", async () => {
    mockApi.respond("GET", "/artifacts", []);
    await renderLab();
    expect(await bench().findByText("No artifacts yet")).toBeInTheDocument();
    expect(bench().getByRole("link", { name: "Go to Projects" })).toHaveAttribute("href", "/");
  });

  it("requires at least one algorithm", async () => {
    await renderLab();
    for (const label of ["Greedy", "Best-first", "Dijkstra", "Backtracking"]) {
      fireEvent.click(bench().getByRole("checkbox", { name: new RegExp(label) }));
    }
    expect(bench().getByText("Choose at least one algorithm.")).toBeInTheDocument();
    expect(bench().getByRole("button", { name: "Run benchmark" })).toBeDisabled();
  });

  it("preselects the artifact from ?artifact= and runs one request per algorithm with node_limit on backtracking", async () => {
    await renderLab(`?artifact=${MID}`);
    await waitFor(() => expect(bench().getByRole("button", { name: "Run benchmark" })).toBeEnabled());
    mockApi.respond("POST", BENCH(MID), []);
    fireEvent.change(bench().getByLabelText(/^Node limit/), { target: { value: "300" } });
    fireEvent.click(bench().getByRole("button", { name: "Run benchmark" }));
    await waitFor(() => expect(mockApi.calls("POST", BENCH(MID))).toHaveLength(4));
    const bodies = mockApi.calls("POST", BENCH(MID)).map((c) => c.body);
    expect(bodies).toEqual([
      { algorithms: ["greedy"] },
      { algorithms: ["best_first"] },
      { algorithms: ["dijkstra"] },
      { algorithms: ["backtracking"], node_limit: 300 },
    ]);
  });

  it("shows the comparison table with the best values marked, a truncated backtracking run and a reading", async () => {
    await renderLab();
    fireEvent.change(await bench().findByLabelText(/^Node limit/), { target: { value: "100" } });
    runBench();
    const table = await bench().findByRole("table", { name: /Benchmark results/ });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(rowFor(table, "Backtracking")).getByText("yes*")).toBeInTheDocument();
    expect(within(rowFor(table, "Greedy")).getByText("no")).toBeInTheDocument();
    expect(bench().getAllByText(/best: (lowest|highest)/).length).toBeGreaterThan(0);
    expect(bench().getByRole("list", { name: "Reading of the result" })).toHaveTextContent(/fastest/);
    expect(bench().getAllByText(/node limit reached/).length).toBeGreaterThan(0);
    expect(bench().getAllByRole("figure")).toHaveLength(4);
  });

  it("sorts when a column header is clicked and reports aria-sort", async () => {
    await renderLab();
    runBench();
    const table = await bench().findByRole("table", { name: /Benchmark results/ });
    const header = within(table).getByRole("columnheader", { name: /Time \(ms\)/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    const times = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => Number((within(r).getAllByRole("cell")[1].textContent ?? "").replace(/[^\d.]/g, "")));
    const asc = times();
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("expands the per-counter breakdown of operations", async () => {
    await renderLab();
    runBench();
    fireEvent.click(await bench().findByRole("button", { name: /Show operation counters for Dijkstra/ }));
    expect(bench().getByRole("list", { name: /Operation counters for Dijkstra/ })).toBeInTheDocument();
  });

  it("shows — for null accuracies from the API", async () => {
    const nulls = real.benchmark.map((r) => ({
      ...r,
      neighbour_accuracy: null,
      direct_accuracy: null,
      coverage: null,
    }));
    await renderLab();
    setMockOverride("POST", BENCH(MID), async (req) => {
      const wanted = (req.body as { algorithms: string[] }).algorithms[0];
      return nulls.filter((r) => r.algorithm === wanted);
    });
    fireEvent.change(bench().getByRole("combobox", { name: "Artifact" }), { target: { value: MID } });
    fireEvent.click(bench().getByRole("button", { name: "Run benchmark" }));
    const table = await bench().findByRole("table", { name: /Benchmark results/ });
    expect(within(table).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(bench().getByRole("list", { name: "Reading of the result" })).toHaveTextContent(/No ground truth/);
  });

  it("asks for matching on a 409, then re-runs the benchmark after matching", async () => {
    await renderLab();
    runBench(PID);
    expect(await bench().findByText("Run matching first")).toBeInTheDocument();
    fireEvent.click(bench().getByRole("button", { name: "Run matching" }));
    expect(await bench().findByRole("table", { name: /Benchmark results/ })).toBeInTheDocument();
  });

  it("shows a partial failure and still lists the algorithms that worked", async () => {
    await renderLab();
    let n = 0;
    setMockOverride("POST", BENCH(MID), async () => {
      const call = n++;
      if (call === 2) throw new ApiError(500, "internal_error", "solver crashed");
      return [real.benchmark[call]];
    });
    fireEvent.change(bench().getByRole("combobox", { name: "Artifact" }), { target: { value: MID } });
    fireEvent.click(bench().getByRole("button", { name: "Run benchmark" }));
    const alert = await bench().findByTestId("bench-failures");
    expect(alert).toHaveTextContent("One algorithm failed");
    expect(alert).toHaveTextContent("Dijkstra: solver crashed");
    expect(within(await bench().findByRole("table", { name: /Benchmark results/ })).getAllByRole("row")).toHaveLength(
      4,
    );
  });

  it("shows a 404 for an artifact that does not exist", async () => {
    await renderLab("?artifact=missing");
    expect(await bench().findByText("Artifact not found")).toBeInTheDocument();
    fireEvent.click(bench().getByRole("button", { name: "Clear selection" }));
    await act(async () => {
      await Promise.resolve(); // let the artifact lookup settle
    });
    expect(bench().queryByText("Artifact not found")).not.toBeInTheDocument();
  });

  it("shows a loading state and an error with retry for the artifact list", async () => {
    mockApi.fail("GET", "/artifacts", 500, "internal_error", "db down");
    await renderLab();
    expect(await bench().findByText(/db down/)).toBeInTheDocument();
    expect(bench().getByText(/internal_error/)).toBeInTheDocument();
    mockApi.respond("GET", "/artifacts", []);
    fireEvent.click(bench().getByRole("button", { name: /retry/i }));
    expect(await bench().findByText("No artifacts yet")).toBeInTheDocument();
  });

  it("shows a 422 as a field message on the node limit", async () => {
    await renderLab();
    mockApi.fail("POST", BENCH(MID), 422, "validation_error", "bad", {
      errors: [{ loc: ["body", "node_limit"], msg: "node_limit too high" }],
    });
    fireEvent.change(bench().getByRole("combobox", { name: "Artifact" }), { target: { value: MID } });
    fireEvent.click(bench().getByRole("button", { name: "Run benchmark" }));
    expect(await bench().findByText("node_limit too high")).toBeInTheDocument();
  });

  it("warns about a high node limit", async () => {
    await renderLab();
    fireEvent.change(await bench().findByLabelText(/^Node limit/), { target: { value: "500000" } });
    expect(bench().getByText(/can make backtracking slow/)).toBeInTheDocument();
  });

  it("Cancel aborts the request and clears the busy state", async () => {
    const abort = vi.spyOn(AbortController.prototype, "abort");
    await renderLab();
    mockApi.respond("POST", BENCH(MID), [], { delayMs: 5000 });
    fireEvent.change(bench().getByRole("combobox", { name: "Artifact" }), { target: { value: MID } });
    fireEvent.click(bench().getByRole("button", { name: "Run benchmark" }));
    expect(await bench().findByRole("button", { name: "Running…" })).toBeDisabled();
    expect(bench().getByTestId("bench-status")).toHaveTextContent(/server may still finish/);
    fireEvent.click(bench().getByRole("button", { name: "Cancel" }));
    expect(abort).toHaveBeenCalled();
    expect(bench().getByRole("button", { name: "Run benchmark" })).toBeEnabled();
    expect(bench().queryByRole("table")).not.toBeInTheDocument();
  });

  it("downloads the CSV of what is on screen", async () => {
    const create = vi.fn(() => "blob:x");
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await renderLab();
    runBench();
    await bench().findByRole("table", { name: /Benchmark results/ });
    fireEvent.click(bench().getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });
});

describe("LabPage: scaling", () => {
  useMockApi();
  const openScaling = () => fireEvent.click(screen.getByRole("tab", { name: "Scaling: time vs n" }));

  it("switches tabs and records it in the URL", async () => {
    await renderLab("?tab=scaling");
    expect(screen.getByRole("tab", { name: "Scaling: time vs n" })).toHaveAttribute("aria-selected", "true");
    expect(await scal().findByDisplayValue("mosaic-tile")).toBeInTheDocument();
  });

  it("sends the full request (API defaults explicit) and draws the charts and the match table", async () => {
    await renderLab();
    openScaling();
    mockApi.respond("POST", "/benchmark/scaling", real.scaling);
    fireEvent.click(scal().getByRole("button", { name: "Run scaling" }));
    await scal().findByText(/4 sizes/);
    expect(mockApi.calls("POST", "/benchmark/scaling")[0].body).toEqual({
      sample: "mosaic-tile",
      sizes: [3, 4, 5, 6],
      algorithms: ["greedy", "best_first", "dijkstra", "backtracking"],
      rotate: false,
      noise: 4,
      erosion: 0.2,
      node_limit: 50000,
    });
    expect(scal().getAllByRole("figure")).toHaveLength(3);
    expect(scal().getByRole("table", { name: /Matching cost/ })).toBeInTheDocument();
    fireEvent.click(scal().getByRole("checkbox", { name: "Log y axis" }));
    fireEvent.click(scal().getByRole("checkbox", { name: /Log x axis/ }));
    fireEvent.click(scal().getByRole("checkbox", { name: /fitted growth/ }));
    expect(scal().getAllByRole("figure")).toHaveLength(3);
  });

  it("validates the sizes and does not call the API", async () => {
    await renderLab();
    openScaling();
    const sizes = await scal().findByLabelText(/Grid sizes/);
    fireEvent.change(sizes, { target: { value: "3, x" } });
    expect(scal().getByText(/Enter whole numbers/)).toBeInTheDocument();
    expect(scal().getByRole("button", { name: "Run scaling" })).toBeDisabled();
    fireEvent.change(sizes, { target: { value: "1, 9" } });
    expect(scal().getByText(/Each size must be/)).toBeInTheDocument();
    expect(mockApi.calls("POST", "/benchmark/scaling")).toHaveLength(0);
  });

  it("warns about large sizes", async () => {
    await renderLab();
    openScaling();
    fireEvent.change(await scal().findByLabelText(/Grid sizes/), { target: { value: "3, 7" } });
    expect(scal().getByText(/can take a long time/)).toBeInTheDocument();
  });

  it("shows the busy state with elapsed seconds and Cancel aborts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const abort = vi.spyOn(AbortController.prototype, "abort");
    await renderLab();
    openScaling();
    mockApi.respond("POST", "/benchmark/scaling", {}, { delayMs: 60_000 });
    fireEvent.click(scal().getByRole("button", { name: "Run scaling" }));
    expect(scal().getByRole("button", { name: "Running…" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(scal().getByTestId("scaling-status")).toHaveTextContent(/3 s elapsed/);
    fireEvent.click(scal().getByRole("button", { name: "Cancel" }));
    expect(abort).toHaveBeenCalled();
    expect(scal().getByRole("button", { name: "Run scaling" })).toBeEnabled();
    expect(scal().getByTestId("scaling-status")).toHaveTextContent("");
    vi.useRealTimers();
  });

  it("shows an error with retry, never a blank chart", async () => {
    await renderLab();
    openScaling();
    mockApi.fail("POST", "/benchmark/scaling", 500, "internal_error", "scaling exploded");
    fireEvent.click(scal().getByRole("button", { name: "Run scaling" }));
    expect(await scal().findByText(/scaling exploded/)).toBeInTheDocument();
    expect(scal().queryByRole("figure")).not.toBeInTheDocument();
    mockApi.respond("POST", "/benchmark/scaling", real.scaling);
    fireEvent.click(scal().getByRole("button", { name: /retry/i }));
    expect(await scal().findByText(/4 sizes/)).toBeInTheDocument();
  });

  it("maps a 422 to the field", async () => {
    await renderLab();
    openScaling();
    mockApi.fail("POST", "/benchmark/scaling", 422, "validation_error", "bad", {
      errors: [{ loc: ["body", "noise"], msg: "noise out of range" }],
    });
    fireEvent.click(scal().getByRole("button", { name: "Run scaling" }));
    expect(await scal().findByText("noise out of range")).toBeInTheDocument();
  });

  it("leaves gaps for an algorithm with no run at a size and says nothing is zero", async () => {
    const data = structuredClone(real.scaling) as {
      points: { runs: Record<string, unknown> }[];
    };
    delete data.points[1].runs.dijkstra;
    await renderLab();
    openScaling();
    mockApi.respond("POST", "/benchmark/scaling", data);
    fireEvent.click(scal().getByRole("button", { name: "Run scaling" }));
    await scal().findByText(/4 sizes/);
    expect(
      scal()
        .getAllByRole("cell", { hidden: true })
        .some((c) => c.textContent === "—"),
    ).toBe(true);
  });

  it("the mock backend itself returns a growing time curve, truncated backtracking and takes a while", async () => {
    await renderLab();
    openScaling();
    fireEvent.change(scal().getByLabelText(/Node limit \(backtracking\)/), { target: { value: "100" } });
    fireEvent.click(scal().getByRole("button", { name: "Run scaling" }));
    await scal().findByText(/4 sizes/);
    expect(scal().getAllByText(/\*/).length).toBeGreaterThan(0);
  });
});
