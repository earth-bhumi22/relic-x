// Owner: A (Arvind)
// Chart colours come from the CSS tokens (styles.css), read at render time and again when the theme changes, then
// passed to Recharts as plain strings. Nothing theme-specific is hard-coded here. Colour is never the only channel:
// every algorithm also has a marker shape and a dash pattern.
import { useEffect, useState } from "react";
import type { Algorithm } from "../../api/types";
import { useTheme } from "../../theme";

export interface ChartTheme {
  alg: Record<Algorithm, string>;
  text: string;
  muted: string;
  grid: string;
  surface: string;
}

export const SHAPES: Record<Algorithm, "circle" | "square" | "triangle" | "diamond"> = {
  greedy: "circle",
  best_first: "square",
  dijkstra: "triangle",
  backtracking: "diamond",
};
export const DASHES: Record<Algorithm, string | undefined> = {
  greedy: undefined,
  best_first: "6 3",
  dijkstra: "2 3",
  backtracking: "10 3 2 3",
};
/** Symbols used next to a name in text (legends, tables), so the shape is readable without the chart. */
export const SHAPE_GLYPH: Record<Algorithm, string> = {
  greedy: "●",
  best_first: "■",
  dijkstra: "▲",
  backtracking: "◆",
};

function read(): ChartTheme {
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const v = (name: string) => style?.getPropertyValue(name).trim() || "currentColor";
  return {
    alg: {
      greedy: v("--alg-greedy"),
      best_first: v("--alg-best_first"),
      dijkstra: v("--alg-dijkstra"),
      backtracking: v("--alg-backtracking"),
    },
    text: v("--text"),
    muted: v("--muted"),
    grid: v("--border"),
    surface: v("--surface"),
  };
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ChartTheme>(read);
  // The theme attribute is set in an effect of ThemeProvider, so re-read after it.
  useEffect(() => setColors(read()), [theme]);
  return colors;
}
