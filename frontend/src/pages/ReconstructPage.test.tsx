// Owner: A (Arvind)
// Reconstruction page against the mock API: controls and the createRun body, history (open / delete / ?run= deep
// link), Cancel, the ground-truth overlay and every state (loading, error, 409, 404, 422, empty, truncated, boundary).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { POTTERY } from "../api/mocks";
import type { Algorithm } from "../api/types";
import { ARTIFACT_ID, fragmentsFixture, runFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import ReconstructPage from "./ReconstructPage";

const RUNS = `/artifacts/${ARTIFACT_ID}/runs`;
const Where = () => <p data-testid="where">{useLocation().search}</p>;
const renderPage = (id = ARTIFACT_ID, query = "") =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/artifacts/:id/reconstruct" element={<ReconstructPage />} />
      </Routes>
      <Where />
    </>,
    { route: `/artifacts/${id}/reconstruct${query}` },
  );
const where = () => screen.getByTestId("where").textContent ?? "";
const run = (name: RegExp | string) => screen.getByRole("button", { name });

const withRuns = (...algorithms: Algorithm[]) => {
  const runs = algorithms.map((a, i) => ({ ...runFixture(a), id: `run${i}` }));
  mockApi.respond("GET", RUNS, runs);
  for (const r of runs) mockApi.respond("GET", `/runs/${r.id}`, r);
  return runs;
};

const boom = vi.hoisted(() => ({ on: false }));
vi.mock("../components/ReconstructionCanvas", async (importOriginal) => {
  const real = await importOriginal<typeof import("../components/ReconstructionCanvas")>();
  return {
    ...real,
    default: (props: Parameters<typeof real.default>[0]) => {
      if (boom.on) throw new Error("canvas exploded");
      return real.default(props);
    },
  };
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
});

