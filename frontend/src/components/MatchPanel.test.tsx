// Owner: A (Arvind)
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getArtifact, matchArtifact } from "../api/client";
import { ApiError } from "../api/errors";
import { isPreconditionFailed, readMatchStats } from "../hooks/useMatchStatus";
import { ARTIFACT_ID, matchSummaryFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import MatchPanel, { MATCH_DEFAULTS, MatchRequired, validateMatchDraft } from "./MatchPanel";

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
});

const PATH = `/artifacts/${ARTIFACT_ID}/match`;

describe("MatchPanel", () => {
  useMockApi();

  it("shows 'Not matched yet' and the Run matching button", () => {
    render(<MatchPanel artifactId={ARTIFACT_ID} stats={null} />);
    expect(screen.getByTestId("match-state")).toHaveTextContent("Not matched yet");
    expect(screen.getByRole("button", { name: "Run matching" })).toBeEnabled();
  });

  it("runs matching with the default MatchParams, shows progress, then the stats", async () => {
    mockApi.respond("POST", PATH, matchSummaryFixture(), { delayMs: 30 });
    const onMatched = vi.fn();
    render(<MatchPanel artifactId={ARTIFACT_ID} stats={null} onMatched={onMatched} />);
    const button = screen.getByRole("button", { name: "Run matching" });
    fireEvent.click(button);
    fireEvent.click(button); // a second click while running is ignored
    expect(await screen.findByRole("button", { name: "Matching…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Running matching…");
    await waitFor(() => expect(onMatched).toHaveBeenCalledTimes(1));
    expect(mockApi.calls("POST", PATH)).toHaveLength(1);
    expect(mockApi.calls("POST", PATH)[0].body).toEqual({ strip_len: 24, levels: 4, top_k: 6 });
  });

  it("sends the advanced fields (strip_len, levels, top_k, allow_rotation) as JSON", async () => {
    mockApi.respond("POST", PATH, matchSummaryFixture());
    render(<MatchPanel artifactId={ARTIFACT_ID} stats={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Strip length"), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText("Levels"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Top-k per side"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow rotation" }));
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    await waitFor(() => expect(mockApi.calls("POST", PATH)).toHaveLength(1));
    expect(mockApi.calls("POST", PATH)[0].body).toEqual({ strip_len: 32, levels: 3, top_k: 8, allow_rotation: true });
  });

  it("validates the advanced fields next to the inputs and does not call the API", () => {
    render(<MatchPanel artifactId={ARTIFACT_ID} stats={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText("Levels"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    expect(screen.getByText("Whole number from 2 to 4.")).toBeInTheDocument();
    expect(screen.getByLabelText("Levels")).toHaveAttribute("aria-invalid", "true");
    expect(mockApi.calls("POST", PATH)).toHaveLength(0);
  });

  it("shows the returned stats after a run", async () => {
    mockApi.respond("POST", PATH, matchSummaryFixture());
    const { rerender } = render(<MatchPanel artifactId={ARTIFACT_ID} stats={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    await waitFor(() => expect(mockApi.calls("POST", PATH)).toHaveLength(1));
    rerender(<MatchPanel artifactId={ARTIFACT_ID} stats={matchSummaryFixture().stats} />);
    expect(screen.getByTestId("match-state")).toHaveTextContent("Matched");
    for (const k of ["Fragments", "Side pairs", "Scored", "Skipped", "Cache hits", "Elapsed", "Match accuracy"])
      expect(screen.getByText(k)).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });

  it("shows '—' for a null match accuracy", () => {
    const stats = { ...matchSummaryFixture().stats, match_accuracy: null };
    render(<MatchPanel artifactId={ARTIFACT_ID} stats={stats} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the API error (code + message) when matching fails", async () => {
    mockApi.fail("POST", PATH, 422, "invalid_input", "strip_len too small");
    render(<MatchPanel artifactId={ARTIFACT_ID} stats={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("invalid_input");
    expect(alert).toHaveTextContent("strip_len too small");
    expect(screen.getByRole("button", { name: "Run matching" })).toBeEnabled();
  });
});

describe("MatchRequired (409 precondition_failed prompt)", () => {
  useMockApi();

  const err = new ApiError(409, "precondition_failed", "run matching first (POST /artifacts/x/match)");

  it("renders the prompt, runs matching and reports success", async () => {
    mockApi.respond("POST", PATH, matchSummaryFixture());
    const onMatched = vi.fn();
    render(<MatchRequired artifactId={ARTIFACT_ID} error={err} onMatched={onMatched} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Run matching first");
    expect(screen.getByRole("alert")).toHaveTextContent("run matching first (POST /artifacts/x/match)");
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    await waitFor(() => expect(onMatched).toHaveBeenCalledTimes(1));
  });

  it("shows a failure of the run itself", async () => {
    mockApi.fail("POST", PATH, 500, "internal_error", "matcher crashed");
    render(<MatchRequired artifactId={ARTIFACT_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Run matching" }));
    expect(await screen.findByText("matcher crashed")).toBeInTheDocument();
  });
});

describe("mock matching endpoint", () => {
  useMockApi();
  it("rejects out-of-range parameters like the backend (422 validation_error) and sets artifact state on success", async () => {
    await expect(matchArtifact(ARTIFACT_ID, { levels: 5 })).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
    });
    await expect(matchArtifact(ARTIFACT_ID, { strip_len: 3 })).rejects.toMatchObject({ status: 422 });
    await expect(matchArtifact(ARTIFACT_ID, { top_k: 1.5 })).rejects.toMatchObject({ status: 422 });
    const summary = await matchArtifact(ARTIFACT_ID, { strip_len: 32 });
    expect(summary.config.strip_len).toBe(32);
    expect((await getArtifact(ARTIFACT_ID)).match_stats).not.toBeNull();
  });
});

describe("matching helpers", () => {
  it("isPreconditionFailed recognises only the 409 code", () => {
    expect(isPreconditionFailed(new ApiError(409, "precondition_failed", "x"))).toBe(true);
    expect(isPreconditionFailed(new ApiError(404, "not_found", "x"))).toBe(false);
    expect(isPreconditionFailed(new Error("x"))).toBe(false);
  });

  it("readMatchStats returns null when matching has not run and fills gaps defensively", () => {
    expect(readMatchStats(null)).toBeNull();
    expect(readMatchStats({})).toBeNull();
    expect(readMatchStats({ fragments: 4 })).toMatchObject({ fragments: 4, cache_hits: 0, match_accuracy: null });
    expect(readMatchStats({ ...matchSummaryFixture().stats })?.match_accuracy).toBe(1);
  });

  it("validateMatchDraft sends only valid values and flags the rest", () => {
    expect(validateMatchDraft(MATCH_DEFAULTS)).toEqual({
      errors: {},
      params: { strip_len: 24, levels: 4, top_k: 6 },
    });
    const bad = validateMatchDraft({ ...MATCH_DEFAULTS, strip_len: "2", top_k: "", levels: "2.5" });
    expect(Object.keys(bad.errors).sort()).toEqual(["levels", "strip_len", "top_k"]);
  });
});
