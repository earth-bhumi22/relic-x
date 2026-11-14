// Owner: A (Arvind)
// Trace player: play / pause, step back / forward, jump to start / end, a scrubber, speed 0.5×–4×, the current step's
// message shown prominently with its action as a labelled badge. Playback is just a timer that moves `index`; the
// frame for any index is derived data (lib/replay.ts), so scrubbing is instant. The timer is cleaned up on unmount
// and on pause. With `prefers-reduced-motion` there is no playback: step on demand.
// Keyboard (when the player region has focus): Space play/pause, ←/→ step, Home/End jump.
import { useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/motion";
import type { Frame } from "../lib/replay";

export const SPEEDS = [0.5, 1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];
/** Time per step at 1×. */
export const STEP_MS = 900;

/** A text label for each action, so the badge is never colour-only. */
export const ACTION_LABEL: Record<string, string> = {
  seed: "Seed",
  place: "Place",
  conflict: "Conflict",
  fallback: "Fallback",
  prune: "Prune",
  backtrack: "Backtrack",
  best: "New best",
  incumbent: "Incumbent",
  limit: "Limit",
  stop: "Stop",
};

interface Props {
  frames: readonly Frame[];
  index: number;
  onIndex: (index: number) => void;
}

/** Number of recorded steps (the synthetic final frame and the empty start are not steps). */
const stepCount = (frames: readonly Frame[]): number =>
  frames.reduce((n, f) => (f.step ? Math.max(n, f.step.step) : n), 0);

export default function TracePlayer({ frames, index, onIndex }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const reduced = prefersReducedMotion();
  const last = frames.length - 1;
  const indexRef = useRef(index);
  indexRef.current = index;
  const scrubId = useId();
  const frame = frames[Math.min(index, last)];
  const total = stepCount(frames);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = indexRef.current + 1;
      if (next > last) {
        setPlaying(false);
        return;
      }
      indexRef.current = next;
      onIndex(next);
      if (next >= last) setPlaying(false);
    }, STEP_MS / speed);
    return () => clearInterval(timer);
  }, [playing, speed, last, onIndex]);

  const go = (i: number) => {
    setPlaying(false);
    onIndex(Math.max(0, Math.min(last, i)));
  };
  const togglePlay = () => {
    if (reduced || last <= 0) return;
    if (playing) setPlaying(false);
    else {
      if (indexRef.current >= last) {
        indexRef.current = 0;
        onIndex(0);
      }
      setPlaying(true);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return; // keys on inner controls keep their own meaning
    const handled = {
      " ": togglePlay,
      ArrowRight: () => go(index + 1),
      ArrowLeft: () => go(index - 1),
      Home: () => go(0),
      End: () => go(last),
    }[e.key];
    if (handled) {
      e.preventDefault();
      handled();
    }
  };

  const action = frame.final ? "final" : (frame.step?.action ?? "start");
  const badge = frame.final ? "Final layout" : (ACTION_LABEL[action] ?? action);
  const stepNo = frame.step?.step ?? 0;
  const counters = [
    frame.nodes !== null ? `${frame.nodes.toLocaleString("en")} nodes` : null,
    frame.prunes > 0 ? `${frame.prunes} pruned` : null,
    frame.backtracks > 0 ? `${frame.backtracks} backtracks` : null,
  ].filter(Boolean);

  return (
    <section className="trace-player" aria-label="Trace player" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="trace-now" role="status" aria-live="polite" aria-atomic="true">
        <span className={`action-badge action-${action}`} data-testid="action-badge">
          {badge}
        </span>
        <p className="trace-message">{frame.status}</p>
        {counters.length > 0 && <p className="muted trace-counters">{counters.join(" · ")} so far</p>}
      </div>

      <div className="trace-controls" role="group" aria-label="Playback controls">
        <button type="button" className="btn" onClick={() => go(0)} disabled={index === 0} aria-label="Jump to start">
          ⏮
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Step back"
        >
          ◀
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={togglePlay}
          disabled={reduced || last <= 0}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => go(index + 1)}
          disabled={index >= last}
          aria-label="Step forward"
        >
          ▶|
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => go(last)}
          disabled={index >= last}
          aria-label="Jump to end"
        >
          ⏭
        </button>
        <label className="speed">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value) as Speed)}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="trace-scrub">
        <label htmlFor={scrubId}>
          Step <strong>{stepNo}</strong> of {total}
        </label>
        <input
          id={scrubId}
          type="range"
          min={0}
          max={Math.max(last, 0)}
          step={1}
          value={Math.min(index, last)}
          onChange={(e) => go(Number(e.target.value))}
          aria-valuetext={`${badge}, step ${stepNo} of ${total}`}
        />
      </div>

      {reduced && <p className="muted">Reduced motion is on: playback is off. Use the step buttons or the scrubber.</p>}
      <p className="muted trace-help">
        Keyboard: focus this player, then <kbd>Space</kbd> plays or pauses, <kbd>←</kbd> <kbd>→</kbd> step,{" "}
        <kbd>Home</kbd> <kbd>End</kbd> jump.
      </p>
    </section>
  );
}
