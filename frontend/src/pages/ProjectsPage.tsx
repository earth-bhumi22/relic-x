// Owner: A (Arvind)
// Projects page: artifact cards, delete with confirmation, and the create-artifact wizard.
// Pattern for T24–T28: useAsync + Loading / EmptyState / ErrorState, API calls only through api/client.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listArtifacts } from "../api/client";
import type { ArtifactOut } from "../api/types";
import ArtifactCard from "../components/ArtifactCard";
import ArtifactWizard from "../components/ArtifactWizard";
import DeleteArtifactDialog from "../components/DeleteArtifactDialog";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import Loading from "../components/Loading";
import { useAsync } from "../hooks/useAsync";

/** Explicit page size passed to GET /artifacts (the API allows up to 200). "Load more" fetches the next page. */
export const PAGE_SIZE = 24;

const newestFirst = (a: ArtifactOut, b: ArtifactOut) => b.created_at.localeCompare(a.created_at);

export default function ProjectsPage() {
  const navigate = useNavigate();
  const first = useAsync(() => listArtifacts({ limit: PAGE_SIZE, offset: 0 }), []);
  const [more, setMore] = useState<ArtifactOut[]>([]);
  const [lastPageFull, setLastPageFull] = useState<boolean | null>(null); // null = use the first page's size
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<Error | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ArtifactOut | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);

  const retry = () => {
    setMore([]);
    setLastPageFull(null);
    setMoreError(null);
    setRemoved(new Set());
    first.reload();
  };

  const loaded = first.status === "success" ? [...first.data, ...more] : [];
  const items = loaded.filter((a) => !removed.has(a.id)).sort(newestFirst);
  const hasMore = lastPageFull ?? (first.status === "success" && first.data.length === PAGE_SIZE);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      // Deleted items shift the server-side offset down by the number we removed.
      const page = await listArtifacts({ limit: PAGE_SIZE, offset: loaded.length - removed.size });
      setMore((m) => [...m, ...page.filter((p) => !loaded.some((l) => l.id === p.id))]);
      setLastPageFull(page.length === PAGE_SIZE);
    } catch (e) {
      setMoreError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingMore(false);
    }
  };

  const openWizard = () => setWizardOpen(true);

  let body;
  if (first.status === "loading") body = <Loading label="Loading artifacts…" />;
  else if (first.status === "error") body = <ErrorState error={first.error} onRetry={retry} />;
  else if (items.length === 0 && !hasMore)
    body = (
      <EmptyState
        title="No artifacts yet"
        message="An artifact is a picture cut into fragments, ready to be matched and reassembled."
        action={
          <button type="button" className="btn btn-primary" onClick={openWizard}>
            Create your first artifact
          </button>
        }
      />
    );
  else
    body = (
      <>
        <div className="artifact-grid">
          {items.map((a) => (
            <ArtifactCard key={a.id} artifact={a} onDelete={setToDelete} />
          ))}
        </div>
        {moreError && <ErrorState error={moreError} onRetry={loadMore} />}
        {hasMore && (
          <div className="load-more">
            <button type="button" className="btn" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </>
    );

  return (
    <section>
      <div className="page-head page-head-split">
        <h1>Projects</h1>
        <button ref={newButton} type="button" className="btn btn-primary" onClick={openWizard}>
          New artifact
        </button>
      </div>
      <p className="muted">Each artifact is a set of fragments you can inspect, match and reassemble.</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="demo-body">{body}</div>

      {wizardOpen && (
        <ArtifactWizard
          onClose={() => setWizardOpen(false)}
          onCreated={(a) => {
            setWizardOpen(false);
            navigate(`/artifacts/${a.id}/gallery`);
          }}
        />
      )}
      {toDelete && (
        <DeleteArtifactDialog
          artifact={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={(id) => {
            setRemoved((r) => new Set(r).add(id));
            setNotice(`Deleted “${toDelete.name}”.`);
            setToDelete(null);
            // The Delete button that opened the dialog is gone; park focus on a stable control.
            queueMicrotask(() => newButton.current?.focus());
          }}
        />
      )}
    </section>
  );
}
