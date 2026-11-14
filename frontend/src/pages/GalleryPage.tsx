// Owner: A (Arvind)
// Fragment gallery (T24): the scrambled pieces of an artifact; selecting one (kept in `?fragment=F07`) opens its four
// edge strings as colour beads. Also hosts the matching panel, since every later page needs matching to have run.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { listFragments } from "../api/client";
import { ApiError } from "../api/errors";
import type { FragmentOut } from "../api/types";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import FragmentDialog, { GroundTruth } from "../components/FragmentDialog";
import Loading from "../components/Loading";
import MatchPanel from "../components/MatchPanel";
import { useAsync } from "../hooks/useAsync";
import { useMatchStatus } from "../hooks/useMatchStatus";
import { seededShuffle } from "../lib/shuffle";

/** Fragments are returned ordered by label; the "scrambled" view is a shuffle seeded by the artifact id. */
export const scrambledOrder = (fragments: readonly FragmentOut[], artifactId: string): FragmentOut[] =>
  seededShuffle(fragments, artifactId);
export const labelOrder = (fragments: readonly FragmentOut[]): FragmentOut[] =>
  [...fragments].sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));

export default function GalleryPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const status = useMatchStatus(id);
  const fragments = useAsync(() => listFragments(id), [id]);
  const [sorted, setSorted] = useState(false);
  const [showTruth, setShowTruth] = useState(false);
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);

  const selectedLabel = params.get("fragment");
  const ordered = useMemo(() => {
    if (fragments.status !== "success") return [];
    return sorted ? labelOrder(fragments.data) : scrambledOrder(fragments.data, id);
  }, [fragments.status, fragments.data, sorted, id]);
  const selected = ordered.find((f) => f.label === selectedLabel) ?? null;

  const select = (label: string) => {
    returnTo.current = label;
    setParams({ fragment: label });
  };
  const close = () => setParams({});

  // After the dialog closes, put focus back on the tile that opened it (also where Safari does not focus buttons on click).
  useEffect(() => {
    if (selectedLabel === null && returnTo.current) {
      tiles.current.get(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [selectedLabel]);

  const retry = () => {
    status.artifact.reload();
    fragments.reload();
  };

  if (status.artifact.status === "error") {
    const err = status.artifact.error;
    const missing = err instanceof ApiError && err.status === 404;
    return (
      <section>
        <Link to="/" className="back-link">
          ← Projects
        </Link>
        <h1>Fragment gallery</h1>
        {missing ? (
          <EmptyState
            title="Artifact not found"
            message={`${err.message} It may have been deleted.`}
            action={
              <Link className="btn btn-primary" to="/">
                Back to Projects
              </Link>
            }
          />
        ) : (
          <ErrorState error={err} onRetry={retry} />
        )}
      </section>
    );
  }

  const artifact = status.artifact.status === "success" ? status.artifact.data : null;

  let body;
  if (!artifact || fragments.status === "loading") body = <Loading label="Loading fragments…" />;
  else if (fragments.status === "error") body = <ErrorState error={fragments.error} onRetry={fragments.reload} />;
  else if (fragments.data.length === 0)
    body = (
      <EmptyState
        title="No fragments yet"
        message="This artifact has no fragments. Create a new artifact from the Projects page, or fragment this one again through the API."
        action={
          <Link className="btn btn-primary" to="/">
            Go to Projects
          </Link>
        }
      />
    );
  else
    body = (
      <>
        <div className="gallery-tools">
          <label className="choice-inline">
            <input type="checkbox" checked={sorted} onChange={(e) => setSorted(e.target.checked)} />
            <span>Sorted by label</span>
          </label>
          <label className="choice-inline">
            <input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} />
            <span>Show ground truth</span>
          </label>
        </div>
        <ul className="fragment-grid" aria-label="Fragments">
          {ordered.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="fragment-tile"
                ref={(el) => {
                  if (el) tiles.current.set(f.label, el);
                  else tiles.current.delete(f.label);
                }}
                onClick={() => select(f.label)}
              >
                <img src={f.image_url} alt="" loading="lazy" />
                <span className="tile-label">{f.label}</span>
                <span className="tile-size muted">
                  {f.width} × {f.height}
                </span>
                {showTruth && (
                  <span className="tile-truth muted">
                    <GroundTruth fragment={f} />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {selectedLabel && !selected && (
          <p className="notice" role="status">
            No fragment labelled “{selectedLabel}” in this artifact.
          </p>
        )}
        {selected && <FragmentDialog fragment={selected} showTruth={showTruth} onClose={close} />}
      </>
    );

  return (
    <section>
      <Link to="/" className="back-link">
        ← Projects
      </Link>
      <div className="page-head page-head-split">
        <h1>Fragment gallery</h1>
        {artifact && (
          <div className="artifact-actions">
            <Link className="btn" to={`/artifacts/${id}/graph`}>
              View graph
            </Link>
            <Link className="btn" to={`/artifacts/${id}/reconstruct`}>
              Reconstruct
            </Link>
          </div>
        )}
      </div>
      {artifact && (
        <p className="muted">
          <strong>{artifact.name}</strong> · {artifact.grid_rows} × {artifact.grid_cols} grid ·{" "}
          {artifact.fragment_count} fragments · {artifact.run_count} runs. Scrambled pieces: select one to see its four
          edge strings as colour beads.
        </p>
      )}
      {artifact && (
        <MatchPanel
          artifactId={id}
          stats={status.stats}
          config={status.result?.config ?? artifact.match_config}
          running={status.running}
          error={status.error}
          run={status.run}
        />
      )}
      <div className="demo-body">{body}</div>
    </section>
  );
}
