// Owner: A (Arvind)
// Similarity graph (T25): Cytoscape canvas + threshold / top-k / BFS|DFS controls, stats, traversal player,
// node and edge selection, and an accessible edge table. Loaded lazily (see routes.tsx) so Cytoscape only ships
// with this page.
//
// Selection contract for T26 ("Why matched?"): choosing an edge writes `?why=F03:E:F11:W` to the URL
// (see parseWhy / formatWhy in lib/graphView.ts) and calls `onSelectMatch({a, sideA, b, sideB})` with fragment
// labels and INTEGER sides (0–3), exactly what explainMatch() takes.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { GraphEdge, Traversal } from "../api/types";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import GraphCanvas from "../components/graph/GraphCanvas";
import GraphControls from "../components/graph/GraphControls";
import {
  EdgeTable,
  GraphLegend,
  GraphStats,
  NodePanel,
  OrderList,
  SelectedMatchCard,
  TraversalPanel,
} from "../components/graph/GraphPanels";
import Loading from "../components/Loading";
import { MatchRequired } from "../components/MatchPanel";
import { useDebounced, useGraphData } from "../hooks/useGraphData";
import { isPreconditionFailed } from "../hooks/useMatchStatus";
import {
  GRAPH_DEFAULTS,
  WHY_PARAM,
  formatWhy,
  parseWhy,
  selectionMatches,
  selectionOf,
  suggestedThreshold,
  summarize,
} from "../lib/graphView";
import type { MatchSelection } from "../lib/graphView";

/** Slider changes are applied after this pause, so dragging produces one request, not one per pixel. */
export const DEBOUNCE_MS = 250;

export default function GraphPage({ onSelectMatch }: { onSelectMatch?: (m: MatchSelection) => void }) {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [threshold, setThreshold] = useState<number>(GRAPH_DEFAULTS.threshold);
  const [topK, setTopK] = useState<number | null>(GRAPH_DEFAULTS.topK);
  const [traversal, setTraversal] = useState<Traversal>(GRAPH_DEFAULTS.traversal);
  const [showTruth, setShowTruth] = useState(true);
  const [compare, setCompare] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [rawRevealed, setRawRevealed] = useState(Number.POSITIVE_INFINITY);

  const query = {
    threshold: useDebounced(threshold, DEBOUNCE_MS),
    topK: useDebounced(topK, DEBOUNCE_MS),
  };
  const main = useGraphData(id, { ...query, traversal });
  const other = useGraphData(id, { ...query, traversal: traversal === "bfs" ? "dfs" : "bfs" }, compare);
  const graph = main.data;

  const order = useMemo(() => graph?.traversal.order ?? [], [graph]);
  const revealed = Math.min(rawRevealed, order.length);
  useEffect(() => setRawRevealed(Number.POSITIVE_INFINITY), [graph]);

  const selection = parseWhy(params.get(WHY_PARAM));
  const selectedEdge = graph?.edges.find((e) => selectionMatches(selection, e)) ?? null;

  const selectEdge = useCallback(
    (edge: GraphEdge | null) => {
      const next = new URLSearchParams(params);
      if (edge) {
        const m = selectionOf(edge);
        next.set(WHY_PARAM, formatWhy(m));
        onSelectMatch?.(m);
      } else next.delete(WHY_PARAM);
      setParams(next, { replace: true });
    },
    [params, setParams, onSelectMatch],
  );

  const retry = () => {
    main.reload();
    other.reload();
  };

  let body;
  if (main.error && !graph) {
    body = isPreconditionFailed(main.error) ? (
      <MatchRequired artifactId={id} error={main.error} onMatched={retry} />
    ) : (
      <ErrorState error={main.error} onRetry={retry} />
    );
  } else if (!graph) body = <Loading label="Loading graph…" />;
  else {
    const stats = summarize(graph);
    const empty = graph.edges.length === 0 && graph.nodes.length > 0;
    body = (
      <>
        <GraphControls
          threshold={threshold}
          topK={topK}
          traversal={traversal}
          showTruth={showTruth}
          compare={compare}
          maxTopK={Math.max(1, graph.nodes.length - 1)}
          onThreshold={setThreshold}
          onTopK={setTopK}
          onTraversal={setTraversal}
          onShowTruth={setShowTruth}
          onCompare={setCompare}
        />
        {main.error && <ErrorState error={main.error} onRetry={retry} />}
        <div aria-busy={main.loading} className="graph-main" data-testid="graph-main">
          <div className="graph-status">
            <GraphStats graph={graph} />
            {main.loading && <span className="badge">Updating…</span>}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {main.loading
              ? "Updating graph…"
              : `Graph updated: ${stats.edgesAfter} edges in ${stats.components} components.`}
          </p>
          {empty && (
            <EmptyState
              title="No edges at this threshold"
              message={`Every fragment is isolated (${stats.isolated.join(", ")}). Lower the threshold to see matches.`}
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setThreshold(suggestedThreshold(threshold))}
                >
                  Lower the threshold
                </button>
              }
            />
          )}
          <GraphCanvas
            graph={graph}
            order={order}
            revealed={revealed}
            selectedNode={selectedNode}
            selectedEdgeId={
              selectedEdge
                ? `${selectedEdge.source}:${selectedEdge.side_source}-${selectedEdge.target}:${selectedEdge.side_target}`
                : null
            }
            showTruth={showTruth}
            onSelectNode={setSelectedNode}
            onSelectEdge={selectEdge}
          />
          <GraphLegend graph={graph} showTruth={showTruth} />
        </div>

        <div className="graph-side">
          <TraversalPanel
            method={graph.traversal.method}
            order={order}
            revealed={revealed}
            onRevealed={setRawRevealed}
          />
          {compare && (
            <section className="card" aria-labelledby="compare-heading">
              <h2 id="compare-heading">BFS vs DFS</h2>
              {main.data && other.data ? (
                <div className="compare-grid">
                  {[main.data, other.data]
                    .sort((a, b) => a.traversal.method.localeCompare(b.traversal.method))
                    .map((g) => (
                      <div key={g.traversal.method}>
                        <h3>
                          {g.traversal.method.toUpperCase()} ({g.traversal.edge_visits} edge visits)
                        </h3>
                        <OrderList
                          order={g.traversal.order}
                          revealed={g.traversal.order.length}
                          label={`${g.traversal.method.toUpperCase()} order (compare)`}
                        />
                      </div>
                    ))}
                </div>
              ) : other.error ? (
                <ErrorState error={other.error} onRetry={other.reload} />
              ) : (
                <Loading label="Loading comparison…" />
              )}
            </section>
          )}
          {selectedNode && <NodePanel graph={graph} label={selectedNode} onSelectEdge={selectEdge} />}
          {selectedEdge && <SelectedMatchCard edge={selectedEdge} />}
        </div>
        <EdgeTable graph={graph} selection={selection} onSelect={selectEdge} />
      </>
    );
  }

  return (
    <section>
      <Link to={`/artifacts/${id}/gallery`} className="back-link">
        ← Gallery
      </Link>
      <h1>Similarity graph</h1>
      <p className="muted">
        Fragments are nodes, matched sides are edges. Raise the threshold or tighten top-k to prune edges and watch the
        components split.
      </p>
      <div className="demo-body">{body}</div>
    </section>
  );
}
