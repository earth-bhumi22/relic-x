// Owner: A (Arvind)
// Mock backend used when VITE_USE_MOCKS=true. `mockRequest` takes the same (path, init) as `api()`
// and answers like the real API would: same paths, same JSON shapes (CONTRACT §5/§6), and the same
// error envelope (CONTRACT §4) — so loading and error states can be exercised with no backend.
//
// Error triggers built into the data:
//   - any unknown artifact / fragment / run id          -> 404 not_found
//   - GET /fragments/{id} returns numeric strips (jittered inside each symbol's colour bucket)
//   - artifact "Pottery band (unmatched)"                -> 409 precondition_failed until POST .../match
//   - sample name not in /samples, empty name, bad sides -> 422 invalid_input / validation_error
//   - artifact NAME "fail-422" / "fail-413" / "fail-500" on any create call -> 422 validation_error (field `name`) /
//     413 payload_too_large / 500 internal_error, so the wizard's error states can be exercised by hand
//   - uploads: a non-image file -> 422 invalid_input; a file over MAX_UPLOAD_MB -> 413 payload_too_large
import { ApiError } from "../errors";
import { sideIndexToLetter } from "../sides";
import type {
  Algorithm,
  ArtifactOut,
  Explanation,
  FragmentOut,
  GraphEdge,
  GraphOut,
  MatchSummary,
  RunDetail,
  RunOut,
  ScalingOut,
  ScalingRequest,
  SideMatchOut,
  Traversal,
} from "../types";
import { ALGORITHMS } from "../types";
import {
  MATCH_CONFIG,
  SAMPLES,
  WEIGHTS,
  artifactImage,
  buildArtifact,
  buildMatchStats,
  buildMatches,
  buildRun,
  fragmentDetail,
  hex32,
  rng,
  scalingModel,
} from "./data";
import type { ArtifactSpec, MockArtifact, MockFragment } from "./data";

/** Tweak from tests / the console: `mockConfig.latencyMs = 0`. Default 350 ms so loading states are visible. */
export const mockConfig = {
  latencyMs: Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 350),
};

// ---- store --------------------------------------------------------------------------------
export const MOSAIC: ArtifactSpec = {
  id: "4f1c2a9e0b7d4e6f8a1b2c3d4e5f6a7b",
  name: "Mughal tile panel",
  description: "Glazed geometric tile panel with star rosettes",
  sample: "mosaic-tile",
  rows: 4,
  cols: 4,
  missing: 0,
  seed: 7,
  rotate: false,
  noise: 4,
  erosion: 0.2,
  createdAt: "2026-11-13T11:30:00Z",
};
export const POTTERY: ArtifactSpec = {
  id: "7b2e5d1c9a3f4c80b6d1e2f3a4b5c6d7",
  name: "Pottery band (unmatched)",
  description: "Fragmented but not matched yet — solving returns 409 precondition_failed",
  sample: "pottery-band",
  rows: 4,
  cols: 4,
  missing: 0,
  seed: 11,
  rotate: false,
  noise: 4,
  erosion: 0.2,
  createdAt: "2026-11-13T12:10:00Z",
};

let store = new Map<string, MockArtifact>();
let runIndex = new Map<string, RunDetail>();
let counter = 0;
const nextId = () => hex32(rng(++counter * 2654435761));
const withId = (run: RunDetail): RunDetail => ({ ...run, id: nextId() });

function saveRun(m: MockArtifact, run: RunDetail) {
  m.runs.push(run);
  runIndex.set(run.id, run);
  m.artifact.run_count = m.runs.length;
  m.artifact.best_accuracy = Math.max(...m.runs.map((r) => r.direct_accuracy ?? 0));
}

function seedStore() {
  store = new Map();
  runIndex = new Map();
  counter = 0;
  const mosaic = buildArtifact(MOSAIC, true);
  store.set(mosaic.artifact.id, mosaic);
  const pottery = buildArtifact(POTTERY, false);
  store.set(pottery.artifact.id, pottery);
  saveRun(mosaic, withId(buildRun(mosaic, "greedy", {}, "2026-11-13T11:32:00Z")));
}

