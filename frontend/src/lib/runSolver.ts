// Owner: A (Arvind)
// THE swappable seam between the page and the solver backend.
//
// Today a run is a synchronous `POST /artifacts/{id}/runs`, so a long backtracking run blocks until it finishes (the
// page therefore defaults to a small `node_limit` and offers Cancel). The background-job endpoints are final (contract
// v2.0, docs/API.md): `POST /artifacts/{id}/jobs` answers `JobCreated`, then poll `GET /jobs/{id}` (`JobOut`: status
// queued|running|done|failed, progress 0–1, run_id, error) about once a second. To move to jobs, replace the body of
// `runSolver` only (same signature, same `RunDetail` result, optional progress callback) using the generated
// `JobCreated` / `JobOut` types from ../api/types. The UI does not know which transport is used.
import { createRun } from "../api/client";
import type { RunDetail } from "../api/types";
import type { RunRequest } from "./solvers";

export interface RunSolverOptions {
  /** Aborts the request (the server may still finish the run). */
  signal?: AbortSignal;
  /** Reserved for the job transport: called with 0–1 progress while a job runs. Unused by the synchronous call. */
  onProgress?: (fraction: number) => void;
}

export type RunSolver = (artifactId: string, request: RunRequest, options?: RunSolverOptions) => Promise<RunDetail>;

export const runSolver: RunSolver = (artifactId, request, options = {}) =>
  createRun(artifactId, request, { signal: options.signal });
