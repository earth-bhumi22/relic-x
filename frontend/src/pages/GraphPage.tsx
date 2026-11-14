// Owner: A (Arvind) — placeholder; replaced by T25.
import { useParams } from "react-router-dom";
import { getGraph } from "../api/client";
import PlaceholderPage from "./PlaceholderPage";

export default function GraphPage() {
  const { id = "" } = useParams();
  return (
    <PlaceholderPage
      title="Similarity graph"
      ticket="T25"
      description="Nodes and weighted edges with threshold / top-k sliders and BFS vs. DFS colouring."
      load={() => getGraph(id)}
      deps={[id]}
      isEmpty={(g) => g.nodes.length === 0}
      summarize={(g) => (
        <p>
          {g.nodes.length} nodes · {g.edges.length} edges · {g.components.length} components
        </p>
      )}
    />
  );
}
