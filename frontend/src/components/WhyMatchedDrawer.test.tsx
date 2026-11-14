// Owner: A (Arvind)
// The "Why matched?" drawer: page logic against the mock API (explanations are computed from the mock fragments, or
// overridden per test to exercise exact payloads), plus the open / close / ?why= behaviour on the graph page.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "../api/errors";
import { POTTERY, setMockOverride } from "../api/mocks";
import type { Explanation } from "../api/types";
import { SIGNALS } from "../lib/signals";
import type { MatchSelection } from "../lib/graphView";
import { ARTIFACT_ID, explanationFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import { ROUTER_FUTURE } from "../routes";
import { ThemeProvider } from "../theme";
import real from "../test/explain-real.json";
import WhyMatchedDrawer from "./WhyMatchedDrawer";

const EXPLAIN = `/artifacts/${ARTIFACT_ID}/explain`;
const m1: MatchSelection = { a: "F01", sideA: 1, b: "F02", sideB: 3 };
const m2: MatchSelection = { a: "F02", sideA: 2, b: "F03", sideB: 0 };

/** A hand-made explanation with known numbers (24-symbol edges). */
function payload(over: Partial<Explanation> = {}): Explanation {
  const edge_a = "ABCDEFGHIJKLMNOPQRSTUVWX";
  const edge_b_reversed = "ABCDxFGHIJKLMNOPQRSTUVWX";
  const scores = { color: 0.9, lcs: 0.8, edit: 0.7, motif: 0.5, hash: 0.4 };
  const weights = { color: 0.4, lcs: 0.2, edit: 0.15, motif: 0.15, hash: 0.1 };
  const contributions = { color: 0.36, lcs: 0.16, edit: 0.105, motif: 0.075, hash: 0.04 };
  return {
    a: "F01",
    side_a: "E",
    b: "F02",
    side_b: "W",
    edge_a,
    edge_b_reversed,
    strip_a: edge_a.split("").map((_, i) => [i * 10, 20, 30]),
    strip_b_reversed: edge_a.split("").map((_, i) => [i * 10, 25, 30]),
    scores,
    weights,
    contributions,
    composite: 0.74,
    lcs: {
      length: 3,
      subsequence: "ABC",
      pairs: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    },
    edit: {
      distance: 3,
      ops: [
        { op: "match", a: "A", b: "A" },
        { op: "sub", a: "B", b: "x" },
        { op: "ins", a: null, b: "y" },
        { op: "del", a: "C", b: null },
        { op: "match", a: "D", b: "D" },
      ],
    },
    motif: { length: 4, pos_a: 5, pos_b: 6, motif: "FGHI", kmp_ops: 812, rabin_karp_ops: 233 },
    hash: { ngram: 3, shared: 8, union: 10 },
    ground_truth_neighbours: true,
    ...over,
  };
}
const seen: URLSearchParams[] = [];
beforeEach(() => {
  seen.length = 0;
});
const serve = (x: Explanation | ((q: URLSearchParams) => Explanation | Promise<Explanation>)) =>
  setMockOverride("GET", EXPLAIN, async (req) => {
    seen.push(req.query);
    return typeof x === "function" ? x(req.query) : x;
  });

const drawer = () => screen.findByRole("dialog", { name: /Why matched\?/ });
const asRegion = (name: RegExp) => within(screen.getByRole("dialog")).getByRole("region", { name });
const beadsOf = (el: HTMLElement) => within(el).queryAllByTestId("bead");
const beadCount = (el: HTMLElement) => beadsOf(el).length;
/** Positions of the beads outlined with highlight `kind`. */
const marked = (el: HTMLElement, kind: string) =>
  beadsOf(el).flatMap((bead, i) => (bead.getAttribute("data-kind") === kind ? [i] : []));

function Harness({ initial = m1 as MatchSelection | null }) {
  const [match, setMatch] = useState(initial);
  return (
    <>
      <button type="button" onClick={() => setMatch(m1)}>
        open
      </button>
      <button type="button" onClick={() => setMatch(m2)}>
        other
      </button>
      <WhyMatchedDrawer artifactId={ARTIFACT_ID} match={match} onClose={() => setMatch(null)} />
    </>
  );
}
const renderDrawer = (initial: MatchSelection | null = m1) => renderWithProviders(<Harness initial={initial} />);

describe("WhyMatchedDrawer — request and header", () => {
  useMockApi();

  it("renders nothing without a match", () => {
    renderDrawer(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(seen).toHaveLength(0);
  });

  it("requests /explain with labels and INTEGER sides, and shows the response's letters and the composite", async () => {
    serve(payload());
    renderDrawer();
    const dlg = await drawer();
    expect(dlg).toHaveAccessibleName("Why matched? F01 · E ↔ F02 · W");
    const q = seen[0];
    expect(Object.fromEntries(q)).toEqual({ a: "F01", side_a: "1", b: "F02", side_b: "3" });
    expect(await screen.findByLabelText("Composite score 0.7400")).toHaveTextContent("0.7400");
    expect(within(dlg).getByTestId("why-sides")).toHaveTextContent("F01 · E ↔ F02 · W");
  });

  it.each([
    [true, "true neighbours"],
    [false, "not neighbours"],
    [null, "unknown (no ground truth)"],
  ])("ground truth %s shows the badge %s", async (truth, text) => {
    serve(payload({ ground_truth_neighbours: truth }));
    renderDrawer();
    expect(await screen.findByText(text)).toHaveClass("badge");
  });

  it("changing the match re-fetches, and a slow stale response never overwrites the newer one", async () => {
    serve(async (q) => {
      const first = q.get("a") === "F01";
      if (first) await new Promise((r) => setTimeout(r, 120));
      return payload({ a: q.get("a")!, composite: first ? 0.11 : 0.22 });
    });
    renderDrawer();
    await drawer();
    fireEvent.click(screen.getByText("other", { selector: "button" }));
    expect(await screen.findByLabelText("Composite score 0.2200")).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(screen.getByLabelText("Composite score 0.2200")).toBeInTheDocument();
    expect(screen.queryByLabelText("Composite score 0.1100")).not.toBeInTheDocument();
    expect(seen).toHaveLength(2);
  });
});

describe("WhyMatchedDrawer — evidence", () => {
  useMockApi();

  beforeEach(() => serve(payload()));

  it("draws both edges as aligned strips with one bead per symbol and says why B is reversed", async () => {
    renderDrawer();
    const sec = await screen.findByRole("region", { name: /two edges, side by side/i });
    const strips = within(sec).getAllByRole("img");
    expect(strips).toHaveLength(2);
    expect(strips.map(beadCount)).toEqual([24, 24]);
    expect(strips[0]).toHaveAccessibleName(/F01 E edge: ABCDEFGHIJKLMNOPQRSTUVWX/);
    expect(sec).toHaveTextContent(/reversed/);
    expect(sec).toHaveTextContent(/clockwise/);
  });

  it("LCS pairs [i, j] highlight position i in edge A and position j in edge B, with a connector per pair", async () => {
    serve(
      payload({
        lcs: {
          length: 2,
          subsequence: "BC",
          pairs: [
            [1, 3],
            [2, 5],
          ],
        },
      }),
    );
    renderDrawer();
    await drawer();
    const sec = await screen.findByRole("region", { name: /^LCS$/ });
    const [a, b] = within(sec)
      .getAllByRole("img")
      .filter((e) => e.classList.contains("beads"));
    expect(marked(a, "lcs")).toEqual([1, 2]);
    expect(marked(b, "lcs")).toEqual([3, 5]);
    expect(within(sec).getByTestId("lcs-links")).toHaveAttribute("data-links", "2");
  });

  it("clips a very long pair list instead of drawing hundreds of lines", async () => {
    const pairs = Array.from({ length: 300 }, (_, i) => [i % 24, i % 24] as [number, number]);
    serve(payload({ lcs: { length: 300, subsequence: "", pairs } }));
    renderDrawer();
    expect(await screen.findByTestId("lcs-links")).toHaveAttribute("data-links", "48");
  });

  it("the motif highlight covers [pos, pos + length) in each strip", async () => {
    renderDrawer();
    await drawer();
    const sec = await screen.findByRole("region", { name: /shared motif/i });
    const [a, b] = within(sec).getAllByRole("img");
    expect(marked(a, "motif")).toEqual([5, 6, 7, 8]);
    expect(marked(b, "motif")).toEqual([6, 7, 8, 9]);
  });

  it("shows KMP and Rabin-Karp operation counts side by side", async () => {
    renderDrawer();
    await drawer();
    const sec = await screen.findByRole("region", { name: /shared motif/i });
    const table = within(sec).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "KMP" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Rabin-Karp" })).toBeInTheDocument();
    expect(table).toHaveTextContent("812 operations");
    expect(table).toHaveTextContent("233 operations");
  });

  it("length 0 shows the empty motif message and highlights nothing", async () => {
    serve(payload({ motif: { length: 0, pos_a: -1, pos_b: -1, motif: "", kmp_ops: 10, rabin_karp_ops: 5 } }));
    renderDrawer();
    await drawer();
    const sec = await screen.findByRole("region", { name: /shared motif/i });
    expect(sec).toHaveTextContent("No shared motif");
    expect(marked(sec, "motif")).toEqual([]);
  });

  it("renders edit ops in order with counts and a text/shape cue per op", async () => {
    renderDrawer();
    await drawer();
    const sec = await screen.findByRole("region", { name: /edit distance/i });
    const cells = within(within(sec).getByRole("list", { name: /edit operations/i })).getAllByRole("listitem");
    expect(cells.map((c) => c.getAttribute("aria-label"))).toEqual([
      "match A with A",
      "substitute B with x",
      "insert nothing with y",
      "delete C with nothing",
      "match D with D",
    ]);
    expect(cells.map((c) => c.textContent)).toEqual(["=", "≠", "+", "−", "="]);
    expect(cells[2]).toHaveAccessibleName("insert nothing with y");
    expect(sec).toHaveTextContent("2 match, 1 substitute, 1 insert, 1 delete");
  });

  it("hash overlap shows the n-gram size and the Jaccard ratio, and is safe for union = 0", async () => {
    renderDrawer();
    await drawer();
    let sec = await screen.findByRole("region", { name: /hash overlap/i });
    expect(sec).toHaveTextContent("3-grams shared: 8 of 10");
    expect(sec).toHaveTextContent("Jaccard 0.80");
    expect(within(sec).getByTestId("ratio-fill")).toHaveStyle({ width: "80%" });
    serve(payload({ hash: { ngram: 3, shared: 0, union: 0 } }));
    fireEvent.click(screen.getByText("other", { selector: "button" }));
    await waitFor(() => expect(seen).toHaveLength(2));
    sec = await screen.findByRole("region", { name: /hash overlap/i });
    await waitFor(() => expect(sec).toHaveTextContent("no n-grams to compare"));
    expect(within(sec).getByTestId("ratio-fill")).toHaveStyle({ width: "0%" });
  });

  it("the score bar has five proportional segments in the shared order, and the legend lists score × weight = contribution", async () => {
    renderDrawer();
    const x = payload();
    await drawer();
    const bar = await screen.findByTestId("score-bar");
    const segs = within(bar).getAllByTestId("score-seg");
    expect(segs.map((s) => s.dataset.signal)).toEqual(SIGNALS.map((s) => s.key));
    segs.forEach((s) => {
      const key = s.dataset.signal as keyof Explanation["contributions"];
      expect(parseFloat(s.style.width)).toBeCloseTo(x.contributions[key] * 100, 5);
    });
    expect(bar).toHaveAccessibleName(/Composite 0\.7400 out of 1: Colour 0\.3600, LCS 0\.1600/);
    const legend = within(asRegion(/weighted score/i)).getByRole("table", { name: /score × weight/i });
    const rows = within(legend).getAllByRole("row");
    expect(rows).toHaveLength(1 + 5 + 1);
    expect(rows[1]).toHaveTextContent("Colour0.9000× 0.40= 0.3600");
    expect(rows[5]).toHaveTextContent("Hash overlap0.4000× 0.10= 0.0400");
    const total = segs.reduce((sum, s) => sum + parseFloat(s.style.width) / 100, 0);
    expect(total).toBeCloseTo(x.composite, 3);
  });

  it("the real mock's contributions sum to its composite", () => {
    const x = explanationFixture("F01", 1, "F02", 3);
    const sum = Object.values(x.contributions).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - x.composite)).toBeLessThan(0.001);
  });
});

