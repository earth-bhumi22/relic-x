// Owner: A (Arvind)
import { screen } from "@testing-library/react";
import { AppRoutes } from "../../routes";
import { useMockApi } from "../../test/mockApi";
import { renderWithProviders } from "../../test/renderWithProviders";

const renderAt = (route: string) => renderWithProviders(<AppRoutes />, { route });

describe("Navbar", () => {
  useMockApi();

  it("always links to Projects and Lab", () => {
    renderAt("/lab");
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(main).toHaveTextContent("Projects");
    expect(main).toHaveTextContent("Lab");
  });

  it("marks the current section as active", () => {
    renderAt("/lab");
    expect(screen.getByRole("link", { name: "Lab" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Projects" })).not.toHaveAttribute("aria-current");
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
