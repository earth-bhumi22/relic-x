// Owner: A (Arvind)
// Deterministic mock data. Shapes follow planning/CONTRACT.md §6 (plus the extra fields the live API
// returns). Everything is seeded, so the same ids/labels/scores appear on every load.
import type {
  Algorithm,
  ArtifactOut,
  FragmentOut,
  MatchSummary,
  PlacementOut,
  RunDetail,
  SampleInfo,
  SideMatchOut,
  TraceStepOut,
  Weights,
} from "../types";

export const WEIGHTS: Weights = { color: 0.4, lcs: 0.2, edit: 0.15, motif: 0.15, hash: 0.1 };
export const MATCH_CONFIG: MatchSummary["config"] = {
  strip_len: 24,
  levels: 4,
  depth: 2,
  ngram: 3,
  motif_method: "kmp",
  min_motif: 3,
  top_k: 6,
  allow_rotation: false,
  color_scale: 40,
  weights: WEIGHTS,
};

export const SAMPLES: SampleInfo[] = [
  {
    name: "mosaic-tile",
    description: "Glazed geometric tile panel with star rosettes",
    image_url: "/api/v1/samples/mosaic-tile/image",
  },
  {
    name: "pottery-band",
    description: "Painted pottery shard with wave and meander bands",
    image_url: "/api/v1/samples/pottery-band/image",
  },
  {
    name: "manuscript",
    description: "Illuminated manuscript leaf with glyph rows and border",
    image_url: "/api/v1/samples/manuscript/image",
  },
];

