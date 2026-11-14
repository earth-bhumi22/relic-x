// Owner: A (Arvind)
// Stats bar, legend, traversal panel (order list + step/play), node neighbours, selected-match card, edge table.
import { useEffect, useRef, useState } from "react";
import type { GraphEdge, GraphOut, Traversal } from "../../api/types";
import {
  COMPONENT_PALETTE,
  componentColor,
  edgeId,
  neighboursOf,
  selectionMatches,
  selectionOf,
  summarize,
  tableEdges,
  truthLabel,
} from "../../lib/graphView";
import type { MatchSelection, SortDir } from "../../lib/graphView";

export function GraphStats({ graph }: { graph: GraphOut }) {
  const s = summarize(graph);
  const rows: [string, string][] = [
    ["Nodes", String(s.nodes)],
    ["Edges", `${s.edgesBefore} → ${s.edgesAfter}`],
    ["Components", String(s.components)],
    ["Largest component", String(s.largest)],
    [`${graph.traversal.method.toUpperCase()} edge visits`, String(s.edgeVisits)],
  ];
  return (
    <dl className="artifact-facts graph-stats" aria-label="Graph statistics">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GraphLegend({ graph, showTruth }: { graph: GraphOut; showTruth: boolean }) {
  return (
    <div className="graph-legend" aria-label="Legend">
      <ul className="legend-list" aria-label="Components">
        {graph.components.slice(0, COMPONENT_PALETTE.length).map((c, i) => (
          <li key={i}>
            <span className="legend-swatch" style={{ backgroundColor: componentColor(i) }} aria-hidden="true" />
            Component {i + 1} ({c.length})
          </li>
        ))}
        {graph.components.length > COMPONENT_PALETTE.length && (
          <li className="muted">+ {graph.components.length - COMPONENT_PALETTE.length} more (colours repeat)</li>
        )}
      </ul>
      <p className="muted legend-note">Edge width and opacity grow with weight.</p>
      {showTruth && (
        <ul className="legend-list" aria-label="Edge ground truth">
          <li>
            <span className="legend-line legend-true" aria-hidden="true" /> true neighbours
          </li>
          <li>
            <span className="legend-line legend-false" aria-hidden="true" /> not neighbours
          </li>
          <li>
            <span className="legend-line legend-unknown" aria-hidden="true" /> unknown (no ground truth)
          </li>
        </ul>
      )}
    </div>
  );
}

/** Reduced motion: no animated play, the final state is shown at once. */
export const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

export function TraversalPanel({
  method,
  order,
  revealed,
  onRevealed,
  stepMs = 600,
}: {
  method: Traversal;
  order: readonly string[];
  revealed: number;
  onRevealed: (n: number) => void;
  stepMs?: number;
}) {
  const [playing, setPlaying] = useState(false);
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = Math.min(revealedRef.current + 1, order.length);
      revealedRef.current = next; // do not wait for a re-render: ticks can outpace React's batching
      onRevealed(next);
      if (next >= order.length) setPlaying(false);
    }, stepMs);
    return () => clearInterval(t);
  }, [playing, order.length, onRevealed, stepMs]);

  const play = () => {
    if (prefersReducedMotion()) {
      onRevealed(order.length);
      return;
    }
    if (revealed >= order.length) onRevealed(0);
    setPlaying(true);
  };

  return (
    <section className="card traversal-panel" aria-labelledby="trav-heading">
      <h2 id="trav-heading">{method.toUpperCase()} visit order</h2>
      <div className="traversal-actions">
        <button type="button" className="btn" onClick={() => onRevealed(Math.min(revealed + 1, order.length))}>
          Step
        </button>
        {playing ? (
          <button type="button" className="btn" onClick={() => setPlaying(false)}>
            Pause
          </button>
        ) : (
          <button type="button" className="btn" onClick={play}>
            Play
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPlaying(false);
            onRevealed(order.length);
          }}
        >
          Show all
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPlaying(false);
            onRevealed(0);
          }}
        >
          Reset
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {revealed > 0 && revealed <= order.length
          ? `Visited ${order[revealed - 1]}, ${revealed} of ${order.length}`
          : ""}
      </p>
      <OrderList order={order} revealed={revealed} label={`${method.toUpperCase()} order`} />
    </section>
  );
}