describe("WhyMatchedDrawer — states", () => {
  useMockApi();

  it("shows a loading skeleton first", async () => {
    mockApi.respond("GET", EXPLAIN, payload(), { delayMs: 50 });
    renderDrawer();
    expect(await screen.findByRole("status", { name: "Loading explanation" })).toBeInTheDocument();
    await screen.findByLabelText("Composite score 0.7400");
  });

  it("409 shows the matching prompt, which runs matching and then reloads", async () => {
    mockApi.fail("GET", EXPLAIN, 409, "precondition_failed", "run matching first");
    renderDrawer();
    expect(await screen.findByText("Run matching first")).toBeInTheDocument();
    serve(payload());
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    expect(await screen.findByLabelText("Composite score 0.7400")).toBeInTheDocument();
  });

  it("404 says what was not found, 422 says the match is invalid, and a generic error offers retry", async () => {
    mockApi.fail("GET", EXPLAIN, 404, "not_found", "fragment F99 not found in artifact x");
    const { unmount } = renderDrawer();
    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.getByText(/fragment F99 not found/)).toBeInTheDocument();
    unmount();

    mockApi.fail("GET", EXPLAIN, 422, "validation_error", "request validation failed");
    const view = renderDrawer();
    expect(await screen.findByText("That match cannot be explained")).toBeInTheDocument();
    view.unmount();

    mockApi.fail("GET", EXPLAIN, 500, "internal_error", "boom");
    renderDrawer();
    expect(await screen.findByText(/internal_error/)).toBeInTheDocument();
    serve(payload());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Composite score 0.7400")).toBeInTheDocument();
  });

  it("an unknown label from the real mock is a 404 that names the fragment", async () => {
    renderDrawer({ a: "F99", sideA: 1, b: "F02", sideB: 3 });
    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.getByText(/F99/, { selector: "p:not(.state-title)" })).toBeInTheDocument();
  });

  it("the unmatched mock artifact gets 409 for any pair", async () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <ThemeProvider>
          <WhyMatchedDrawer artifactId={POTTERY.id as string} match={m1} onClose={() => undefined} />
        </ThemeProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Run matching first")).toBeInTheDocument();
  });

  it("a malformed payload is caught by the error boundary instead of crashing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    serve({ ...payload(), lcs: undefined, scores: undefined } as unknown as Explanation);
    renderDrawer();
    expect(await screen.findByText("The explanation could not be drawn")).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ApiError details are shown for the generic case", async () => {
    setMockOverride("GET", EXPLAIN, async () => {
      throw new ApiError(503, "unavailable", "try later");
    });
    renderDrawer();
    expect(await screen.findByText("try later")).toBeInTheDocument();
  });
});

