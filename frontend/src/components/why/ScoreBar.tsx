// Owner: A (Arvind)
// One stacked bar of the five contributions (colour, lcs, edit, motif, hash). The full track is 0–1, so the
// filled part is the composite and the gap is what is missing. Each segment has a fill pattern and a letter, and the
// legend spells out `score × weight = contribution`, so nothing depends on colour alone.
import type { Explanation } from "../../api/types";
import { SIGNALS, contributionSum } from "../../lib/signals";

export default function ScoreBar({ x }: { x: Explanation }) {
  const sum = contributionSum(x.contributions);
  const summary = SIGNALS.map((s) => `${s.label} ${x.contributions[s.key].toFixed(4)}`).join(", ");
  return (
    <section className="why-section" aria-labelledby="why-score-heading">
      <h3 id="why-score-heading">Weighted score</h3>
      <p className="muted">
        Each signal is scored 0–1, multiplied by its weight, and the five contributions add up to the composite.
      </p>
      <div
        className="score-bar"
        role="img"
        aria-label={`Composite ${x.composite.toFixed(4)} out of 1: ${summary}`}
        data-testid="score-bar"
      >
        {SIGNALS.map((s) => (
          <span
            key={s.key}
            className={`score-seg sig-pattern-${s.pattern}`}
            style={{ width: `${Math.max(0, x.contributions[s.key]) * 100}%`, backgroundColor: `var(${s.cssVar})` }}
            data-testid="score-seg"
            data-signal={s.key}
            title={`${s.label}: ${x.contributions[s.key].toFixed(4)}`}
          >
            <span className="score-seg-label">{s.short}</span>
          </span>
        ))}
      </div>
      <table className="score-legend">
        <caption className="sr-only">Score × weight = contribution, per signal</caption>
        <thead>
          <tr>
            <th scope="col">Signal</th>
            <th scope="col">Score</th>
            <th scope="col">Weight</th>
            <th scope="col">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {SIGNALS.map((s) => (
            <tr key={s.key}>
              <th scope="row">
                <span
                  className={`legend-swatch sig-pattern-${s.pattern}`}
                  style={{ backgroundColor: `var(${s.cssVar})` }}
                />
                {s.label}
              </th>
              <td>{x.scores[s.key].toFixed(4)}</td>
              <td>× {x.weights[s.key].toFixed(2)}</td>
              <td>= {x.contributions[s.key].toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td colSpan={2}>sum of contributions {sum.toFixed(4)}</td>
            <td>= {x.composite.toFixed(4)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
