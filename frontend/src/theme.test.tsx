// Owner: A (Arvind)
import { fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "./components/layout/ThemeToggle";
import { renderWithProviders } from "./test/renderWithProviders";
import { THEME_KEY, useTheme } from "./theme";

const renderToggle = () => renderWithProviders(<ThemeToggle />);

function stubPrefersDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("follows prefers-color-scheme by default", () => {
    stubPrefersDark(true);
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("defaults to light when the OS has no dark preference", () => {
    stubPrefersDark(false);
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("toggle switches data-theme and persists the choice", () => {
    stubPrefersDark(false);
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores the stored theme over the OS preference", () => {
    stubPrefersDark(false);
    window.localStorage.setItem(THEME_KEY, "dark");
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("survives a storage failure", () => {
    stubPrefersDark(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    renderToggle();
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("useTheme", () => {
  it("throws a helpful error outside a ThemeProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const Probe = () => {
      useTheme();
      return null;
    };
    expect(() => render(<Probe />)).toThrow("useTheme must be used inside <ThemeProvider>");
    expect(consoleError).toHaveBeenCalled();
  });
});
