// Owner: A (Arvind)
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes, ROUTER_FUTURE } from "./routes";
import { ThemeProvider } from "./theme";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const ARTIFACT = "4f1c2a9e0b7d4e6f8a1b2c3d4e5f6a7b";

describe("routing", () => {
  beforeEach(() => vi.stubEnv("VITE_USE_MOCKS", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["/", "Projects"],
    [`/artifacts/${ARTIFACT}/gallery`, "Fragment gallery"],
    [`/artifacts/${ARTIFACT}/graph`, "Similarity graph"],
    [`/artifacts/${ARTIFACT}/reconstruct`, "Reconstruction canvas"],
    ["/lab", "Lab / benchmark"],
  ])("%s renders its placeholder page", async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("renders the not-found page for an unknown path", async () => {
    renderAt("/no/such/page");
    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  });

  it("does not expose the Why-matched drawer as a route", async () => {
    renderAt(`/artifacts/${ARTIFACT}/explain`);
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
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("not_found");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows the real error state (404) for an unknown artifact", async () => {
    renderAt("/artifacts/00000000000000000000000000000000/gallery");
    expect(await screen.findByRole("alert")).toHaveTextContent("not_found");
  });

  it("shows precondition_failed (409) for an artifact that has not been matched", async () => {
    renderAt("/artifacts/7b2e5d1c9a3f4c80b6d1e2f3a4b5c6d7/graph");
    expect(await screen.findByRole("alert")).toHaveTextContent("precondition_failed");
  });
});
