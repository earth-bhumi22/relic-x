# Changelog

## [0.1.0] — 2026-11-13

### Added
- Algorithm engine: KMP, Rabin-Karp, longest-motif search, LCS, edit distance, n-gram hashing
  pre-filter, composite matcher; fragment graph with BFS/DFS; greedy, best-first (Prim),
  Dijkstra and backtracking (branch & bound) solvers; accuracy metrics; operation counters.
- FastAPI backend: artifacts (sample / upload / real fragments), matching, graph, explanation,
  runs, benchmark, scaling experiment; SQLAlchemy models with integrity constraints; Alembic migration.
- 69 backend tests (engine, API, migrations) and an engine-purity architecture test.
- Frontend scaffold (React + TypeScript + Vite) with OpenAPI-generated types.
- Docker compose stack, CI, CodeQL, Dependabot, Codespaces devcontainer.
- Planning documents (architecture, team roles, workflow, contract) and validation harness.
