// Owner: A (Arvind)
// Reconstruction canvas (T27): run a solver, open a past run (`?run=<id>`), replay its trace on the canvas, see
// confidence rings and (optionally) the ground-truth overlay. Pure logic lives in lib/replay, lib/confidence, lib/truth.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { deleteRun, getArtifact, getRun, listFragments, listMatches, listRuns } from "../api/client";
import { ApiError } from "../api/errors";
import type { RunDetail, RunOut } from "../api/types";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import Loading from "../components/Loading";
import { MatchRequired } from "../components/MatchPanel";
import ReconstructionCanvas from "../components/ReconstructionCanvas";
import PlacementTable from "../components/run/PlacementTable";
import RunControls from "../components/run/RunControls";
import RunHistory from "../components/run/RunHistory";
import RunSummary from "../components/run/RunSummary";
import TruthPanel from "../components/run/TruthPanel";
import TracePlayer from "../components/TracePlayer";
import WhyBoundary from "../components/why/WhyBoundary";
import { useAsync } from "../hooks/useAsync";
import { isPreconditionFailed } from "../hooks/useMatchStatus";
import { confidences } from "../lib/confidence";
import { buildReplay, replayBounds } from "../lib/replay";
import { runSolver } from "../lib/runSolver";
import { DEFAULT_DRAFT, fieldErrorsFromApi } from "../lib/solvers";
import type { RunDraft, RunField, RunRequest } from "../lib/solvers";
import { bestAlignment, classify, truthOf } from "../lib/truth";

export const RUN_PARAM = "run";
const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;

/** Keyed by artifact so that per-artifact state (draft, selection, cached history) never leaks between artifacts. */
export default function ReconstructPage() {
  const { id = "" } = useParams();
  return <ReconstructInner key={id} id={id} />;
}

