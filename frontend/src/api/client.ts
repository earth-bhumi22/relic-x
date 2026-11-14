/// <reference types="vite/client" />
// Owner: A (Arvind)
// Typed fetch wrapper. Response types come from schema.d.ts, which is generated
// from the backend's OpenAPI spec (`npm run gen:types`) — never edit it by hand.
// Endpoints the OpenAPI spec leaves untyped are described in ./types.ts.
//
// Mock mode: with VITE_USE_MOCKS=true every call is answered by ./mocks (payloads built from
// planning/CONTRACT.md §6) instead of `fetch`, so pages can be built with no backend running.
import { ApiError } from "./errors";
import type {
  Algorithm,
  ArtifactOut,
  Explanation,
  FragmentOut,
  GraphOut,
  Health,
  MatchParams,
  MatchSummary,
  RunCreate,
  RunDetail,
  RunOut,
  SampleArtifactCreate,
  SampleInfo,
  ScalingOut,
  ScalingRequest,
  SideMatchOut,
  Traversal,
} from "./types";
import type { SideIndex } from "./sides";

export { ApiError } from "./errors";
export * from "./types";
export * from "./sides";

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api/v1";

/** True when VITE_USE_MOCKS=true. Read on every call so tests can toggle it. */
export function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCKS === "true";
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isMockMode()) {
    const { mockRequest } = await import("./mocks");
    return mockRequest<T>(path, init);
  }
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? "http_error", err.message ?? res.statusText, err.details);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** Builds "?a=1&b=2", skipping null/undefined values. */
function qs(params: Query = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

// ---- health & samples -------------------------------------------------------------------
export const getHealth = () => api<Health>("/health");
export const listSamples = () => api<SampleInfo[]>("/samples");

// ---- artifacts --------------------------------------------------------------------------
export const listArtifacts = (params: { limit?: number; offset?: number } = {}) =>
  api<ArtifactOut[]>(`/artifacts${qs(params)}`);
export const getArtifact = (id: string) => api<ArtifactOut>(`/artifacts/${id}`);
export const createSampleArtifact = (body: Partial<SampleArtifactCreate> & { name: string }) =>
  api<ArtifactOut>("/artifacts/sample", post(body));

// ---- fragments & matching ---------------------------------------------------------------
export const listFragments = (artifactId: string) => api<FragmentOut[]>(`/artifacts/${artifactId}/fragments`);
export const matchArtifact = (artifactId: string, params: Partial<MatchParams> = {}) =>
  api<MatchSummary>(`/artifacts/${artifactId}/match`, post(params));
/** Side indices in the result are integers 0–3 (see sideIndexToLetter). */
export const listMatches = (artifactId: string, params: { min_score?: number; limit?: number } = {}) =>
  api<SideMatchOut[]>(`/artifacts/${artifactId}/matches${qs(params)}`);
/** Edges carry side letters N/E/S/W plus *_index integers. */
export const getGraph = (
  artifactId: string,
  params: { threshold?: number; top_k?: number | null; traversal?: Traversal } = {},
) => api<GraphOut>(`/artifacts/${artifactId}/graph${qs(params)}`);
/** `a` and `b` are fragment *labels* (e.g. "F03"); sides are integers 0–3. The response uses letters. */
export const explainMatch = (artifactId: string, p: { a: string; sideA: SideIndex; b: string; sideB: SideIndex }) =>
  api<Explanation>(`/artifacts/${artifactId}/explain${qs({ a: p.a, side_a: p.sideA, b: p.b, side_b: p.sideB })}`);

// ---- runs & benchmarks ------------------------------------------------------------------
export const createRun = (artifactId: string, body: Partial<RunCreate> & { algorithm: Algorithm }) =>
  api<RunDetail>(`/artifacts/${artifactId}/runs`, post(body));
export const listRuns = (artifactId: string) => api<RunOut[]>(`/artifacts/${artifactId}/runs`);
export const getRun = (runId: string) => api<RunDetail>(`/runs/${runId}`);
export const runBenchmark = (artifactId: string, body: { algorithms: Algorithm[]; node_limit?: number }) =>
  api<RunDetail[]>(`/artifacts/${artifactId}/benchmark`, post(body));
export const runScalingBenchmark = (body: ScalingRequest = {}) => api<ScalingOut>("/benchmark/scaling", post(body));
