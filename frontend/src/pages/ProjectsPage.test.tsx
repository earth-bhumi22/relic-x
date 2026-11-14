// Owner: A (Arvind)
// Projects page: list states, card contents, sorting, pagination and delete. Mock API only; no real network.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { setMockOverride } from "../api/mocks";
import type { ArtifactOut } from "../api/types";
import { artifactFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import ProjectsPage, { PAGE_SIZE } from "./ProjectsPage";

const art = (i: number, over: Partial<ArtifactOut> = {}): ArtifactOut => ({
  ...artifactFixture(),
  id: `id${String(i).padStart(30, "0")}`,
  name: `Artifact ${i}`,
  created_at: `2026-11-${String(10 + (i % 18)).padStart(2, "0")}T10:00:00Z`,
  ...over,
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
});

const renderPage = () => renderWithProviders(<ProjectsPage />);

describe("ProjectsPage list", () => {
  useMockApi();

  it("shows loading, then the artifact cards", async () => {
    mockApi.respond("GET", "/artifacts", [art(1), art(2)], { delayMs: 20 });
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading artifacts…");
    expect(await screen.findByRole("heading", { level: 2, name: "Artifact 1" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByText("Loading artifacts…")).not.toBeInTheDocument();
  });

  it("requests an explicit page size", async () => {
    mockApi.respond("GET", "/artifacts", [art(1)]);
    renderPage();
    await screen.findByText("Artifact 1");
    expect(mockApi.calls("GET", "/artifacts")[0].query.get("limit")).toBe(String(PAGE_SIZE));
    expect(mockApi.calls("GET", "/artifacts")[0].query.get("offset")).toBe("0");
  });

  it("shows the empty state with a call to action that opens the wizard", async () => {
    mockApi.respond("GET", "/artifacts", []);
    renderPage();
    expect(await screen.findByText("No artifacts yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create your first artifact" }));
    expect(await screen.findByRole("dialog", { name: "New artifact" })).toBeInTheDocument();
  });

  it.each([
    [409, "precondition_failed", "run matching first"],
    [500, "internal_error", "boom"],
  ])("shows a %i from the backend and retries", async (status, code, message) => {
    mockApi.fail("GET", "/artifacts", status, code, message);
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(code);
    expect(alert).toHaveTextContent(message);
    mockApi.respond("GET", "/artifacts", [art(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Artifact 1")).toBeInTheDocument();
    expect(mockApi.calls("GET", "/artifacts")).toHaveLength(2);
  });

  it("copes with a network failure (fetch rejects) and retries", async () => {
    vi.stubEnv("VITE_USE_MOCKS", "false");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(new Response(JSON.stringify([art(1)])));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Artifact 1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows every field on a card", async () => {
    mockApi.respond("GET", "/artifacts", [
      art(1, {
        name: "Mughal tile",
        description: "Glazed panel",
        source_kind: "sample",
        grid_rows: 3,
        grid_cols: 5,
        fragment_count: 14,
        run_count: 2,
        best_accuracy: 0.8333,
        has_ground_truth: true,
        created_at: "2026-11-13T11:30:00Z",
      }),
    ]);
    renderPage();
    const card = await screen.findByRole("article");
    expect(within(card).getByRole("heading", { name: "Mughal tile" })).toBeInTheDocument();
    expect(within(card).getByText("Glazed panel")).toBeInTheDocument();
    expect(within(card).getByTestId("source-kind")).toHaveTextContent("sample");
    expect(within(card).getByText("3 × 5")).toBeInTheDocument();
    expect(within(card).getByText("14")).toBeInTheDocument();
    expect(within(card).getByText("83%")).toBeInTheDocument();
    expect(within(card).getByText("Ground truth")).toBeInTheDocument();
    expect(within(card).getByText("13 Nov 2026")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Open Mughal tile" })).toHaveAttribute(
      "href",
      `/artifacts/${art(1).id}/gallery`,
    );
    expect(within(card).getByRole("img", { name: "Mughal tile thumbnail" })).toBeInTheDocument();
  });

  it("shows a dash when best_accuracy is null and no ground truth for real fragments", async () => {
    mockApi.respond("GET", "/artifacts", [
      art(1, { best_accuracy: null, has_ground_truth: false, source_kind: "fragments", description: null }),
    ]);
    renderPage();
    const card = await screen.findByRole("article");
    expect(within(card).getByText("—")).toBeInTheDocument();
    expect(within(card).getByText("No ground truth")).toBeInTheDocument();
    expect(within(card).getByText("No description")).toBeInTheDocument();
    expect(within(card).getByTestId("source-kind")).toHaveTextContent("fragments");
  });

  it("falls back when the thumbnail fails to load or is missing", async () => {
    mockApi.respond("GET", "/artifacts", [art(1), art(2, { image_url: null })]);
    renderPage();
    const img = await screen.findByRole("img", { name: "Artifact 1 thumbnail" });
    fireEvent.error(img);
    expect(await screen.findByRole("img", { name: "No preview available for Artifact 1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "No preview available for Artifact 2" })).toBeInTheDocument();
  });

  it("lists the newest artifact first even if the API does not", async () => {
    mockApi.respond("GET", "/artifacts", [
      art(1, { created_at: "2026-01-01T00:00:00Z" }),
      art(2, { created_at: "2026-03-01T00:00:00Z" }),
      art(3, { created_at: "2026-02-01T00:00:00Z" }),
    ]);
    renderPage();
    await screen.findByText("Artifact 1");
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["Artifact 2", "Artifact 3", "Artifact 1"]);
  });

  it("offers Load more when a full page came back, and appends the next page", async () => {
    const all = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => art(i + 1));
    setMockOverride("GET", "/artifacts", (req) => {
      const limit = Number(req.query.get("limit"));
      const offset = Number(req.query.get("offset"));
      return all.slice(offset, offset + limit);
    });
    renderPage();
    await screen.findByText("Artifact 1");
    expect(screen.getAllByRole("article")).toHaveLength(PAGE_SIZE);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(PAGE_SIZE + 3));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("does not offer Load more for a short page", async () => {
    mockApi.respond("GET", "/artifacts", [art(1)]);
    renderPage();
    await screen.findByText("Artifact 1");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an error with retry when Load more fails", async () => {
    const all = Array.from({ length: PAGE_SIZE }, (_, i) => art(i + 1));
    let fail = true;
    setMockOverride("GET", "/artifacts", (req) => {
      if (Number(req.query.get("offset")) > 0 && fail) throw Object.assign(new Error("later page broke"), {});
      return all;
    });
    renderPage();
    await screen.findByText("Artifact 1");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("later page broke");
    expect(screen.getAllByRole("article")).toHaveLength(PAGE_SIZE);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("ProjectsPage delete", () => {
  useMockApi();

  const open = async () => {
    mockApi.respond("GET", "/artifacts", [art(1), art(2)]);
    renderPage();
    await screen.findByText("Artifact 1");
    const trigger = screen.getByRole("button", { name: "Delete Artifact 1" });
    trigger.focus();
    fireEvent.click(trigger);
    return { trigger, dialog: await screen.findByRole("dialog") };
  };

  it("opens an accessible confirmation dialog and cancel does nothing", async () => {
    const { trigger, dialog } = await open();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Delete “Artifact 1”?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(mockApi.calls("DELETE")).toHaveLength(0);
    expect(trigger).toHaveFocus();
  });

  it("confirm calls the API, shows progress and removes the card", async () => {
    mockApi.respond("DELETE", "/artifacts/" + art(1).id, undefined, { delayMs: 20 });
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(within(dialog).getByText("Deleting…", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Artifact 1")).not.toBeInTheDocument();
    expect(screen.getByText("Artifact 2")).toBeInTheDocument();
    expect(mockApi.calls("DELETE", `/artifacts/${art(1).id}`)).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Deleted “Artifact 1”.");
  });

  it("keeps the card and shows code + message when the API fails", async () => {
    mockApi.fail("DELETE", "/artifacts/" + art(1).id, 500, "internal_error", "could not delete");
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("internal_error");
    expect(alert).toHaveTextContent("could not delete");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Artifact 1")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("deletes for real against the mock store and the list reflects it", async () => {
    renderPage();
    await screen.findByText("Mughal tile panel");
    fireEvent.click(screen.getByRole("button", { name: "Delete Mughal tile panel" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Mughal tile panel")).not.toBeInTheDocument());
    expect(screen.getByText("Pottery band (unmatched)")).toBeInTheDocument();
  });

  it("closes the dialog with Escape and ignores it while deleting", async () => {
    mockApi.respond("DELETE", "/artifacts/" + art(1).id, undefined, { delayMs: 30 });
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await within(dialog).findByRole("button", { name: "Deleting…" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