/** mulberry32: tiny seeded PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hex32 = (r: () => number) => Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16)).join("");
const round = (n: number, d = 4) => Number(n.toFixed(d));
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const STRIP_LEN = 24;

export const composite = (s: Weights): number =>
  round(
    s.color * WEIGHTS.color +
      s.lcs * WEIGHTS.lcs +
      s.edit * WEIGHTS.edit +
      s.motif * WEIGHTS.motif +
      s.hash * WEIGHTS.hash,
  );

export interface MockFragment extends FragmentOut {
  true_row: number;
  true_col: number;
}

export interface MockArtifact {
  artifact: ArtifactOut;
  fragments: MockFragment[];
  matches: SideMatchOut[] | null;
  matchStats: MatchSummary["stats"] | null;
  runs: RunDetail[];
}

// ---- images (inline SVG so mock mode needs no image files) -------------------------------
const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const hue = (row: number, col: number) => (row * 67 + col * 41 + 20) % 360;

function tileSvgBody(row: number, col: number, x: number, y: number, size: number, label?: string): string {
  const h = hue(row, col);
  const text = label
    ? `<text x="${x + size / 2}" y="${y + size / 2 + 6}" font-family="sans-serif" font-size="${size / 4}" text-anchor="middle" fill="#fff">${label}</text>`
    : "";
  return (
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="hsl(${h} 55% 45%)"/>` +
    `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 3}" fill="hsl(${(h + 40) % 360} 60% 62%)"/>` +
    `<rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" fill="none" stroke="hsl(${h} 40% 25%)" stroke-width="2"/>` +
    text
  );
}
const fragmentImage = (row: number, col: number, label: string) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">${tileSvgBody(row, col, 0, 0, 120, label)}</svg>`,
  );
export function artifactImage(rows: number, cols: number): string {
  const size = 480 / Math.max(rows, cols);
  let body = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) body += tileSvgBody(r, c, c * size, r * size, size);
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${cols * size}" height="${rows * size}">${body}</svg>`);
}

// ---- fragments ----------------------------------------------------------------------------
export interface ArtifactSpec {
  id?: string;
  name: string;
  description: string | null;
  sample: string;
  rows: number;
  cols: number;
  missing: number;
  seed: number;
  rotate: boolean;
  noise: number;
  erosion: number;
  createdAt: string;
}

export function buildFragments(spec: ArtifactSpec): MockFragment[] {
  const r = rng(spec.seed * 7919 + spec.rows * 31 + spec.cols);
  const randStrip = () => Array.from({ length: STRIP_LEN }, () => ALPHABET[Math.floor(r() * ALPHABET.length)]).join("");
  const mutate = (s: string) =>
    s
      .split("")
      .map((ch) => (r() < 0.08 ? ALPHABET[Math.floor(r() * ALPHABET.length)] : ch))
      .join("");
  const reverse = (s: string) => s.split("").reverse().join("");

  // Edge strings per grid cell; a shared boundary gets s on one side and a noisy reverse(s) on the other.
  const grid: Record<"N" | "E" | "S" | "W", string>[][] = Array.from({ length: spec.rows }, () =>
    Array.from({ length: spec.cols }, () => ({ N: randStrip(), E: randStrip(), S: randStrip(), W: randStrip() })),
  );
  for (let row = 0; row < spec.rows; row++)
    for (let col = 0; col < spec.cols; col++) {
      if (col + 1 < spec.cols) {
        const s = randStrip();
        grid[row][col].E = s;
        grid[row][col + 1].W = mutate(reverse(s));
      }
      if (row + 1 < spec.rows) {
        const s = randStrip();
        grid[row][col].S = s;
        grid[row + 1][col].N = mutate(reverse(s));
      }
    }

  // Scramble: shuffle which label each cell gets, then drop `missing` cells.
  const cells = Array.from({ length: spec.rows * spec.cols }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const kept = cells.slice(0, cells.length - Math.min(spec.missing, cells.length - 1));
  return kept.map((cell, i) => {
    const row = Math.floor(cell / spec.cols);
    const col = cell % spec.cols;
    const label = `F${String(i + 1).padStart(2, "0")}`;
    const id = hex32(r);
    return {
      id,
      label,
      width: 120,
      height: 120,
      image_url: fragmentImage(row, col, label),
      true_row: row,
      true_col: col,
      scramble_rot: 0,
      edges: grid[row][col],
    };
  });
}

// ---- matches ------------------------------------------------------------------------------
const posKey = (row: number, col: number) => `${row},${col}`;

/** Side pairs are (E→W) and (S→N); true neighbours score high, decoys low. Sorted best first. */
export function buildMatches(spec: ArtifactSpec, fragments: MockFragment[]): SideMatchOut[] {
  const r = rng(spec.seed * 104729 + fragments.length);
  const byPos = new Map(fragments.map((f) => [posKey(f.true_row, f.true_col), f]));
  const pairs = new Map<string, SideMatchOut>();
  const add = (a: string, sa: number, b: string, sb: number, base: number) => {
    const key = `${a}|${sa}|${b}|${sb}`;
    if (pairs.has(key)) return;
    const j = () => clamp01(base + (r() - 0.5) * 0.2);
    const s = { color: round(j()), lcs: round(j()), edit: round(j()), motif: round(j()), hash: round(j()) };
    pairs.set(key, { a, side_a: sa, b, side_b: sb, ...s, composite: composite(s) });
  };
  for (const f of fragments) {
    const east = byPos.get(posKey(f.true_row, f.true_col + 1));
    if (east) add(f.label, 1, east.label, 3, 0.78 + r() * 0.17);
    const south = byPos.get(posKey(f.true_row + 1, f.true_col));
    if (south) add(f.label, 2, south.label, 0, 0.78 + r() * 0.17);
    for (let d = 0; d < 3; d++) {
      const other = fragments[Math.floor(r() * fragments.length)];
      if (other.label === f.label) continue;
      if (r() < 0.5) add(f.label, 1, other.label, 3, 0.1 + r() * 0.42);
      else add(f.label, 2, other.label, 0, 0.1 + r() * 0.42);
    }
  }
  return [...pairs.values()].sort((x, y) => y.composite - x.composite);
}