describe("WhyMatchedDrawer — dialog behaviour", () => {
  useMockApi();

  it("Esc closes it and focus returns to the opener; the page scroll lock is released", async () => {
    serve(payload());
    renderWithProviders(<Harness initial={null} />);
    const opener = screen.getByText("open", { selector: "button" });
    opener.focus();
    fireEvent.click(opener);
    await drawer();
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("the backdrop click and the Close button close it", async () => {
    serve(payload());
    renderDrawer();
    await drawer();
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("open", { selector: "button" }));
    await drawer();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("WhyMatchedDrawer — ?why= on the graph page", () => {
  useMockApi();

  function Where() {
    return <p data-testid="where">{useLocation().search}</p>;
  }

  it("opening from the URL shows the drawer for that pair; closing removes ?why=", async () => {
    serve(payload());
    const { default: GraphPage } = await import("../pages/GraphPage");
    renderWithProviders(
      <>
        <Routes>
          <Route path="/artifacts/:id/graph" element={<GraphPage />} />
        </Routes>
        <Where />
      </>,
      { route: `/artifacts/${ARTIFACT_ID}/graph?why=F01:E:F02:W` },
    );
    const dlg = await drawer();
    expect(dlg).toHaveAccessibleName("Why matched? F01 · E ↔ F02 · W");
    expect(Object.fromEntries(seen[0])).toMatchObject({ side_a: "1", side_b: "3" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("where")).not.toHaveTextContent("why=");
  });
});

// Payloads captured from the real backend (GET /explain, mosaic-tile 4×4): the strong pair F08 N / F09 S and the
// weak pair F01 E / F02 W, which has no shared motif (length 0, positions -1) and 24 substitutions.
describe("WhyMatchedDrawer — real backend payloads", () => {
  useMockApi();

  it("draws a strong real match: LCS pairs index edge A and edge B reversed, sections add up", async () => {
    const x = real.strong as Explanation;
    serve(x);
    renderDrawer({ a: "F08", sideA: 0, b: "F09", sideB: 2 });
    await drawer();
    const sec = await screen.findByRole("region", { name: /^LCS$/ });
    expect(within(sec).getByTestId("lcs-links")).toHaveAttribute("data-links", String(x.lcs.pairs.length));
    const [a, b] = within(sec)
      .getAllByRole("img")
      .filter((e) => within(e).queryAllByTestId("bead").length > 0);
    expect(marked(a, "lcs")).toEqual(x.lcs.pairs.map(([i]) => i));
    expect(marked(b, "lcs")).toEqual(x.lcs.pairs.map(([, j]) => j));
    expect(x.lcs.pairs.every(([i, j]) => x.edge_a[i] === x.edge_b_reversed[j])).toBe(true);
    expect(screen.getByLabelText("Composite score 0.9055")).toBeInTheDocument();
  });

  it("draws a weak real match with no shared motif", async () => {
    serve(real.weak as Explanation);
    renderDrawer();
    const sec = await screen.findByRole("region", { name: /shared motif/i });
    expect(sec).toHaveTextContent("No shared motif");
    expect(screen.getByText("not neighbours")).toBeInTheDocument();
    expect(screen.getByLabelText("Composite score 0.0250")).toBeInTheDocument();
  });
});
