# RELIC-X — Project Contract (T00)

**Version:** 0.1 (proposed)

This is the output of task **T00** in [WORKFLOW.md](WORKFLOW.md). It fixes the names, values and
response shapes that the backend (B) and frontend (A) build against, so neither has to guess.
The live, machine-readable version is the OpenAPI spec at `http://localhost:8000/openapi.json`;
the frontend generates its types from it with `npm run gen:types`.

Everything here is a **proposal with a sensible default**. Review it together, change what you
disagree with, then tick the sign-off at the end. Gate **G0** passes when both have signed off.

Related: [ARCHITECTURE](ARCHITECTURE.md) · [TEAM_ROLES](TEAM_ROLES.md) · [WORKFLOW](WORKFLOW.md)

---

## 1. Decisions checklist

| # | Decision | Recommended default | Agreed |
|---|---|---|---|
| D1 | Python version | 3.11+ | [ ] |
| D2 | Backend framework | FastAPI + Pydantic v2 | [ ] |
| D3 | ORM / migrations | SQLAlchemy 2 + Alembic | [ ] |
| D4 | Database | SQLite for dev, PostgreSQL 16 in compose and CI | [ ] |
| D5 | Frontend | React 18 + TypeScript + Vite | [ ] |
| D6 | Graph drawing | Cytoscape.js | [ ] |
| D7 | Charts | Recharts | [ ] |
| D8 | Frontend tests | Vitest + React Testing Library | [ ] |
| D9 | Lint / format | ruff + black (backend), ESLint + Prettier (frontend) | [ ] |
| D10 | JSON field naming | `snake_case`, same as the database | [ ] |
| D11 | IDs | 32-char hex UUID strings; fragment *labels* `F01`, `F02` … are used inside the engine and trace | [ ] |
| D12 | Side numbering | `0=N, 1=E, 2=S, 3=W`, clockwise | [ ] |
| D13 | Rotation | `rot` = number of 90° **clockwise** turns applied to a fragment image | [ ] |
| D14 | Auth | None in v0.1; optional `X-API-Key` on write endpoints added in T22 | [ ] |

## 2. Conventions

- Base path: `/api/v1`. All bodies are JSON except uploads (`multipart/form-data`) and images (`image/png`).
- Successful responses return the resource directly (no envelope).
- Every response carries `X-Request-ID` and `X-Response-Time-ms` headers.
- Times are ISO-8601 UTC strings.
- Scores are floats in `[0, 1]`, rounded to 4 decimals.

## 3. Shared engine interface (between the two DSA slices)

```text
compat[(frag_i, side_a, frag_j, side_b)] -> composite score in [0, 1]   (symmetric)
```

- Produced by B's `matcher.match_all` + `compat_table`; consumed by every one of A's solvers.
- Edge strings are read **clockwise**; side `a` of i is compared with **reversed** side `b` of j.
- Without rotation, only opposite sides can meet: `(E,W) (W,E) (S,N) (N,S)`.
- A placement `(row, col, rot)` puts original side `s` facing direction `(s + rot) % 4`.

## 4. Errors

```json
{ "error": { "code": "precondition_failed", "message": "run matching first (POST /artifacts/{id}/match)", "details": {} } }
```

| HTTP | `code` | When |
|---|---|---|
| 404 | `not_found` | Unknown artifact, fragment or run |
| 409 | `precondition_failed` | A pipeline step is missing (e.g. solving before matching) |
| 413 | `payload_too_large` | Upload over `RELICX_MAX_UPLOAD_MB` |
| 422 | `invalid_input` | Semantically invalid input (bad image, unknown sample) |
| 422 | `validation_error` | Schema validation failed; `details.errors` lists fields |
| 500 | `internal_error` | Unexpected; logged with the request ID |