export function buildMatchStats(fragments: number, matches: SideMatchOut[]): MatchSummary["stats"] {
  const total = fragments * 4 * (fragments - 1);
  const scored = matches.length * 2;
  return {
    fragments,
    side_pairs_total: total,
    side_pairs_scored: scored,
    side_pairs_skipped: total - scored,
    cache_hits: 3,
    elapsed_ms: 61.2,
    operations: { prefilter_checks: total, dp_cells: fragments * 9504, char_comparisons: fragments * 2513 },
    match_accuracy: 1.0,
  };
}

// ---- artifacts ----------------------------------------------------------------------------
export function buildArtifact(spec: ArtifactSpec, matched: boolean): MockArtifact {
  const fragments = buildFragments(spec);
  const matches = matched ? buildMatches(spec, fragments) : null;
  const matchStats = matches ? buildMatchStats(fragments.length, matches) : null;
  const id = spec.id ?? hex32(rng(spec.seed + spec.rows * 1000 + spec.cols));
  const artifact: ArtifactOut = {
    id,
    name: spec.name,
    description: spec.description,
    source_kind: "sample",
    grid_rows: spec.rows,
    grid_cols: spec.cols,
    tile: 120,
    has_ground_truth: true,
    fragment_params: {
      rows: spec.rows,
      cols: spec.cols,
      rotate: spec.rotate,
      noise: spec.noise,
      erosion: spec.erosion,
      missing: spec.missing,
      seed: spec.seed,
      missing_cells: [],
    },
    match_config: matched ? { ...MATCH_CONFIG } : null,
    match_stats: matchStats ? { ...matchStats } : null,
    created_at: spec.createdAt,
    fragment_count: fragments.length,
    run_count: 0,
    best_accuracy: null,
    image_url: artifactImage(spec.rows, spec.cols),
  };
  return { artifact, fragments, matches, matchStats, runs: [] };
}

// ---- runs ---------------------------------------------------------------------------------
/** Swapped pairs per algorithm: how "wrong" each solver is on the mock (backtracking is exact). */
const SWAPS: Record<Algorithm, number> = { greedy: 2, best_first: 1, dijkstra: 3, backtracking: 0 };
const TIMING: Record<Algorithm, { ms: number; ops: (n: number) => Record<string, number> }> = {
  greedy: { ms: 1.4, ops: (n) => ({ score_lookups: n * 320 }) },
  best_first: { ms: 2.9, ops: (n) => ({ heap_pushes: n * 14, heap_pops: n * 11, score_lookups: n * 410 }) },
  dijkstra: { ms: 6.3, ops: (n) => ({ heap_pushes: n * 38, heap_pops: n * 31, relaxations: n * 52 }) },
  backtracking: { ms: 412.8, ops: (n) => ({ nodes_expanded: n * 1140, pruned: n * 790, bound_checks: n * 2210 }) },
};

export function lookupScore(matches: SideMatchOut[], a: string, sa: number, b: string, sb: number): number {
  const hit = matches.find(
    (m) =>
      (m.a === a && m.side_a === sa && m.b === b && m.side_b === sb) ||
      (m.a === b && m.side_a === sb && m.b === a && m.side_b === sa),
  );
  return hit?.composite ?? 0.05;
}

