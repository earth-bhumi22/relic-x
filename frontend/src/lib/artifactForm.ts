// Owner: A (Arvind)
// Pure helpers for the create-artifact wizard: parameter defaults, limits, validation and formatting.
// Defaults and limits live ONLY here. They mirror the backend (schemas FragmentParams / SampleArtifactCreate and the
// OpenAPI `@default`s in api/schema.d.ts); a unit test pins them to the generated defaults.
import type { FragmentParams } from "../api/types";

export const DEFAULT_PARAMS: FragmentParams = {
  rows: 4,
  cols: 4,
  rotate: false,
  noise: 4,
  erosion: 0.2,
  missing: 0,
  seed: 7,
};

/**
 * Server-enforced ranges. Note: the OpenAPI description of `noise` says "0-255 scale" but the server accepts 0–30
 * only (backend FragmentParams `le=30`), so the slider stops at 30. Fragments upload accepts rows/cols from 1.
 */
export const LIMITS = {
  grid: { min: 2, max: 8 },
  fragmentsGrid: { min: 1, max: 8 },
  noise: { min: 0, max: 30 },
  erosion: { min: 0, max: 1 },
  maxMissing: 6,
  seed: { min: 0, max: 1_000_000 },
  nameMax: 120,
  descriptionMax: 2000,
} as const;

/** Client-side upload cap. Mirrors the server's RELICX_MAX_UPLOAD_MB (default 15); override with VITE_MAX_UPLOAD_MB. */
export function maxUploadMb(): number {
  const n = Number(import.meta.env.VITE_MAX_UPLOAD_MB);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

/** Form state for the parameters step. Numbers stay strings so half-typed input is representable. */
export interface ParamDraft {
  rows: string;
  cols: string;
  rotate: boolean;
  noise: string;
  erosion: string;
  missing: string;
  seed: string;
}

export const draftFromParams = (p: FragmentParams = DEFAULT_PARAMS): ParamDraft => ({
  rows: String(p.rows),
  cols: String(p.cols),
  rotate: p.rotate,
  noise: String(p.noise),
  erosion: String(p.erosion),
  missing: String(p.missing),
  seed: String(p.seed),
});

export type FieldErrors = Partial<Record<string, string>>;

const isBlank = (s: string) => s.trim() === "";
const parseNum = (s: string) => (isBlank(s) ? NaN : Number(s));

function integerIn(raw: string, min: number, max: number, label: string): string | undefined {
  const n = parseNum(raw);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (!Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return undefined;
}

/** Validates the parameters step. Returns {errors, params}; params is set only when there are no errors. */
export function validateParams(draft: ParamDraft): { errors: FieldErrors; params?: FragmentParams } {
  const errors: FieldErrors = {};
  const set = (k: string, msg: string | undefined) => {
    if (msg) errors[k] = msg;
  };
  set("rows", integerIn(draft.rows, LIMITS.grid.min, LIMITS.grid.max, "Rows"));
  set("cols", integerIn(draft.cols, LIMITS.grid.min, LIMITS.grid.max, "Columns"));
  const noise = parseNum(draft.noise);
  if (!Number.isFinite(noise) || noise < LIMITS.noise.min || noise > LIMITS.noise.max)
    errors.noise = `Noise must be a number between ${LIMITS.noise.min} and ${LIMITS.noise.max}.`;
  const erosion = parseNum(draft.erosion);
  if (!Number.isFinite(erosion) || erosion < LIMITS.erosion.min || erosion > LIMITS.erosion.max)
    errors.erosion = `Erosion must be a number between ${LIMITS.erosion.min} and ${LIMITS.erosion.max}.`;
  set("seed", integerIn(draft.seed, LIMITS.seed.min, LIMITS.seed.max, "Seed"));

  const missingMsg = integerIn(draft.missing, 0, LIMITS.maxMissing, "Missing");
  set("missing", missingMsg);
  if (!errors.rows && !errors.cols && !errors.missing) {
    const cells = Number(draft.rows) * Number(draft.cols);
    if (Number(draft.missing) >= cells) errors.missing = `Missing must be less than rows × columns (${cells}).`;
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    params: {
      rows: Number(draft.rows),
      cols: Number(draft.cols),
      rotate: draft.rotate,
      noise,
      erosion,
      missing: Number(draft.missing),
      seed: Number(draft.seed),
    },
  };
}

/** Name is required, trimmed and capped. Returns the trimmed name or an error. */
export function validateName(raw: string): { name?: string; error?: string } {
  const name = raw.trim();
  if (!name) return { error: "Name is required." };
  if (name.length > LIMITS.nameMax) return { error: `Name must be at most ${LIMITS.nameMax} characters.` };
  return { name };
}

export function validateDescription(raw: string): string | undefined {
  return raw.length > LIMITS.descriptionMax
    ? `Description must be at most ${LIMITS.descriptionMax} characters.`
    : undefined;
}

export const formatBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Returns an error message when `file` is not an acceptable image, otherwise undefined. */
export function validateImageFile(file: { name: string; type: string; size: number }): string | undefined {
  if (!file.type.startsWith("image/")) return `${file.name} is not an image (type "${file.type || "unknown"}").`;
  const cap = maxUploadMb() * 1024 * 1024;
  if (file.size > cap) return `${file.name} is ${formatBytes(file.size)}; the limit is ${maxUploadMb()} MB per image.`;
  return undefined;
}

/** First problem among several files, or undefined. */
export function validateImageFiles(files: readonly { name: string; type: string; size: number }[]): string | undefined {
  for (const f of files) {
    const e = validateImageFile(f);
    if (e) return e;
  }
  return undefined;
}

/** Fragments upload: the grid must have exactly one cell per file. */
export function validateFragmentGrid(rows: string, cols: string, fileCount: number): FieldErrors {
  const errors: FieldErrors = {};
  const r = integerIn(rows, LIMITS.fragmentsGrid.min, LIMITS.fragmentsGrid.max, "Rows");
  const c = integerIn(cols, LIMITS.fragmentsGrid.min, LIMITS.fragmentsGrid.max, "Columns");
  if (r) errors.rows = r;
  if (c) errors.cols = c;
  if (!r && !c && fileCount > 0 && Number(rows) * Number(cols) !== fileCount)
    errors.files = `${fileCount} image${fileCount === 1 ? "" : "s"} selected but ${rows} × ${cols} = ${
      Number(rows) * Number(cols)
    } cells. Pick a grid with one cell per image.`;
  return errors;
}

/** `0.8333` → "83%"; null/undefined → "—". */
export const formatPercent = (v: number | null | undefined): string => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Maps an API 422 `validation_error` (`details.errors: [{loc, msg}]`) to wizard field names.
 * `loc` looks like ["body","name"] or ["body","fragment","rows"]; the last segment is the field.
 */
export function fieldErrorsFromApi(details: Record<string, unknown> | undefined): FieldErrors {
  const out: FieldErrors = {};
  const list = (details as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const loc = (item as { loc?: unknown }).loc;
    const msg = (item as { msg?: unknown }).msg;
    if (!Array.isArray(loc) || typeof msg !== "string") continue;
    const field = String(loc[loc.length - 1]);
    out[field] ??= msg;
  }
  return out;
}
