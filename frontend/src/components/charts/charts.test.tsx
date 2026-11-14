// Owner: A (Arvind)
// Chart render tests at a FIXED size (jsdom cannot measure a responsive container): structure, text alternative,
// truncation marking, gaps and the error boundary. No pixel assertions.
import { render, screen, within } from "@testing-library/react";
import type { RunDetail, ScalingOut } from "../../api/types";
import { benchmarkRows } from "../../lib/labData";
import real from "../../test/lab-real.json";
import { ThemeProvider } from "../../theme";
import BenchBars, { TRUNCATED_NOTE } from "./BenchBars";
import ScalingLines from "./ScalingLines";

const SIZE = { width: 600, height: 300 };
const runs = real.benchmark as unknown as RunDetail[];
const scaling = real.scaling as unknown as ScalingOut;
const withTheme = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error");
  warnSpy = vi.spyOn(console, "warn");
});
afterEach(() => {
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
});

describe("BenchBars", () => {
  it("renders a figure with a title, an accessible legend and a collapsed data table", () => {
    const rows = benchmarkRows(runs);
    render(withTheme(<BenchBars title="Time" rows={rows} measures={["elapsed_ms"]} fixedSize={SIZE} />));
    const figure = screen.getByRole("figure", { name: /Time/ });
    expect(within(figure).getAllByText("Greedy", { exact: false }).length).toBeGreaterThan(0);
    expect(within(figure).getByText(/Data table for/)).toBeInTheDocument(); // the collapsed text alternative
    expect(within(figure).getAllByRole("row", { hidden: true }).length).toBeGreaterThan(1);
  });

  it("marks a truncated run with an asterisk and states the reason in words", () => {
    const rows = benchmarkRows(runs).map((r) => (r.algorithm === "backtracking" ? { ...r, truncated: true } : r));
    render(withTheme(<BenchBars title="Time" rows={rows} measures={["elapsed_ms"]} fixedSize={SIZE} />));
    expect(screen.getAllByText(/B&B\*/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(new RegExp(TRUNCATED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length,
    ).toBeGreaterThan(0);
  });

  it("shows — for a missing value in the table instead of 0", () => {
    const rows = benchmarkRows(runs).map((r) => ({ ...r, direct_accuracy: null }));
    render(
      withTheme(
        <BenchBars
          title="Accuracy"
          rows={rows}
          measures={["direct_accuracy"]}
          format={(v) => `${v}`}
          fixedSize={SIZE}
        />,
      ),
    );
    expect(screen.getAllByText("—", { exact: true }).length).toBeGreaterThan(0);
  });

  it("log scale does not crash on a zero", () => {
    const rows = benchmarkRows(runs).map((r, i) => (i === 0 ? { ...r, operations: 0 } : r));
    render(withTheme(<BenchBars title="Ops" rows={rows} measures={["operations"]} logY fixedSize={SIZE} />));
    expect(screen.getByRole("figure", { name: /Ops/ })).toBeInTheDocument();
  });
});

describe("ScalingLines", () => {
  const props = { points: scaling.points, algorithms: ["greedy", "best_first", "dijkstra", "backtracking"] as const };

  it("renders a titled figure and a data table with one row per n", () => {
    render(
      withTheme(
        <ScalingLines
          title="Time vs n"
          {...props}
          algorithms={[...props.algorithms]}
          measure="elapsed_ms"
          fixedSize={SIZE}
        />,
      ),
    );
    const figure = screen.getByRole("figure", { name: /Time vs n/ });
    const rows = within(figure).getAllByRole("row", { hidden: true });
    expect(rows).toHaveLength(1 + scaling.points.length);
  });

  it("leaves a gap ('—'), not a zero, where an algorithm has no run", () => {
    const points = structuredClone(scaling.points);
    delete points[1].runs.dijkstra;
    render(
      withTheme(
        <ScalingLines
          title="Time vs n"
          points={points}
          algorithms={["dijkstra"]}
          measure="elapsed_ms"
          fixedSize={SIZE}
        />,
      ),
    );
    const cells = screen.getAllByRole("cell", { hidden: true }).map((c) => c.textContent);
    expect(cells).toContain("—");
  });

  it("marks truncated points in the table", () => {
    render(
      withTheme(
        <ScalingLines
          title="Time vs n"
          {...props}
          algorithms={[...props.algorithms]}
          measure="elapsed_ms"
          fixedSize={SIZE}
        />,
      ),
    );
    expect(screen.getAllByText(/\*/).length).toBeGreaterThan(0);
  });

  it("draws with log axes and a fitted curve with its R² stated as a fit of the displayed points", () => {
    render(
      withTheme(
        <ScalingLines
          title="Time vs n"
          {...props}
          algorithms={["greedy"]}
          measure="elapsed_ms"
          logY
          logX
          showFit
          fixedSize={SIZE}
        />,
      ),
    );
    expect(screen.getByText(/R²/)).toBeInTheDocument();
    expect(screen.getByText(/fit/i)).toBeInTheDocument();
  });
});
