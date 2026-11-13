import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App scaffold", () => {
  it("shows the API status once health responds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", database: true, version: "0.1.0" }))));
    render(<App />);
    expect(await screen.findByText("API ok · v0.1.0")).toBeInTheDocument();
  });
});