export function OrderList({ order, revealed, label }: { order: readonly string[]; revealed: number; label: string }) {
  return (
    <ol className="order-list" aria-label={label}>
      {order.map((l, i) => (
        <li
          key={l}
          className={i < revealed ? "visited" : "unvisited"}
          aria-current={i === revealed - 1 ? "step" : undefined}
        >
          {l}
        </li>
      ))}
    </ol>
  );
}

export function NodePanel({
  graph,
  label,
  onSelectEdge,
}: {
  graph: GraphOut;
  label: string;
  onSelectEdge: (e: GraphEdge) => void;
}) {
  const node = graph.nodes.find((n) => n.id === label);
  const list = neighboursOf(graph, label);
  return (
    <section className="card" aria-labelledby="node-heading">
      <h2 id="node-heading">Fragment {label}</h2>
      {node && <p className="muted">Component {node.component + 1}</p>}
      {list.length === 0 ? (
        <p className="muted">No neighbours at this threshold.</p>
      ) : (
        <ul className="plain-list" aria-label={`Neighbours of ${label}`}>
          {list.map((n) => (
            <li key={edgeId(n.edge)}>
              <button type="button" className="btn-link" onClick={() => onSelectEdge(n.edge)}>
                {n.label}
              </button>{" "}
              · weight {n.weight.toFixed(2)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SelectedMatchCard({ edge }: { edge: GraphEdge }) {
  const s = selectionOf(edge);
  return (
    <section className="card" aria-labelledby="match-card-heading">
      <h2 id="match-card-heading">
        {s.a} {edge.side_source} ↔ {s.b} {edge.side_target}
      </h2>
      <p>
        Weight <strong>{edge.weight.toFixed(3)}</strong> · {truthLabel(edge.true_neighbours)}
      </p>
      <button type="button" className="btn" disabled title="Available with the “Why matched?” drawer (T26)">
        Why matched?
      </button>
    </section>
  );
}

export function EdgeTable({
  graph,
  selection,
  onSelect,
}: {
  graph: GraphOut;
  selection: MatchSelection | null;
  onSelect: (e: GraphEdge) => void;
}) {
  const [sort, setSort] = useState<SortDir>("desc");
  const [node, setNode] = useState("");
  const rows = tableEdges(graph, { node, sort });
  return (
    <section className="card edge-table" aria-labelledby="edges-heading">
      <h2 id="edges-heading">Edges</h2>
      <div className="field">
        <label htmlFor="edge-filter">Filter by fragment</label>
        <input
          id="edge-filter"
          type="text"
          value={node}
          placeholder="e.g. F07"
          onChange={(e) => setNode(e.target.value)}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {rows.length} edge{rows.length === 1 ? "" : "s"} listed
      </p>
      {rows.length === 0 ? (
        <p className="muted">No edges to list.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Edges between fragments; select a row to choose that match</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col" aria-sort={sort === "desc" ? "descending" : "ascending"}>
                  <button type="button" className="btn-link" onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
                    Weight {sort === "desc" ? "▼" : "▲"}
                  </button>
                </th>
                <th scope="col">Ground truth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const chosen = selectionMatches(selection, e);
                return (
                  <tr key={edgeId(e)} className={chosen ? "selected-row" : undefined}>
                    <td>
                      <button
                        type="button"
                        className="btn-link"
                        aria-pressed={chosen}
                        aria-label={`Select ${e.source} ${e.side_source} to ${e.target} ${e.side_target}, weight ${e.weight.toFixed(2)}`}
                        onClick={() => onSelect(e)}
                      >
                        {e.source} {e.side_source}
                      </button>
                    </td>
                    <td>
                      {e.target} {e.side_target}
                    </td>
                    <td>{e.weight.toFixed(2)}</td>
                    <td>{e.true_neighbours === null ? "—" : e.true_neighbours ? "yes" : "no"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
