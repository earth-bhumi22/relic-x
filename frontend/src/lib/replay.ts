// Owner: A (Arvind)
// Trace replay (T27): turns a run's `trace` into one frame per step, so scrubbing is instant and deterministic
// (`frameIndex` -> tiles so far). Pure functions only; no timers.
//
// What the real API does (checked against live runs, see the PR):
//  * Greedy / best-first / Dijkstra record the SEED at internal (0, 0) and every other cell relative to it, so internal
//    coordinates go negative. `placements` are normalised to a top-left (0, 0). The shift is therefore the same for every
//    fragment: `placement - trace` (and the rotations agree). We *derive* it from the trace and check every fragment
//    against it; if the trace cannot reproduce the final placements we say so instead of drawing wrong cells.
//  * `seed`, `place`, `conflict` and `fallback` steps all put a tile on the board (conflict / fallback tiles are flagged
//    with the step's reason). `backtrack` removes the tile named in its `data.fragment`.
//  * `prune`, `best`, `incumbent`, `limit`, `stop` only update the status line (and counters).
//  * Backtracking traces use plain grid-cell coordinates, `place` is a *tentative try*, and the trace is capped
//    (`trace_dropped`): the best layout may come from the heuristic incumbent and never appear in the trace. Then the
//    replay plays what exists and ends on an extra "final layout" frame built from `placements`.
import type { RunDetail, TraceStepOut } from "../api/types";

export type TileKind = "seed" | "place" | "conflict" | "fallback";

export interface ReplayTile {
  label: string;
  row: number;
  col: number;
  /** Clockwise quarter turns (CONTRACT D13). */
  rot: number;
  /** The `step` number of the trace step that put it here (0 for tiles taken straight from `placements`). */
  step: number;
  kind: TileKind;
  /** The step's message for conflict / fallback tiles; "" otherwise. */
  note: string;
  score: number | null;
}

export interface Frame {
  /** 0 = nothing placed yet; k = after the k-th recorded step; the last frame may be the synthetic final layout. */
  index: number;
  step: TraceStepOut | null;
  tiles: ReplayTile[];
  status: string;
  prunes: number;
  backtracks: number;
  /** Search nodes reported by the step (`limit` carries `nodes`), else null. */
  nodes: number | null;
  /** True for the synthetic frame that shows the run's final `placements`. */
  final: boolean;
}

export type ReplayMode =
  /** Replaying every step reproduces `placements` exactly (after the derived shift). */
  | "exact"
  /** The trace is capped or the best layout was not built by the trace: ends on the final layout. */
  | "final-only"
  /** The trace cannot reproduce the placements: only the final layout is drawn. */
  | "inconsistent"
  | "empty";

export interface Replay {
  frames: Frame[];
  mode: ReplayMode;
  /** Added to trace coordinates to get layout coordinates. */
  shift: { row: number; col: number };
  /** Steps the solver did not record (sum of `trace_dropped`). */
  dropped: number;
  truncated: boolean;
  /** A user-facing explanation when the replay is not exact. */
  message: string | null;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const key = (t: { row: number; col: number }) => `${t.row},${t.col}`;
const PLACING = new Set(["seed", "place", "conflict", "fallback"]);

interface Raw {
  label: string;
  row: number;
  col: number;
  rot: number;
  step: number;
  kind: TileKind;
  note: string;
  score: number | null;
}

/** Raw (unshifted) tiles after each step, plus per-step bookkeeping. */
function replayRaw(trace: readonly TraceStepOut[]) {
  const board = new Map<string, Raw>();
  const states: Raw[][] = [[]];
  const meta: { status: string; prunes: number; backtracks: number; nodes: number | null }[] = [
    { status: "Nothing placed yet.", prunes: 0, backtracks: 0, nodes: null },
  ];
  let prunes = 0;
  let backtracks = 0;
  let nodes: number | null = null;
  let valid = true;
  for (const step of trace) {
    const d = step.data ?? {};
    if (PLACING.has(step.action)) {
      if (typeof d.fragment === "string" && isInt(d.row) && isInt(d.col)) {
        board.set(d.fragment, {
          label: d.fragment,
          row: d.row,
          col: d.col,
          rot: isInt(d.rot) ? ((d.rot % 4) + 4) % 4 : 0,
          step: step.step,
          kind: step.action as TileKind,
          note: step.action === "conflict" || step.action === "fallback" ? step.message : "",
          score: typeof d.score === "number" ? d.score : null,
        });
      } else valid = false;
    } else if (step.action === "backtrack") {
      if (typeof d.fragment === "string") board.delete(d.fragment);
      backtracks += 1;
    } else if (step.action === "prune") prunes += 1;
    if (isInt(d.nodes)) nodes = d.nodes;
    states.push([...board.values()]);
    meta.push({ status: step.message, prunes, backtracks, nodes });
  }
  return { states, meta, valid };
}

/** Finds the shift that maps the trace's final board onto `placements`, or null if there is none. */
function deriveShift(raw: readonly Raw[], run: RunDetail): { row: number; col: number } | null {
  const final = new Map(run.placements.map((p) => [p.label, p]));
  if (raw.length !== final.size || raw.length === 0) return null;
  let shift: { row: number; col: number } | null = null;
  for (const t of raw) {
    const p = final.get(t.label);
    if (!p || ((p.rot % 4) + 4) % 4 !== t.rot) return null;
    const s = { row: p.row - t.row, col: p.col - t.col };
    if (shift && (shift.row !== s.row || shift.col !== s.col)) return null;
    shift = s;
  }
  return shift;
}

const emptyFrame = (): Pick<Frame, "step" | "tiles" | "prunes" | "backtracks" | "nodes" | "final"> => ({
  step: null,
  tiles: [],
  prunes: 0,
  backtracks: 0,
  nodes: null,
  final: false,
});

/** The run's `placements` as tiles (used for the final layout frame). */
export function placementTiles(run: RunDetail, raw: readonly Raw[] = []): ReplayTile[] {
  const stepOf = new Map(raw.map((t) => [t.label, t]));
  return run.placements.map((p) => {
    const t = stepOf.get(p.label);
    return {
      label: p.label,
      row: p.row,
      col: p.col,
      rot: ((p.rot % 4) + 4) % 4,
      step: t?.step ?? 0,
      kind: t?.kind ?? "place",
      note: t?.note ?? "",
      score: t?.score ?? null,
    };
  });
}

/** Total of `trace_dropped` (steps the solver ran but did not record because the trace is capped). */
export const droppedSteps = (run: RunDetail): number =>
  Object.values(run.trace_dropped ?? {}).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);

