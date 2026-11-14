// Owner: A (Arvind)
// Lab / benchmark dashboard (T28): all solvers side by side on one artifact, the time-vs-n scaling experiment, and CSV
// export. Loaded lazily by the router (routes.tsx), so Recharts only ships with this page.
import { useSearchParams } from "react-router-dom";
import BenchmarkPanel from "../components/lab/BenchmarkPanel";
import ScalingPanel from "../components/lab/ScalingPanel";
import Tabs from "../components/lab/Tabs";
import type { FixedSize } from "../components/charts/ChartBox";

export const TAB_PARAM = "tab";
const TABS = ["benchmark", "scaling"] as const;

/** `chartSize` is for tests only (jsdom cannot measure a responsive chart). */
export default function LabPage({ chartSize }: { chartSize?: FixedSize }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get(TAB_PARAM);
  const active = TABS.find((t) => t === requested) ?? "benchmark";
  return (
    <section aria-labelledby="lab-heading">
      <h1 id="lab-heading">Lab / benchmark</h1>
      <p className="muted">
        Compare the four reconstruction algorithms, see how they grow with the number of fragments, and download the
        data.
      </p>
      <Tabs
        active={active}
        onChange={(id) => {
          const next = new URLSearchParams(params);
          next.set(TAB_PARAM, id);
          setParams(next, { replace: true });
        }}
        tabs={[
          { id: "benchmark", label: "Benchmark an artifact", content: <BenchmarkPanel chartSize={chartSize} /> },
          { id: "scaling", label: "Scaling: time vs n", content: <ScalingPanel chartSize={chartSize} /> },
        ]}
      />
    </section>
  );
}
