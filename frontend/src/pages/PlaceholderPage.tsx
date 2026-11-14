// Owner: A (Arvind)
// Shared placeholder for pages that later issues (T23–T28) replace. It demonstrates the three
// states every page must handle — loading, empty, error — plus a "live" mode that calls the API
// (real or mock) so the data path is exercised too. Pages replace this file's usage, not the states.
import { useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../api/errors";
import { useAsync } from "../hooks/useAsync";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import Loading from "../components/Loading";

type Mode = "live" | "loading" | "empty" | "error";
const MODES: { id: Mode; label: string }[] = [
  { id: "live", label: "Live data" },
  { id: "loading", label: "Loading" },
  { id: "empty", label: "Empty" },
  { id: "error", label: "Error" },
];

interface Props<T> {
  title: string;
  ticket: string;
  description: string;
  /** Loads the page's real data (works in mock mode too). */
  load: () => Promise<T>;
  deps?: readonly unknown[];
  isEmpty: (data: T) => boolean;
  summarize: (data: T) => ReactNode;
}

export default function PlaceholderPage<T>({ title, ticket, description, load, deps = [], isEmpty, summarize }: Props<T>) {
  const [mode, setMode] = useState<Mode>("live");
  const live = useAsync(load, deps);
  const forcedError = new ApiError(404, "not_found", "Demo error: this is how a 404 from the API looks.");

  let body: ReactNode;
  if (mode === "loading") body = <Loading />;
  else if (mode === "empty") body = <EmptyState title="Nothing here yet" message="This is the empty state." />;
  else if (mode === "error") body = <ErrorState error={forcedError} onRetry={() => setMode("live")} />;
  else if (live.status === "loading") body = <Loading />;
  else if (live.status === "error") body = <ErrorState error={live.error} onRetry={live.reload} />;
  else if (isEmpty(live.data)) body = <EmptyState title="Nothing here yet" message="The API returned no data." />;
  else body = <div className="card">{summarize(live.data)}</div>;

  return (
    <section>
      <div className="page-head">
        <h1>{title}</h1>
        <span className="badge">Placeholder · {ticket}</span>
      </div>
      <p className="muted">{description}</p>
      <div className="seg" role="group" aria-label="State demo">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? "seg-btn active" : "seg-btn"} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="demo-body">{body}</div>
    </section>
  );
}
