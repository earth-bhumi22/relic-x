// Owner: A (Arvind)
// Algorithm descriptions (one line + complexity, from docs/ALGORITHMS.md §10–§13) and run-parameter validation.
// Bounds were checked against the real `RunCreate`: threshold 0–1, top_k 1–16 or absent, node_limit 100–2,000,000.
import type { Algorithm } from "../api/types";

export interface AlgorithmInfo {
  key: Algorithm;
  label: string;
  /** One line, plain language. */
  summary: string;
  /** Worst-case time (ALGORITHMS.md summary table). */
  complexity: string;
}

export const ALGORITHM_INFO: readonly AlgorithmInfo[] = [
  {
    key: "greedy",
    label: "Greedy",
    summary: "Each step commits the single best (cell, fragment, rotation) over the whole frontier; never undoes.",
    complexity: "O(n³) time, O(n) space",
  },
  {
    key: "best_first",
    label: "Best-first (Prim)",
    summary: "Grows from a seed, always taking the strongest open join from a max-heap of the similarity graph.",
    complexity: "O(E log E) time, O(E) space",
  },
  {
    key: "dijkstra",
    label: "Dijkstra",
    summary: "Shortest-path tree from the seed with edge cost 1 − weight; places fragments in settle order.",
    complexity: "O((V + E) log V) time, O(V) space",
  },
  {
    key: "backtracking",
    label: "Backtracking + B&B",
    summary: "Exact search over arrangements with a bound that prunes hopeless branches; capped by a node limit.",
    complexity: "O((n·R)ⁿ) worst case, O(n) space",
  },
];

export const RUN_LIMITS = {
  threshold: { min: 0, max: 1 },
  topK: { min: 1, max: 16 },
  nodeLimit: { min: 100, max: 2_000_000 },
} as const;

/**
 * Until T20's async jobs land, runs are synchronous, so backtracking gets a small default budget (ROLE_A §6) instead
 * of the API's 150,000, which can take a long time. A truncated run is reported as such.
 */
export const DEFAULT_NODE_LIMIT = 5000;

export interface RunDraft {
  algorithm: Algorithm;
  threshold: string;
  topK: string;
  nodeLimit: string;
}

export const DEFAULT_DRAFT: RunDraft = {
  algorithm: "greedy",
  threshold: "0",
  topK: "",
  nodeLimit: String(DEFAULT_NODE_LIMIT),
};

export interface RunRequest {
  algorithm: Algorithm;
  threshold: number;
  top_k: number | null;
  /** Only sent for backtracking. */
  node_limit?: number;
}

export type RunField = "threshold" | "topK" | "nodeLimit";

const intOf = (text: string): number | null => (/^\s*-?\d+\s*$/.test(text) ? Number(text) : null);

export function validateDraft(d: RunDraft): { errors: Partial<Record<RunField, string>>; request: RunRequest | null } {
  const errors: Partial<Record<RunField, string>> = {};
  const t = Number(d.threshold);
  if (d.threshold.trim() === "" || !Number.isFinite(t) || t < RUN_LIMITS.threshold.min || t > RUN_LIMITS.threshold.max)
    errors.threshold = "Threshold must be a number from 0 to 1.";
  let topK: number | null = null;
  if (d.topK.trim() !== "") {
    topK = intOf(d.topK);
    if (topK === null || topK < RUN_LIMITS.topK.min || topK > RUN_LIMITS.topK.max)
      errors.topK = `Top-k must be a whole number from ${RUN_LIMITS.topK.min} to ${RUN_LIMITS.topK.max}, or empty for no limit.`;
  }
  const request: RunRequest = { algorithm: d.algorithm, threshold: t, top_k: topK };
  if (d.algorithm === "backtracking") {
    const n = intOf(d.nodeLimit);
    if (n === null || n < RUN_LIMITS.nodeLimit.min || n > RUN_LIMITS.nodeLimit.max)
      errors.nodeLimit = `Node limit must be a whole number from ${RUN_LIMITS.nodeLimit.min} to ${RUN_LIMITS.nodeLimit.max.toLocaleString("en")}.`;
    else request.node_limit = n;
  }
  return { errors, request: Object.keys(errors).length ? null : request };
}

/** Maps a 422 `details.errors[].loc` (["body", "node_limit"]) back to a form field. */
export function fieldErrorsFromApi(details: Record<string, unknown> | undefined): Partial<Record<RunField, string>> {
  const out: Partial<Record<RunField, string>> = {};
  const errors = (details?.errors ?? []) as { loc?: unknown[]; msg?: string }[];
  const names: Record<string, RunField> = { threshold: "threshold", top_k: "topK", node_limit: "nodeLimit" };
  for (const e of errors) {
    const field = names[String(e.loc?.[e.loc.length - 1])];
    if (field) out[field] = e.msg ?? "Invalid value.";
  }
  return out;
}