export function buildRun(
  m: MockArtifact,
  algorithm: Algorithm,
  params: { threshold?: number; top_k?: number | null; node_limit?: number },
  createdAt: string,
): RunDetail {
  const matches = m.matches ?? [];
  const frags = m.fragments;
  const r = rng(frags.length * 977 + algorithm.length * 13);
  // Start from the ground truth, then swap pairs to mimic an imperfect solver.
  const pos = new Map(frags.map((f) => [f.label, { row: f.true_row, col: f.true_col }]));
  const labels = frags.map((f) => f.label);
  for (let s = 0; s < SWAPS[algorithm] && labels.length >= 2; s++) {
    const a = labels[Math.floor(r() * labels.length)];
    const b = labels[Math.floor(r() * labels.length)];
    if (a === b) continue;
    const pa = pos.get(a)!;
    pos.set(a, pos.get(b)!);
    pos.set(b, pa);
  }
  const placements: PlacementOut[] = frags
    .map((f) => ({ fragment_id: f.id, label: f.label, row: pos.get(f.label)!.row, col: pos.get(f.label)!.col, rot: 0 }))
    .sort((x, y) => x.row - y.row || x.col - y.col);

  const at = new Map(placements.map((p) => [posKey(p.row, p.col), p]));
  let total = 0;
  let placedPairs = 0;
  let goodPairs = 0;
  for (const p of placements) {
    const east = at.get(posKey(p.row, p.col + 1));
    const south = at.get(posKey(p.row + 1, p.col));
    for (const [nb, sa, sb] of [
      [east, 1, 3],
      [south, 2, 0],
    ] as const) {
      if (!nb) continue;
      placedPairs++;
      const score = lookupScore(matches, p.label, sa, nb.label, sb);
      total += score;
      if (score >= 0.7) goodPairs++;
    }
  }
  const direct = placements.filter((p) => {
    const f = frags.find((x) => x.label === p.label)!;
    return f.true_row === p.row && f.true_col === p.col;
  }).length;

  const trace: TraceStepOut[] = placements.map((p, i) =>
    i === 0
      ? {
          step: 1,
          action: "seed",
          message: `Seed ${p.label}: strongest total edge weight`,
          data: { fragment: p.label, row: 0, col: 0, rot: 0 },
        }
      : {
          step: i + 1,
          action: "place",
          message: `Place ${p.label} at (${p.row}, ${p.col}) rot 0° — best local score ${(0.6 + r() * 0.35).toFixed(3)} from 1 neighbour(s)`,
          data: { fragment: p.label, row: p.row, col: p.col, rot: 0, score: round(0.6 + r() * 0.35, 3) },
        },
  );
  if (algorithm === "backtracking") {
    trace.push({
      step: trace.length + 1,
      action: "prune",
      message: "Bound 14.20 < incumbent 19.84: prune subtree",
      data: {},
    });
    trace.push({
      step: trace.length + 1,
      action: "best",
      message: "New best layout found",
      data: { total_score: round(total) },
    });
  }
  trace.push({
    step: trace.length + 1,
    action: "stop",
    message: `Placed ${placements.length}/${frags.length} fragments`,
    data: {},
  });

  return {
    id: hex32(rng(Math.floor(r() * 1e9) + createdAt.length)),
    artifact_id: m.artifact.id,
    algorithm,
    params: {
      threshold: params.threshold ?? 0,
      top_k: params.top_k ?? null,
      node_limit: params.node_limit ?? 150000,
      seed: null,
    },
    elapsed_ms: TIMING[algorithm].ms,
    operations: TIMING[algorithm].ops(frags.length),
    total_score: round(total),
    neighbour_accuracy: placedPairs ? round(goodPairs / placedPairs) : null,
    direct_accuracy: frags.length ? round(direct / frags.length) : null,
    coverage: 1.0,
    truncated: false,
    meta: { seed: placements[0]?.label ?? null, unplaced: [] },
    created_at: createdAt,
    placements,
    trace,
    trace_dropped: algorithm === "backtracking" ? { place: 12575, prune: 8120 } : {},
  };
}

export function scalingModel(algorithm: Algorithm, n: number): { ms: number; ops: number; truncated: boolean } {
  const f = {
    greedy: 0.09 * n ** 1.3,
    best_first: 0.16 * n ** 1.5,
    dijkstra: 0.25 * n ** 1.7,
    backtracking: 0.4 * 1.55 ** n,
  }[algorithm];
  const opsF = { greedy: 20 * n ** 2, best_first: 30 * n ** 2, dijkstra: 60 * n ** 2, backtracking: 90 * 1.6 ** n }[
    algorithm
  ];
  const truncated = algorithm === "backtracking" && n > 25;
  return { ms: round(f, 2), ops: Math.round(opsF), truncated };
}
