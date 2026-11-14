// Owner: A (Arvind) — placeholder; replaced by T28.
import { listSamples } from "../api/client";
import PlaceholderPage from "./PlaceholderPage";

export default function LabPage() {
  return (
    <PlaceholderPage
      title="Lab / benchmark"
      ticket="T28"
      description="All solvers side by side, the time-vs-n scaling chart and CSV export."
      load={() => listSamples()}
      isEmpty={(s) => s.length === 0}
      summarize={(samples) => <p>{samples.length} sample artifacts available: {samples.map((s) => s.name).join(", ")}</p>}
    />
  );
}
