// Owner: A (Arvind)
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/renderWithProviders";
import ApiStatus from "./ApiStatus";

const stubHealth = (impl: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(impl));

describe("ApiStatus", () => {
  it("shows checking, then the status and version", async () => {
    stubHealth(async () => new Response(JSON.stringify({ status: "ok", database: true, version: "0.1.0" })));
    renderWithProviders(<ApiStatus />);
    expect(screen.getByTestId("api-status")).toHaveTextContent("API checking…");
    expect(await screen.findByText("API ok · v0.1.0")).toBeInTheDocument();
    expect(screen.getByTestId("api-status")).toHaveClass("api-status-ok");
  });

  it("shows a warning tone when the API reports a non-ok status", async () => {
    stubHealth(async () => new Response(JSON.stringify({ status: "degraded", database: false, version: "0.1.0" })));
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText("API degraded · v0.1.0")).toBeInTheDocument();
    expect(screen.getByTestId("api-status")).toHaveClass("api-status-warn");
  });

  it("shows offline when the request fails", async () => {
    stubHealth(async () => {
      throw new TypeError("network down");
    });
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText("API offline")).toBeInTheDocument();
    expect(screen.getByTestId("api-status")).toHaveClass("api-status-down");
  });

  it("shows offline on a 5xx response", async () => {
    stubHealth(async () => new Response("bad gateway", { status: 502 }));
    renderWithProviders(<ApiStatus />);
    expect(await screen.findByText("API offline")).toBeInTheDocument();
  });

  it("never calls the network in mock mode", () => {
    vi.stubEnv("VITE_USE_MOCKS", "true");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderWithProviders(<ApiStatus />);
    expect(screen.getByTestId("api-status")).toHaveTextContent("API mock");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
