// Owner: A (Arvind)
// Fragment gallery: states, deterministic shuffle, detail dialog (labelled sides, Esc, focus, deep link),
// ground-truth spoiler. Mock API only; no real network.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { POTTERY } from "../api/mocks";
import type { FragmentOut } from "../api/types";
import { ARTIFACT_ID, artifactFixture, fragmentsFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import GalleryPage, { labelOrder, scrambledOrder } from "./GalleryPage";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
});

const PATH = "/artifacts/:id/gallery";
const renderGallery = (id = ARTIFACT_ID, query = "") =>
  renderWithProviders(<GalleryPage />, { route: `/artifacts/${id}/gallery${query}`, path: PATH });
const tileNames = () => within(screen.getByRole("list", { name: "Fragments" })).getAllByRole("button");
const labels = () => tileNames().map((b) => /^F\d{2}/.exec(b.textContent ?? "")![0]);

describe("GalleryPage states", () => {
  useMockApi();

  it("shows loading, then the header, links and one tile per fragment", async () => {
    mockApi.respond("GET", `/artifacts/${ARTIFACT_ID}/fragments`, fragmentsFixture(), { delayMs: 20 });
    renderGallery();
    expect(screen.getByRole("status")).toHaveTextContent("Loading fragments…");
    expect(await screen.findAllByRole("button", { name: /^F\d\d/ })).toHaveLength(16);
    expect(screen.getByRole("heading", { level: 1, name: "Fragment gallery" })).toBeInTheDocument();
    expect(screen.getByText(/Mughal tile panel/)).toBeInTheDocument();
    expect(screen.getByText(/4 × 4 grid · 16 fragments/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View graph" })).toHaveAttribute("href", `/artifacts/${ARTIFACT_ID}/graph`);
    expect(screen.getByRole("link", { name: "Reconstruct" })).toHaveAttribute(
      "href",
      `/artifacts/${ARTIFACT_ID}/reconstruct`,
    );
    expect(screen.getByRole("link", { name: /Projects/ })).toHaveAttribute("href", "/");
  });

  it("shows the empty state when there are no fragments", async () => {
    mockApi.respond("GET", `/artifacts/${ARTIFACT_ID}/fragments`, []);
    renderGallery();
    expect(await screen.findByText("No fragments yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Projects" })).toBeInTheDocument();
  });

  it("shows an error with retry for a failed fragment list", async () => {
    mockApi.fail("GET", `/artifacts/${ARTIFACT_ID}/fragments`, 500, "internal_error", "boom");
    renderGallery();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    mockApi.respond("GET", `/artifacts/${ARTIFACT_ID}/fragments`, fragmentsFixture());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByRole("button", { name: /^F\d\d/ })).toHaveLength(16);
    expect(mockApi.calls("GET", `/artifacts/${ARTIFACT_ID}/fragments`)).toHaveLength(2);
  });

  it("shows an unknown artifact as not found, with a way back", async () => {
    renderGallery("00000000000000000000000000000000");
    expect(await screen.findByText("Artifact not found")).toBeInTheDocument();
    expect(screen.getByText(/not found/i, { selector: ".muted" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Projects" })).toHaveAttribute("href", "/");
  });

  it("shows other artifact errors with retry", async () => {
    mockApi.fail("GET", `/artifacts/${ARTIFACT_ID}`, 500, "internal_error", "db down");
    renderGallery();
    expect(await screen.findByRole("alert")).toHaveTextContent("db down");
    mockApi.respond("GET", `/artifacts/${ARTIFACT_ID}`, artifactFixture());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByRole("button", { name: /^F\d\d/ })).toHaveLength(16);
  });
});

describe("GalleryPage order", () => {
  useMockApi();

  it("is a stable shuffle by default and sorted by label on request", async () => {
    const view = renderGallery();
    await screen.findAllByRole("button", { name: /^F\d\d/ });
    const scrambled = labels();
    expect(scrambled).not.toEqual([...scrambled].sort());
    view.unmount();

    renderGallery();
    await screen.findAllByRole("button", { name: /^F\d\d/ });
    expect(labels()).toEqual(scrambled); // same artifact id -> same order on a fresh render

    fireEvent.click(screen.getByRole("checkbox", { name: "Sorted by label" }));
    expect(labels()).toEqual(Array.from({ length: 16 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`));
    fireEvent.click(screen.getByRole("checkbox", { name: "Sorted by label" }));
    expect(labels()).toEqual(scrambled);
  });

  it("pure helpers: scrambledOrder is deterministic per id, labelOrder is natural order", () => {
    const frags = fragmentsFixture();
    expect(scrambledOrder(frags, "a").map((f) => f.id)).toEqual(scrambledOrder(frags, "a").map((f) => f.id));
    expect(scrambledOrder(frags, "a").map((f) => f.id)).not.toEqual(scrambledOrder(frags, "b").map((f) => f.id));
    const odd = [
      { ...frags[0], label: "F10" },
      { ...frags[1], label: "F2" },
    ] as FragmentOut[];
    expect(labelOrder(odd).map((f) => f.label)).toEqual(["F2", "F10"]);
  });
});

describe("GalleryPage fragment detail", () => {
  useMockApi();

  const openF01 = async () => {
    renderGallery();
    const tile = await screen.findByRole("button", { name: /^F01/ });
    tile.focus();
    fireEvent.click(tile);
    return tile;
  };

  it("opens a dialog with the four labelled sides and edge strings, and keeps the selection in the URL", async () => {
    await openF01();
    const dialog = await screen.findByRole("dialog", { name: "Fragment F01" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const f01 = fragmentsFixture().find((f) => f.label === "F01")!;
    for (const [side, name] of [
      ["N", "North"],
      ["E", "East"],
      ["S", "South"],
      ["W", "West"],
    ] as const)
      expect(within(dialog).getByRole("img", { name: `${name} edge of F01: ${f01.edges[side]}` })).toBeInTheDocument();
    expect(within(dialog).getByText("120 × 120 px")).toBeInTheDocument();
    expect(within(dialog).getByText(f01.id)).toBeInTheDocument();
  });

  it("closes with Esc and returns focus to the tile", async () => {
    const tile = await openF01();
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(tile).toHaveFocus());
  });

  it("closes with the Close button", async () => {
    await openF01();
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens from a ?fragment= deep link", async () => {
    renderGallery(ARTIFACT_ID, "?fragment=F07");
    expect(await screen.findByRole("dialog", { name: "Fragment F07" })).toBeInTheDocument();
  });

  it("explains an unknown ?fragment= label instead of failing", async () => {
    renderGallery(ARTIFACT_ID, "?fragment=F99");
    expect(await screen.findByText(/No fragment labelled “F99”/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("loads and shows the numeric strips only when asked", async () => {
    await openF01();
    const dialog = await screen.findByRole("dialog");
    expect(mockApi.calls("GET")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /numeric strips/ }));
    expect(await within(dialog).findByRole("img", { name: /^North numeric strip: / })).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: /^West numeric strip: / })).toBeInTheDocument();
  });

  it("shows an error with retry when the numeric strips fail to load", async () => {
    const f01 = fragmentsFixture().find((f) => f.label === "F01")!;
    mockApi.fail("GET", `/fragments/${f01.id}`, 500, "internal_error", "no strips");
    await openF01();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /numeric strips/ }));
    expect(await within(dialog).findByText("no strips")).toBeInTheDocument();
    mockApi.respond("GET", `/fragments/${f01.id}`, { ...f01, strips: { N: [[1, 2, 3]], E: [], S: [], W: [] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByRole("img", { name: "North numeric strip: 1,2,3" })).toBeInTheDocument();
  });
});

describe("GalleryPage ground truth", () => {
  useMockApi();

  it("hides ground truth by default and reveals it behind the toggle", async () => {
    renderGallery(ARTIFACT_ID, "?fragment=F01");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/Ground truth/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Row \d/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show ground truth" }));
    expect(within(dialog).getByText(/Row \d+, column \d+, scrambled by 0°/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Row \d+, column \d+/).length).toBeGreaterThan(1); // tiles show it too
  });

  it("says there is no ground truth for uploaded fragments", async () => {
    const frags = fragmentsFixture().map((f) => ({ ...f, true_row: null, true_col: null, scramble_rot: null }));
    mockApi.respond("GET", `/artifacts/${ARTIFACT_ID}/fragments`, frags);
    renderGallery(ARTIFACT_ID, "?fragment=F01");
    await screen.findByRole("dialog");
    expect(screen.queryByText(/no ground truth/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show ground truth" }));
    expect(screen.getAllByText("No ground truth (uploaded fragments)").length).toBeGreaterThan(0);
  });
});

describe("GalleryPage matching panel", () => {
  useMockApi();

  it("shows 'Not matched yet' for an unmatched artifact and runs matching with the default parameters", async () => {
    renderGallery(POTTERY.id as string);
    expect(await screen.findByTestId("match-state")).toHaveTextContent("Not matched yet");
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    expect(await screen.findByText("Matched")).toBeInTheDocument();
    expect(screen.getByText("Match accuracy")).toBeInTheDocument();
    // the real mock endpoint changed state: a later artifact read now has match_stats
    renderGallery(POTTERY.id as string);
    await waitFor(() => expect(screen.getAllByTestId("match-state").at(-1)).toHaveTextContent("Matched"));
  });

  it("shows 'Matched' with stats for an already matched artifact", async () => {
    renderGallery();
    expect(await screen.findByTestId("match-state")).toHaveTextContent("Matched");
    expect(screen.getByText("Side pairs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run matching again" })).toBeInTheDocument();
  });
});
