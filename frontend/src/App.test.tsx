// Owner: A (Arvind)
import { render, screen } from "@testing-library/react";
import App from "./App";

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
});
