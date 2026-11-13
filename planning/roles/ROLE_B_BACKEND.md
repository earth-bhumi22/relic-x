# Member B — Backend

**Assigned to:** Bhumi Kansal (`@earth-bhumi22`), repository owner

**DSA slice:** Strings & Matching

Related documents: [TEAM_ROLES](../TEAM_ROLES.md) · [ARCHITECTURE](../ARCHITECTURE.md) · [WORKFLOW](../WORKFLOW.md) · [CONTRACT](../CONTRACT.md)

---

## 1. Your role

You own everything behind `/api/v1`: the FastAPI application, the service and repository
layers, the database schema and migrations, file storage, and the platform it runs on (Docker,
Codespaces, CI). You keep the API contract accurate so the frontend can build against it with
confidence.

You also own the **first half of the algorithm pipeline**: turning fragment edges into symbol
strings and scoring how well two edges fit, using string matching (KMP, Rabin-Karp), dynamic
programming (LCS, Edit Distance) and hashing. You are the person who explains those in the viva.

## 2. What you need to do

**Backend and platform**
- Verify the backend on PostgreSQL through docker-compose (the default dev database is SQLite)
- CI pipeline: lint, tests, migrations against a PostgreSQL service, compose validation; branch protection on `main`
- Codespaces devcontainer works from a fresh codespace
- Demo seed command that creates the three sample artifacts with matches and runs
- Background jobs for long solver runs (create → poll status), so the UI never waits on a 10-second request
- CSV export endpoints for runs, benchmarks and scaling results
- Hardening: pagination headers, optional API-key protection for write endpoints, rate limit on `/benchmark/scaling`

**DSA slice: Strings & Matching**

| Algorithm | File | What you deliver (quota in TEAM_ROLES §1) |
|---|---|---|
| KMP | `engine/strings/kmp.py` | tests vs. naive, amortised O(n+m) argument, experiment |
| Rabin-Karp | `engine/strings/rabin_karp.py` | collision analysis, expected vs. worst case, KMP-vs-RK chart |
| Longest motif (binary search + KMP/RK) | `engine/strings/motif.py` | monotonicity proof, complexity |
| LCS | `engine/strings/lcs.py` | recurrence, two-row space proof, traceback |
| Edit Distance | `engine/strings/edit_distance.py` | recurrence, operation script, damage interpretation |
| Hashing pre-filter + memo cache | `engine/strings/hashing.py`, `matcher.py` | pruning ratio vs. `top_k`, cache hit rate |
| Feature extraction + composite matcher | `engine/features.py`, `matcher.py`, `fragmenter.py` | weight sweep, accuracy vs. noise and erosion |

**Testing:** API and integration tests on PostgreSQL, migration tests, coverage ≥ 85 % for `relicx`.

**Documentation:** `planning/CONTRACT.md` upkeep, `docs/API.md`, `docs/DATABASE.md` (ER diagram,
constraints), `SECURITY.md` and deployment notes, Strings & Matching sections of
`docs/ALGORITHMS.md` and `docs/VIVA_NOTES.md`.

**Validation:** `validation/matcher_experiments.py` and its tables in `validation/results.md`.

## 3. Files and folders you own

| Area | Path |
|---|---|
| Backend | `backend/src/relicx/{api,services,repositories,db,schemas,core}/**`, `main.py`, `samples.py` |
| Migrations | `backend/migrations/**`, `backend/alembic.ini` |
| Your slice | `backend/src/relicx/engine/strings/**`, `features.py`, `fragmenter.py`, `matcher.py` |
| Your tests | `backend/tests/api/**`, `test_migrations.py`, `tests/engine/test_strings.py`, `test_features_and_matching.py`, `test_engine_purity.py` |
| Platform | `docker-compose.yml`, `backend/Dockerfile`, `.devcontainer/**`, `.github/**`, `.env.example` |
| Validation | `validation/matcher_experiments.py` |
| Docs | `docs/API.md`, `docs/DATABASE.md`, `SECURITY.md`, `planning/CONTRACT.md`, your sections of `docs/ALGORITHMS.md`, `docs/VIVA_NOTES.md` |

## 4. Your workflow

Task IDs match [WORKFLOW.md](../WORKFLOW.md); each one is a GitHub issue assigned to you.

1. **T00** Contract sign-off with A (both).
2. **T01** Backend on PostgreSQL via docker-compose; **T02** CI green + branch protection; **T05** seed command.
3. Your DSA slice, in this order: **T10** KMP + Rabin-Karp → **T11** LCS + Edit Distance → **T12** hashing pre-filter → **T13** features + matcher.
4. Features: **T20** background jobs → **T21** CSV exports → **T22** hardening.
5. **T30** PostgreSQL integration tests + coverage; **T31** matcher experiments.
6. **T40** your algorithm docs and viva notes; **T41** API docs; **T42** database docs.
7. **T50 – T51** End-to-end check and demo rehearsal (both).

Branches: `b/<task-id>-<short-name>` (for example `b/t20-async-jobs`). One pull request per issue,
reviewed and approved by A.

## 5. Tasks you can start now

- **T01, T02, T05**: the backend already runs, so make it run everywhere
- **T10 – T13**: your algorithms already run, so start with tests and complexity write-ups

## 6. Tasks that need someone else first

| Your task | Needs | From | While you wait |
|---|---|---|---|
| T20 job status response shape | Feedback on how the canvas polls | A | Propose the shape in CONTRACT §5 and ask A to review |
| T41 API docs screenshots | Pages integrated (T23 – T28) | A | Write the docs from Swagger (`/docs`) |
| T50 end-to-end run | Every page integrated (gate G3) | A | Finish T30 and T31 |

## 7. Who is waiting on you

| Person | Task | Waiting for |
|---|---|---|
| A | Real-API integration of every page | T01 backend verified on PostgreSQL |
| A | T04 frontend CI job | T02 CI pipeline |
| A | T27 progress bar for long runs | T20 background jobs |
| A | T28 CSV download | T21 export endpoints |

## 8. Rules and done criteria

- Routes stay thin; logic goes in services; only repositories write queries; the engine imports
  nothing from web/DB (a test enforces this).
- Every schema change is a new Alembic migration, and the migration test must pass.
- Every API change is reflected in CONTRACT.md in the same PR.
- Done means: tests added and green in CI, docs updated, merged with A's approval.
