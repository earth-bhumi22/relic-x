// Owner: A (Arvind)
// Sizing wrapper. In the app a ResponsiveContainer fills the width; jsdom cannot measure layout, so tests pass a
// `fixedSize` and the chart renders at exactly that size.
import { cloneElement, isValidElement } from "react";
import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

export interface FixedSize {
  width: number;
  height: number;
}

export default function ChartBox({
  height = 280,
  fixedSize,
  label,
  children,
}: {
  height?: number;
  fixedSize?: FixedSize;
  label: string;
  children: ReactElement;
}) {
  return (
    <div className="chart-box" role="group" aria-label={label} style={{ height: fixedSize?.height ?? height }}>
      {fixedSize && isValidElement(children) ? (
        cloneElement(children as ReactElement<FixedSize>, { width: fixedSize.width, height: fixedSize.height })
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
}
