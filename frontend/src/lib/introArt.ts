// Owner: A (Arvind)
// Decorative artwork for the intro page: one painted "tile panel" drawn as SVG (no image files), plus the
// deterministic scatter used to throw its 16 fragments around before they snap back into place.

/** A rosette panel in the field-notebook palette, as a data URI so it can be sliced with background-position. */
export function panelDataUri(): string {
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = i * 30;
    const fill = i % 2 ? "#a43b26" : "#e0a23c";
    return `<ellipse cx="200" cy="112" rx="21" ry="58" fill="${fill}" stroke="#221c15" stroke-width="3" transform="rotate(${a} 200 200)"/>`;
  }).join("");
  const corners = [
    [0, 0, 0],
    [400, 0, 90],
    [400, 400, 180],
    [0, 400, 270],
  ]
    .map(
      ([x, y, r]) =>
        `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0H92L0 92Z" fill="#2d6a4f" stroke="#221c15" stroke-width="3"/><circle cx="26" cy="26" r="11" fill="#f4eedd" stroke="#221c15" stroke-width="3"/></g>`,
    )
    .join("");
  const waves = Array.from({ length: 5 }, (_, i) => {
    const y = 18 + i * 9;
    return `<path d="M120 ${y} q20 -10 40 0 t40 0 t40 0 t40 0" fill="none" stroke="#221c15" stroke-width="2.5" opacity=".55"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" shape-rendering="geometricPrecision">
<rect width="400" height="400" fill="#efe3c4"/>
<rect x="10" y="10" width="380" height="380" fill="none" stroke="#221c15" stroke-width="4"/>
<rect x="22" y="22" width="356" height="356" fill="none" stroke="#a43b26" stroke-width="2" stroke-dasharray="3 7"/>
${corners}${waves}
<circle cx="200" cy="200" r="150" fill="#d9c79d" stroke="#221c15" stroke-width="4"/>
${petals}
<circle cx="200" cy="200" r="62" fill="#221c15"/>
<circle cx="200" cy="200" r="50" fill="#2d6a4f" stroke="#efe3c4" stroke-width="4"/>
<circle cx="200" cy="200" r="26" fill="#efe3c4" stroke="#221c15" stroke-width="3"/>
<circle cx="200" cy="200" r="9" fill="#a43b26"/>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface Scatter {
  tx: number;
  ty: number;
  rot: number;
}

/** Fixed pseudo-random scatter (percent of tile size, degrees), so renders and tests are stable. */
export const SCATTER: Scatter[] = Array.from({ length: 16 }, (_, i) => {
  const s = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    tx: Math.round((s(1) - 0.5) * 520),
    ty: Math.round((s(2) - 0.5) * 520),
    rot: Math.round((s(3) - 0.5) * 220),
  };
});

/** Algorithms shown on the intro, straight from the README table. */
export const TECHNIQUES = [
  {
    topic: "Hashing",
    name: "n-gram signatures",
    cost: "O(L) per edge",
    job: "Cheap pre-filter: throw out hopeless pairs before any real work.",
  },
  {
    topic: "String matching",
    name: "KMP · Rabin–Karp",
    cost: "O(log L · L)",
    job: "Find the longest run two edges share.",
  },
  {
    topic: "Dynamic programming",
    name: "LCS",
    cost: "O(L²) time, O(L) space",
    job: "How much of one edge reads like the other.",
  },
  {
    topic: "Dynamic programming",
    name: "Edit distance",
    cost: "O(L²) time, O(L) space",
    job: "The damage bill: edits needed to make two edges agree.",
  },
  {
    topic: "Graph traversal",
    name: "BFS · DFS",
    cost: "O(V + E)",
    job: "Split fragments into groups that can belong together.",
  },
  { topic: "Greedy", name: "Frontier placement", cost: "O(n³)", job: "Always take the best-looking next piece." },
  {
    topic: "Priority queues",
    name: "Best-first (Prim)",
    cost: "O(E log E)",
    job: "Grow the picture from its strongest joins.",
  },
  {
    topic: "Shortest paths",
    name: "Dijkstra",
    cost: "O((V+E) log V)",
    job: "Assemble along a shortest-path tree of joins.",
  },
  {
    topic: "State-space search",
    name: "Backtracking + B&B",
    cost: "O((n·R)ⁿ) worst",
    job: "Try everything sensible, prune what cannot win.",
  },
] as const;
