// Owner: A (Arvind)
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { INTRO_KEY } from "../lib/intro";
import { renderWithProviders } from "../test/renderWithProviders";
import IntroPage from "./IntroPage";

const renderIntro = () =>
  renderWithProviders(
    <Routes>
      <Route path="/welcome" element={<IntroPage />} />
      <Route path="/" element={<p>home</p>} />
    </Routes>,
    { route: "/welcome" },
  );

describe("IntroPage", () => {
  it("explains the project: title, the five stages, the toolbox and the limits", () => {
    renderIntro();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/broken things,\s*put back\s*together/i);
    for (const stage of ["Cut", "Read the edges", "Match", "Build the graph", "Solve"]) {
      expect(screen.getByRole("heading", { level: 3, name: stage })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { level: 3, name: "Dijkstra" })).toBeInTheDocument();
    expect(screen.getByText("Backtracking is exponential")).toBeInTheDocument();
  });

  it("can shatter and reassemble the panel", () => {
    renderIntro();
    const toggle = screen.getByRole("button", { name: /shatter it|put it back together/i });
    const wasAssembled = /shatter/i.test(toggle.textContent ?? "");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent(wasAssembled ? /put it back/i : /shatter/i);
  });

  it.each(["Enter the lab", "Skip intro"])("%s remembers the visit and goes home", (name) => {
    renderIntro();
    fireEvent.click(screen.getAllByRole("button", { name })[0]!);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderIntro();
    fireEvent.click(screen.getAllByRole("button", { name: "Enter the lab" })[0]!);
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