## 5. Endpoints

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/health` | — | `{status, database, version}` |
| GET | `/samples` | — | `SampleInfo[]` |
| GET | `/samples/{name}/image` | — | PNG |
| GET | `/artifacts` | `limit≤200, offset` | `ArtifactOut[]` |
| POST | `/artifacts/sample` | `{name, sample, description?, fragment: FragmentParams}` | 201 `ArtifactOut` |
| POST | `/artifacts/upload` | multipart: `name`, `image`, `params` (FragmentParams JSON) | 201 `ArtifactOut` |
| POST | `/artifacts/fragments-upload` | multipart: `name`, `rows`, `cols`, `files[]` | 201 `ArtifactOut` (no ground truth) |
| GET | `/artifacts/{id}` | — | `ArtifactOut` |
| DELETE | `/artifacts/{id}` | — | 204 |
| GET | `/artifacts/{id}/image` | — | PNG |
| POST | `/artifacts/{id}/fragment` | `FragmentParams` | `FragmentOut[]` (old matches and runs deleted) |
| GET | `/artifacts/{id}/fragments` | — | `FragmentOut[]` |
| GET | `/fragments/{id}` | — | `FragmentDetail` (adds numeric `strips`) |
| GET | `/fragments/{id}/image` | — | PNG |
| POST | `/artifacts/{id}/match` | `MatchParams` (all optional) | `{config, stats}` |
| GET | `/artifacts/{id}/matches` | `min_score, limit` | `SideMatchOut[]` (best first) |
| GET | `/artifacts/{id}/graph` | `threshold, top_k?, traversal=bfs\|dfs` | `{nodes, edges, components, traversal, stats}` |
| GET | `/artifacts/{id}/explain` | `a, side_a, b, side_b` | explanation (§6.4) |
| POST | `/artifacts/{id}/runs` | `{algorithm, threshold?, top_k?, node_limit?}` | 201 `RunDetail` |
| GET | `/artifacts/{id}/runs` | — | `RunOut[]` |
| POST | `/artifacts/{id}/benchmark` | `{algorithms[], node_limit?}` | `RunDetail[]` |
| GET | `/runs/{id}` | — | `RunDetail` |
| DELETE | `/runs/{id}` | — | 204 |
| POST | `/benchmark/scaling` | `{sample, sizes[], algorithms[], rotate, noise, erosion, node_limit}` | `{sample, rotate, points[]}` |
| *planned* POST | `/artifacts/{id}/jobs` | same as runs | 202 `{job_id, status}` (T20) |
| *planned* GET | `/jobs/{id}` | — | `{status: queued\|running\|done\|failed, progress, run_id?}` (T20) |
| *planned* GET | `/runs/{id}/export.csv`, `/artifacts/{id}/benchmark.csv` | — | CSV (T21) |

`algorithm` ∈ `greedy | best_first | dijkstra | backtracking`.

## 6. Example payloads

### 6.1 `ArtifactOut`

```json
{
  "id": "4f1c2a9e0b7d4e6f8a1b2c3d4e5f6a7b",
  "name": "Mughal tile panel",
  "description": "Glazed geometric tile panel with star rosettes",
  "source_kind": "sample",
  "grid_rows": 4, "grid_cols": 4, "tile": 120,
  "has_ground_truth": true,
  "fragment_params": {"rows": 4, "cols": 4, "rotate": false, "noise": 4.0, "erosion": 0.2, "missing": 0, "seed": 7, "missing_cells": []},
  "match_config": null, "match_stats": null,
  "created_at": "2026-11-13T11:30:00Z",
  "fragment_count": 16, "run_count": 0, "best_accuracy": null,
  "image_url": "/api/v1/artifacts/4f1c…/image"
}
```

### 6.2 `FragmentOut`

```json
{
  "id": "9a8b…", "label": "F07", "width": 120, "height": 120,
  "image_url": "/api/v1/fragments/9a8b…/image",
  "true_row": 1, "true_col": 2, "scramble_rot": 0,
  "edges": {"N": "AAQQRbbcc…", "E": "…", "S": "…", "W": "…"}
}
```

### 6.3 Match summary

```json
{
  "config": {"strip_len": 24, "levels": 4, "motif_method": "kmp", "top_k": 6, "allow_rotation": false, "weights": {"color": 0.4, "lcs": 0.2, "edit": 0.15, "motif": 0.15, "hash": 0.1}},
  "stats": {"fragments": 16, "side_pairs_total": 480, "side_pairs_scored": 132, "side_pairs_skipped": 348, "cache_hits": 3, "elapsed_ms": 61.2, "operations": {"dp_cells": 152064, "char_comparisons": 40211}, "match_accuracy": 1.0}
}
```

### 6.4 Explanation ("Why matched?")

```json
{
  "a": "F03", "side_a": "E", "b": "F11", "side_b": "W",
  "edge_a": "AAQQRbbcc…", "edge_b_reversed": "AAQRRbbcd…",
  "scores": {"color": 0.91, "lcs": 0.83, "edit": 0.79, "motif": 0.42, "hash": 0.55},
  "weights": {"color": 0.4, "lcs": 0.2, "edit": 0.15, "motif": 0.15, "hash": 0.1},
  "contributions": {"color": 0.364, "lcs": 0.166, "edit": 0.1185, "motif": 0.063, "hash": 0.055},
  "composite": 0.7665,
  "lcs": {"length": 20, "subsequence": "…", "pairs": [[0, 0], [1, 1]]},
  "edit": {"distance": 5, "ops": [{"op": "match", "a": "A", "b": "A"}, {"op": "sub", "a": "Q", "b": "R"}]},
  "motif": {"length": 10, "pos_a": 4, "pos_b": 4, "motif": "Rbbcc…", "kmp_ops": 812, "rabin_karp_ops": 233},
  "hash": {"ngram": 3, "shared": 11, "union": 20},
  "ground_truth_neighbours": true
}
```

### 6.5 `RunDetail`

```json
{
  "id": "c0ffee…", "artifact_id": "4f1c…", "algorithm": "greedy",
  "params": {"threshold": 0.0, "top_k": null, "node_limit": 150000, "seed": null},
  "elapsed_ms": 1.4, "operations": {"score_lookups": 5120},
  "total_score": 19.84, "neighbour_accuracy": 1.0, "direct_accuracy": 1.0, "coverage": 1.0,
  "truncated": false, "meta": {"seed": "F07", "unplaced": []},
  "created_at": "2026-11-13T11:32:00Z",
  "placements": [{"fragment_id": "9a8b…", "label": "F07", "row": 1, "col": 2, "rot": 0}],
  "trace": [
    {"step": 1, "action": "seed", "message": "Seed F07: strongest total edge weight", "data": {"fragment": "F07", "row": 0, "col": 0, "rot": 0}},
    {"step": 2, "action": "place", "message": "Place F03 at (0, 1) rot 0° — best local score 0.912 from 1 neighbour(s)", "data": {"fragment": "F03", "row": 0, "col": 1, "rot": 0, "score": 0.912}}
  ],
  "trace_dropped": {}
}
```

Trace `action` values: `seed`, `place`, `conflict`, `fallback`, `prune`, `backtrack`, `best`,
`incumbent`, `limit`, `stop`. Placement `row`/`col` are normalised so the top-left is `(0, 0)`;
trace coordinates are the solver's internal ones (seed at `(0, 0)`, may be negative).

## 7. Changing this contract

1. Open a PR that edits this file **and** the code (`schemas/`, routes) together.
2. Bump the version line at the top and say what changed.
3. The other member must approve. A regenerates types with `npm run gen:types`.

## 8. Sign-off

| Member | Signed | Date |
|---|---|---|
| A — Arvind | [ ] | |
| B — Bhumi | [ ] | |