/** Per-endpoint replacement used by tests (see src/test/mockApi.ts). Never set in the running app. */
export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
  /** The multipart body of upload requests (null for JSON requests). */
  form: FormData | null;
}
export type MockHandler = (req: MockRequest) => unknown | Promise<unknown>;
const overrides = new Map<string, MockHandler>();
export const overrideKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;
export function setMockOverride(method: string, path: string, handler: MockHandler) {
  overrides.set(overrideKey(method, path), handler);
}

/** Restores the initial data and removes all overrides (used by tests). */
export function resetMocks() {
  overrides.clear();
  seedStore();
}
seedStore();

// ---- helpers ------------------------------------------------------------------------------
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const notFound = (what: string, id: string) => new ApiError(404, "not_found", `${what} ${id} not found`);
const invalid = (message: string, details: Record<string, unknown> = {}) =>
  new ApiError(422, "invalid_input", message, details);
const validation = (field: string, message: string) =>
  new ApiError(422, "validation_error", "request validation failed", { errors: [{ loc: [field], msg: message }] });

/** Mirrors the server's RELICX_MAX_UPLOAD_MB default. */
const MAX_UPLOAD_MB = 15;

/** Name-based failure triggers, so the wizard's error handling can be tried in `npm run dev:mock`. */
function nameTriggers(name: string) {
  const key = name.trim().toLowerCase();
  if (key === "fail-422") throw validation("name", "This name is rejected by the mock API (fail-422)");
  if (key === "fail-413")
    throw new ApiError(413, "payload_too_large", `image larger than ${MAX_UPLOAD_MB} MB`, { limit_mb: MAX_UPLOAD_MB });
  if (key === "fail-500") throw new ApiError(500, "internal_error", "Mock server error (fail-500)");
}

function checkImageFile(f: File) {
  if (f.size > MAX_UPLOAD_MB * 1024 * 1024)
    throw new ApiError(413, "payload_too_large", `image larger than ${MAX_UPLOAD_MB} MB`, { limit_mb: MAX_UPLOAD_MB });
  if (!f.type.startsWith("image/")) throw invalid("file is not a readable image", { filename: f.name });
}

function getArtifactOr404(id: string): MockArtifact {
  const m = store.get(id);
  if (!m) throw notFound("artifact", id);
  return m;
}
function requireMatches(m: MockArtifact): SideMatchOut[] {
  if (!m.matches)
    throw new ApiError(409, "precondition_failed", `run matching first (POST /artifacts/${m.artifact.id}/match)`);
  return m.matches;
}
function num(q: URLSearchParams, key: string): number | undefined {
  const v = q.get(key);
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw validation(key, "value is not a valid number");
  return n;
}
function side(q: URLSearchParams, key: string): number {
  const v = q.get(key);
  if (v === null) throw validation(key, "field required");
  if (!/^[0-3]$/.test(v)) throw validation(key, "input should be 0, 1, 2 or 3"); // the real API rejects "N"
  return Number(v);
}
const toRunOut = ({ placements: _p, trace: _t, trace_dropped: _d, ...rest }: RunDetail): RunOut => rest;
const r4 = (n: number) => Number(n.toFixed(4));

// ---- endpoint implementations -------------------------------------------------------------
function createSample(body: Record<string, unknown>): ArtifactOut {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw validation("name", "String should have at least 1 character");
  nameTriggers(name);
  const sample = typeof body.sample === "string" ? body.sample : "mosaic-tile";
  if (!SAMPLES.some((s) => s.name === sample))
    throw invalid(`unknown sample '${sample}'`, { available: SAMPLES.map((s) => s.name) });
  const f = (body.fragment ?? {}) as Record<string, unknown>;
  const rows = Number(f.rows ?? 4);
  const cols = Number(f.cols ?? 4);
  if (!(rows >= 1 && rows <= 8)) throw validation("fragment.rows", "input should be between 1 and 8");
  if (!(cols >= 1 && cols <= 8)) throw validation("fragment.cols", "input should be between 1 and 8");
  const spec: ArtifactSpec = {
    id: nextId(),
    name,
    description: typeof body.description === "string" ? body.description : null,
    sample,
    rows,
    cols,
    missing: Number(f.missing ?? 0),
    seed: Number(f.seed ?? 7),
    rotate: Boolean(f.rotate ?? false),
    noise: Number(f.noise ?? 4),
    erosion: Number(f.erosion ?? 0.2),
    createdAt: new Date().toISOString(),
  };
  const m = buildArtifact(spec, false);
  store.set(m.artifact.id, m);
  return m.artifact;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) throw validation("name", "String should have at least 1 character");
  if (name.length > 120) throw validation("name", "String should have at most 120 characters");
  nameTriggers(name);
  return name;
}