describe("ReconstructPage", () => {
  useMockApi();

  it("shows loading, then the empty history prompt when there are no runs", async () => {
    mockApi.respond("GET", RUNS, []);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading runs…");
    expect(await screen.findByText("Run an algorithm to begin.")).toBeInTheDocument();
  });

  it("lists the algorithms with a description and complexity each", async () => {
    mockApi.respond("GET", RUNS, []);
    renderPage();
    await screen.findByText("Run an algorithm to begin.");
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getAllByText(/O\(/).length).toBeGreaterThanOrEqual(4);
  });

  it("sends node_limit only for backtracking", async () => {
    mockApi.respond("GET", RUNS, []);
    mockApi.respond("POST", RUNS, { ...runFixture("greedy"), id: "new0" });
    mockApi.respond("GET", "/runs/new0", { ...runFixture("greedy"), id: "new0" });
    renderPage();
    await screen.findByText("Run an algorithm to begin.");
    expect(screen.queryByRole("spinbutton", { name: /node limit/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText(/top-k/i), { target: { value: "3" } });
    fireEvent.click(run("Run"));
    await waitFor(() => expect(where()).toBe("?run=new0"));
    expect(mockApi.calls("POST", RUNS)[0].body).toEqual({ algorithm: "greedy", threshold: 0.4, top_k: 3 });

    await waitFor(() => expect(run("Run")).toBeEnabled());
    fireEvent.click(screen.getByRole("radio", { name: /backtracking/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /node limit/i }), { target: { value: "750" } });
    fireEvent.click(run("Run"));
    await waitFor(() => expect(mockApi.calls("POST", RUNS)).toHaveLength(2));
    expect(mockApi.calls("POST", RUNS)[1].body).toEqual({
      algorithm: "backtracking",
      threshold: 0.4,
      top_k: 3,
      node_limit: 750,
    });
  });

  it("validates parameters against the API bounds and disables Run", async () => {
    mockApi.respond("GET", RUNS, []);
    renderPage();
    await screen.findByText("Run an algorithm to begin.");
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: "2" } });
    expect(screen.getByText(/threshold must be a number from 0 to 1/i)).toBeInTheDocument();
    expect(run("Run")).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: "0.3" } });
    fireEvent.change(screen.getByLabelText(/top-k/i), { target: { value: "99" } });
    expect(screen.getByText(/top-k must be a whole number/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /backtracking/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /node limit/i }), { target: { value: "5" } });
    expect(screen.getByText(/node limit must be a whole number from 100/i)).toBeInTheDocument();
  });

  it("runs backtracking with node_limit, opens the new run via ?run= and warns when truncated", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("radio", { name: /backtracking/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /node limit/i }), { target: { value: "500" } });
    fireEvent.click(run("Run"));
    await waitFor(() => expect(where()).toMatch(/\?run=\w+/));
    expect(await screen.findByTestId("truncated-notice")).toHaveTextContent(/not guaranteed to be optimal/i);
    expect(await screen.findByTestId("trace-truncated")).toHaveTextContent(/steps not recorded/i);
    expect(screen.getAllByTestId("recon-tile").length).toBeGreaterThan(0);
  });

  it("shows the busy state with Cancel; Cancel aborts the request and leaves the page usable", async () => {
    mockApi.respond("GET", RUNS, []);
    mockApi.respond("POST", RUNS, new Promise(() => {}));
    const abort = vi.spyOn(AbortController.prototype, "abort");
    renderPage();
    await screen.findByText("Run an algorithm to begin.");
    fireEvent.click(run("Run"));
    expect(await screen.findByTestId("run-busy")).toHaveTextContent(/server may\s+still finish/i);
    expect(run("Running…")).toBeDisabled();
    fireEvent.click(run("Cancel"));
    expect(abort).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("run-busy")).not.toBeInTheDocument();
    expect(run("Run")).toBeEnabled();
    expect(where()).not.toMatch(/run=/);
    abort.mockRestore();
  });

  it("opens a past run from the history and writes it to the URL; ?run= deep links work", async () => {
    const [a, b] = withRuns("greedy", "dijkstra");
    renderPage(ARTIFACT_ID, `?run=${a.id}`);
    expect(await screen.findByRole("heading", { name: /greedy · run summary/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^dijkstra/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^dijkstra/i }));
    expect(where()).toBe(`?run=${b.id}`);
    expect(await screen.findByRole("heading", { name: /dijkstra · run summary/i })).toBeInTheDocument();
  });

  it("deletes a run and clears the selection when it was open", async () => {
    const [a] = withRuns("greedy", "best_first");
    renderPage(ARTIFACT_ID, `?run=${a.id}`);
    await screen.findByRole("heading", { name: /greedy · run summary/i });
    mockApi.respond("DELETE", `/runs/${a.id}`, undefined);
    mockApi.respond("GET", RUNS, [{ ...runFixture("best_first"), id: "run1" }]);
    fireEvent.click(screen.getByRole("button", { name: /delete greedy run/i }));
    await waitFor(() => expect(where()).toBe(""));
    expect(await screen.findByText(/run history \(1\)/i)).toBeInTheDocument();
    expect(mockApi.calls("DELETE", `/runs/${a.id}`)).toHaveLength(1);
  });

  it("shows summary values, with — for null accuracies", async () => {
    const r = { ...runFixture("greedy"), id: "run0", neighbour_accuracy: null, direct_accuracy: null, coverage: 1 };
    mockApi.respond("GET", RUNS, [r]);
    mockApi.respond("GET", "/runs/run0", r);
    renderPage(ARTIFACT_ID, "?run=run0");
    const summary = await screen.findByRole("region", { name: /run summary/i });
    expect(summary).toHaveTextContent(/Neighbour accuracy\s*—/);
    expect(summary).toHaveTextContent(/Direct accuracy\s*—/);
    expect(within(summary).getByText("Total score")).toBeInTheDocument();
    expect(within(summary).getByText("Elapsed")).toBeInTheDocument();
  });

  it("starts on the final layout, lets the player step back, and lists confidence in a table", async () => {
    const [a] = withRuns("greedy");
    renderPage(ARTIFACT_ID, `?run=${a.id}`);
    const tiles = await screen.findAllByTestId("recon-tile");
    expect(tiles).toHaveLength(a.placements.length);
    fireEvent.click(screen.getByRole("button", { name: "Jump to start" }));
    expect(screen.queryAllByTestId("recon-tile")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: `Unplaced (${a.placements.length})` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    expect(screen.getAllByTestId("recon-tile")).toHaveLength(1);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row").length).toBe(2);
    expect(within(table).getByText(/joins scored/)).toBeInTheDocument();
  });

  it("overlay is off by default, shows verdict symbols and wrongly placed fragments when turned on", async () => {
    const [a] = withRuns("greedy");
    renderPage(ARTIFACT_ID, `?run=${a.id}`);
    await screen.findAllByTestId("recon-tile");
    const toggle = screen.getByRole("checkbox", { name: /ground-truth overlay/i });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByTestId("alignment")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByTestId("alignment")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /wrongly placed/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("recon-tile")[0]).toHaveTextContent(/[✓◐✗·]/);
    expect(screen.getByRole("group", { name: /ground truth: 4 rows by 4 columns/i })).toBeInTheDocument();
  });

  it("disables the overlay with an explanation when the artifact has no ground truth", async () => {
    const [a] = withRuns("greedy");
    mockApi.respond(
      "GET",
      `/artifacts/${ARTIFACT_ID}/fragments`,
      fragmentsFixture().map((f) => ({ ...f, true_row: null, true_col: null })),
    );
    renderPage(ARTIFACT_ID, `?run=${a.id}`);
    await screen.findAllByTestId("recon-tile");
    expect(screen.getByRole("checkbox", { name: /ground-truth overlay/i })).toBeDisabled();
    expect(screen.getByText(/no ground truth/i)).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    mockApi.fail("GET", RUNS, 500, "internal_error", "runs exploded");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("runs exploded");
    mockApi.respond("GET", RUNS, []);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Run an algorithm to begin.")).toBeInTheDocument();
  });

  it("shows the run-matching prompt on 409 and offers to run again after matching", async () => {
    renderPage(POTTERY.id as string);
    const prompt = await screen.findByRole("alert");
    expect(prompt).toHaveTextContent("Run matching first");
    fireEvent.click(within(prompt).getByRole("button", { name: "Run matching" }));
    expect(await screen.findByRole("button", { name: "Run" })).toBeInTheDocument();
  });

  it("re-runs after a 409 on Run once matching is done", async () => {
    mockApi.respond("GET", RUNS, []);
    mockApi.fail("POST", RUNS, 409, "precondition_failed", "run matching first");
    renderPage();
    await screen.findByText("Run an algorithm to begin.");
    fireEvent.click(run("Run"));
    const prompt = await screen.findByText("Run matching first");
    expect(prompt).toBeInTheDocument();
  });

  it("shows 404 for an unknown artifact", async () => {
    mockApi.fail("GET", `/artifacts/${ARTIFACT_ID}`, 404, "not_found", "artifact not found");
    renderPage();
    expect(await screen.findByText("Artifact not found")).toBeInTheDocument();
  });

  it("shows 404 for an unknown run and lets you clear it", async () => {
    mockApi.respond("GET", RUNS, []);
    mockApi.fail("GET", "/runs/nope", 404, "not_found", "run nope not found");
    renderPage(ARTIFACT_ID, "?run=nope");
    expect(await screen.findByText("Run not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    await waitFor(() => expect(where()).toBe(""));
  });

  it("maps 422 field errors from the server next to the fields", async () => {
    mockApi.respond("GET", RUNS, []);
    mockApi.fail("POST", RUNS, 422, "validation_error", "request validation failed", {
      errors: [{ loc: ["body", "threshold"], msg: "Input should be less than or equal to 1" }],
    });
    renderPage();
    await screen.findByText("Run an algorithm to begin.");
    fireEvent.click(run("Run"));
    expect(await screen.findByText(/less than or equal to 1/)).toBeInTheDocument();
  });

  it("explains an empty trace and an inconsistent trace, and still draws the final layout when it can", async () => {
    const base = { ...runFixture("greedy"), id: "run0" };
    mockApi.respond("GET", RUNS, [base]);
    mockApi.respond("GET", "/runs/run0", { ...base, trace: [] });
    renderPage(ARTIFACT_ID, "?run=run0");
    expect(await screen.findByText("Empty trace")).toBeInTheDocument();
  });

  it("does not crash the page when the canvas cannot be drawn (error boundary)", async () => {
    errorSpy.mockImplementation(() => {});
    boom.on = true;
    const base = { ...runFixture("greedy"), id: "run0" };
    mockApi.respond("GET", RUNS, [base]);
    mockApi.respond("GET", "/runs/run0", base);
    renderPage(ARTIFACT_ID, "?run=run0");
    expect(await screen.findByText("The canvas could not be drawn")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /run history/i })).toBeInTheDocument();
    boom.on = false;
    errorSpy.mockClear();
  });
});
