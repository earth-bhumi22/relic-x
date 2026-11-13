# RELIC-X — Team Roles

Two dimensions keep the work equal, the same model we used in eBioTrack:

1. **DSA work is divided equally.** The algorithm engine is split into two *slices*, one per
   member. Each member delivers the same DSA quota for every algorithm in their slice.
2. **Engineering work is divided by discipline.** Each member owns one side of the application
   (frontend or backend) and also owns the testing and documentation of their own code.

| Member | Discipline (whole project) | DSA slice |
|---|---|---|
| **A** — Arvind Kaushik (`@arvnd108`) | **Frontend** (UI, UI tests, user guide, demo flow) | **Graph & Search**: fragment graph, BFS/DFS, Greedy, Best-first (Prim), Dijkstra, Backtracking (branch & bound), accuracy metrics |
| **B** — Bhumi Kansal (`@earth-bhumi22`) | **Backend** (API, database, platform/DevOps, CI) | **Strings & Matching**: KMP, Rabin-Karp, LCS, Edit Distance, Hashing pre-filter, feature extraction, composite matcher |

The slices follow the pipeline: **B's slice decides *which* pieces fit** (edge strings → scores),
and **A's slice decides *where* they go** (graph → arrangement). Each slice also lines up with
what that member builds: B serves the scores and "Why matched?" data from the API, and A draws
the graph, the canvas and the trace in the UI.

Full role descriptions: [roles/ROLE_A_FRONTEND.md](roles/ROLE_A_FRONTEND.md) ·
[roles/ROLE_B_BACKEND.md](roles/ROLE_B_BACKEND.md)

> **Starting point.** Version 0.1 of the engine and backend was generated as a working baseline
> (all tests pass). "Owning" an algorithm means you can explain every line in the viva, you
> extend its tests, derive and measure its complexity, document it, and present it. The
> frontend starts as a scaffold only and is built by A.

---

## 1. DSA work (divided equally)

### Algorithm ownership

| Slice | Owner | Algorithms | Engine files | Count |
|---|---|---|---|---|
| Strings & Matching | **B** | KMP, Rabin-Karp, LCS, Edit Distance, Hashing (n-gram signatures + memo cache) | `engine/strings/*`, `features.py`, `fragmenter.py`, `matcher.py` | 5 |
| Graph & Search | **A** | BFS / DFS, Greedy, Best-first (Prim), Dijkstra, Backtracking + branch & bound | `engine/graph.py`, `layout.py`, `solvers/*`, `metrics.py` | 5 (+ BFS/DFS pair) |

Shared, owned jointly: `engine/counters.py`, `engine/pipeline.py`, `engine/__init__.py`.

### Equal DSA quota (each member delivers all of this for **every** algorithm in their slice)

| # | Deliverable | Where |
|---|---|---|
| 1 | **Own the implementation**: read it, refactor if needed, explain every line | `backend/src/relicx/engine/...` |
| 2 | **Correctness tests**: textbook cases, comparison against a brute-force/naive version, at least one property test | `backend/tests/engine/` |
| 3 | **Complexity derivation**: recurrence or loop analysis, time *and* space, best/worst case | `docs/ALGORITHMS.md` (your section) |
| 4 | **Measured complexity**: operation counts (`OpCounter`) and wall time vs. input size, with a chart | `validation/` |
| 5 | **Explainability hook**: the algorithm's decisions show in the API (B) and in the UI (A) | API + UI |
| 6 | **Viva notes**: at least 3 likely questions with short answers per algorithm | `docs/VIVA_NOTES.md` (your section) |
| 7 | **Demo segment**: present your algorithms live | Demo |

### Slice details

**B — Strings & Matching** (string matching, dynamic programming, hashing)
- KMP: prefix function, O(n + m) amortised argument; vs. Rabin-Karp on identical inputs.
- Rabin-Karp: rolling hash, spurious-hit verification, expected vs. worst case.
- Longest shared motif: binary search over length (monotonicity argument) + KMP or RK decision step.
- LCS and Edit Distance: recurrences, two-row space optimisation, traceback for the "Why matched?" panel.
- Hashing: n-gram signatures + Jaccard pre-filter (how much it prunes vs. `top_k`), memo cache hit rate.
- Matcher: weight tuning experiment; match accuracy vs. noise and erosion.

**A — Graph & Search** (graphs, greedy, shortest paths, state-space search)
- Fragment graph: threshold and mutual top-k pruning; BFS vs. DFS components and visit order.
- Greedy: greedy-choice property, and a concrete counterexample where it fails.
- Best-first (Prim): max-heap, lazy deletion, relation to maximum spanning trees.
- Dijkstra: correctness argument, and why a path-sum objective underperforms for assembly.
- Backtracking: validity of both bounds, effect of the greedy starting solution, node count vs. n,
  truncation. Extension: a DP formulation (row-profile DP for 2 × n strips), as the synopsis
  mentions "Backtracking / DP extension".
