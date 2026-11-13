# Member A — Frontend

**Assigned to:** Arvind Kaushik (`@arvnd108`)

**DSA slice:** Graph & Search

Related documents: [TEAM_ROLES](../TEAM_ROLES.md) · [ARCHITECTURE](../ARCHITECTURE.md) · [WORKFLOW](../WORKFLOW.md) · [CONTRACT](../CONTRACT.md)

---

## 1. Your role

You build everything users see: the React app that turns RELIC-X from a set of algorithms into
an interactive lab. You draw the fragment gallery, the similarity graph, the "Why matched?"
breakdown, the animated reconstruction with trace playback, and the benchmark dashboard. The
app must make each algorithm's decisions visible and easy to follow.

You also own the **second half of the algorithm pipeline**: once B's matcher has scored the edges,
your algorithms build the fragment graph and decide where every piece goes. You are the person
who explains greedy, best-first, Dijkstra and backtracking in the viva.

## 2. What you need to do

**Frontend**
- App shell, routing, layout and theme; API client with a **mock mode**, so you are never blocked on the backend
- TypeScript types generated from the backend OpenAPI spec (`npm run gen:types`)
- Pages:
  - **Projects:** artifact cards and a *create artifact* wizard (sample / upload image / upload real fragments; grid, rotation, noise, erosion, missing pieces)
  - **Fragment gallery:** scrambled pieces; click one to see its four edge strings as colour beads
  - **Similarity graph:** nodes and weighted edges (Cytoscape.js), threshold and top-k sliders, BFS vs. DFS colouring and visit order
  - **"Why matched?" drawer:** both edges side by side, LCS pairs highlighted, edit operations, shared motif, hash overlap, weighted score bar
  - **Reconstruction canvas:** algorithm picker, animated placement, confidence rings, step-by-step trace player, ground-truth overlay
  - **Lab / benchmark:** all solvers side by side (time, operation counts, score, accuracy), time-vs-n scaling chart, CSV export
- Loading, empty and error states on every page (the API error shape is in CONTRACT §4)

**DSA slice: Graph & Search**

| Algorithm | File | What you deliver (quota in TEAM_ROLES §1) |
|---|---|---|
| Fragment graph + pruning, BFS / DFS | `engine/graph.py` | tests, O(V+E) analysis, edges-vs-threshold experiment |
| Greedy | `engine/solvers/greedy.py` | greedy-choice analysis, counterexample, experiment |
| Best-first (Prim) | `engine/solvers/best_first.py` | heap analysis, relation to MST, experiment |
| Dijkstra | `engine/solvers/dijkstra.py` | correctness sketch, why path-sum underperforms, experiment |
| Backtracking + B&B | `engine/solvers/backtracking.py` | bound proofs, node-count chart, DP extension |
| Metrics | `engine/metrics.py` | neighbour / direct accuracy, rotation invariance |

**Testing:** Vitest + React Testing Library for components and hooks; one end-to-end smoke test;
the frontend CI job (lint, type-check, test, build).

**Documentation:** Graph & Search sections of `docs/ALGORITHMS.md` and `docs/VIVA_NOTES.md`,
user guide with screenshots (`docs/USER_GUIDE.md`), demo script and slides.

**Validation:** `validation/run_benchmarks.py` experiments and the tables in `validation/results.md`.

## 3. Files and folders you own

| Area | Path |
|---|---|
| Frontend | `frontend/**` |
| Your slice | `backend/src/relicx/engine/graph.py`, `layout.py`, `metrics.py`, `solvers/**` |
| Your tests | `backend/tests/engine/test_graph_solvers_metrics.py` (+ new solver tests) |
| Validation | `validation/run_benchmarks.py`, `validation/results.md` |
| Docs | `docs/USER_GUIDE.md`, `docs/DEMO_SCRIPT.md`, your sections of `docs/ALGORITHMS.md`, `docs/VIVA_NOTES.md` |

## 4. Your workflow

Task IDs match [WORKFLOW.md](../WORKFLOW.md); each one is a GitHub issue assigned to you.

1. **T00** Contract sign-off with B (both).
2. **T03** App shell, routing, API client with mock mode.
3. **T04** Frontend test setup and CI job.
4. Your DSA slice, in this order: **T14** graph + BFS/DFS → **T15** greedy + best-first → **T16** Dijkstra → **T17** backtracking + DP extension.
5. Pages, against mocks first and then the real API: **T23** projects + wizard → **T24** gallery → **T25** graph view → **T26** "Why matched?" → **T27** reconstruction canvas → **T28** lab dashboard.
6. **T32** Solver benchmarks and results tables.
7. **T43** Your algorithm docs and viva notes; **T44** user guide, demo script, slides.
8. **T50 – T51** End-to-end check and demo rehearsal (both).

Branches: `a/<task-id>-<short-name>` (for example `a/t25-graph-view`). One pull request per issue,
reviewed and approved by B.

## 5. Tasks you can start now

- **T03** app shell with mock data built from the example payloads in CONTRACT §6
- **T14 – T17** your algorithms already run, so start with tests and complexity write-ups

## 6. Tasks that need someone else first

| Your task | Needs | From | While you wait |
|---|---|---|---|
| T23 – T28 real-API integration | T01 backend verified | B | Build against the mock client |
| T28 CSV download button | T21 export endpoints | B | Generate CSV in the browser from the benchmark JSON |
| T27 progress bar for long backtracking runs | T20 background jobs | B | Run synchronously with a small `node_limit` |
| T04 frontend CI job | T02 CI pipeline | B | Run `npm test` and `npm run build` locally |

## 7. Who is waiting on you

| Person | Task | Waiting for |
|---|---|---|
| B | T41 API docs screenshots | Your pages (T23 – T28) |
| B | T20 job status shape | Your feedback on how the canvas polls progress |
| Both | T50 end-to-end run | Every page integrated (gate G3) |

## 8. Rules and done criteria

- The frontend talks only to `/api/v1`, never to files or the database.
- Types come from `npm run gen:types`; do not hand-edit `src/api/schema.d.ts`.
- Every page handles loading, empty and error states.
- Done means: the page works against the real API, has at least one test, is merged with B's
  approval, and has a screenshot in the user guide.
