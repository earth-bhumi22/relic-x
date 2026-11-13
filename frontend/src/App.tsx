// Owner: A (Arvind)
// Scaffold only. The app shell, routing and every page are built in issues
// T03 and T23–T28 (see planning/WORKFLOW.md).
import { useEffect, useState } from "react";
import { getHealth } from "./api/client";

export default function App() {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    getHealth()
      .then((h) => setStatus(`API ${h.status} · v${h.version}`))
      .catch(() => setStatus("API not reachable — start the backend: uvicorn relicx.main:app"));
  }, []);

  return (
    <main className="scaffold">
      <h1>RELIC-X</h1>
      <p>Fragment reconstruction lab — frontend scaffold.</p>
      <p data-testid="api-status">{status}</p>
      <p>
        Next: <strong>T03</strong> app shell and routing → <strong>T23–T28</strong> pages.
      </p>
    </main>
  );
}
