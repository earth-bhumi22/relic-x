// Owner: A (Arvind)
// One section per signal: colour, LCS (with connector lines), edit alignment, shared motif, hash overlap.
// Each has a plain-language line, its score, weight and contribution.
import type { Explanation } from "../../api/types";
import type { SideLetter } from "../../api/sides";
import { SIGNALS, editCounts, jaccard, lcsHighlights, motifHighlights, percent, signalInfo } from "../../lib/signals";
import type { EditOpKind, SignalKey } from "../../lib/signals";
import { StripSwatches } from "../EdgeBeads";
import StripPair from "./StripPair";

function SectionHead({ x, signal }: { x: Explanation; signal: SignalKey }) {
  const s = signalInfo(signal);
  return (
    <>
      <h3 id={`why-${signal}-heading`}>
        <span className={`legend-swatch sig-pattern-${s.pattern}`} style={{ backgroundColor: `var(${s.cssVar})` }} />
        {s.label}
      </h3>
      <p className="muted">{s.blurb}</p>
      <p className="why-numbers">
        Score <strong>{x.scores[signal].toFixed(4)}</strong> × weight {x.weights[signal].toFixed(2)} = contribution{" "}
        <strong>{x.contributions[signal].toFixed(4)}</strong>
      </p>
    </>
  );
}

const OP_INFO: Record<EditOpKind, { glyph: string; word: string }> = {
  match: { glyph: "=", word: "match" },
  sub: { glyph: "≠", word: "substitute" },
  ins: { glyph: "+", word: "insert" },
  del: { glyph: "−", word: "delete" },
};

export interface StripLabels {
  a: string;
  b: string;
  sideA: SideLetter;
  sideB: SideLetter;
}

export default function SignalSections({ x, labels }: { x: Explanation; labels: StripLabels }) {
  const lcs = lcsHighlights(x.lcs.pairs);
  const motif = motifHighlights(x.motif);
  const counts = editCounts(x.edit.ops);
  const ratio = jaccard(x.hash.shared, x.hash.union);
  const stripProps = {
    edgeA: x.edge_a,
    edgeBReversed: x.edge_b_reversed,
    labelA: `${labels.a} ${labels.sideA} edge`,
    labelB: `${labels.b} ${labels.sideB} edge`,
  };
  return (
    <>
      <section className="why-section" aria-labelledby="why-color-heading">
        <SectionHead x={x} signal="color" />
        <StripSwatches strip={x.strip_a} label={`${labels.a} ${labels.sideA} colour samples`} size="sm" />
        <StripSwatches
          strip={x.strip_b_reversed}
          label={`${labels.b} ${labels.sideB} colour samples (reversed)`}
          size="sm"
        />
      </section>

      <section className="why-section" aria-labelledby="why-lcs-heading">
        <SectionHead x={x} signal="lcs" />
        <p>
          Common subsequence of length <strong>{x.lcs.length}</strong>
          {x.lcs.subsequence && (
            <>
              {" "}
              (<code>{x.lcs.subsequence}</code>)
            </>
          )}
          . Highlighted beads are paired; lines connect each pair.
        </p>
        <StripPair {...stripProps} highlightA={lcs.a} highlightB={lcs.b} pairs={x.lcs.pairs} />
      </section>

      <section className="why-section" aria-labelledby="why-edit-heading">
        <SectionHead x={x} signal="edit" />
        <p>
          Edit distance <strong>{x.edit.distance}</strong>:{" "}
          {(Object.keys(OP_INFO) as EditOpKind[]).map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              {counts[k]} {OP_INFO[k].word}
            </span>
          ))}
        </p>
        <ol className="edit-ops" aria-label="Edit operations, in order">
          {x.edit.ops.map((o, i) => (
            <li
              key={i}
              className={`edit-op edit-op-${o.op}`}
              title={`${OP_INFO[o.op].word}: ${o.a ?? "–"} → ${o.b ?? "–"}`}
              aria-label={`${OP_INFO[o.op].word} ${o.a ?? "nothing"} with ${o.b ?? "nothing"}`}
            >
              <span aria-hidden="true">{OP_INFO[o.op].glyph}</span>
            </li>
          ))}
        </ol>
        <p className="muted edit-key">
          <span className="edit-op edit-op-match">=</span> match · <span className="edit-op edit-op-sub">≠</span>{" "}
          substitute · <span className="edit-op edit-op-ins">+</span> insert ·{" "}
          <span className="edit-op edit-op-del">−</span> delete
        </p>
      </section>

      <section className="why-section" aria-labelledby="why-motif-heading">
        <SectionHead x={x} signal="motif" />
        {x.motif.length > 0 ? (
          <p>
            Longest shared run: <strong>{x.motif.length}</strong> symbols (<code>{x.motif.motif}</code>), at position{" "}
            {x.motif.pos_a} in edge A and {x.motif.pos_b} in edge B.
          </p>
        ) : (
          <p>No shared motif: the two edges have no common run of symbols.</p>
        )}
        <StripPair {...stripProps} highlightA={motif.a} highlightB={motif.b} />
        <table className="ops-compare">
          <caption>Operations needed to find the motif</caption>
          <thead>
            <tr>
              <th scope="col">KMP</th>
              <th scope="col">Rabin-Karp</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{x.motif.kmp_ops.toLocaleString("en")} operations</td>
              <td>{x.motif.rabin_karp_ops.toLocaleString("en")} operations</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="why-section" aria-labelledby="why-hash-heading">
        <SectionHead x={x} signal="hash" />
        <p>
          {x.hash.ngram}-grams shared: <strong>{x.hash.shared}</strong> of {x.hash.union} in the union
          {x.hash.union > 0 ? <> = Jaccard {ratio.toFixed(2)}</> : <> (no n-grams to compare)</>}.
        </p>
        <div
          className="ratio-bar"
          role="img"
          aria-label={`Jaccard ${percent(ratio)}: ${x.hash.shared} of ${x.hash.union} ${x.hash.ngram}-grams shared`}
        >
          <span style={{ width: percent(ratio) }} data-testid="ratio-fill" />
        </div>
      </section>
    </>
  );
}

export { SIGNALS };
