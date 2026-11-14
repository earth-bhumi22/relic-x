// Owner: A (Arvind)
// One artifact on the Projects page: thumbnail (with a fallback), facts, and the Open / Delete actions.
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ArtifactOut } from "../api/types";
import { formatDate, formatPercent } from "../lib/artifactForm";

interface Props {
  artifact: ArtifactOut;
  onDelete: (artifact: ArtifactOut) => void;
}

const KIND_LABEL: Record<string, string> = { sample: "sample", upload: "upload", fragments: "fragments" };

export default function ArtifactCard({ artifact: a, onDelete }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <article className="card artifact-card" aria-labelledby={`artifact-${a.id}-name`}>
      <div className="artifact-thumb">
        {a.image_url && !imgFailed ? (
          <img src={a.image_url} alt={`${a.name} thumbnail`} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="artifact-thumb-fallback" role="img" aria-label={`No preview available for ${a.name}`}>
            No preview
          </div>
        )}
      </div>
      <div className="artifact-body">
        <h2 id={`artifact-${a.id}-name`} className="artifact-name">
          {a.name}
        </h2>
        <p className="artifact-desc muted">{a.description || "No description"}</p>
        <div className="artifact-badges">
          <span className="badge" data-testid="source-kind">
            {KIND_LABEL[a.source_kind] ?? a.source_kind}
          </span>
          <span className={a.has_ground_truth ? "badge badge-ok" : "badge"}>
            {a.has_ground_truth ? "Ground truth" : "No ground truth"}
          </span>
        </div>
        <dl className="artifact-facts">
          <div>
            <dt>Grid</dt>
            <dd>
              {a.grid_rows} × {a.grid_cols}
            </dd>
          </div>
          <div>
            <dt>Fragments</dt>
            <dd>{a.fragment_count}</dd>
          </div>
          <div>
            <dt>Runs</dt>
            <dd>{a.run_count}</dd>
          </div>
          <div>
            <dt>Best accuracy</dt>
            <dd>{formatPercent(a.best_accuracy)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={a.created_at}>{formatDate(a.created_at)}</time>
            </dd>
          </div>
        </dl>
        <div className="artifact-actions">
          <Link className="btn btn-primary" to={`/artifacts/${a.id}/gallery`} aria-label={`Open ${a.name}`}>
            Open
          </Link>
          <button type="button" className="btn btn-danger" aria-label={`Delete ${a.name}`} onClick={() => onDelete(a)}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
