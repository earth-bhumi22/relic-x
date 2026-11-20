// Owner: A (Arvind)
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { INTRO_KEY } from "./lib/intro";

beforeEach(() => {
  window.history.pushState({}, "", "/");
  window.localStorage.setItem(INTRO_KEY, "1"); // returning visitor: no intro redirect
});

describe("App", () => {
  it("mounts the layout and shows the API status once health responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async (url: string) =>
            new Response(
              JSON.stringify(url.endsWith("/health") ? { status: "ok", database: true, version: "0.1.0" } : []),
            ),
        ),
    );
    render(<App />);
    expect(screen.getByRole("link", { name: "RELIC-X" })).toBeInTheDocument();
    expect(await screen.findByText("API ok · v0.1.0")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
  });

  it("reports the API as offline when health fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    render(<App />);
    expect(await screen.findByText("API offline")).toBeInTheDocument();
  });

  it("sends a first-time visitor from / to the intro, once", async () => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "RELIC-X" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/welcome");
    fireEvent.click(screen.getAllByRole("button", { name: "Enter the lab" })[0]!);
    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });

  it("does not redirect deep links on a first visit", async () => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/lab");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: /lab/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/lab");
  });
});
