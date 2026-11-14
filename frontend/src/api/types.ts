// Owner: A (Arvind)
// Response types for endpoints whose OpenAPI schema is untyped (`{[key: string]: unknown}`).
// They mirror CONTRACT §5/§6 and the verified live responses. Types that the generated
// schema.d.ts does describe are re-exported from there — never redefined here.
import type { components } from "./schema";
import type { SideLetter } from "./sides";

export type Schemas = components["schemas"];
export type ArtifactOut = Schemas["ArtifactOut"];
export type FragmentOut = Schemas["FragmentOut"];
export type FragmentDetail = Schemas["FragmentDetail"];
export type FragmentParams = Schemas["FragmentParams"];
export type SideMatchOut = Schemas["SideMatchOut"];
export type RunOut = Schemas["RunOut"];
export type RunDetail = Schemas["RunDetail"];
export type RunCreate = Schemas["RunCreate"];
export type PlacementOut = Schemas["PlacementOut"];
export type TraceStepOut = Schemas["TraceStepOut"];
export type SampleInfo = Schemas["SampleInfo"];
export type SampleArtifactCreate = Schemas["SampleArtifactCreate"];
export type MatchParams = Schemas["MatchParams"];

export type Algorithm = RunCreate["algorithm"];
export const ALGORITHMS: readonly Algorithm[] = ["greedy", "best_first", "dijkstra", "backtracking"];

export interface Health {
  status: string;
  database: boolean;
  version: string;
}

export interface Weights {
  color: number;
  lcs: number;
  edit: number;
  motif: number;
  hash: number;
}

export interface MatchSummary {
  config: {
    strip_len: number;
    levels: number;
    depth: number;
    ngram: number;
    motif_method: "kmp" | "rabin_karp";
    min_motif: number;
    top_k: number;
    allow_rotation: boolean;
    color_scale: number;
    weights: Weights;
  };
  stats: {
    fragments: number;
    side_pairs_total: number;
    side_pairs_scored: number;
    side_pairs_skipped: number;
    cache_hits: number;
    elapsed_ms: number;
    operations: Record<string, number>;
    match_accuracy: number | null;
  };
}

export type Traversal = "bfs" | "dfs";

export interface GraphNode {
  id: string; // fragment label, e.g. "F07"
  fragment_id: string;
  component: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  side_source: SideLetter;
  side_target: SideLetter;
  side_source_index: number;
  side_target_index: number;
  true_neighbours: boolean | null;
}

export interface GraphOut {
  nodes: GraphNode[];
  edges: GraphEdge[];
  components: string[][];
  traversal: { method: Traversal; order: string[]; edge_visits: number };
  stats: { edges_before_pruning: number; edges_after_pruning: number; threshold: number; top_k: number | null };
}

export interface Explanation {
  a: string; // labels, not ids
  side_a: SideLetter;
  b: string;
  side_b: SideLetter;
  edge_a: string;
  edge_b_reversed: string;
  strip_a: number[][];
  strip_b_reversed: number[][];
  scores: Weights;
  weights: Weights;
  contributions: Weights;
  composite: number;
  lcs: { length: number; subsequence: string; pairs: [number, number][] };
  edit: { distance: number; ops: { op: "match" | "sub" | "ins" | "del"; a: string | null; b: string | null }[] };
  motif: { length: number; pos_a: number; pos_b: number; motif: string; kmp_ops: number; rabin_karp_ops: number };
  hash: { ngram: number; shared: number; union: number };
  ground_truth_neighbours: boolean | null;
}

export interface ScalingRequest {
  sample?: string;
  sizes?: number[];
  algorithms?: Algorithm[];
  rotate?: boolean;
  noise?: number;
  erosion?: number;
  node_limit?: number;
}

export interface ScalingRunPoint {
  elapsed_ms: number;
  operations: number; // a single total here, unlike RunDetail.operations (object)
  total_score: number;
  truncated: boolean;
  neighbour_accuracy: number | null;
  direct_accuracy: number | null;
  coverage: number | null;
}

export interface ScalingPoint {
  size: number;
  n: number;
  match: MatchSummary["stats"];
  runs: Partial<Record<Algorithm, ScalingRunPoint>>;
}

export interface ScalingOut {
  sample: string;
  rotate: boolean;
  points: ScalingPoint[];
}
