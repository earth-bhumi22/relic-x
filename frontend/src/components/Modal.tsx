// Owner: A (Arvind)
// Accessible modal dialog: role="dialog" + aria-modal, labelled by its title, focus moves in on open and is
// trapped (Tab / Shift+Tab cycle), Esc and a backdrop click close it, and focus returns to whatever had it
// before. While `busy` (a request is in flight) closing is blocked so work is not lost.
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Blocks Esc / backdrop closing while true. */
  busy?: boolean;
  /** Extra class on the dialog box (e.g. "modal-wide"). */
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, busy = false, className = "" }: Props) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>("[data-autofocus]") ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!busyRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        box.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === box || !box.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !box.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      data-testid="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={boxRef}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
