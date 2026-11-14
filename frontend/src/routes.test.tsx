// Owner: A (Arvind)
import { fireEvent, screen } from "@testing-library/react";
import { AppRoutes } from "./routes";
import { ARTIFACT_ID } from "./test/fixtures";
import { useMockApi, mockApi } from "./test/mockApi";
import { renderWithProviders } from "./test/renderWithProviders";

const renderAt = (route: string) => renderWithProviders(<AppRoutes />, { route });
const UNMATCHED = "7b2e5d1c9a3f4c80b6d1e2f3a4b5c6d7";

describe("routing", () => {
  useMockApi();

  it.each([
    ["/", "Projects"],
    [`/artifacts/${ARTIFACT_ID}/gallery`, "Fragment gallery"],
    [`/artifacts/${ARTIFACT_ID}/graph`, "Similarity graph"],
    [`/artifacts/${ARTIFACT_ID}/reconstruct`, "Reconstruction canvas"],
    ["/lab", "Lab / benchmark"],
  ])("%s renders its placeholder page", async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("renders the not-found page for an unknown path", async () => {
    renderAt("/no/such/page");
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Projects" })).toHaveAttribute("href", "/");
  });

  it("does not expose the Why-matched drawer as a route", async () => {
    renderAt(`/artifacts/${ARTIFACT_ID}/explain`);
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });

  it("loads mock data into the live state", async () => {
    renderAt("/");
    expect(await screen.findByText("Mughal tile panel")).toBeInTheDocument();
  });

  it("lets a page demonstrate loading, empty and error states", async () => {
    renderAt("/");
    await screen.findByText("Mughal tile panel");
    fireEvent.click(screen.getByRole("button", { name: "Loading" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
    fireEvent.click(screen.getByRole("button", { name: "Empty" }));
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Error" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not_found");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Mughal tile panel")).toBeInTheDocument();
  });

  it("shows the empty state when the API returns an empty list", async () => {
    mockApi.respond("GET", "/artifacts", []);
    renderAt("/");
    expect(await screen.findByText("The API returned no data.")).toBeInTheDocument();
  });

  it("shows a loading state while the API is slow", async () => {
    mockApi.respond("GET", "/artifacts", [], { delayMs: 30 });
    renderAt("/");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(await screen.findByText("The API returned no data.")).toBeInTheDocument();
  });

  it("shows the real error state (404) for an unknown artifact", async () => {
    renderAt("/artifacts/00000000000000000000000000000000/gallery");
    expect(await screen.findByRole("alert")).toHaveTextContent("not_found");
  });

  it("shows precondition_failed (409) for an artifact that has not been matched", async () => {
    renderAt(`/artifacts/${UNMATCHED}/graph`);
    expect(await screen.findByRole("alert")).toHaveTextContent("precondition_failed");
  });

  it("retries a failed request from the error state", async () => {
    mockApi.fail("GET", "/artifacts", 500, "internal_error", "boom");
    renderAt("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    mockApi.respond("GET", "/artifacts", []);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("The API returned no data.")).toBeInTheDocument();
    expect(mockApi.calls("GET", "/artifacts")).toHaveLength(2);
  });
});
