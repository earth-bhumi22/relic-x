// Owner: A (Arvind)
// THE swappable seam between the page and the solver backend.
//
// Today a run is a synchronous `POST /artifacts/{id}/runs`, so a long backtracking run blocks until it finishes (the
// page therefore defaults to a small `node_limit` and offers Cancel). When T20's async jobs land
// (`POST /artifacts/{id}/jobs`, then poll `GET /jobs/{id}` about once a second; CONTRACT §5.1, a proposal), replace
// the body of `runSolver` only: same signature, same `RunDetail` result, optional progress callback. The UI does not
// know which transport is used.
import { createRun } from "../api/client";
import type { RunDetail } from "../api/types";
import type { RunRequest } from "./solvers";

export interface RunSolverOptions {
  /** Aborts the request (the server may still finish the run). */
  signal?: AbortSignal;
  /** Reserved for T20: called with 0–1 progress while a job runs. Unused by the synchronous call. */
  onProgress?: (fraction: number) => void;
}

export type RunSolver = (artifactId: string, request: RunRequest, options?: RunSolverOptions) => Promise<RunDetail>;

export const runSolver: RunSolver = (artifactId, request, options = {}) =>
  createRun(artifactId, request, { signal: options.signal });
