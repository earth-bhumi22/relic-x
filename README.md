# 🏺 RELIC-X

[![CI](https://github.com/earth-bhumi22/relic-x/actions/workflows/ci.yml/badge.svg)](https://github.com/earth-bhumi22/relic-x/actions/workflows/ci.yml)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](backend/pyproject.toml)
[![React + TypeScript](https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-61dafb.svg)](frontend/package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Interactive System for Reconstruction of Fragmented Cultural Artifacts.**
An ADA (Analysis and Design of Algorithms) project, Faculty of Technology, University of Delhi. CSE-B, Semester III.

Archaeological artifacts come back from the ground broken, shuffled and damaged.
RELIC-X is a web-based **algorithm laboratory** that reassembles 2-D fragments
using *classical, explainable* algorithms (string matching, dynamic programming,
hashing, graph search, greedy, shortest paths and backtracking) and shows
**why** every piece was placed where it was.

It answers two questions:

1. **What reconstruction did we get?** Fragments are scored pairwise, turned into a
   weighted graph, and assembled by a choice of four solvers.
2. **Why did the algorithm put these two pieces together?** Every join can be broken
   down into its LCS, edit-distance, motif (KMP / Rabin-Karp), hash and colour scores,
   and every solver decision is replayable as a step-by-step trace.

---

## ⚠️ Read this before you demo anything

- **Accuracy numbers are on synthetic fragments.** Artifacts are cut from a known
  image so the true arrangement is available for measurement (synopsis §6). Real
  fragments can be uploaded and reconstructed, but no accuracy can be reported for them
  because there is no ground truth.
- **Backtracking is exponential.** It runs branch-and-bound with a node limit. When
  the limit is hit, the run is marked `truncated` and returns the best arrangement
  found. That is expected behaviour, and the scaling chart is built to show it.
- **Periodic patterns are genuinely ambiguous.** If an image repeats exactly at the cut
  spacing, several arrangements are equally valid for *any* algorithm. The bundled
  samples are drawn to avoid this.
- **Fragments are square grid tiles** in this version (rotation in 90° steps).
  Free-form contours and 3-D point clouds are future work; see
  [`planning/ARCHITECTURE.md`](planning/ARCHITECTURE.md) §Scope.

---

## 🧭 How it works

```mermaid
flowchart LR
    IMG[Artifact image<br/>or uploaded fragments] --> FR[Fragmenter<br/>ground truth]
    FR --> FE[Feature extractor<br/>edge → symbol string]
    FE --> MA[Matcher<br/>Hash pre-filter →<br/>KMP/RK · LCS · Edit Distance]
    MA --> GR[Fragment graph<br/>pruning · BFS / DFS]
    GR --> SO{Solver}
    SO --> G1[Greedy]
    SO --> G2[Best-first / Prim]
    SO --> G3[Dijkstra]
    SO --> G4[Backtracking<br/>branch & bound]
    G1 & G2 & G3 & G4 --> EV[Placements · trace ·<br/>accuracy · op counts]
```

Each fragment edge is read **clockwise** as a strip of pixels, resampled and
quantised into a symbol string such as `AAQQRbbcc…`. Two pieces fit when one
edge reads like the other edge reversed, which turns a picture problem into a
string problem.

| Stage | Technique | Complexity | ADA topic |
|---|---|---|---|
| Pre-filter | n-gram rolling-hash signatures + Jaccard | O(L) per edge | Hashing |
| Motif | Longest shared run: binary search + **KMP** or **Rabin-Karp** | O(log L · L²) / O(log L · L) exp. | String matching |
| Similarity | **LCS** (two-row DP) | O(L²) time, O(L) space | Dynamic programming |
| Damage cost | **Edit distance** (two-row DP) | O(L²) time, O(L) space | Dynamic programming |
| Groups | **BFS / DFS** connected components | O(V + E) | Graph traversal |
| Assembly | **Greedy** frontier placement | O(n³) | Greedy-choice property |
| Assembly | **Best-first** (Prim, max-heap) | O(E log E) | Priority queues, MST |
| Assembly | **Dijkstra** shortest-path tree | O((V+E) log V) | Shortest paths |
| Assembly | **Backtracking** + branch & bound | O((n·R)ⁿ) worst | State-space search |

Full derivations, recurrences and measured results are in [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md).

---

## 🏗️ System architecture

```mermaid
flowchart LR
    U[Browser] --> FE[React + TS frontend<br/>Vite · nginx]
    FE -->|REST /api/v1| API[FastAPI routes]
    API --> SV[Services<br/>business logic]
    SV --> RP[Repositories<br/>all SQL lives here]
    SV --> EN[Algorithm engine<br/>pure Python + NumPy]
    RP --> DB[(PostgreSQL / SQLite)]
    SV --> FS[(File storage<br/>fragment images)]
    T[pytest · vitest · CI] -.-> API
    T -.-> EN
```

**Layering rules**

- The frontend talks only to `/api/v1`; it never touches the database or files.
- Routes contain no logic: they validate input (Pydantic) and call one service.
- Services orchestrate repositories and the engine and raise *domain* errors, never HTTP errors.
- Only repositories build SQL queries.
- **The engine imports nothing from the web or DB layers.** This is enforced by
  `backend/tests/engine/test_engine_purity.py`, so every algorithm can be tested and
  benchmarked on its own.
- Integrity rules (sides 0–3, scores in [0, 1], one fragment per cell, no self-joins)
  are `CHECK` / `UNIQUE` constraints in the schema, not only Python checks.

---

## 📁 Repository layout

```text
relic-x/
├── backend/                  # Python package `relicx`
│   ├── src/relicx/
│   │   ├── engine/           # ★ algorithms: strings/, solvers/, matcher, graph, metrics
│   │   ├── api/              # FastAPI routes, dependencies, presenters
│   │   ├── services/         # business logic, storage
│   │   ├── repositories/     # data access (SQLAlchemy)
│   │   ├── db/               # ORM models, session
│   │   ├── schemas/          # request/response models = API contract
│   │   └── core/             # config, errors, logging
│   ├── migrations/           # Alembic
│   └── tests/                # engine/ (unit) · api/ (HTTP) · migrations
├── frontend/                 # React + TypeScript + Vite
│   └── src/                  # pages/ · components/ · api/ · hooks/ · types/
├── validation/               # reproducible benchmark + accuracy experiments
├── datasets/                 # sample artifacts and how they are generated
├── docs/                     # ALGORITHMS.md · API.md · VIVA_NOTES.md
├── planning/                 # ARCHITECTURE · TEAM_ROLES · CONTRACT · WORKFLOW
├── .github/                  # CI, CodeQL, dependabot, templates, CODEOWNERS
└── docker-compose.yml        # postgres → migrate → api → web
```

| Folder | Owner | Notes |
|---|---|---|
| `frontend/` | **A** | All UI (scaffold now; pages built in issues T23 – T28) |
| `backend/src/relicx/engine/{graph,layout,metrics}.py`, `solvers/` | **A** | Graph & Search slice: BFS/DFS, greedy, best-first, Dijkstra, backtracking |
| `backend/src/relicx/{api,services,repositories,db,schemas,core}` | **B** | API, persistence |
| `backend/src/relicx/engine/strings/`, `features.py`, `matcher.py` | **B** | Strings & Matching slice: KMP, Rabin-Karp, LCS, edit distance, hashing |
| `.github/`, `.devcontainer/`, Docker files | **B** | Platform / DevOps / CI |
| `validation/`, `docs/` | A + B | Each documents and measures their own algorithms |

Team key and full responsibilities: [`planning/TEAM_ROLES.md`](planning/TEAM_ROLES.md).

---

## 🚀 Quick start

### Option 0: GitHub Codespaces

**Code → Codespaces → Create codespace on `main`.** The devcontainer installs Python 3.11,
Node 20 and all dependencies. Then run the backend and frontend commands from Option 2.

### Option 1: Docker (whole stack, one command)

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm api relicx seed     # optional: 3 ready-to-demo artifacts
```

| Service | URL |
|---|---|
| Web app | http://localhost:8080 |
| API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

### Option 2: Local development

**Backend** (Python 3.11+). SQLite and local storage, no setup needed:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[api,dev]"
uvicorn relicx.main:app --reload                       # http://localhost:8000/docs
relicx seed                                            # optional demo data (idempotent; --reset to recreate)
```

**Frontend** (Node 20+):

```bash
cd frontend
npm install
npm run dev                                            # http://localhost:5173
```

### Verify an installation

With the stack running (Docker or local), run the end-to-end smoke test. It calls every
endpoint group, runs all four solvers, and cleans up after itself:

```bash
python backend/scripts/smoke_pipeline.py                         # API on :8000
python backend/scripts/smoke_pipeline.py --base http://localhost:8080   # through nginx (Docker)
```

It ends with `ALL CHECKS PASSED`. CI runs the same script against PostgreSQL 16 on every PR.

### Run the tests

```bash
cd backend && pytest            # engine + API + migration tests (SQLite)
RELICX_TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost/relicx_test pytest tests/api tests/test_constraints.py   # same, on PostgreSQL
ruff check . && black --check .
cd ../frontend && npm test && npm run build
```

---

## 🖥️ What you can do in the app

> **Status:** the engine and API are complete and tested (v0.1). The frontend is a scaffold;
> its screens are being built by A in issues T23 – T28. Until then, every feature can be used
> through the interactive API docs at `/docs`.

| Screen | What it shows | Issue |
|---|---|---|
| **Projects** | Artifact cards, create-artifact wizard (sample / upload / real fragments) | T23 |
| **Fragment gallery** | Scrambled pieces; click one to see its 4 edge strings as colour beads | T24 |
| **Similarity graph** | Fragments as nodes, joins as weighted edges; threshold / top-k pruning live; BFS vs DFS | T25 |
| **Why matched?** | LCS alignment, edit operations, shared motif, hash overlap, weighted score breakdown | T26 |
| **Reconstruction** | Animated assembly, step-by-step trace playback, ground-truth overlay | T27 |
| **Lab / Benchmark** | All solvers side by side: time, operation counts, accuracy; scaling chart; CSV export | T28 |

---

## 🔌 API at a glance

Base path `/api/v1`. The full contract is in [`planning/CONTRACT.md`](planning/CONTRACT.md); live docs are at `/docs`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + DB check |
| `GET` | `/samples` | Built-in demo artifacts |
| `POST` | `/artifacts/sample` · `/artifacts/upload` · `/artifacts/fragments-upload` | Create an artifact |
| `POST` | `/artifacts/{id}/fragment` | Re-cut with new grid / damage settings |
| `GET` | `/artifacts/{id}/fragments` | Fragment gallery |
| `POST` | `/artifacts/{id}/match` | Compute pairwise compatibility |
| `GET` | `/artifacts/{id}/graph` | Pruned graph + BFS/DFS components |
| `GET` | `/artifacts/{id}/explain` | "Why matched?" for one join |
| `POST` | `/artifacts/{id}/runs` | Run one solver |
| `POST` | `/artifacts/{id}/benchmark` | Run all solvers |
| `GET` | `/runs/{id}` | Placements + full trace |
| `POST` | `/benchmark/scaling` | Time / accuracy vs. fragment count |

Errors always have one shape: `{"error": {"code", "message", "details"}}`.

---

## 📊 Measured results

Neighbour accuracy (mean ± standard deviation over 12 runs: three samples × four seeds), damaged fragments (noise σ = 4,
30 % edge erosion), no rotation, backtracking with a 50,000-node limit. Reproduce with `python validation/run_benchmarks.py`.
Full tables (all scenarios, n up to 64, direct accuracy, coverage, operations, the oracle comparison and fitted growth) are in
[`validation/results.md`](validation/results.md); the per-run data is in `validation/solver_runs.csv`.

<!-- T32:readme-table:begin -->
| n | Greedy | Best-first | Dijkstra | Backtracking |
|---|---|---|---|---|
| 9 | 87 ± 21% · 0.2 ms | 92 ± 15% · 0.1 ms | 85 ± 24% · 0.1 ms | 98 ± 7% · 3.2 ms |
| 16 | 93 ± 15% · 0.8 ms | 93 ± 13% · 0.1 ms | 77 ± 26% · 0.2 ms | 95 ± 12% · 53.4 ms \* |
| 25 | 90 ± 13% · 2.2 ms | 83 ± 19% · 0.3 ms | 53 ± 22% · 0.5 ms | 91 ± 13% · 169.8 ms \* |
| 36 | 88 ± 20% · 5.2 ms | 83 ± 19% · 0.5 ms | 66 ± 30% · 0.8 ms | 88 ± 20% · 184.6 ms \* |

Mean ± sd over 12 runs per cell (3 samples × several seeds); bold = the only solver whose 95 % interval lies above all others.
<!-- T32:readme-table:end -->

\* backtracking hit its node limit on at least one run and returned its best-so-far.

- **Backtracking** (starting from the greedy solution) can fix greedy's early mistakes on small grids, but its cost explodes with n, and from about n = 25 every run stops at the node limit with its best-so-far.
- **Greedy** scores each candidate against *all* placed neighbours, so its mean accuracy is the highest of the three fast solvers from n = 25 on, but the spreads overlap at most sizes, so no ranking is claimed there.
- **Best-first (Prim)** does far fewer operations and takes far less time than greedy; it trusts single strongest joins.
- **Dijkstra** has the lowest mean accuracy at the larger sizes. Summing costs along paths is the wrong objective for assembly, which makes it a useful comparison point in the report.

---

## 📚 Documentation

| Document | Contents |
|---|---|
| [`planning/ARCHITECTURE.md`](planning/ARCHITECTURE.md) | Layers, ER diagram, data flow, scope, design decisions |
| [`planning/TEAM_ROLES.md`](planning/TEAM_ROLES.md) | Who owns what; role files in [`planning/roles/`](planning/roles) |
| [`planning/CONTRACT.md`](planning/CONTRACT.md) | API contract between frontend and backend |
| [`planning/WORKFLOW.md`](planning/WORKFLOW.md) | Branching, PRs, reviews, CI |
| [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) | Recurrences, proofs sketches, complexity, measured counts |
| [`docs/VIVA_NOTES.md`](docs/VIVA_NOTES.md) | Likely viva questions with short answers |
| [`docs/API.md`](docs/API.md) · [`docs/DATABASE.md`](docs/DATABASE.md) | API reference, ER diagram and constraints |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) · [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | Screens walkthrough, demo plan |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md) · [`CHANGELOG.md`](CHANGELOG.md) | Project hygiene |

---

## 👥 Team

| | Member | GitHub | Discipline | DSA slice |
|---|---|---|---|---|
| **A** | Arvind Kaushik (25293916019) | [@arvnd108](https://github.com/arvnd108) | Frontend | Graph & Search |
| **B** | Bhumi Kansal (25293916026) | [@earth-bhumi22](https://github.com/earth-bhumi22) | Backend + DevOps | Strings & Matching |

Work is split equally (15 issues each, plus 3 shared). Every PR is reviewed by the other member.
Full split: [`planning/TEAM_ROLES.md`](planning/TEAM_ROLES.md) · task order: [`planning/WORKFLOW.md`](planning/WORKFLOW.md).

Submitted to **Dr. Juhi Jain**, Analysis and Design of Algorithms.

## 📖 References

1. RePAIR Project, *The RePAIR Dataset and Benchmark for Real-World 2D and 3D Archaeological Fragment Reassembly.* https://repairproject.github.io/
2. Zhang, K. et al., *3D Fragment Reassembly Using Integrated Fracture-Region Matching.* ICCV 2015.
3. Cormen, Leiserson, Rivest, Stein, *Introduction to Algorithms*, 4th ed. (KMP, LCS, Dijkstra, Prim).

## License

[MIT](LICENSE)