function createUpload(form: FormData): ArtifactOut {
  const image = form.get("image");
  if (!(image instanceof File)) throw invalid("no image uploaded");
  const name = cleanName(form.get("name"));
  checkImageFile(image);
  let f: Record<string, unknown>;
  try {
    f = JSON.parse(String(form.get("params") || "{}")) as Record<string, unknown>;
  } catch {
    throw invalid("params must be valid JSON");
  }
  const rows = Number(f.rows ?? 4);
  const cols = Number(f.cols ?? 4);
  if (!(rows >= 2 && rows <= 8)) throw validation("rows", "input should be between 2 and 8");
  if (!(cols >= 2 && cols <= 8)) throw validation("cols", "input should be between 2 and 8");
  const missing = Number(f.missing ?? 0);
  if (missing >= rows * cols) throw invalid("cannot remove every fragment");
  const description = form.get("description");
  const m = buildArtifact(
    {
      id: nextId(),
      name,
      description: typeof description === "string" && description ? description : null,
      sample: "mosaic-tile",
      rows,
      cols,
      missing,
      seed: Number(f.seed ?? 7),
      rotate: Boolean(f.rotate ?? false),
      noise: Number(f.noise ?? 4),
      erosion: Number(f.erosion ?? 0.2),
      createdAt: new Date().toISOString(),
    },
    false,
  );
  m.artifact.source_kind = "upload";
  store.set(m.artifact.id, m);
  return m.artifact;
}

function createFragments(form: FormData): ArtifactOut {
  const files = form.getAll("files").filter((x): x is File => x instanceof File);
  if (!files.length) throw invalid("no fragment images uploaded");
  const name = cleanName(form.get("name"));
  const rows = Number(form.get("rows"));
  const cols = Number(form.get("cols"));
  if (!(Number.isInteger(rows) && rows >= 1 && rows <= 8)) throw validation("rows", "input should be between 1 and 8");
  if (!(Number.isInteger(cols) && cols >= 1 && cols <= 8)) throw validation("cols", "input should be between 1 and 8");
  if (files.length > rows * cols) throw invalid(`${files.length} fragments do not fit a ${rows}x${cols} grid`);
  files.forEach(checkImageFile);
  const m = buildArtifact(
    {
      id: nextId(),
      name,
      description: null,
      sample: "mosaic-tile",
      rows,
      cols,
      missing: rows * cols - files.length,
      seed: 7,
      rotate: false,
      noise: 0,
      erosion: 0,
      createdAt: new Date().toISOString(),
    },
    false,
  );
  m.artifact.source_kind = "fragments";
  m.artifact.has_ground_truth = false;
  m.artifact.fragment_params = {};
  store.set(m.artifact.id, m);
  return m.artifact;
}

function specOf(m: MockArtifact): ArtifactSpec {
  const p = m.artifact.fragment_params as {
    seed: number;
    rows: number;
    cols: number;
    rotate: boolean;
    noise: number;
    erosion: number;
    missing: number;
  };
  return {
    name: m.artifact.name,
    description: m.artifact.description,
    sample: "mosaic-tile",
    rows: p.rows,
    cols: p.cols,
    missing: p.missing,
    seed: p.seed,
    rotate: p.rotate,
    noise: p.noise,
    erosion: p.erosion,
    createdAt: m.artifact.created_at,
  };
}

// Same bounds as MatchParams in the backend (strip_len 8-96, levels 2-4, top_k 1-64).
const MATCH_BOUNDS = { strip_len: [8, 96], levels: [2, 4], top_k: [1, 64] } as const;

