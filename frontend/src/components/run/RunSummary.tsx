// Owner: A (Arvind)
// Run summary next to the canvas: scores, accuracies (— when there is no ground truth), timing, operation counters,
// the truncated notice and the solver-specific meta (seed, unplaced, conflicts, nodes, pruned).
import type { RunDetail } from "../../api/types";
import { ALGORITHM_INFO } from "../../lib/solvers";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("en") : v === null || v === undefined ? "—" : String(v);

const META_LABELS: Record<string, string> = {
  seed: "Seed",
  conflicts: "Conflicts",
  unreachable: "Unreachable",
  nodes: "Search nodes",
  pruned: "Branches pruned",
  node_limit: "Node limit",
  incumbent_score: "Incumbent score",
  improved_on_incumbent: "Improved on incumbent",
};

export default function RunSummary({ run }: { run: RunDetail }) {
  const info = ALGORITHM_INFO.find((a) => a.key === run.algorithm);
  const unplaced = Array.isArray(run.meta.unplaced) ? (run.meta.unplaced as string[]) : [];
  const meta = Object.entries(META_LABELS).filter(([k]) => k in run.meta);
  return (
    <section className="card run-summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">{info?.label ?? run.algorithm} · run summary</h2>
      {run.truncated && (
        <div className="state state-warning" role="alert" data-testid="truncated-notice">
          <p className="state-title">Truncated: the node limit was reached</p>
          <p>
            The search stopped early and returned the best layout found so far. It is a valid layout but is{" "}
            <strong>not guaranteed to be optimal</strong>. Raise the node limit to search further.
          </p>
        </div>
      )}
      <dl className="summary-grid">
        <div>
          <dt>Total score</dt>
          <dd>{run.total_score.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Neighbour accuracy</dt>
          <dd>{pct(run.neighbour_accuracy)}</dd>
        </div>
        <div>
          <dt>Direct accuracy</dt>
          <dd>{pct(run.direct_accuracy)}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>{pct(run.coverage)}</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{run.elapsed_ms} ms</dd>
        </div>
        <div>
          <dt>Placed</dt>
          <dd>{run.placements.length}</dd>
        </div>
      </dl>
      <h3>Operations</h3>
      <ul className="plain-list chip-list">
        {Object.entries(run.operations).map(([k, v]) => (
          <li key={k}>
            <code>{k}</code> {num(v)}
          </li>
        ))}
      </ul>
      {meta.length > 0 && (
        <>
          <h3>Solver details</h3>
          <dl className="summary-grid">
            {meta.map(([k, text]) => (
              <div key={k}>
                <dt>{text}</dt>
                <dd>{typeof run.meta[k] === "boolean" ? (run.meta[k] ? "yes" : "no") : num(run.meta[k])}</dd>
              </div>
            ))}
            <div>
              <dt>Unplaced</dt>
              <dd>{unplaced.length ? unplaced.join(", ") : "none"}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
