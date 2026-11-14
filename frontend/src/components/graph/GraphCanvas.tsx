// Owner: A (Arvind)
// Thin Cytoscape adapter: everything that touches the library lives here, so the page logic can be tested against a
// stub of this component (jsdom has no canvas). `headless` runs Cytoscape without a renderer (used by tests).
//
// Styling: node colour = component (palette in lib/graphView.ts); edge width/opacity = weight; edge colour =
// `true_neighbours` (success / danger / muted, from the CSS tokens). Tokens are re-read when the theme changes.
// Layout: `cose` with randomize:false from a deterministic starting ring, re-run only when the topology changes.
import cytoscape from "cytoscape";
import type { Core, ElementDefinition, StylesheetJson } from "cytoscape";
import { useEffect, useRef } from "react";
import type { GraphEdge, GraphOut } from "../../api/types";
import { COMPONENT_PALETTE, componentColor, edgeId, topologyKey } from "../../lib/graphView";
import { useTheme } from "../../theme";

export interface GraphCanvasProps {
  graph: GraphOut;
  /** Visit order of the chosen traversal and how many entries are revealed (step/play). */
  order: readonly string[];
  revealed: number;
  selectedNode: string | null;
  selectedEdgeId: string | null;
  showTruth: boolean;
  onSelectNode: (label: string | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
  /** Run Cytoscape without a renderer. Defaults to true under Vitest, where jsdom has no canvas to draw on. */
  headless?: boolean;
  /** Receives the Cytoscape instance once created (tests, debugging). */
  onReady?: (cy: Core) => void;
}

interface Tokens {
  text: string;
  muted: string;
  surface: string;
  accent: string;
  success: string;
  danger: string;
}
function readTokens(): Tokens {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: get("--text", "#1b2030"),
    muted: get("--muted", "#5b6475"),
    surface: get("--surface", "#ffffff"),
    accent: get("--accent", "#3b5bdb"),
    success: get("--success", "#1f8a4c"),
    danger: get("--danger", "#c92a2a"),
  };
}

function buildStyle(t: Tokens): StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        label: "data(display)",
        color: t.text,
        "font-size": 10,
        "text-valign": "bottom",
        "text-margin-y": 3,
        "text-outline-color": t.surface,
        "text-outline-width": 2,
        width: 22,
        height: 22,
        "border-width": 2,
        "border-color": t.surface,
      },
    },
    {
      selector: "edge",
      style: {
        width: "data(width)",
        opacity: "data(opacity)" as unknown as number,
        "line-color": t.muted,
        "curve-style": "bezier",
      },
    },
    { selector: "edge.truth-true", style: { "line-color": t.success } },
    { selector: "edge.truth-false", style: { "line-color": t.danger } },
    { selector: "node.pending", style: { opacity: 0.3 } },
    { selector: "node.current", style: { "border-color": t.accent, "border-width": 4, width: 28, height: 28 } },
    { selector: "node.selected", style: { "border-color": t.accent, "border-width": 4 } },
    { selector: "edge.incident", style: { opacity: 1, "overlay-color": t.accent, "overlay-opacity": 0.15 } },
    { selector: "edge.selected", style: { opacity: 1, width: 7, "overlay-color": t.accent, "overlay-opacity": 0.25 } },
  ];
}

function elementsOf(g: GraphOut): ElementDefinition[] {
  const nodes: ElementDefinition[] = g.nodes.map((n, i) => ({
    group: "nodes",
    data: { id: n.id, label: n.id, display: n.id, component: n.component, color: componentColor(n.component) },
    // Deterministic start: one ring per component, so `cose` (randomize:false) always gives the same picture.
    position: ringPosition(n.component, i, g.nodes.length),
  }));
  const edges: ElementDefinition[] = g.edges.map((e) => ({
    group: "edges",
    data: {
      id: edgeId(e),
      source: e.source,
      target: e.target,
      weight: e.weight,
      width: 1 + 5 * e.weight,
      opacity: 0.25 + 0.7 * e.weight,
    },
    classes: e.true_neighbours === null ? "truth-unknown" : e.true_neighbours ? "truth-true" : "truth-false",
  }));
  return [...nodes, ...edges];
}

function ringPosition(component: number, index: number, total: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(COMPONENT_PALETTE.length)));
  const cx = (component % cols) * 220;
  const cy = Math.floor(component / cols) * 220;
  const angle = (2 * Math.PI * index) / Math.max(1, total);
  return { x: cx + 80 * Math.cos(angle), y: cy + 80 * Math.sin(angle) };
}