function matchArtifact(m: MockArtifact, body: Record<string, unknown>): MatchSummary {
  for (const [key, [lo, hi]] of Object.entries(MATCH_BOUNDS)) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v))
      throw validation(`body.${key}`, "Input should be a valid integer");
    if (v < lo || v > hi) throw validation(`body.${key}`, `Input should be between ${lo} and ${hi}`);
  }
  const config = { ...MATCH_CONFIG, ...(body as Partial<MatchSummary["config"]>) };
  m.matches = buildMatches(specOf(m), m.fragments);
  m.matchStats = buildMatchStats(m.fragments.length, m.matches);
  m.artifact.match_config = { ...config };
  m.artifact.match_stats = { ...m.matchStats };
  return { config, stats: m.matchStats };
}

function trueNeighbour(
  fa: MockFragment | undefined,
  sa: number,
  fb: MockFragment | undefined,
  sb: number,
): boolean | null {
  if (!fa || !fb) return null;
  const dr = fb.true_row - fa.true_row;
  const dc = fb.true_col - fa.true_col;
  return (
    (sa === 1 && sb === 3 && dr === 0 && dc === 1) ||
    (sa === 2 && sb === 0 && dr === 1 && dc === 0) ||
    (sa === 3 && sb === 1 && dr === 0 && dc === -1) ||
    (sa === 0 && sb === 2 && dr === -1 && dc === 0)
  );
}

export function graph(m: MockArtifact, q: URLSearchParams): GraphOut {
  const matches = requireMatches(m);
  // Same defaults and bounds as the backend: threshold 0 (0-1), top_k absent (1-16), traversal bfs.
  const threshold = num(q, "threshold") ?? 0;
  if (threshold < 0 || threshold > 1) throw validation("threshold", "input should be between 0 and 1");
  const topK = num(q, "top_k") ?? null;
  if (topK !== null && (!Number.isInteger(topK) || topK < 1 || topK > 16))
    throw validation("top_k", "input should be between 1 and 16");
  const method = (q.get("traversal") ?? "bfs") as Traversal;
  if (method !== "bfs" && method !== "dfs") throw validation("traversal", "input should be 'bfs' or 'dfs'");
  const byLabel = new Map(m.fragments.map((f) => [f.label, f]));

  // Like the backend (engine/graph.py build_graph): one edge per fragment pair (its best side pair, oriented so the
  // smaller label is the source), then the threshold, then *mutual* top-k (an edge survives only if it is among the
  // k strongest of both endpoints).
  const pairs = new Map<string, SideMatchOut>();
  for (const x of matches) {
    if (x.a === x.b) continue;
    const flip = x.a > x.b;
    const cand = flip ? { ...x, a: x.b, b: x.a, side_a: x.side_b, side_b: x.side_a } : x;
    const key = `${cand.a}|${cand.b}`;
    const cur = pairs.get(key);
    if (!cur || cand.composite > cur.composite) pairs.set(key, cand);
  }
  const collapsed = [...pairs.values()].sort((p, q) => q.composite - p.composite || p.a.localeCompare(q.a));
  let kept = collapsed.filter((x) => x.composite >= threshold);
  if (topK !== null) {
    const rank = new Map<string, Set<string>>();
    for (const label of byLabel.keys()) {
      const top = kept
        .filter((x) => x.a === label || x.b === label)
        .slice(0, topK) // `kept` is already strongest first
        .map((x) => `${x.a}|${x.b}`);
      rank.set(label, new Set(top));
    }
    kept = kept.filter((x) => rank.get(x.a)!.has(`${x.a}|${x.b}`) && rank.get(x.b)!.has(`${x.a}|${x.b}`));
  }
  const edges: GraphEdge[] = kept.map((x) => ({
    source: x.a,
    target: x.b,
    weight: x.composite,
    side_source: sideIndexToLetter(x.side_a),
    side_target: sideIndexToLetter(x.side_b),
    side_source_index: x.side_a,
    side_target_index: x.side_b,
    true_neighbours: trueNeighbour(byLabel.get(x.a), x.side_a, byLabel.get(x.b), x.side_b),
  }));

  const adj = new Map<string, { to: string; w: number }[]>(m.fragments.map((f) => [f.label, []]));
  for (const e of edges) {
    adj.get(e.source)!.push({ to: e.target, w: e.weight });
    adj.get(e.target)!.push({ to: e.source, w: e.weight });
  }
  for (const list of adj.values()) list.sort((a, b) => b.w - a.w || a.to.localeCompare(b.to));

  const order: string[] = [];
  const components: string[][] = [];
  const seen = new Set<string>();
  for (const start of m.fragments.map((x) => x.label).sort()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const frontier = [start];
    seen.add(start);
    while (frontier.length) {
      const cur = method === "bfs" ? frontier.shift()! : frontier.pop()!;
      comp.push(cur);
      order.push(cur);
      const next = adj
        .get(cur)!
        .map((n) => n.to)
        .filter((t) => !seen.has(t));
      // DFS pops from the end, so push in reverse to visit the strongest neighbour first.
      for (const t of method === "bfs" ? next : [...next].reverse()) {
        if (!seen.has(t)) {
          seen.add(t);
          frontier.push(t);
        }
      }
    }
    components.push(comp);
  }
  const compOf = new Map(components.flatMap((c, i) => c.map((l) => [l, i] as const)));
  return {
    nodes: m.fragments.map((f) => ({ id: f.label, fragment_id: f.id, component: compOf.get(f.label)! })),
    edges,
    components,
    traversal: { method, order, edge_visits: edges.length * 2 },
    stats: { edges_before_pruning: collapsed.length, edges_after_pruning: edges.length, threshold, top_k: topK },
  };
}