export function buildReplay(run: RunDetail): Replay {
  const dropped = droppedSteps(run);
  const truncated = run.truncated;
  const first: Frame = { index: 0, status: "Nothing placed yet.", ...emptyFrame() };
  if (run.trace.length === 0) {
    const final: Frame = {
      index: 1,
      status: "No trace was recorded; showing the final layout.",
      ...emptyFrame(),
      tiles: placementTiles(run),
      final: true,
    };
    return {
      frames: run.placements.length ? [first, final] : [first],
      mode: "empty",
      shift: { row: 0, col: 0 },
      dropped,
      truncated,
      message: "This run has no trace, so there is nothing to play back.",
    };
  }

  const { states, meta, valid } = replayRaw(run.trace);
  const finalRaw = states[states.length - 1];
  const shift = valid ? deriveShift(finalRaw, run) : null;
  const backtracking = run.algorithm === "backtracking" || dropped > 0;

  const finalFrame = (index: number, status: string, last: Frame | undefined): Frame => ({
    ...emptyFrame(),
    index,
    status,
    tiles: placementTiles(run, finalRaw),
    prunes: last?.prunes ?? 0,
    backtracks: last?.backtracks ?? 0,
    nodes: last?.nodes ?? null,
    final: true,
  });

  if (shift) {
    const frames: Frame[] = states.map((tiles, i) => ({
      ...(i === 0 ? first : { ...emptyFrame(), step: run.trace[i - 1] }),
      index: i,
      status: meta[i].status,
      prunes: meta[i].prunes,
      backtracks: meta[i].backtracks,
      nodes: meta[i].nodes,
      tiles: tiles.map((t) => ({ ...t, row: t.row + shift.row, col: t.col + shift.col })),
    }));
    return { frames, mode: "exact", shift, dropped, truncated, message: null };
  }

  if (backtracking && valid) {
    // Grid-cell coordinates, no shift. The trace is capped or the best layout came from the heuristic incumbent.
    const frames: Frame[] = states.map((tiles, i) => ({
      ...(i === 0 ? first : { ...emptyFrame(), step: run.trace[i - 1] }),
      index: i,
      status: meta[i].status,
      prunes: meta[i].prunes,
      backtracks: meta[i].backtracks,
      nodes: meta[i].nodes,
      tiles,
    }));
    frames.push(
      finalFrame(
        frames.length,
        "Final layout: the best arrangement found" + (dropped > 0 ? " (the trace above is incomplete)." : "."),
        frames[frames.length - 1],
      ),
    );
    return {
      frames,
      mode: "final-only",
      shift: { row: 0, col: 0 },
      dropped,
      truncated,
      message:
        dropped > 0
          ? `Trace truncated: ${dropped.toLocaleString("en")} steps were not recorded. The recorded steps play back, then the final layout is shown.`
          : "The recorded steps are tentative tries; the last frame shows the final layout.",
    };
  }

  return {
    frames: [finalFrame(0, "Final layout (the trace could not be replayed).", undefined)],
    mode: "inconsistent",
    shift: { row: 0, col: 0 },
    dropped,
    truncated,
    message:
      "The trace does not reproduce this run's placements, so the step-by-step replay is disabled. The final layout is drawn from the placements instead.",
  };
}

/** Rows / columns the canvas needs: derived from every tile in every frame, never from the artifact grid. */
export function replayBounds(replay: Replay): { minRow: number; minCol: number; rows: number; cols: number } {
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const f of replay.frames)
    for (const t of f.tiles) {
      minRow = Math.min(minRow, t.row);
      minCol = Math.min(minCol, t.col);
      maxRow = Math.max(maxRow, t.row);
      maxCol = Math.max(maxCol, t.col);
    }
  if (!Number.isFinite(minRow)) return { minRow: 0, minCol: 0, rows: 0, cols: 0 };
  return { minRow, minCol, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 };
}

export const tileAt = (tiles: readonly ReplayTile[], row: number, col: number) =>
  tiles.find((t) => key(t) === `${row},${col}`);
