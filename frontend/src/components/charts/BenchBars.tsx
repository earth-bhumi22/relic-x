// Owner: A (Arvind)
// Grouped bar chart for the benchmark: one group per measure, one bar per algorithm (colour from the shared palette,
// the value printed above each bar). A truncated run's bars are dashed and faded, its legend name carries an asterisk and
// its tooltip says why. The same numbers are in the data table under the chart (ChartFrame).
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Tooltip, XAxis, YAxis } from "recharts";
import type { Algorithm } from "../../api/types";
import { algorithmLabel, barSeries } from "../../lib/labData";
import type { BenchMeasure, BenchRow } from "../../lib/labData";
import ChartBox from "./ChartBox";
import type { FixedSize } from "./ChartBox";
import ChartFrame from "./ChartFrame";
import { SHAPE_GLYPH, useChartTheme } from "./chartTheme";

export const TRUNCATED_NOTE = "node limit reached: best found, optimality not guaranteed";

interface Props {
  title: string;
  description?: string;
  rows: readonly BenchRow[];
  measures: readonly BenchMeasure[];
  logY?: boolean;
  format?: (v: number) => string;
  fixedSize?: FixedSize;
}

const defaultFormat = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 3 });

export default function BenchBars({
  title,
  description,
  rows,
  measures,
  logY = false,
  format = defaultFormat,
  fixedSize,
}: Props) {
  const theme = useChartTheme();
  const data = barSeries(rows, measures, logY);
  const truncated = new Set<Algorithm>(rows.filter((r) => r.truncated).map((r) => r.algorithm));
  const name = (a: Algorithm) => `${algorithmLabel(a)}${truncated.has(a) ? "*" : ""}`;
  const gaps = logY && rows.some((r) => measures.some((m) => !(r[m] !== null && (r[m] as number) > 0)));

  return (
    <ChartFrame
      title={title}
      description={description}
      note={
        <>
          {truncated.size > 0 && <>* {TRUNCATED_NOTE}. </>}
          {gaps && <>A log axis cannot show 0 or missing values; those bars are left out.</>}
        </>
      }
      table={
        <table className="edge-table-grid">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {rows.map((r) => (
                <th key={r.algorithm} scope="col">
                  {name(r.algorithm)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {measures.map((m, i) => (
              <tr key={m}>
                <th scope="row">{data[i].label}</th>
                {rows.map((r) => (
                  <td key={r.algorithm}>{r[m] === null ? "—" : format(r[m] as number)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ChartBox label={`${title}: grouped bar chart`} fixedSize={fixedSize}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 12, bottom: 4, left: 4 }}
          accessibilityLayer
          barCategoryGap="18%"
        >
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" stroke={theme.muted} tick={{ fill: theme.text, fontSize: 12 }} />
          <YAxis
            stroke={theme.muted}
            tick={{ fill: theme.text, fontSize: 12 }}
            scale={logY ? "log" : "linear"}
            domain={logY ? ["auto", "auto"] : [0, "auto"]}
            allowDataOverflow
            tickFormatter={(v: number) => format(v)}
            width={64}
          />
          <Tooltip
            cursor={{ fill: theme.grid, opacity: 0.3 }}
            contentStyle={{ background: theme.surface, color: theme.text, border: `1px solid ${theme.grid}` }}
            formatter={(value, key) => [
              value === null || value === undefined ? "—" : format(Number(value)),
              `${SHAPE_GLYPH[key as Algorithm]} ${name(key as Algorithm)}${truncated.has(key as Algorithm) ? ` (${TRUNCATED_NOTE})` : ""}`,
            ]}
          />
          <Legend formatter={(key: string) => `${SHAPE_GLYPH[key as Algorithm]} ${name(key as Algorithm)}`} />
          {rows.map((r) => (
            <Bar
              key={r.algorithm}
              dataKey={r.algorithm}
              fill={theme.alg[r.algorithm]}
              fillOpacity={r.truncated ? 0.55 : 1}
              stroke={theme.alg[r.algorithm]}
              strokeWidth={r.truncated ? 2 : 0}
              strokeDasharray={r.truncated ? "4 3" : undefined}
              isAnimationActive={false}
              name={r.algorithm}
            >
              <LabelList
                dataKey={r.algorithm}
                position="top"
                fill={theme.text}
                fontSize={11}
                formatter={(v: unknown) => (typeof v === "number" ? `${format(v)}${r.truncated ? "*" : ""}` : "")}
              />
            </Bar>
          ))}
        </BarChart>
      </ChartBox>
    </ChartFrame>
  );
}