export default function GraphCanvas({
  graph,
  order,
  revealed,
  selectedNode,
  selectedEdgeId,
  showTruth,
  onSelectNode,
  onSelectEdge,
  headless = import.meta.env.MODE === "test",
  onReady,
}: GraphCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const topology = useRef("");
  const { theme } = useTheme();
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const handlers = useRef({ onSelectNode, onSelectEdge, edges: graph.edges });
  handlers.current = { onSelectNode, onSelectEdge, edges: graph.edges };

  // Create once, destroy on unmount (no leaked instance, listeners or renderer).
  useEffect(() => {
    const cy = cytoscape({
      container: headless ? undefined : host.current,
      headless,
      style: buildStyle(readTokens()),
      elements: [],
      userZoomingEnabled: true,
      minZoom: 0.2,
      maxZoom: 3,
      boxSelectionEnabled: false,
    });
    cy.on("tap", "node", (e) => handlers.current.onSelectNode(e.target.id()));
    cy.on("tap", "edge", (e) => {
      const found = handlers.current.edges.find((x) => edgeId(x) === e.target.id());
      if (found) handlers.current.onSelectEdge(found);
    });
    // Native tooltip (title attribute) naming the component, so the colour is never the only cue.
    cy.on("mouseover", "node", (e) => {
      if (host.current)
        host.current.title = `${e.target.id()} · component ${(e.target.data("component") as number) + 1}`;
    });
    cy.on("mouseout", "node", () => {
      if (host.current) host.current.removeAttribute("title");
    });
    cy.on("tap", (e) => {
      if (e.target === cy) {
        handlers.current.onSelectNode(null);
        handlers.current.onSelectEdge(null);
      }
    });
    cyRef.current = cy;
    topology.current = "";
    onReadyRef.current?.(cy);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [headless]);

  // Theme change: restyle from the new tokens.
  useEffect(() => {
    cyRef.current?.style(buildStyle(readTokens()));
  }, [theme]);

  // Data: replace elements and re-run the layout only when the topology changed; otherwise update in place.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const key = topologyKey(graph);
    if (key !== topology.current) {
      topology.current = key;
      cy.batch(() => {
        cy.elements().remove();
        cy.add(elementsOf(graph));
      });
      if (graph.nodes.length > 0)
        cy.layout({ name: "cose", randomize: false, animate: false, fit: true, padding: 24, numIter: 400 }).run();
    } else {
      cy.batch(() => {
        for (const n of graph.nodes) {
          const node = cy.getElementById(n.id);
          node.data({ component: n.component, color: componentColor(n.component) });
        }
      });
    }
  }, [graph]);

  // View state: traversal numbers, current node, selection, truth colouring.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const position = new Map(order.map((label, i) => [label, i]));
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const i = position.get(n.id());
        const shown = i !== undefined && i < revealed;
        n.data("display", shown ? `${n.id()} · ${i + 1}` : n.id());
        n.toggleClass("pending", revealed < order.length && !shown);
        n.toggleClass("current", revealed > 0 && revealed < order.length + 1 && order[revealed - 1] === n.id());
        n.toggleClass("selected", selectedNode === n.id());
      });
      cy.edges().forEach((e) => {
        e.toggleClass("selected", selectedEdgeId === e.id());
        e.toggleClass(
          "incident",
          selectedNode !== null && (e.source().id() === selectedNode || e.target().id() === selectedNode),
        );
        if (!showTruth) e.removeClass("truth-true truth-false truth-unknown");
        else {
          const found = handlers.current.edges.find((x) => edgeId(x) === e.id());
          const t = found?.true_neighbours;
          e.removeClass("truth-true truth-false truth-unknown");
          e.addClass(t === null || t === undefined ? "truth-unknown" : t ? "truth-true" : "truth-false");
        }
      });
    });
  }, [graph, order, revealed, selectedNode, selectedEdgeId, showTruth]);

  const comps = graph.components.length;
  return (
    <div
      ref={host}
      className="graph-canvas"
      role="img"
      aria-label={`Similarity graph: ${graph.nodes.length} fragments, ${graph.edges.length} edges, ${comps} connected component${comps === 1 ? "" : "s"}. The edge table below is the keyboard and screen-reader equivalent.`}
      data-testid="graph-canvas"
    />
  );
}