function ReconstructInner({ id }: { id: string }) {
  const [params, setParams] = useSearchParams();
  const runId = params.get(RUN_PARAM);

  const [draft, setDraft] = useState<RunDraft>(DEFAULT_DRAFT);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<Error | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RunField, string>>>({});
  const [needsMatch, setNeedsMatch] = useState<RunRequest | null>(null);
  const [showTruth, setShowTruth] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const artifact = useAsync(() => getArtifact(id), [id]);
  const fragments = useAsync(() => listFragments(id), [id]);
  const runs = useAsync(() => listRuns(id), [id]);
  const matches = useAsync(() => listMatches(id), [id]);
  const run = useAsync<RunDetail | null>(() => (runId ? getRun(runId) : Promise.resolve(null)), [runId]);

  const openRun = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams(params);
      if (next) p.set(RUN_PARAM, next);
      else p.delete(RUN_PARAM);
      setParams(p, { replace: false });
      setFrameIndex(null);
      setSelected(null);
    },
    [params, setParams],
  );

  const start = async (request: RunRequest) => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setRunError(null);
    setFieldErrors({});
    setNeedsMatch(null);
    try {
      const created = await runSolver(id, request, { signal: controller.signal });
      if (controller.signal.aborted) return;
      runs.reload();
      openRun(created.id);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      if (isPreconditionFailed(e)) setNeedsMatch(request);
      else if (e instanceof ApiError && e.status === 422) {
        const mapped = fieldErrorsFromApi(e.details);
        setFieldErrors(mapped);
        if (Object.keys(mapped).length === 0) setRunError(e);
      } else setRunError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (abort.current === controller) abort.current = null;
      if (!controller.signal.aborted) setBusy(false); // Cancel already reset the busy state
    }
  };
  const cancel = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  };
  const remove = async (rid: string) => {
    await deleteRun(rid);
    runs.reload();
    if (rid === runId) openRun(null);
  };

  const detail = run.status === "success" ? run.data : null;
  const replay = useMemo(() => (detail ? buildReplay(detail) : null), [detail]);
  const bounds = useMemo(() => (replay ? replayBounds(replay) : null), [replay]);
  const frames = replay?.frames ?? [];
  const index = Math.min(frameIndex ?? frames.length - 1, frames.length - 1);
  const frame = frames[index];
  const tiles = useMemo(() => frame?.tiles ?? [], [frame]);
  const matchList = matches.status === "success" ? matches.data : null;
  const confidence = useMemo(() => confidences(tiles, matchList ?? []), [tiles, matchList]);
  const truth = useMemo(() => (fragments.status === "success" ? truthOf(fragments.data) : null), [fragments]);
  const overlay = showTruth && truth !== null;
  const verdicts = useMemo(() => (overlay && truth ? classify(tiles, truth) : null), [overlay, truth, tiles]);
  const alignment = useMemo(() => (overlay && truth ? bestAlignment(tiles, truth) : null), [overlay, truth, tiles]);
  const unplaced = useMemo(() => {
    if (fragments.status !== "success") return [];
    const placed = new Set(tiles.map((t) => t.label));
    return fragments.data.map((f) => f.label).filter((l) => !placed.has(l));
  }, [fragments, tiles]);

  // Keep showing the last history while it reloads (after a run or a delete), so the controls do not unmount.
  const lastRuns = useRef<RunOut[] | null>(null);
  if (runs.status === "success") lastRuns.current = runs.data;
  const firstError = [artifact, fragments, runs, matches].find((s) => s.status === "error");
  const reloadAll = () => {
    artifact.reload();
    fragments.reload();
    runs.reload();
    matches.reload();
    run.reload();
  };

  let body;
  if (artifact.status === "error" && isNotFound(artifact.error)) {
    body = (
      <EmptyState
        title="Artifact not found"
        message="This artifact does not exist (it may have been deleted)."
        action={
          <Link className="btn" to="/projects">
            Back to projects
          </Link>
        }
      />
    );
  } else if (firstError?.error && isPreconditionFailed(firstError.error)) {
    body = <MatchRequired artifactId={id} error={firstError.error} onMatched={reloadAll} />;
  } else if (firstError?.error) {
    body = <ErrorState error={firstError.error} onRetry={reloadAll} />;
  } else if (
    artifact.status === "loading" ||
    fragments.status === "loading" ||
    (runs.status === "loading" && !lastRuns.current)
  ) {
    body = <Loading label="Loading runs…" />;
  } else {
    const history = lastRuns.current ?? [];
    body = (
      <div className="recon-layout">
        <div className="recon-side">
          <RunControls
            draft={draft}
            onDraft={setDraft}
            serverErrors={fieldErrors}
            busy={busy}
            onRun={(r) => void start(r)}
            onCancel={cancel}
          />
          {needsMatch && (
            <MatchRequired
              artifactId={id}
              onMatched={() => {
                const again = needsMatch;
                setNeedsMatch(null);
                matches.reload();
                void start(again);
              }}
            />
          )}
          {runError && <ErrorState error={runError} onRetry={() => setRunError(null)} />}
          {history.length === 0 ? (
            <EmptyState title="No runs yet" message="Run an algorithm to begin." />
          ) : (
            <RunHistory runs={history} selectedId={runId} onOpen={openRun} onDelete={remove} />
          )}
        </div>
        <div className="recon-main">
          {!runId ? (
            history.length > 0 && <EmptyState title="No run open" message="Open a run from the history to replay it." />
          ) : run.status === "loading" ? (
            <Loading label="Loading run…" />
          ) : run.status === "error" ? (
            isNotFound(run.error) ? (
              <EmptyState
                title="Run not found"
                message="This run does not exist (it may have been deleted)."
                action={
                  <button type="button" className="btn" onClick={() => openRun(null)}>
                    Clear selection
                  </button>
                }
              />
            ) : (
              <ErrorState error={run.error} onRetry={run.reload} />
            )
          ) : detail && replay && bounds ? (
            <>
              <RunSummary run={detail} />
              {replay.message && (
                <p className="state state-warning" role="status" data-testid="replay-notice">
                  {replay.message}
                </p>
              )}
              {replay.dropped > 0 && (
                <p className="state state-warning" role="status" data-testid="trace-truncated">
                  Trace truncated: {replay.dropped.toLocaleString("en")} steps not recorded. The replay ends on the
                  final layout.
                </p>
              )}
              <WhyBoundary
                title="The canvas could not be drawn"
                message="This run has data the canvas cannot show. Try another run."
              >
                {frames.length === 0 || replay.mode === "empty" ? (
                  <EmptyState
                    title="Empty trace"
                    message="This run recorded no steps, so there is nothing to replay."
                  />
                ) : null}
                {replay.mode !== "empty" && frame && (
                  <>
                    {replay.mode !== "inconsistent" && (
                      <TracePlayer frames={frames} index={index} onIndex={setFrameIndex} />
                    )}
                    <ReconstructionCanvas
                      tiles={tiles}
                      bounds={bounds}
                      fragments={fragments.data ?? []}
                      confidence={confidence}
                      verdicts={verdicts}
                      unplaced={unplaced}
                      selected={selected}
                      onSelect={setSelected}
                    />
                    <PlacementTable
                      tiles={tiles}
                      confidence={confidence}
                      verdicts={verdicts}
                      selected={selected}
                      onSelect={setSelected}
                    />
                  </>
                )}
              </WhyBoundary>
              <TruthPanel
                enabled={showTruth}
                onToggle={setShowTruth}
                truth={truth}
                tiles={tiles}
                verdicts={verdicts}
                alignment={alignment}
                fragments={fragments.data ?? []}
              />
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="recon-heading">
      <h1 id="recon-heading">Reconstruction canvas</h1>
      {body}
    </section>
  );
}
