// Owner: A (Arvind)
// Ready-made payloads from CONTRACT §6, built from the same seeded generators the mock API uses
// (src/api/mocks), so tests and mock mode can never drift apart. Each call returns a fresh copy.
//
//   const artifact = artifactFixture();            // §6.1 ArtifactOut  (4×4 "Mughal tile panel", matched)
//   const frags = fragmentsFixture();              // §6.2 FragmentOut[] (16 pieces)
//   const summary = matchSummaryFixture();         // §6.3 {config, stats}
//   const why = explanationFixture("F01", 1, "F02", 3); // §6.4 (side indices in, letters out)
//   const run = runFixture("greedy");              // §6.5 RunDetail with placements + trace
import { MATCH_CONFIG, buildArtifact, buildMatchStats, buildRun } from "../api/mocks/data";
import { MOSAIC, explain, graph } from "../api/mocks";
import type {
  Algorithm,
  ArtifactOut,
  Explanation,
  FragmentOut,
  GraphOut,
  MatchSummary,
  RunDetail,
  SideMatchOut,
} from "../api/types";

const base = () => buildArtifact(MOSAIC, true);

export const ARTIFACT_ID = MOSAIC.id as string;

export const artifactFixture = (): ArtifactOut => base().artifact;
export const fragmentsFixture = (): FragmentOut[] => base().fragments;
export const matchesFixture = (): SideMatchOut[] => base().matches ?? [];

export function matchSummaryFixture(): MatchSummary {
  const m = base();
  return { config: { ...MATCH_CONFIG }, stats: buildMatchStats(m.fragments.length, m.matches ?? []) };
}

export function graphFixture(threshold = 0.5, traversal: "bfs" | "dfs" = "bfs"): GraphOut {
  return graph(base(), new URLSearchParams({ threshold: String(threshold), traversal }));
}

export function explanationFixture(a: string, sideA: number, b: string, sideB: number): Explanation {
  return explain(base(), new URLSearchParams({ a, side_a: String(sideA), b, side_b: String(sideB) }));
}

export function runFixture(algorithm: Algorithm = "greedy"): RunDetail {
  return buildRun(base(), algorithm, {}, "2026-11-13T11:32:00Z");
}
