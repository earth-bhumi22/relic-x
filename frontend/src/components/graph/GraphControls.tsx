// Owner: A (Arvind)
// Threshold slider (+ editable number), top-k (off or 1..16), BFS | DFS switch, ground-truth hint toggle.
import { useEffect, useState } from "react";
import type { Traversal } from "../../api/types";
import { TOP_K_RANGE } from "../../lib/graphView";

interface Props {
  threshold: number;
  topK: number | null;
  traversal: Traversal;
  showTruth: boolean;
  compare: boolean;
  maxTopK: number;
  onThreshold: (v: number) => void;
  onTopK: (v: number | null) => void;
  onTraversal: (v: Traversal) => void;
  onShowTruth: (v: boolean) => void;
  onCompare: (v: boolean) => void;
}

export default function GraphControls(p: Props) {
  const [thresholdText, setThresholdText] = useState(p.threshold.toFixed(2));
  const [topKText, setTopKText] = useState(String(p.topK ?? 3));
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [topKError, setTopKError] = useState<string | null>(null);
  const topKMax = Math.max(TOP_K_RANGE.min, Math.min(TOP_K_RANGE.max, p.maxTopK));

  // Keep the text in step when the value changes from outside (e.g. "Lower the threshold").
  useEffect(() => {
    setThresholdText(p.threshold.toFixed(2));
    setThresholdError(null);
  }, [p.threshold]);
  useEffect(() => {
    if (p.topK !== null) {
      setTopKText(String(p.topK));
      setTopKError(null);
    }
  }, [p.topK]);

  const commitThreshold = (text: string) => {
    setThresholdText(text);
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n) || n < 0 || n > 1) setThresholdError("Enter a number from 0 to 1.");
    else {
      setThresholdError(null);
      p.onThreshold(Math.round(n * 100) / 100);
    }
  };
  const commitTopK = (text: string) => {
    setTopKText(text);
    const n = Number(text);
    if (text.trim() === "" || !Number.isInteger(n) || n < TOP_K_RANGE.min || n > topKMax)
      setTopKError(`Whole number from ${TOP_K_RANGE.min} to ${topKMax}.`); // the API rejects top_k < 1: never sent
    else {
      setTopKError(null);
      p.onTopK(n);
    }
  };

  return (
    <div className="graph-controls card">
      <div className="field">
        <label htmlFor="g-threshold">Threshold</label>
        <div className="slider-row">
          <input
            id="g-threshold"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={p.threshold}
            aria-valuetext={`${p.threshold.toFixed(2)}: keep edges with weight at least ${p.threshold.toFixed(2)}`}
            onChange={(e) => p.onThreshold(Number(e.target.value))}
          />
          <input
            type="number"
            aria-label="Threshold value"
            min={0}
            max={1}
            step={0.01}
            value={thresholdText}
            aria-invalid={thresholdError ? true : undefined}
            onChange={(e) => commitThreshold(e.target.value)}
          />
        </div>
        {thresholdError && (
          <p className="field-error" role="alert">
            {thresholdError}
          </p>
        )}
      </div>

      <div className="field">
        <label className="choice-inline">
          <input
            type="checkbox"
            checked={p.topK !== null}
            onChange={(e) => p.onTopK(e.target.checked ? Math.min(Number(topKText) || 3, topKMax) : null)}
          />
          <span>Top-k pruning (keep each fragment’s strongest edges)</span>
        </label>
        {p.topK !== null && (
          <>
            <label htmlFor="g-topk" className="sr-only">
              Top-k value
            </label>
            <input
              id="g-topk"
              type="number"
              min={TOP_K_RANGE.min}
              max={topKMax}
              step={1}
              value={topKText}
              aria-invalid={topKError ? true : undefined}
              aria-describedby={topKError ? "g-topk-err" : undefined}
              onChange={(e) => commitTopK(e.target.value)}
            />
            {topKError && (
              <p className="field-error" id="g-topk-err" role="alert">
                {topKError}
              </p>
            )}
          </>
        )}
      </div>

      <fieldset className="field seg-group">
        <legend>Traversal</legend>
        {(["bfs", "dfs"] as const).map((t) => (
          <label key={t} className="choice-inline">
            <input
              type="radio"
              name="traversal"
              value={t}
              checked={p.traversal === t}
              onChange={() => p.onTraversal(t)}
            />
            <span>{t.toUpperCase()}</span>
          </label>
        ))}
      </fieldset>

      <div className="graph-toggles">
        <label className="choice-inline">
          <input type="checkbox" checked={p.showTruth} onChange={(e) => p.onShowTruth(e.target.checked)} />
          <span>Show ground-truth hint on edges</span>
        </label>
        <label className="choice-inline">
          <input type="checkbox" checked={p.compare} onChange={(e) => p.onCompare(e.target.checked)} />
          <span>Compare BFS and DFS</span>
        </label>
      </div>
    </div>
  );
}
