// Owner: A (Arvind)
// Pure helpers for the similarity-graph page (T25): defaults, palette, stats, selection contract, table sorting.
import type { GraphEdge, GraphOut, Traversal } from "../api/types";
import { sideLetterToIndex } from "../api/sides";
import type { SideIndex } from "../api/sides";

/** Backend defaults for GET /graph (`threshold` 0, no `top_k`, `bfs`) and its bounds (`top_k` 1–16, threshold 0–1). */
export const GRAPH_DEFAULTS = { threshold: 0, topK: null as number | null, traversal: "bfs" as Traversal };
export const TOP_K_RANGE = { min: 1, max: 16 } as const;
/** Where "Lower the threshold" jumps to when the current threshold removed every edge. */
export const SENSIBLE_THRESHOLD = 0.5;
export const suggestedThreshold = (current: number): number => (current > SENSIBLE_THRESHOLD ? SENSIBLE_THRESHOLD : 0);

/**
 * Categorical palette for connected components (defined once; the only hard-coded colours of the graph page).
 * Okabe–Ito based, chosen to stay distinguishable on both the light and the dark surface and for colour-blind
 * viewers. It is never the only cue: nodes keep their label, the tooltip names the component, and the legend numbers it.
 */
export const COMPONENT_PALETTE: readonly string[] = [
  "#0072b2", // blue
  "#e69f00", // orange
  "#009e73", // green
  "#cc79a7", // pink
  "#d55e00", // vermilion
  "#56b4e9", // sky
  "#f0e442", // yellow
  "#7b6fd6", // violet
  "#8c8c8c", // grey
  "#b07a3b", // brown
];
export const componentColor = (component: number): string => COMPONENT_PALETTE[component % COMPONENT_PALETTE.length];

export interface GraphSummary {
  nodes: number;
  edgesBefore: number;
  edgesAfter: number;
  components: number;
  largest: number;
  isolated: string[];
  edgeVisits: number;
}

export function summarize(g: GraphOut): GraphSummary {
  const sizes = g.components.map((c) => c.length);
  return {
    nodes: g.nodes.length,
    edgesBefore: g.stats.edges_before_pruning,
    edgesAfter: g.stats.edges_after_pruning,
    components: g.components.length,
    largest: sizes.length ? Math.max(...sizes) : 0,
    isolated: g.components.filter((c) => c.length === 1).map((c) => c[0]),
    edgeVisits: g.traversal.edge_visits,
  };
}

// ---- edges ----------------------------------------------------------------------------------
/** Unique, stable id of an edge (two fragments can be joined by more than one side pair). */
export const edgeId = (e: GraphEdge): string => `${e.source}:${e.side_source}-${e.target}:${e.side_target}`;

/**
 * The selection T26 ("Why matched?") consumes: fragment LABELS and the integer sides `/explain` expects.
 * Edge sides arrive as letters ("N"), `/explain` wants integers (0–3): always converted with sideLetterToIndex.
 */
export interface MatchSelection {
  a: string;
  sideA: SideIndex;
  b: string;
  sideB: SideIndex;
}

export const selectionOf = (e: GraphEdge): MatchSelection => ({
  a: e.source,
  sideA: sideLetterToIndex(e.side_source),
  b: e.target,
  sideB: sideLetterToIndex(e.side_target),
});

export const selectionId = (s: MatchSelection): string => `${s.a}:${"NESW"[s.sideA]}-${s.b}:${"NESW"[s.sideB]}`;
export const selectionMatches = (s: MatchSelection | null, e: GraphEdge): boolean =>
  s !== null && selectionId(s) === edgeId(e);

/** URL form of a selection, the `?why=` query parameter: `F03:E:F11:W` (label:side:label:side, side letters). */
export const WHY_PARAM = "why";
export const formatWhy = (s: MatchSelection): string => `${s.a}:${"NESW"[s.sideA]}:${s.b}:${"NESW"[s.sideB]}`;

export function parseWhy(text: string | null): MatchSelection | null {
  if (!text) return null;
  const m = /^([^:]+):([NESW]):([^:]+):([NESW])$/.exec(text);
  return m ? { a: m[1], sideA: sideLetterToIndex(m[2]), b: m[3], sideB: sideLetterToIndex(m[4]) } : null;
}

/** Edges touching a node, strongest first (the "neighbours" list). */
export function neighboursOf(g: GraphOut, label: string): { label: string; edge: GraphEdge; weight: number }[] {
  return g.edges
    .filter((e) => e.source === label || e.target === label)
    .map((edge) => ({ label: edge.source === label ? edge.target : edge.source, edge, weight: edge.weight }))
    .sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label, "en", { numeric: true }));
}

export type SortDir = "desc" | "asc";
/** Table rows: filtered to edges touching `node` (empty = all) and sorted by weight (ties by labels). */
export function tableEdges(g: GraphOut, opts: { node: string; sort: SortDir }): GraphEdge[] {
  const needle = opts.node.trim().toLowerCase();
  const rows = needle
    ? g.edges.filter((e) => e.source.toLowerCase().includes(needle) || e.target.toLowerCase().includes(needle))
    : [...g.edges];
  const dir = opts.sort === "desc" ? -1 : 1;
  return rows.sort(
    (x, y) => dir * (x.weight - y.weight) || edgeId(x).localeCompare(edgeId(y), "en", { numeric: true }),
  );
}

export const truthLabel = (v: boolean | null): string =>
  v === null ? "unknown (no ground truth)" : v ? "true neighbours" : "not neighbours";

/** Whether `topology` changed (nodes or edges), so the layout must be recomputed; weights/order alone do not. */
export function topologyKey(g: GraphOut): string {
  return `${g.nodes.map((n) => n.id).join(",")}|${g.edges.map(edgeId).join(",")}`;
}
