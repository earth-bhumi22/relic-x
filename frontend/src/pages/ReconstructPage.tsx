// Owner: A (Arvind) — placeholder; replaced by T27.
import { useParams } from "react-router-dom";
import { listRuns } from "../api/client";
import PlaceholderPage from "./PlaceholderPage";

export default function ReconstructPage() {
  const { id = "" } = useParams();
  return (
    <PlaceholderPage
      title="Reconstruction canvas"
      ticket="T27"
      description="Algorithm picker, animated placement, confidence rings and the step-by-step trace player."
      load={() => listRuns(id)}
      deps={[id]}
      isEmpty={(r) => r.length === 0}
      summarize={(runs) => (
        <ul className="plain-list">
          {runs.map((r) => (
            <li key={r.id}>
              {r.algorithm} · direct accuracy {r.direct_accuracy ?? "n/a"} · {r.elapsed_ms} ms
            </li>
          ))}
        </ul>
      )}
    />
  );
}
