// Owner: A (Arvind)
// Accessible tabs: tablist / tab / tabpanel roles, roving tabindex, ←/→/Home/End. All panels stay mounted (hidden)
// so a half-filled form or a result is not lost when the user switches tabs.
import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabSpec {
  id: string;
  label: string;
  content: ReactNode;
}

export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabSpec[];
  active: string;
  onChange: (id: string) => void;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );

  const move = (i: number) => {
    const next = (i + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const handled: Record<string, () => void> = {
      ArrowRight: () => move(index + 1),
      ArrowLeft: () => move(index - 1),
      Home: () => move(0),
      End: () => move(tabs.length - 1),
    };
    const fn = handled[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div className="tabs">
      <div role="tablist" aria-label="Lab sections" className="tab-list" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            className={`tab${i === index ? " selected" : ""}`}
            aria-selected={i === index}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={i !== index}
          className="tab-panel"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
