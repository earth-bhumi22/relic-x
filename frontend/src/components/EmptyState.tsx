// Owner: A (Arvind)
import type { ReactNode } from "react";

interface Props {
  title: string;
  message?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, message, action }: Props) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  );
}
