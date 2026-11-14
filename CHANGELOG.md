# Changelog

## [Unreleased]

### Fixed
- Database writes are now committed **before** the HTTP response is sent
  (`Depends(get_db, scope="function")`). Previously a client re-reading immediately after a
  write (e.g. GET right after DELETE) could see stale data. Found in T01; regression test added.
- Deleting an artifact or run lets PostgreSQL's `ON DELETE CASCADE` remove child rows in one
  statement (`passive_deletes=True`) instead of the ORM deleting them row by row.

### Added
- `relicx seed [--reset]` (T05): three demo artifacts (plain 4×4, rotated 4×4, 5×5 with a missing piece), each matched and solved by all four algorithms. Idempotent; `--reset` only touches demo artifacts.
- `backend/scripts/smoke_pipeline.py`: end-to-end check of a running API (69 checks); runs in CI
  against PostgreSQL 16.

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
