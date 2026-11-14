// Owner: A (Arvind)
// Sortable comparison table. The best value in a column carries a ★ and the words "best" for assistive technology
// (not only a colour); null accuracies read "—"; a truncated run says so in words and with an asterisk.
import { Fragment, useState } from "react";
import { SHAPE_GLYPH } from "../charts/chartTheme";
import { BETTER, bestPerColumn, sortRows } from "../../lib/labData";
import type { BenchRow, NumericColumn, SortKey } from "../../lib/labData";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const fmt = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 3 });

const COLUMNS: { key: SortKey; label: string; render: (r: BenchRow) => string }[] = [
  { key: "elapsed_ms", label: "Time (ms)", render: (r) => fmt(r.elapsed_ms) },
  { key: "operations", label: "Operations", render: (r) => r.operations.toLocaleString("en") },
  { key: "total_score", label: "Total score", render: (r) => fmt(r.total_score) },
  { key: "neighbour_accuracy", label: "Neighbour accuracy", render: (r) => pct(r.neighbour_accuracy) },
  { key: "direct_accuracy", label: "Direct accuracy", render: (r) => pct(r.direct_accuracy) },
  { key: "coverage", label: "Coverage", render: (r) => pct(r.coverage) },
];

export default function BenchmarkTable({ rows }: { rows: readonly BenchRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "algorithm", dir: "asc" });
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const best = bestPerColumn(rows);
  const sorted = sortRows(rows, sort.key, sort.dir);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={ariaSort(key)}>
      <button type="button" className="link-button sort-button" onClick={() => toggleSort(key)}>
        {label}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
  );

  return (
    <div className="table-scroll">
      <table className="edge-table-grid bench-table">
        <caption className="sr-only">
          Benchmark results. Sorted by {sort.key} ({sort.dir}). ★ marks the best value in a column.
        </caption>
        <thead>
          <tr>
            <th scope="col" aria-label="Details" />
            {header("algorithm", "Algorithm")}
            {COLUMNS.map((c) => (
              <Fragment key={c.key}>{header(c.key, c.label)}</Fragment>
            ))}
            {header("truncated", "Truncated")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isOpen = open.has(r.algorithm);
            return (
              <Fragment key={r.algorithm}>
                <tr>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} operation counters for ${r.label}`}
                      onClick={() =>
                        setOpen((o) => {
                          const n = new Set(o);
                          if (n.has(r.algorithm)) n.delete(r.algorithm);
                          else n.add(r.algorithm);
                          return n;
                        })
                      }
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  </td>
                  <th scope="row">
                    <span aria-hidden="true">{SHAPE_GLYPH[r.algorithm]}</span> {r.label}
                  </th>
                  {COLUMNS.map((c) => {
                    const isBest = best[c.key as NumericColumn]?.has(r.algorithm);
                    return (
                      <td key={c.key} className={isBest ? "best" : undefined} data-best={isBest ? "true" : undefined}>
                        {c.render(r)}
                        {isBest && (
                          <>
                            {" "}
                            <span aria-hidden="true">★</span>
                            <span className="sr-only">
                              {" "}
                              (best: {BETTER[c.key as NumericColumn] === "low" ? "lowest" : "highest"})
                            </span>
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td>{r.truncated ? "yes*" : "no"}</td>
                </tr>
                {isOpen && (
                  <tr className="bench-detail">
                    <td />
                    <td colSpan={COLUMNS.length + 2}>
                      {r.breakdown.length === 0 ? (
                        "No counters recorded."
                      ) : (
                        <ul className="plain-list chip-list" aria-label={`Operation counters for ${r.label}`}>
                          {r.breakdown.map(([k, v]) => (
                            <li key={k}>
                              <code>{k}</code> {v.toLocaleString("en")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => r.truncated) && (
        <p className="muted">* node limit reached: the best layout found, optimality not guaranteed.</p>
      )}
    </div>
  );
}
