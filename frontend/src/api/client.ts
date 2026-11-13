// Owner: A (Arvind)
// Typed fetch wrapper. Response types come from schema.d.ts, which is generated
// from the backend's OpenAPI spec (`npm run gen:types`) — never edit it by hand.
//
// TODO(T03): add mock mode (VITE_USE_MOCKS=true) serving the payloads in
// planning/CONTRACT.md §6, so pages can be built before the API is running.
import type { components } from "./schema";

export type Schemas = components["schemas"];
export type ArtifactOut = Schemas["ArtifactOut"];
export type FragmentOut = Schemas["FragmentOut"];
export type RunDetail = Schemas["RunDetail"];
export type SampleInfo = Schemas["SampleInfo"];

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api/v1";

/** Error with the backend's standard shape: {error: {code, message, details}}. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export const getHealth = () => api<{ status: string; database: boolean; version: string }>("/health");
export const listSamples = () => api<SampleInfo[]>("/samples");
export const listArtifacts = () => api<ArtifactOut[]>("/artifacts");
