// Owner: A (Arvind)
import { getHealth, isMockMode } from "../../api/client";
import { useAsync } from "../../hooks/useAsync";

export default function ApiStatus() {
  const health = useAsync(getHealth, []);
  let text: string;
  let tone: "ok" | "warn" | "down";
  if (isMockMode()) {
    text = "API mock";
    tone = "warn";
  } else if (health.status === "loading") {
    text = "API checking…";
    tone = "warn";
  } else if (health.status === "error") {
    text = "API offline";
    tone = "down";
  } else {
    text = `API ${health.data.status} · v${health.data.version}`;
    tone = health.data.status === "ok" ? "ok" : "warn";
  }
  return (
    <span
      className={`api-status api-status-${tone}`}
      data-testid="api-status"
      title="Backend health (GET /api/v1/health)"
    >
      <span className="dot" aria-hidden="true" />
      {text}
    </span>
  );
}
