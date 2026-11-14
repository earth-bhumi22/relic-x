// Owner: A (Arvind)
// Form drafts and validation for the Lab page. Bounds were checked against the running API (T28):
//   benchmark  `node_limit` 100–2,000,000 (RunCreate); an EMPTY `algorithms` list is accepted by the server and returns
//              [] (no 422), so the client must require at least one itself;
//   scaling    `sizes` 1–7 items, each 2–8; `noise` 0–30; `erosion` 0–1; `node_limit` 100–500,000;
//              defaults: sizes [3, 4, 5, 6], node_limit 50,000, noise 4, erosion 0.2, rotate false.
import type { Algorithm, ScalingRequest } from "../api/types";
import { ALGORITHMS } from "../api/types";
import { DEFAULT_NODE_LIMIT, RUN_LIMITS } from "./solvers";

const intOf = (text: string): number | null => (/^\s*-?\d+\s*$/.test(text) ? Number(text) : null);
const numOf = (text: string): number | null =>
  text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : null;

// ---- benchmark -------------------------------------------------------------------------
/** Above this, a backtracking run can take a long time on a real board. */
export const SLOW_NODE_LIMIT = 100_000;

export interface BenchDraft {
  algorithms: Algorithm[];
  nodeLimit: string;
}
export const DEFAULT_BENCH: BenchDraft = { algorithms: [...ALGORITHMS], nodeLimit: String(DEFAULT_NODE_LIMIT) };

export type BenchField = "algorithms" | "nodeLimit";
export interface BenchRequest {
  algorithms: Algorithm[];
  /** Only when backtracking is selected. */
  node_limit?: number;
}

export function validateBench(d: BenchDraft): {
  errors: Partial<Record<BenchField, string>>;
  request: BenchRequest | null;
  warnings: string[];
} {
  const errors: Partial<Record<BenchField, string>> = {};
  const warnings: string[] = [];
  if (d.algorithms.length === 0) errors.algorithms = "Choose at least one algorithm.";
  const request: BenchRequest = { algorithms: ALGORITHMS.filter((a) => d.algorithms.includes(a)) };
  if (d.algorithms.includes("backtracking")) {
    const n = intOf(d.nodeLimit);
    const { min, max } = RUN_LIMITS.nodeLimit;
    if (n === null || n < min || n > max)
      errors.nodeLimit = `Node limit must be a whole number from ${min} to ${max.toLocaleString("en")}.`;
    else {
      request.node_limit = n;
      if (n > SLOW_NODE_LIMIT)
        warnings.push(`A node limit above ${SLOW_NODE_LIMIT.toLocaleString("en")} can make backtracking slow.`);
    }
  }
  return { errors, request: Object.keys(errors).length ? null : request, warnings };
}

// ---- scaling ---------------------------------------------------------------------------
export const SCALING_LIMITS = {
  sizes: { count: 7, min: 2, max: 8 },
  noise: { min: 0, max: 30 },
  erosion: { min: 0, max: 1 },
  nodeLimit: { min: 100, max: 500_000 },
} as const;
export const DEFAULT_SCALING_SAMPLE = "mosaic-tile";

export interface ScalingDraft {
  sample: string;
  /** Comma or space separated grid sizes, e.g. "3, 4, 5, 6". */
  sizes: string;
  algorithms: Algorithm[];
  rotate: boolean;
  noise: string;
  erosion: string;
  nodeLimit: string;
}
export const DEFAULT_SCALING: ScalingDraft = {
  sample: DEFAULT_SCALING_SAMPLE,
  sizes: "3, 4, 5, 6",
  algorithms: [...ALGORITHMS],
  rotate: false,
  noise: "4",
  erosion: "0.2",
  nodeLimit: "50000",
};

export type ScalingField = "sizes" | "algorithms" | "noise" | "erosion" | "nodeLimit" | "sample";

export function parseSizes(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = intOf(p);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

export function validateScaling(d: ScalingDraft): {
  errors: Partial<Record<ScalingField, string>>;
  request: Required<ScalingRequest> | null;
  warnings: string[];
} {
  const errors: Partial<Record<ScalingField, string>> = {};
  const warnings: string[] = [];
  const { sizes: sl, noise: nl, erosion: el, nodeLimit: nlim } = SCALING_LIMITS;

  const parsed = parseSizes(d.sizes);
  const unique = parsed ? [...new Set(parsed)].sort((a, b) => a - b) : [];
  if (parsed === null || parsed.length === 0)
    errors.sizes = "Enter whole numbers separated by commas, for example 3, 4, 5, 6.";
  else if (unique.length > sl.count) errors.sizes = `At most ${sl.count} different sizes.`;
  else if (unique.some((s) => s < sl.min || s > sl.max))
    errors.sizes = `Each size must be a whole number from ${sl.min} to ${sl.max} (a size s makes an s×s board).`;
  else if (unique.some((s) => s >= 7))
    warnings.push("Sizes of 7 or more (49+ fragments) can take a long time, especially with backtracking.");

  if (d.algorithms.length === 0) errors.algorithms = "Choose at least one algorithm.";
  if (!d.sample) errors.sample = "Choose a sample.";

  const noise = numOf(d.noise);
  if (noise === null || noise < nl.min || noise > nl.max)
    errors.noise = `Noise must be a number from ${nl.min} to ${nl.max}.`;
  const erosion = numOf(d.erosion);
  if (erosion === null || erosion < el.min || erosion > el.max)
    errors.erosion = `Erosion must be a number from ${el.min} to ${el.max}.`;
  const limit = intOf(d.nodeLimit);
  if (limit === null || limit < nlim.min || limit > nlim.max)
    errors.nodeLimit = `Node limit must be a whole number from ${nlim.min} to ${nlim.max.toLocaleString("en")}.`;

  if (Object.keys(errors).length) return { errors, request: null, warnings };
  return {
    errors,
    warnings,
    request: {
      sample: d.sample,
      sizes: unique,
      algorithms: ALGORITHMS.filter((a) => d.algorithms.includes(a)),
      rotate: d.rotate,
      noise: noise as number,
      erosion: erosion as number,
      node_limit: limit as number,
    },
  };
}

/** Maps 422 `details.errors[].loc` (["body", "node_limit"]) back to form fields. */
export function apiFieldErrors<F extends string>(
  details: Record<string, unknown> | undefined,
  names: Record<string, F>,
): Partial<Record<F, string>> {
  const out: Partial<Record<F, string>> = {};
  const errors = (details?.errors ?? []) as { loc?: unknown[]; msg?: string }[];
  for (const e of errors) {
    const field = names[String(e.loc?.[e.loc.length - 1])];
    if (field) out[field] = e.msg ?? "Invalid value.";
  }
  return out;
}
export const BENCH_API_FIELDS: Record<string, BenchField> = { algorithms: "algorithms", node_limit: "nodeLimit" };
export const SCALING_API_FIELDS: Record<string, ScalingField> = {
  sizes: "sizes",
  algorithms: "algorithms",
  noise: "noise",
  erosion: "erosion",
  node_limit: "nodeLimit",
  sample: "sample",
};