- Metrics: neighbour and direct accuracy, including invariance to global rotation.

---

## 2. Engineering work (divided by discipline)

### A — Frontend (Arvind)

- App shell, routing, layout, API client with mock mode, TypeScript types generated from OpenAPI
- Pages: Projects and the create-artifact wizard, Fragment gallery, Similarity graph,
  "Why matched?" drawer, Reconstruction canvas with trace playback, Lab / benchmark dashboard
- Loading, empty and error states on every page; responsive layout
- **Testing:** Vitest + React Testing Library unit tests; one end-to-end smoke test; frontend CI job
- **Docs:** user guide with screenshots, demo script and slides, Graph & Search section of
  `docs/ALGORITHMS.md` and `docs/VIVA_NOTES.md`
- **Validation:** solver benchmark experiments and `validation/results.md` tables

### B — Backend (Bhumi)

- API (FastAPI), services, repositories, database schema and Alembic migrations, file storage
- Platform/DevOps: Docker and docker-compose, Codespaces devcontainer, CI pipeline, branch protection
- Features: background jobs for long runs, CSV exports, pagination, optional API key, rate limiting,
  demo seed command
- **Testing:** API and integration tests on PostgreSQL, migration tests, coverage target
- **Docs:** `planning/CONTRACT.md` upkeep, `docs/API.md`, database/ER documentation,
  `SECURITY.md` and deployment notes, Strings & Matching section of `docs/ALGORITHMS.md` and
  `docs/VIVA_NOTES.md`
- **Validation:** matcher experiments (KMP vs. Rabin-Karp, weight sweep, robustness to noise)

---

## 3. Workload summary

| | A — Arvind (Frontend) | B — Bhumi (Backend) |
|---|---|---|
| DSA slice | Graph & Search: 5 algorithms + metrics | Strings & Matching: 5 algorithms + matcher |
| Discipline | All pages and UI, frontend CI | All API, DB, DevOps, CI |
| Testing | UI unit + E2E smoke, solver tests | API/integration/migration tests, string tests |
| Docs | User guide, demo, slides, own algorithm docs | API/contract, DB/ER, security, own algorithm docs |
| Validation | Solver benchmarks + results tables | Matcher experiments |
| GitHub issues | 15 | 15 (+3 shared by both) |

## 4. Working conventions

- One branch per issue: `a/<task-id>-<short-name>` or `b/<task-id>-<short-name>`
  (for example `a/t25-graph-view`, `b/t20-async-jobs`). Never commit directly to `main`.
- **Every pull request is reviewed and approved by the other member** before merging. With two
  people, cross-review means both of you read each other's algorithms and code before the viva.
  The author merges after approval. Bhumi (repository owner) manages settings and branch protection.
- Link the PR to its issue (`Closes #12`) so the issue closes automatically.
- Changes to the API shape go through [CONTRACT.md](CONTRACT.md) first. Tell the other member
  before changing their files. [CODEOWNERS](../.github/CODEOWNERS) automatically requests the other member as reviewer:
  Bhumi reviews everything in Arvind's areas, Arvind reviews everything in Bhumi's.
- CI must be green before merge. Never commit secrets, `.env`, `relicx.db` or `storage/`.

## 5. Order of work

Work is organised by phase and dependency, not by dates. The full task list, prerequisites and
gates are in [WORKFLOW.md](WORKFLOW.md). In outline:

1. **Contract:** review and sign off the API contract together (T00).
2. **Foundations:** B verifies the backend on PostgreSQL and makes CI green; A builds the app shell
   with a mock API client.
3. **Algorithms:** both work on their DSA slice in parallel: tests → complexity → experiments.
4. **Features:** A builds each page against mocks, then against the real API; B adds jobs,
   exports and hardening.
5. **Docs, validation and demo:** each documents their own work; both run the end-to-end check and rehearse.

## 6. Demo ownership

| Demo step | Presenter |
|---|---|
| Problem, architecture, why classical algorithms | B |
| Create an artifact, fragment it, gallery and edge strings | A (UI) with B (feature extraction) |
| Matching: hash pre-filter, KMP vs. Rabin-Karp, LCS / edit distance in "Why matched?" | B |
| Similarity graph, pruning, BFS vs. DFS | A |
| Reconstruction: greedy vs. best-first vs. Dijkstra, trace playback | A |
| Backtracking + branch & bound, truncation, scaling chart | A |
| Benchmark dashboard: time, operation counts, accuracy | B (API + data) with A (UI) |
| Complexity summary and conclusions | both |
