// Owner: A (Arvind)
// Line chart of one scaling measure against n, one line per algorithm: colour + marker shape + dash pattern, hollow
// markers for truncated points, gaps (not zeros) where the backend gave no value, optional log axes and an optional
// least-squares fit drawn as a thin dotted line (labelled as a fit from the displayed points).
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Algorithm, ScalingPoint } from "../../api/types";
import { algorithmLabel, fitSeries, fitValue, scalingSeries, truncKey } from "../../lib/labData";
import type { ScalingDatum, ScalingMeasure } from "../../lib/labData";
import ChartBox from "./ChartBox";
import type { FixedSize } from "./ChartBox";
import ChartFrame from "./ChartFrame";
import { DASHES, SHAPES, SHAPE_GLYPH, useChartTheme } from "./chartTheme";
import type { ChartTheme } from "./chartTheme";
import { TRUNCATED_NOTE } from "./BenchBars";

interface Props {
  title: string;
  description?: string;
  points: readonly ScalingPoint[];
  algorithms: readonly Algorithm[];
  measure: ScalingMeasure;
  logY?: boolean;
  logX?: boolean;
  /** Overlay a fitted power-law curve per algorithm (time and operations only). */
  showFit?: boolean;
  format?: (v: number) => string;
  fixedSize?: FixedSize;
}

const defaultFormat = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 3 });

function Marker({
  cx,
  cy,
  algorithm,
  hollow,
  theme,
}: {
  cx?: number;
  cy?: number;
  algorithm: Algorithm;
  hollow: boolean;
  theme: ChartTheme;
}) {
  if (cx === undefined || cy === undefined) return null;
  const r = 5;
  const common = { fill: hollow ? theme.surface : theme.alg[algorithm], stroke: theme.alg[algorithm], strokeWidth: 2 };
  switch (SHAPES[algorithm]) {
    case "square":
      return <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />;
    case "triangle":
      return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} {...common} />;
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`}
          {...common}
        />
      );
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
}

export default function ScalingLines({
  title,
  description,
  points,
  algorithms,
  measure,
  logY = false,
  logX = false,
  showFit = false,
  format = defaultFormat,
  fixedSize,
}: Props) {
  const theme = useChartTheme();
  const fitMeasure = measure === "elapsed_ms" || measure === "operations" ? measure : null;
  const fits = new Map(
    fitMeasure && showFit ? algorithms.map((a) => [a, fitSeries(points, a, fitMeasure)] as const) : [],
  );
  const data: ScalingDatum[] = scalingSeries(points, measure, algorithms, logY).map((d) => {
    const out = { ...d };
    for (const [a, fit] of fits) out[`fit:${a}`] = fit ? fitValue(fit, d.n) : null;
    return out;
  });
  const truncatedAny = points.some((p) => algorithms.some((a) => p.runs[a]?.truncated));
  const missing = points.some((p) => algorithms.some((a) => !p.runs[a]));
  const percent = measure === "neighbour_accuracy" || measure === "direct_accuracy";

  return (
    <ChartFrame
      title={title}
      description={description}
      note={
        <>
          {truncatedAny && <>Hollow markers: {TRUNCATED_NOTE}. </>}
          {missing && <>A gap means the backend returned no run for that algorithm at that size. </>}
          {logY && <>Log axis: values of 0 are left out. </>}
          {fits.size > 0 && (
            <>
              Dotted lines are least-squares fits of y = c·nᵏ on the displayed points (truncated points excluded), not a
              theoretical claim:{" "}
              {algorithms
                .map((a) => {
                  const f = fits.get(a);
                  return `${algorithmLabel(a)} ${f ? `k = ${f.exponent.toFixed(2)}, R² = ${f.r2.toFixed(3)}` : "no fit (needs 3 points)"}`;
                })
                .join("; ")}
              .
            </>
          )}
        </>
      }
      table={
        <table className="edge-table-grid">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">n (size)</th>
              {algorithms.map((a) => (
                <th key={a} scope="col">
                  {algorithmLabel(a)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scalingSeries(points, measure, algorithms).map((d) => (
              <tr key={d.n}>
                <th scope="row">
                  {d.n} ({d.size}×{d.size})
                </th>
                {algorithms.map((a) => (
                  <td key={a}>
                    {d[a] === null ? "—" : format(d[a] as number)}
                    {d[truncKey(a)] ? "*" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ChartBox label={`${title}: line chart`} fixedSize={fixedSize} height={300}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 20, left: 4 }} accessibilityLayer>
          <CartesianGrid stroke={theme.grid} />
          <XAxis
            dataKey="n"
            type="number"
            scale={logX ? "log" : "linear"}
            domain={logX ? ["auto", "auto"] : [0, "auto"]}
            allowDataOverflow
            stroke={theme.muted}
            tick={{ fill: theme.text, fontSize: 12 }}
            label={{ value: "n (fragments)", position: "insideBottom", offset: -10, fill: theme.text, fontSize: 12 }}
          />
          <YAxis
            scale={logY ? "log" : "linear"}
            domain={logY ? ["auto", "auto"] : percent ? [0, 1] : [0, "auto"]}
            allowDataOverflow
            stroke={theme.muted}
            tick={{ fill: theme.text, fontSize: 12 }}
            tickFormatter={(v: number) => format(v)}
            width={64}
          />
          <Tooltip
            contentStyle={{ background: theme.surface, color: theme.text, border: `1px solid ${theme.grid}` }}
            labelFormatter={(n) => `n = ${String(n)}`}
            formatter={(value, key, item) => {
              const k = String(key);
              if (k.startsWith("fit:")) return [format(Number(value)), `fit, ${algorithmLabel(k.slice(4))}`];
              const trunc = Boolean((item.payload as ScalingDatum)[truncKey(k)]);
              return [
                value === null || value === undefined ? "—" : format(Number(value)),
                `${SHAPE_GLYPH[k as Algorithm]} ${algorithmLabel(k)}${trunc ? ` (${TRUNCATED_NOTE})` : ""}`,
              ];
            }}
          />
          <Legend
            formatter={(key: string) =>
              key.startsWith("fit:") ? "" : `${SHAPE_GLYPH[key as Algorithm]} ${algorithmLabel(key)}`
            }
            payload={algorithms.map((a) => ({
              value: a,
              id: a,
              type: "line" as const,
              color: theme.alg[a],
            }))}
          />
          {algorithms.map((a) => (
            <Line
              key={a}
              type="monotone"
              dataKey={a}
              name={a}
              stroke={theme.alg[a]}
              strokeWidth={2}
              strokeDasharray={DASHES[a]}
              connectNulls={false}
              isAnimationActive={false}
              dot={(p: { cx?: number; cy?: number; payload?: ScalingDatum; index?: number }) => (
                <Marker
                  key={`${a}-${p.index}`}
                  cx={p.cx}
                  cy={p.cy}
                  algorithm={a}
                  hollow={Boolean(p.payload?.[truncKey(a)])}
                  theme={theme}
                />
              )}
              activeDot={false}
            />
          ))}
          {[...fits].map(([a, fit]) =>
            fit ? (
              <Line
                key={`fit-${a}`}
                dataKey={`fit:${a}`}
                name={`fit:${a}`}
                stroke={theme.alg[a]}
                strokeWidth={1}
                strokeDasharray="1 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            ) : null,
          )}
        </LineChart>
      </ChartBox>
    </ChartFrame>
  );
}
