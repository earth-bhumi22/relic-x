# Contributing to RELIC-X

Two-person team: **A — Arvind** (frontend, Graph & Search) and **B — Bhumi** (backend,
Strings & Matching). Roles: [planning/TEAM_ROLES.md](planning/TEAM_ROLES.md).

## Flow

1. Take an issue assigned to you. Its title starts with the task ID from
   [planning/WORKFLOW.md](planning/WORKFLOW.md), e.g. `T25 · Similarity graph view`.
2. Branch from `main`: `a/t25-graph-view` or `b/t20-async-jobs`.
3. Commit with a clear message (`feat(graph): add top-k slider`, `test(lcs): property test`).
4. Open a PR using the template and link the issue (`Closes #N`).
5. CI must be green. **The other member reviews and approves**; then the author merges (squash).

## Local checks

```bash
cd backend  && ruff check . && black --check . && pytest
cd frontend && npm run typecheck && npm test && npm run build
```

## Rules

- The engine (`backend/src/relicx/engine`) never imports web or DB code (a test enforces it).
- API changes update `planning/CONTRACT.md` in the same PR; A regenerates types (`npm run gen:types`).
- Schema changes are new Alembic migrations (`alembic revision --autogenerate -m "..."`).
- Never commit `.env`, `*.db` or `storage/`.
