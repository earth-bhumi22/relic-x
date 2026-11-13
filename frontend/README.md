# RELIC-X frontend

Owner: **A — Arvind**. Scaffold only: the shell and pages are built in issues T03 and T23–T28
(see [planning/WORKFLOW.md](../planning/WORKFLOW.md) and [ROLE_A_FRONTEND.md](../planning/roles/ROLE_A_FRONTEND.md)).

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /api to http://localhost:8000)
npm test             # Vitest + React Testing Library
npm run gen:types    # regenerate src/api/schema.d.ts from the running backend
```
