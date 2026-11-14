// Owner: A (Arvind)
// Fragment detail dialog: large image with the four sides labelled N / E / S / W (clockwise, CONTRACT D12),
// one edge bead strip per side, an optional numeric-strip row (getFragment) showing the quantisation, and metadata.
// Ground truth (true cell, scramble rotation) is only shown when `showTruth` is on.
import { useState } from "react";
import { getFragment } from "../api/client";
import type { FragmentOut } from "../api/types";
import { SIDE_LETTERS } from "../api/sides";
import type { SideLetter } from "../api/sides";
import { useAsync } from "../hooks/useAsync";
import EdgeBeads, { StripSwatches } from "./EdgeBeads";
import ErrorState from "./ErrorState";
import Loading from "./Loading";
import Modal from "./Modal";

const SIDE_NAMES: Record<SideLetter, string> = { N: "North", E: "East", S: "South", W: "West" };

export function GroundTruth({ fragment }: { fragment: FragmentOut }) {
  if (fragment.true_row === null || fragment.true_col === null)
    return <span>No ground truth (uploaded fragments)</span>;
  return (
    <span>
      Row {fragment.true_row}, column {fragment.true_col}
      {fragment.scramble_rot !== null && <>, scrambled by {fragment.scramble_rot * 90}°</>}
    </span>
  );
}

function NumericStrips({ id }: { id: string }) {
  const detail = useAsync(() => getFragment(id), [id]);
  if (detail.status === "loading") return <Loading label="Loading numeric strips…" />;
  if (detail.status === "error") return <ErrorState error={detail.error} onRetry={detail.reload} />;
  return (
    <div className="strip-rows">
      {SIDE_LETTERS.map((side) => (
        <div className="strip-row" key={side}>
          <span className={`side-tag side-${side.toLowerCase()}`}>{side}</span>
          <StripSwatches strip={detail.data.strips[side] ?? []} label={`${SIDE_NAMES[side]} numeric strip`} />
        </div>
      ))}
    </div>
  );
}

export default function FragmentDialog({
  fragment,
  showTruth,
  onClose,
}: {
  fragment: FragmentOut;
  showTruth: boolean;
  onClose: () => void;
}) {
  const [numeric, setNumeric] = useState(false);
  return (
    <Modal title={`Fragment ${fragment.label}`} onClose={onClose} className="modal-wide">
      <div className="fragment-detail">
        <div className="fragment-frame" aria-hidden="true">
          <span className="side-tag side-n frame-n">N</span>
          <span className="side-tag side-w frame-w">W</span>
          <img src={fragment.image_url} alt="" className="fragment-large" />
          <span className="side-tag side-e frame-e">E</span>
          <span className="side-tag side-s frame-s">S</span>
        </div>
        <img className="sr-only" src={fragment.image_url} alt={`Fragment ${fragment.label}`} />

        <div className="fragment-edges">
          <h3>Edge strings (read clockwise)</h3>
          <div className="strip-rows">
            {SIDE_LETTERS.map((side) => (
              <div className="strip-row" key={side}>
                <span className={`side-tag side-${side.toLowerCase()}`}>{side}</span>
                <EdgeBeads
                  edge={fragment.edges[side] ?? ""}
                  side={side}
                  label={`${SIDE_NAMES[side]} edge of ${fragment.label}`}
                  showSymbols
                />
              </div>
            ))}
          </div>
          <label className="choice-inline">
            <input type="checkbox" checked={numeric} onChange={(e) => setNumeric(e.target.checked)} />
            <span>Show numeric strips (colour before quantising)</span>
          </label>
          {numeric && <NumericStrips id={fragment.id} />}
        </div>

        <dl className="artifact-facts fragment-meta">
          <div>
            <dt>Label</dt>
            <dd>{fragment.label}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {fragment.width} × {fragment.height} px
            </dd>
          </div>
          <div>
            <dt>Id</dt>
            <dd>
              <code>{fragment.id}</code>
            </dd>
          </div>
          {showTruth && (
            <div>
              <dt>Ground truth</dt>
              <dd>
                <GroundTruth fragment={fragment} />
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
