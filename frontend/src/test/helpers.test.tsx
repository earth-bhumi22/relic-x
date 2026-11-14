// Owner: A (Arvind)
// Tests for the test helpers themselves; they double as usage examples for T23–T28.
import { screen } from "@testing-library/react";
import { useParams } from "react-router-dom";
import { getArtifact, listArtifacts } from "../api/client";
import {
  ARTIFACT_ID,
  artifactFixture,
  explanationFixture,
  fragmentsFixture,
  graphFixture,
  matchSummaryFixture,
  matchesFixture,
  runFixture,
} from "./fixtures";
import { mockApi, useMockApi } from "./mockApi";
import { renderWithProviders } from "./renderWithProviders";

describe("renderWithProviders", () => {
  it("renders at the given route with the theme available", () => {
    const Here = () => <p>at {window.location.pathname === "/" ? "jsdom root" : "?"}</p>;
    renderWithProviders(<Here />, { route: "/anything" });
    expect(screen.getByText(/at/)).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toMatch(/light|dark/);
  });

  it("mounts `ui` at `path` so useParams works", () => {
    const Id = () => <p>artifact {useParams().id}</p>;
    renderWithProviders(<Id />, { route: "/artifacts/abc/gallery", path: "/artifacts/:id/gallery" });
    expect(screen.getByText("artifact abc")).toBeInTheDocument();
  });
});

describe("mockApi", () => {
  useMockApi();

  it("serves seeded data by default", async () => {
    expect(await listArtifacts()).toHaveLength(2);
  });

  it("respond() overrides one endpoint and records the call", async () => {
    mockApi.respond("GET", "/artifacts", []);
    expect(await listArtifacts({ limit: 3 })).toEqual([]);
    expect(await getArtifact(ARTIFACT_ID)).toMatchObject({ id: ARTIFACT_ID }); // others untouched
    expect(mockApi.calls("GET", "/artifacts")).toHaveLength(1);
    expect(mockApi.calls("GET", "/artifacts")[0].query.get("limit")).toBe("3");
  });

  it("fail() produces a CONTRACT §4 ApiError", async () => {
    mockApi.fail("GET", "/artifacts", 409, "precondition_failed", "run matching first", { step: "match" });
    await expect(listArtifacts()).rejects.toMatchObject({
      status: 409,
      code: "precondition_failed",
      message: "run matching first",
      details: { step: "match" },
    });
  });

  it("respond() can delay the answer (use fake timers to control it)", async () => {
    vi.useFakeTimers();
    try {
      mockApi.respond("GET", "/artifacts", [], { delayMs: 500 });
      let settled = false;
      const pending = listArtifacts().then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(499);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is reset between tests (previous override is gone)", async () => {
    expect(await listArtifacts()).toHaveLength(2);
    expect(mockApi.calls()).toHaveLength(0);
  });
});

describe("fixtures", () => {
  it("match CONTRACT §6 shapes", () => {
    expect(artifactFixture()).toMatchObject({ id: ARTIFACT_ID, grid_rows: 4, grid_cols: 4, fragment_count: 16 });
    const frags = fragmentsFixture();
    expect(frags).toHaveLength(16);
    expect(frags[0]).toMatchObject({ label: expect.stringMatching(/^F\d\d$/), width: 120, height: 120 });
    expect(matchSummaryFixture().stats.fragments).toBe(16);
    expect(matchesFixture()[0].composite).toBeGreaterThan(0.7);
    expect(graphFixture().nodes).toHaveLength(16);
    expect(explanationFixture("F01", 1, "F02", 3)).toMatchObject({ a: "F01", side_a: "E", side_b: "W" });
    const run = runFixture("backtracking");
    expect(run.placements).toHaveLength(16);
    expect(run.trace[0].action).toBe("seed");
  });

  it("return independent copies", () => {
    const a = artifactFixture();
    a.name = "changed";
    expect(artifactFixture().name).toBe("Mughal tile panel");
  });
});
