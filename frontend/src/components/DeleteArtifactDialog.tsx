// Owner: A (Arvind)
// Confirmation dialog for deleting an artifact (an accessible dialog, not window.confirm). Shows progress while the
// request runs and the API error (code + message) on failure; the card stays in the list until success.
import { useRef, useState } from "react";
import { ApiError, deleteArtifact } from "../api/client";
import type { ArtifactOut } from "../api/types";
import Modal from "./Modal";

interface Props {
  artifact: ArtifactOut;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export default function DeleteArtifactDialog({ artifact, onClose, onDeleted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef(false);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await deleteArtifact(artifact.id);
      onDeleted(artifact.id);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <Modal title={`Delete “${artifact.name}”?`} onClose={onClose} busy={busy}>
      <p>
        This permanently removes the artifact with its {artifact.fragment_count} fragments, matches and{" "}
        {artifact.run_count} run{artifact.run_count === 1 ? "" : "s"}. This cannot be undone.
      </p>
      <div role="status" aria-live="polite">
        {busy && <p className="muted">Deleting…</p>}
      </div>
      {error && (
        <div className="form-error" role="alert">
          <strong>{error instanceof ApiError ? error.code : "client_error"}</strong> {error.message}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
