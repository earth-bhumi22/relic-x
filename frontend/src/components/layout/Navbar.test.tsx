// Owner: A (Arvind)
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes, ROUTER_FUTURE } from "../../routes";
import { ThemeProvider } from "../../theme";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("Navbar", () => {
  beforeEach(() => vi.stubEnv("VITE_USE_MOCKS", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("always links to Projects and Lab", () => {
    renderAt("/lab");
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(main).toHaveTextContent("Projects");
    expect(main).toHaveTextContent("Lab");
  });

  it.each(["/", "/lab", "/nowhere"])("hides the artifact sub-links on %s", (path) => {
    renderAt(path);
    expect(screen.queryByRole("navigation", { name: "Artifact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gallery" })).not.toBeInTheDocument();
  });

  it.each(["gallery", "graph", "reconstruct"])("shows the artifact sub-links on /artifacts/:id/%s", (page) => {
    renderAt(`/artifacts/abc123/${page}`);
    const sub = screen.getByRole("navigation", { name: "Artifact" });
    expect(sub).toHaveTextContent("Gallery");
    expect(sub).toHaveTextContent("Graph");
    expect(sub).toHaveTextContent("Reconstruct");
    expect(screen.getByRole("link", { name: "Graph" })).toHaveAttribute("href", "/artifacts/abc123/graph");
  });

  it("shows a mock indicator in mock mode", () => {
    renderAt("/");
    expect(screen.getByTestId("api-status")).toHaveTextContent("API mock");
  });
});
