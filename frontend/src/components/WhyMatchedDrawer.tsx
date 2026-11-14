// Owner: A (Arvind)
// "Why matched?" drawer (T26). NOT a route: a side panel any page can mount with only `artifactId` + `match`.
//
//   <WhyMatchedDrawer artifactId={id} match={{ a: "F03", sideA: 1, b: "F11", sideB: 3 }} onClose={...} />
//
// `a` / `b` are fragment *labels*; sides are the integers 0–3 the /explain query takes (the response answers with
// letters, which is what the header shows, so a disagreement would be visible). `match = null` renders nothing.
// Data: GET /explain through useAsync, re-fetched when the match changes (a stale response is ignored).
// States: loading skeleton, 409 (matching prompt), 404 (which thing is missing), 422, generic error with retry.
// Built on <Modal>: role="dialog", focus in / trapped / back to the opener, Esc and backdrop close, scroll locked.
import { explainMatch } from "../api/client";
import { ApiError } from "../api/errors";
import { sideIndexToLetter } from "../api/sides";
import type { Explanation } from "../api/types";
import { useAsync } from "../hooks/useAsync";
import { isPreconditionFailed } from "../hooks/useMatchStatus";
import { truthLabel } from "../lib/graphView";
import type { MatchSelection } from "../lib/graphView";
import ErrorState from "./ErrorState";
import { MatchRequired } from "./MatchPanel";
import Modal from "./Modal";
import ScoreBar from "./why/ScoreBar";
import SignalSections from "./why/SignalSections";
import StripPair from "./why/StripPair";
import WhyBoundary from "./why/WhyBoundary";

export interface WhyMatchedDrawerProps {
  artifactId: string;
  match: MatchSelection | null;
  onClose: () => void;
}

function Skeleton() {
  return (
    <div className="why-skeleton" role="status" aria-live="polite" aria-label="Loading explanation">
      <span className="sr-only">Loading explanation…</span>
      <div />
      <div />
      <div />
    </div>
  );
}

function Failure({ error, artifactId, retry }: { error: Error; artifactId: string; retry: () => void }) {
  if (isPreconditionFailed(error)) return <MatchRequired artifactId={artifactId} error={error} onMatched={retry} />;
  if (error instanceof ApiError && error.code === "not_found")
    return (
      <div className="state state-error" role="alert">
        <p className="state-title">Not found</p>
        <p>{error.message}</p>
        <p className="muted">The fragment label or the artifact does not exist (any more).</p>
        <button type="button" className="btn" onClick={retry}>
          Retry
        </button>
      </div>
    );
  if (error instanceof ApiError && error.code === "validation_error")
    return (
      <div className="state state-error" role="alert">
        <p className="state-title">That match cannot be explained</p>
        <p>The request was rejected as invalid ({error.message}). Sides must be 0–3 (N, E, S, W).</p>
      </div>
    );
  return <ErrorState error={error} onRetry={retry} />;
}

const truthClass = (v: boolean | null) => (v === null ? "truth-unknown" : v ? "truth-true" : "truth-false");

function Evidence({ x }: { x: Explanation }) {
  const labels = { a: x.a, b: x.b, sideA: x.side_a, sideB: x.side_b };
  return (
    <WhyBoundary>
      <header className="why-header">
        <p className="why-sides" data-testid="why-sides">
          {x.a} · {x.side_a} <span aria-label="matched with">↔</span> {x.b} · {x.side_b}
        </p>
        <p className="why-composite">
          <span className="why-score" aria-label={`Composite score ${x.composite.toFixed(4)}`}>
            {x.composite.toFixed(4)}
          </span>
          <span className="muted"> composite (0–1)</span>
        </p>
        <p>
          <span className={`badge ${truthClass(x.ground_truth_neighbours)}`}>
            {truthLabel(x.ground_truth_neighbours)}
          </span>
        </p>
      </header>

      <section className="why-section" aria-labelledby="why-edges-heading">
        <h3 id="why-edges-heading">The two edges, side by side</h3>
        <StripPair
          edgeA={x.edge_a}
          edgeBReversed={x.edge_b_reversed}
          labelA={`${x.a} ${x.side_a} edge`}
          labelB={`${x.b} ${x.side_b} edge`}
          sideA={x.side_a}
          sideB={x.side_b}
          showSymbols
        />
        <p className="muted">
          Edge B is shown <strong>reversed</strong>: every edge string is read clockwise, so two sides that touch run in
          opposite directions and must be compared against each other backwards.
        </p>
      </section>

      <ScoreBar x={x} />
      <SignalSections x={x} labels={labels} />
    </WhyBoundary>
  );
}

function Content({ artifactId, match }: { artifactId: string; match: MatchSelection }) {
  const { a, sideA, b, sideB } = match;
  const state = useAsync(() => explainMatch(artifactId, { a, sideA, b, sideB }), [artifactId, a, sideA, b, sideB]);
  const announce =
    state.status === "loading"
      ? "Loading explanation…"
      : state.status === "error"
        ? "The explanation could not be loaded."
        : `Explanation loaded. Composite score ${state.data.composite.toFixed(4)}.`;
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && <Failure error={state.error} artifactId={artifactId} retry={state.reload} />}
      {state.status === "success" && <Evidence x={state.data} />}
    </>
  );
}

export default function WhyMatchedDrawer({ artifactId, match, onClose }: WhyMatchedDrawerProps) {
  if (!match) return null;
  const title = `Why matched? ${match.a} · ${sideIndexToLetter(match.sideA)} ↔ ${match.b} · ${sideIndexToLetter(match.sideB)}`;
  return (
    <Modal title={title} onClose={onClose} className="drawer" backdropClassName="drawer-backdrop">
      <button type="button" className="btn drawer-close" data-autofocus onClick={onClose}>
        Close
      </button>
      <Content artifactId={artifactId} match={match} />
    </Modal>
  );
}
