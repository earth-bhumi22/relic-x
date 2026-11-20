// Owner: A (Arvind)
// End-to-end smoke test: the whole app in mock mode, driven only through the UI.
// Any console.error (React warnings, act() problems, router errors, failed renders) fails the test.
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { INTRO_KEY } from "./lib/intro";
import { useMockApi } from "./test/mockApi";

describe("smoke: whole app in mock mode", () => {
  useMockApi();

  it("walks Projects → Gallery → Graph → Reconstruct → Lab without errors", async () => {
    const consoleError = vi.spyOn(console, "error");
    const consoleWarn = vi.spyOn(console, "warn");
    window.sessionStorage.setItem(INTRO_KEY, "1"); // returning visitor
    window.history.pushState({}, "", "/");

    render(<App />);

    // Projects: both mock artifacts are listed
    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open Mughal tile panel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Pottery band (unmatched)" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Artifact" })).not.toBeInTheDocument();

    // into an artifact (Gallery shows its 16 fragments)
    fireEvent.click(screen.getByRole("link", { name: "Open Mughal tile panel" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Fragment gallery" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^F01/ })).toBeInTheDocument();
    const sub = screen.getByRole("navigation", { name: "Artifact" });

    fireEvent.click(within(sub).getByRole("link", { name: "Graph" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Similarity graph" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Graph statistics")).toHaveTextContent("Nodes16");

    fireEvent.click(within(sub).getByRole("link", { name: "Reconstruct" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Reconstruction canvas" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(await screen.findByRole("heading", { name: /greedy · run summary/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("recon-tile").length).toBeGreaterThan(0);

    fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Lab" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Lab / benchmark" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Artifact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run benchmark" })).toBeDisabled(); // nothing chosen yet
    expect(screen.queryByRole("navigation", { name: "Artifact" })).not.toBeInTheDocument();

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
