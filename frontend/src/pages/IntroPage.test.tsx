// Owner: A (Arvind)
// The panel tiles, scissors and technique cards are decorative (no roles), so a few checks query the DOM directly.
/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { INTRO_KEY } from "../lib/intro";
import { renderWithProviders } from "../test/renderWithProviders";
import IntroPage from "./IntroPage";

/** jsdom's PointerEvent has no coordinates, so build pointer events from MouseEvent. */
const pointer = (el: Element, type: string, x = 0, y = 0) => {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: 1 });
  fireEvent(el, e);
};

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
    const { container } = renderIntro();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("RELIC-X");
    expect(container.querySelector(".hero-tagline")).toHaveTextContent(/broken things,\s*put back\s*together/i);
    for (const stage of ["Cut", "Read the edges", "Match", "Build the graph", "Solve"]) {
      expect(screen.getByRole("heading", { level: 2, name: stage })).toBeInTheDocument();
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

  it("Enter the lab remembers the visit and goes home", () => {
    renderIntro();
    fireEvent.click(screen.getAllByRole("button", { name: "Enter the lab" })[0]!);
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(INTRO_KEY)).toBe("1");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderIntro();
    fireEvent.click(screen.getAllByRole("button", { name: "Enter the lab" })[0]!);
    expect(screen.getByText("home")).toBeInTheDocument();
  });

  it("has no scrolling banner of algorithm names", () => {
    const { container } = renderIntro();
    expect(container.querySelector(".ticker")).toBeNull();
  });

  it("lets you drag a fragment anywhere and springs it back on release", () => {
    const { container } = renderIntro();
    const tile = container.querySelector<HTMLElement>(".ptile")!;
    pointer(tile, "pointerdown", 10, 10);
    expect(tile).toHaveClass("is-dragging");
    pointer(tile, "pointermove", 70, 45);
    expect(tile.style.getPropertyValue("--dx")).toBe("60px");
    expect(tile.style.getPropertyValue("--dy")).toBe("35px");
    pointer(tile, "pointerup");
    expect(tile).not.toHaveClass("is-dragging");
    expect(tile.style.getPropertyValue("--dx")).toBe("0px");
    expect(tile.style.getPropertyValue("--dy")).toBe("0px");
  });

  it("shows all nine techniques in one grid and a scissors in the cut step", () => {
    const { container } = renderIntro();
    expect(container.querySelectorAll(".tech-grid > li")).toHaveLength(9);
    expect(container.querySelector(".viz-cut .scissors")).not.toBeNull();
    expect(container.querySelectorAll(".viz-cut .cpiece")).toHaveLength(16);
  });

  it("has a scroll-down cue, and 'See how it works' targets the problem section first", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderIntro();
    expect(screen.getByRole("button", { name: "Scroll down" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /see how it works/i }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toHaveProperty("id", "problem");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("keeps the scroll cue on the first screen only, and shows a vertical scroll rail", () => {
    const { container } = renderIntro();
    const cue = screen.getByRole("button", { name: "Scroll down" });
    expect(cue).not.toHaveClass("is-hidden");
    expect(container.querySelector(".intro-rail .intro-rail-fill")).not.toBeNull();
    Object.defineProperty(window, "scrollY", { value: 900, configurable: true });
    fireEvent.scroll(window);
    expect(screen.getByRole("button", { name: "Scroll down", hidden: true })).toHaveClass("is-hidden");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    fireEvent.scroll(window);
    expect(screen.getByRole("button", { name: "Scroll down" })).not.toHaveClass("is-hidden");
  });
});
