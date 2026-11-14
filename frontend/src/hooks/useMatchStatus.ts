// Owner: A (Arvind)
// Matching state shared by the gallery (T24) and every page that needs matches first (T25 graph, T26, T27):
//   useMatchStatus(id)      loads the artifact and exposes `matched` plus `run()` (POST /artifacts/{id}/match)
//   useMatchRunner(id)      just the run part (used by <MatchRequired> where the artifact is already loaded)
//   isPreconditionFailed(e) true for the 409 `precondition_failed` "run matching first" error (CONTRACT §4)
import { useCallback, useRef, useState } from "react";
import { getArtifact, matchArtifact } from "../api/client";
import type { MatchRequest } from "../api/client";
import { ApiError } from "../api/errors";
import type { ArtifactOut, MatchSummary } from "../api/types";
import { useAsync } from "./useAsync";

export const isPreconditionFailed = (e: unknown): boolean => e instanceof ApiError && e.code === "precondition_failed";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reads `ArtifactOut.match_stats` (an untyped object in OpenAPI) defensively; `null` when matching has not run. */
export function readMatchStats(raw: ArtifactOut["match_stats"]): MatchSummary["stats"] | null {
  if (!raw || !num(raw.fragments)) return null;
  const n = (k: string) => (num(raw[k]) ? (raw[k] as number) : 0);
  return {
    fragments: n("fragments"),
    side_pairs_total: n("side_pairs_total"),
    side_pairs_scored: n("side_pairs_scored"),
    side_pairs_skipped: n("side_pairs_skipped"),
    cache_hits: n("cache_hits"),
    elapsed_ms: n("elapsed_ms"),
    operations: (raw.operations as Record<string, number> | undefined) ?? {},
    match_accuracy: num(raw.match_accuracy) ? raw.match_accuracy : null,
  };
}

export function useMatchRunner(artifactId: string, onMatched?: (summary: MatchSummary) => void) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [result, setResult] = useState<MatchSummary | null>(null);
  const inFlight = useRef(false);
  const callback = useRef(onMatched);
  callback.current = onMatched;

  const run = useCallback(
    async (params: MatchRequest = {}) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRunning(true);
      setError(null);
      try {
        const summary = await matchArtifact(artifactId, params);
        setResult(summary);
        callback.current?.(summary);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        inFlight.current = false;
        setRunning(false);
      }
    },
    [artifactId],
  );
  return { running, error, result, run };
}

export function useMatchStatus(artifactId: string) {
  const artifact = useAsync(() => getArtifact(artifactId), [artifactId]);
  // The run result is kept locally (no refetch), so the page does not flash a loading state after matching.
  const runner = useMatchRunner(artifactId);
  const stored = artifact.status === "success" ? readMatchStats(artifact.data.match_stats) : null;
  const stats = runner.result?.stats ?? stored;
  return { artifact, matched: artifact.status === "success" ? stats !== null : null, stats, ...runner };
}