function stripColours(edge: string): number[][] {
  return edge.split("").map((ch) => {
    const c = ch.charCodeAt(0);
    return [(c * 37) % 256, (c * 91) % 256, (c * 53) % 256];
  });
}
function lcs(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const pairs: [number, number][] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { length: dp[a.length][b.length], subsequence: pairs.map(([x]) => a[x]).join(""), pairs };
}
function longestCommonRun(a: string, b: string) {
  let best = { length: 0, pos_a: 0, pos_b: 0 };
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best.length) best = { length: k, pos_a: i, pos_b: j };
    }
  return best;
}

export function explain(m: MockArtifact, q: URLSearchParams): Explanation {
  const matches = requireMatches(m);
  const a = q.get("a");
  const b = q.get("b");
  if (!a) throw validation("a", "field required");
  if (!b) throw validation("b", "field required");
  const sa = side(q, "side_a");
  const sb = side(q, "side_b");
  const fa = m.fragments.find((f) => f.label === a);
  const fb = m.fragments.find((f) => f.label === b);
  if (!fa) throw notFound("fragment", a);
  if (!fb) throw notFound("fragment", b);
  const letterA = sideIndexToLetter(sa);
  const letterB = sideIndexToLetter(sb);
  const edgeA = fa.edges[letterA];
  const edgeBRev = fb.edges[letterB].split("").reverse().join("");
  const hit = matches.find(
    (x) =>
      (x.a === a && x.side_a === sa && x.b === b && x.side_b === sb) ||
      (x.a === b && x.side_a === sb && x.b === a && x.side_b === sa),
  );
  const scores = hit
    ? { color: hit.color, lcs: hit.lcs, edit: hit.edit, motif: hit.motif, hash: hit.hash }
    : { color: 0.12, lcs: 0.125, edit: 0.08, motif: 0.0, hash: 0.05 }; // an unscored pair is a poor match
  const contributions = {
    color: r4(scores.color * WEIGHTS.color),
    lcs: r4(scores.lcs * WEIGHTS.lcs),
    edit: r4(scores.edit * WEIGHTS.edit),
    motif: r4(scores.motif * WEIGHTS.motif),
    hash: r4(scores.hash * WEIGHTS.hash),
  };
  const run = longestCommonRun(edgeA, edgeBRev);
  const ngrams = (s: string) => new Set(Array.from({ length: s.length - 2 }, (_, i) => s.slice(i, i + 3)));
  const ga = ngrams(edgeA);
  const gb = ngrams(edgeBRev);
  const shared = [...ga].filter((g) => gb.has(g)).length;
  const ops = edgeA
    .split("")
    .map((ch, i) => ({ op: (ch === edgeBRev[i] ? "match" : "sub") as "match" | "sub", a: ch, b: edgeBRev[i] }));
  return {
    a,
    side_a: letterA,
    b,
    side_b: letterB,
    edge_a: edgeA,
    edge_b_reversed: edgeBRev,
    strip_a: stripColours(edgeA),
    strip_b_reversed: stripColours(edgeBRev),
    scores,
    weights: { ...WEIGHTS },
    contributions,
    composite: hit?.composite ?? r4(Object.values(contributions).reduce((s, v) => s + v, 0)),
    lcs: lcs(edgeA, edgeBRev),
    // Mock simplification: position-wise comparison. The real API returns a true Levenshtein alignment.
    edit: { distance: ops.filter((o) => o.op !== "match").length, ops },
    motif: { ...run, motif: edgeA.slice(run.pos_a, run.pos_a + run.length), kmp_ops: 812, rabin_karp_ops: 233 },
    hash: { ngram: 3, shared, union: ga.size + gb.size - shared },
    ground_truth_neighbours: trueNeighbour(fa, sa, fb, sb),
  };
}

function createRun(m: MockArtifact, body: Record<string, unknown>): RunDetail {
  const algorithm = body.algorithm as Algorithm;
  if (!ALGORITHMS.includes(algorithm))
    throw validation("algorithm", "input should be 'greedy', 'best_first', 'dijkstra' or 'backtracking'");
  requireMatches(m);
  const params = {
    threshold: body.threshold as number | undefined,
    top_k: body.top_k as number | null | undefined,
    node_limit: body.node_limit as number | undefined,
  };
  const run = withId(buildRun(m, algorithm, params, new Date().toISOString()));
  saveRun(m, run);
  return run;
}

function scaling(body: ScalingRequest): ScalingOut {
  const sample = body.sample ?? "mosaic-tile";
  if (!SAMPLES.some((s) => s.name === sample)) throw invalid(`unknown sample '${sample}'`);
  const sizes = body.sizes ?? [2, 3, 4, 5];
  if (sizes.some((s) => !Number.isInteger(s) || s < 1 || s > 8))
    throw validation("sizes", "each size must be an integer between 1 and 8");
  const algorithms = body.algorithms ?? [...ALGORITHMS];
  return {
    sample,
    rotate: body.rotate ?? false,
    points: sizes.map((size) => {
      const n = size * size;
      const pairs = n * 4 * (n - 1);
      const runs: ScalingOut["points"][number]["runs"] = {};
      for (const alg of algorithms) {
        const t = scalingModel(alg, n);
        runs[alg] = {
          elapsed_ms: t.ms,
          operations: t.ops,
          total_score: r4(n * 1.25),
          truncated: t.truncated,
          neighbour_accuracy: alg === "dijkstra" ? 0.83 : 1,
          direct_accuracy: alg === "dijkstra" ? 0.5 : 1,
          coverage: 1,
        };
      }
      return {
        size,
        n,
        match: {
          fragments: n,
          side_pairs_total: pairs,
          side_pairs_scored: Math.round(pairs * 0.5),
          side_pairs_skipped: Math.round(pairs * 0.5),
          cache_hits: 0,
          elapsed_ms: Number((n * 4.1).toFixed(2)),
          operations: { prefilter_checks: pairs, dp_cells: n * 9504, char_comparisons: n * 2513 },
          match_accuracy: 1,
        },
        runs,
      };
    }),
  };
}

// ---- router -------------------------------------------------------------------------------
export async function mockRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (mockConfig.latencyMs > 0) await wait(mockConfig.latencyMs);
  const method = (init.method ?? "GET").toUpperCase();
  const url = new URL(path, "http://mock.local");
  const p = url.pathname;
  const q = url.searchParams;
  let body: Record<string, unknown> = {};
  if (typeof init.body === "string" && init.body) body = JSON.parse(init.body) as Record<string, unknown>;
  const form = init.body instanceof FormData ? init.body : null;

  const override = overrides.get(overrideKey(method, p));
  if (override) return structuredClone(await override({ method, path: p, query: q, body, form })) as T;

  // Responses are cloned so callers can never mutate the store.
  const out = (v: unknown) => structuredClone(v) as T;
  let m: RegExpMatchArray | null;

  if (method === "GET" && p === "/health") return out({ status: "ok", database: true, version: "mock" });
  if (method === "GET" && p === "/samples")
    // Mock mode has no image server: serve inline SVG thumbnails so the wizard shows something real.
    return out(SAMPLES.map((x, i) => ({ ...x, image_url: artifactImage(3 + (i % 2), 3 + (i % 2)) })));
  if (method === "GET" && p === "/artifacts") {
    const limit = num(q, "limit") ?? 50;
    const offset = num(q, "offset") ?? 0;
    if (limit > 200 || limit < 1) throw validation("limit", "input should be between 1 and 200");
    // The real API orders by created_at DESC; ties (same millisecond) put the later insert first.
    const newestFirst = [...store.values()].map((x) => x.artifact).reverse();
    newestFirst.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return out(newestFirst.slice(offset, offset + limit));
  }
  if (method === "POST" && p === "/artifacts/sample") return out(createSample(body));
  if (method === "POST" && p === "/artifacts/upload") return out(createUpload(form ?? new FormData()));
  if (method === "POST" && p === "/artifacts/fragments-upload") return out(createFragments(form ?? new FormData()));
  if (method === "POST" && p === "/benchmark/scaling") return out(scaling(body as ScalingRequest));

  if ((m = p.match(/^\/artifacts\/([^/]+)$/)) && method === "GET") return out(getArtifactOr404(m[1]).artifact);
  if ((m = p.match(/^\/artifacts\/([^/]+)$/)) && method === "DELETE") {
    const gone = getArtifactOr404(m[1]);
    for (const r of gone.runs) runIndex.delete(r.id);
    store.delete(m[1]);
    return undefined as T;
  }
  if ((m = p.match(/^\/artifacts\/([^/]+)\/fragments$/)) && method === "GET")
    return out(getArtifactOr404(m[1]).fragments satisfies FragmentOut[]);
  if ((m = p.match(/^\/fragments\/([^/]+)$/)) && method === "GET") {
    for (const art of store.values()) {
      const frag = art.fragments.find((f) => f.id === m![1]);
      if (frag) return out(fragmentDetail(frag));
    }
    throw notFound("fragment", m[1]);
  }
  if ((m = p.match(/^\/artifacts\/([^/]+)\/match$/)) && method === "POST")
    return out(matchArtifact(getArtifactOr404(m[1]), body));
  if ((m = p.match(/^\/artifacts\/([^/]+)\/matches$/)) && method === "GET") {
    const matches = requireMatches(getArtifactOr404(m[1]));
    const min = num(q, "min_score") ?? 0;
    const limit = num(q, "limit") ?? 200;
    return out(matches.filter((x) => x.composite >= min).slice(0, limit));
  }
  if ((m = p.match(/^\/artifacts\/([^/]+)\/graph$/)) && method === "GET") return out(graph(getArtifactOr404(m[1]), q));
  if ((m = p.match(/^\/artifacts\/([^/]+)\/explain$/)) && method === "GET")
    return out(explain(getArtifactOr404(m[1]), q));
  if ((m = p.match(/^\/artifacts\/([^/]+)\/runs$/))) {
    const art = getArtifactOr404(m[1]);
    if (method === "GET") return out(art.runs.map(toRunOut));
    if (method === "POST") return out(createRun(art, body));
  }
  if ((m = p.match(/^\/artifacts\/([^/]+)\/benchmark$/)) && method === "POST") {
    const art = getArtifactOr404(m[1]);
    const algs = (body.algorithms as Algorithm[] | undefined) ?? [];
    if (!algs.length) throw validation("algorithms", "at least one algorithm is required");
    return out(algs.map((algorithm) => createRun(art, { algorithm, node_limit: body.node_limit })));
  }
  if ((m = p.match(/^\/runs\/([^/]+)$/)) && method === "GET") {
    const run = runIndex.get(m[1]);
    if (!run) throw notFound("run", m[1]);
    return out(run);
  }
  throw new ApiError(404, "not_found", `mock API has no route for ${method} ${p}`);
}
