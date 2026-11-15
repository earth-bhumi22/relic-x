# RELIC-X — API reference

**Owner:** B — Bhumi · **Issue:** T41 · Contract: [`planning/CONTRACT.md`](../planning/CONTRACT.md) · Live docs: `/docs` (Swagger), `/redoc`

> **Generated** by `backend/scripts/gen_api_docs.py` from real requests against a throwaway instance. Every example
> response below is what the API returned. Long arrays show their first items (`"… N more"`), ids are replaced with
> placeholders such as `<artifact_id>`; timing fields (`elapsed_ms`, …) differ on every run. Regenerate after any API change: `cd backend && python scripts/gen_api_docs.py`.

## Conventions

- Base URL `http://localhost:8000/api/v1` (behind the Docker nginx: `http://localhost:8080/api/v1`).
- JSON in and out, `snake_case` fields; uploads are `multipart/form-data`; images `image/png`; exports `text/csv`.
- Fragment sides: `0 = N, 1 = E, 2 = S, 3 = W`, each edge read **clockwise**. `rot` = quarter turns clockwise.
- Every response has `X-Request-ID` (quote it in bug reports) and `X-Response-Time-ms`.
- Lists take `limit` / `offset`; the total is in `X-Total-Count`.
- Optional write protection: if the server sets `RELICX_API_KEY`, every POST/DELETE needs `X-API-Key`.

**Typical flow:** create an artifact → `POST /match` → `GET /graph` / `GET /explain` → `POST /runs` (or a job) → `GET /runs/{id}` → CSV.

## Health and samples

### `GET /api/v1/health`

**Liveness.** `database` is false if the database cannot be reached (status `degraded`).

```bash
curl -s "http://localhost:8000/api/v1/health"
```

**Response** `200`

```json
{
  "status": "ok",
  "database": true,
  "version": "0.1.0"
}
```

### `GET /api/v1/samples`

**Built-in demo artifacts.** Procedurally drawn images (no copyrighted content).

```bash
curl -s "http://localhost:8000/api/v1/samples"
```

**Response** `200`

```json
[
  {
    "name": "mosaic-tile",
    "description": "Glazed geometric tile panel with star rosettes",
    "image_url": "/api/v1/samples/mosaic-tile/image"
  },
  {
    "name": "pottery-band",
    "description": "Painted pottery shard with wave and meander bands",
    "image_url": "/api/v1/samples/pottery-band/image"
  },
  {
    "name": "manuscript",
    "description": "Illuminated manuscript leaf with glyph rows and border",
    "image_url": "/api/v1/samples/manuscript/image"
  }
]
```

### `GET /api/v1/samples/mosaic-tile/image`

**Sample preview.** Cached for a day.

```bash
curl -s "http://localhost:8000/api/v1/samples/mosaic-tile/image"
```

**Response** `200`

Binary body: `image/png`.

## Artifacts

### `POST /api/v1/artifacts/sample`

**Create from a sample.** Cuts the sample into a grid (synthetic fragments **with ground truth**). `fragment` fields are optional: rows/cols 2–8, `rotate`, `noise` 0–30, `erosion` 0–1, `missing` 0–6, `seed`.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/sample" \
  -H 'Content-Type: application/json' -d '{"name": "Mughal tile panel", "sample": "mosaic-tile", "fragment": {"rows": 3, "cols": 3, "noise": 4, "erosion": 0.2}}'
```

**Response** `201`

```json
{
  "id": "<artifact_id>",
  "name": "Mughal tile panel",
  "description": "Glazed geometric tile panel with star rosettes",
  "source_kind": "sample",
  "grid_rows": 3,
  "grid_cols": 3,
  "tile": 160,
  "has_ground_truth": true,
  "fragment_params": {
    "rows": 3,
    "cols": 3,
    "rotate": false,
    "noise": 4.0,
    "erosion": 0.2,
    "missing": 0,
    "seed": 7,
    "missing_cells": []
  },
  "match_config": null,
  "match_stats": null,
  "created_at": "2026-11-15T10:00:00Z",
  "fragment_count": 9,
  "run_count": 0,
  "best_accuracy": null,
  "image_url": "/api/v1/artifacts/<artifact_id>/image"
}
```

### `POST /api/v1/artifacts/upload`

**Create from your own image.** Multipart. `params` is the same FragmentParams object as JSON. PNG, JPEG, WebP or BMP, up to `RELICX_MAX_UPLOAD_MB` (default 15).

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/upload" \
  -F name='My scan' -F image=@scan.png -F params='{"rows": 2, "cols": 2}'
```

**Response** `201`

```json
{
  "id": "<upload_id>",
  "name": "My scan",
  "description": null,
  "source_kind": "upload",
  "grid_rows": 2,
  "grid_cols": 2,
  "tile": 80,
  "has_ground_truth": true,
  "fragment_params": {
    "rows": 2,
    "cols": 2,
    "rotate": false,
    "noise": 4.0,
    "erosion": 0.2,
    "missing": 0,
    "seed": 7,
    "missing_cells": []
  },
  "match_config": null,
  "match_stats": null,
  "created_at": "2026-11-15T10:00:00Z",
  "fragment_count": 4,
  "run_count": 0,
  "best_accuracy": null,
  "image_url": "/api/v1/artifacts/<upload_id>/image"
}
```

### `POST /api/v1/artifacts/fragments-upload`

**Create from real fragment photos.** Multipart, one `files` part per fragment. **No ground truth**, so runs report coverage but no accuracy.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/fragments-upload" \
  -F name='Field finds' -F rows=2 -F cols=2 -F files=@f1.png -F files=@f2.png …
```

**Response** `201`

```json
{
  "id": "<real_id>",
  "name": "Field finds",
  "description": null,
  "source_kind": "fragments",
  "grid_rows": 2,
  "grid_cols": 2,
  "tile": 96,
  "has_ground_truth": false,
  "fragment_params": {},
  "match_config": null,
  "match_stats": null,
  "created_at": "2026-11-15T10:00:00Z",
  "fragment_count": 4,
  "run_count": 0,
  "best_accuracy": null,
  "image_url": null
}
```

### `GET /api/v1/artifacts`

**List artifacts.** Newest first. `limit` ≤ 200, `offset`; total in `X-Total-Count`.

```bash
curl -s "http://localhost:8000/api/v1/artifacts?limit=2&offset=0"
```

**Response** `200` · `X-Total-Count: 3`

```json
[
  {
    "id": "<real_id>",
    "name": "Field finds",
    "description": null,
    "source_kind": "fragments",
    "grid_rows": 2,
    "grid_cols": 2,
    "tile": 96,
    "has_ground_truth": false,
    "fragment_params": {},
    "match_config": null,
    "match_stats": null,
    "created_at": "2026-11-15T10:00:00Z",
    "fragment_count": 4,
    "run_count": 0,
    "best_accuracy": null,
    "image_url": null
  },
  {
    "id": "<upload_id>",
    "name": "My scan",
    "description": null,
    "source_kind": "upload",
    "grid_rows": 2,
    "grid_cols": 2,
    "tile": 80,
    "has_ground_truth": true,
    "fragment_params": {
      "rows": 2,
      "cols": 2,
      "rotate": false,
      "noise": 4.0,
      "erosion": 0.2,
      "missing": 0,
      "seed": 7,
      "missing_cells": []
    },
    "match_config": null,
    "match_stats": null,
    "created_at": "2026-11-15T10:00:00Z",
    "fragment_count": 4,
    "run_count": 0,
    "best_accuracy": null,
    "image_url": "/api/v1/artifacts/<upload_id>/image"
  }
]
```

### `GET /api/v1/artifacts/<artifact_id>`

**One artifact.** Includes `fragment_count`, `run_count`, `best_accuracy`.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>"
```

**Response** `200`

```json
{
  "id": "<artifact_id>",
  "name": "Mughal tile panel",
  "description": "Glazed geometric tile panel with star rosettes",
  "source_kind": "sample",
  "grid_rows": 3,
  "grid_cols": 3,
  "tile": 160,
  "has_ground_truth": true,
  "fragment_params": {
    "rows": 3,
    "cols": 3,
    "rotate": false,
    "noise": 4.0,
    "erosion": 0.2,
    "missing": 0,
    "seed": 7,
    "missing_cells": []
  },
  "match_config": null,
  "match_stats": null,
  "created_at": "2026-11-15T10:00:00Z",
  "fragment_count": 9,
  "run_count": 0,
  "best_accuracy": null,
  "image_url": "/api/v1/artifacts/<artifact_id>/image"
}
```

### `GET /api/v1/artifacts/<artifact_id>/image`

**Source image.** Only for sample/upload artifacts.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/image"
```

**Response** `200`

Binary body: `image/png`.

## Fragments

### `GET /api/v1/artifacts/<artifact_id>/fragments`

**Fragments of an artifact.** Edge strings per side (`N`, `E`, `S`, `W`, read clockwise).

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/fragments"
```

**Response** `200`

```json
[
  {
    "id": "<fragment_id F01>",
    "label": "F01",
    "width": 160,
    "height": 160,
    "image_url": "/api/v1/fragments/<fragment_id F01>/image",
    "true_row": 0,
    "true_col": 0,
    "scramble_rot": 0,
    "edges": {
      "N": "FFFFVRRRRlGGCGllRlRVCCCC",
      "E": "CVVVVVVVVVVqRRkpFFFFFFFF",
      "S": "FFF+5544pBBBFVWaZ54ZaWWW",
      "W": "WWWWWqaJJJJJJJaaFFFFFFFF"
    }
  },
  {
    "id": "<fragment_id F02>",
    "label": "F02",
    "width": 160,
    "height": 160,
    "image_url": "/api/v1/fragments/<fragment_id F02>/image",
    "true_row": 1,
    "true_col": 2,
    "scramble_rot": 0,
    "edges": {
      "N": "//JJq//aFFl0000lQQQV10kR",
      "E": "Rl016QQQQAAUVVVVVEFaJJJJ",
      "S": "JaFFFFFq////aBFBFGRRRRVF",
      "W": "VlFFaFFFFVFFqqFFZFFF+VZ/"
    }
  },
  {
    "id": "<fragment_id F03>",
    "label": "F03",
    "width": 160,
    "height": 160,
    "image_url": "/api/v1/fragments/<fragment_id F03>/image",
    "true_row": 0,
    "true_col": 2,
    "scramble_rot": 0,
    "edges": {
      "N": "VaVJVaVVVVl051101VVVVp55",
      "E": "400055qVVVVVVVVVVVVp00hR",
      "S": "Rk00lQQQl0000lFFFq/uJa/+",
      "W": "VpqUUUVUVVpVVVVVVVVVVVVV"
    }
  },
  "… 6 more"
]
```

### `GET /api/v1/fragments/<fragment_id F01>`

**One fragment with numeric strips.** Adds `strips`: the resampled RGB values behind each edge string.

```bash
curl -s "http://localhost:8000/api/v1/fragments/<fragment_id F01>"
```

**Response** `200`

```json
{
  "id": "<fragment_id F01>",
  "label": "F01",
  "width": 160,
  "height": 160,
  "image_url": "/api/v1/fragments/<fragment_id F01>/image",
  "true_row": 0,
  "true_col": 0,
  "scramble_rot": 0,
  "edges": {
    "N": "FFFFVRRRRlGGCGllRlRVCCCC",
    "E": "CVVVVVVVVVVqRRkpFFFFFFFF",
    "S": "FFF+5544pBBBFVWaZ54ZaWWW",
    "W": "WWWWWqaJJJJJJJaaFFFFFFFF"
  },
  "strips": {
    "N": [
      [
        12.71,
        89.14,
        "… 1 more"
      ],
      [
        13.19,
        88.25,
        "… 1 more"
      ],
      "… 22 more"
    ],
    "E": [
      [
        10.43,
        43.14,
        "… 1 more"
      ],
      [
        75.06,
        75.25,
        "… 1 more"
      ],
      "… 22 more"
    ],
    "S": [
      [
        28.57,
        71.0,
        "… 1 more"
      ],
      [
        29.81,
        69.88,
        "… 1 more"
      ],
      "… 22 more"
    ],
    "W": [
      [
        91.71,
        69.64,
        "… 1 more"
      ],
      [
        93.44,
        72.12,
        "… 1 more"
      ],
      "… 22 more"
    ]
  }
}
```

### `GET /api/v1/fragments/<fragment_id F01>/image`

**Fragment image.** As cut (and rotated, if `rotate` was set).

```bash
curl -s "http://localhost:8000/api/v1/fragments/<fragment_id F01>/image"
```

**Response** `200`

Binary body: `image/png`.

## Matching, graph and explanation

### `POST /api/v1/artifacts/<artifact_id>/match`

**Compute pairwise compatibility.** Body optional (all MatchParams have defaults: `strip_len` 24, `levels` 4, `top_k` 6, `motif_method` `kmp`|`rabin_karp`, `weights`). Replaces earlier matches.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/<artifact_id>/match" \
  -H 'Content-Type: application/json' -d '{"top_k": 6}'
```

**Response** `200`

```json
{
  "config": {
    "strip_len": 24,
    "levels": 4,
    "depth": 2,
    "ngram": 3,
    "motif_method": "kmp",
    "min_motif": 3,
    "top_k": 6,
    "allow_rotation": false,
    "color_scale": 40.0,
    "weights": {
      "color": 0.4,
      "lcs": 0.2,
      "edit": 0.15,
      "motif": 0.15,
      "hash": 0.1
    }
  },
  "stats": {
    "fragments": 9,
    "side_pairs_total": 144,
    "side_pairs_scored": 127,
    "side_pairs_skipped": 17,
    "cache_hits": 0,
    "elapsed_ms": 49.37,
    "operations": {
      "prefilter_checks": 144,
      "dp_cells": 146304,
      "char_comparisons": 267642
    },
    "match_accuracy": 1.0
  }
}
```

### `GET /api/v1/artifacts/<artifact_id>/matches`

**Scored joins, best first.** `min_score`, `limit` ≤ 5000, `offset`; total in `X-Total-Count`. Sides are integers 0–3.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/matches?min_score=0.5&limit=3"
```

**Response** `200` · `X-Total-Count: 7`

```json
[
  {
    "a": "F04",
    "side_a": 1,
    "b": "F09",
    "side_b": 3,
    "color": 0.7032,
    "lcs": 0.8333,
    "edit": 0.7917,
    "motif": 0.4167,
    "hash": 0.4,
    "composite": 0.6692
  },
  {
    "a": "F02",
    "side_a": 2,
    "b": "F06",
    "side_b": 0,
    "color": 0.8658,
    "lcs": 0.7083,
    "edit": 0.6667,
    "motif": 0.2083,
    "hash": 0.0938,
    "composite": 0.6286
  },
  {
    "a": "F02",
    "side_a": 0,
    "b": "F03",
    "side_b": 2,
    "color": 0.6832,
    "lcs": 0.7083,
    "edit": 0.7083,
    "motif": 0.4583,
    "hash": 0.2812,
    "composite": 0.6181
  }
]
```

### `GET /api/v1/artifacts/<artifact_id>/graph`

**Fragment graph.** `threshold` 0–1, optional `top_k` (mutual best-buddy pruning), `traversal` `bfs`|`dfs`.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/graph?threshold=0.5&top_k=3&traversal=bfs"
```

**Response** `200`

```json
{
  "nodes": [
    {
      "id": "F01",
      "fragment_id": "<fragment_id F01>",
      "component": 0
    },
    {
      "id": "F02",
      "fragment_id": "<fragment_id F02>",
      "component": 1
    },
    "… 7 more"
  ],
  "edges": [
    {
      "source": "F04",
      "target": "F09",
      "weight": 0.6692,
      "side_source": "E",
      "side_target": "W",
      "side_source_index": 1,
      "side_target_index": 3,
      "true_neighbours": true
    },
    {
      "source": "F02",
      "target": "F06",
      "weight": 0.6286,
      "side_source": "S",
      "side_target": "N",
      "side_source_index": 2,
      "side_target_index": 0,
      "true_neighbours": true
    },
    "… 5 more"
  ],
  "components": [
    [
      "F01"
    ],
    [
      "F02",
      "F06",
      "… 5 more"
    ],
    "… 1 more"
  ],
  "traversal": {
    "method": "bfs",
    "order": [
      "F01",
      "F02",
      "… 7 more"
    ],
    "edge_visits": 14
  },
  "stats": {
    "edges_before_pruning": 36,
    "edges_after_pruning": 7,
    "threshold": 0.5,
    "top_k": 3
  }
}
```

### `GET /api/v1/artifacts/<artifact_id>/explain`

**"Why matched?" for one join.** Every component score, the weighted contributions, the LCS pairs, the edit script and the motif.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/explain?a=F04&side_a=1&b=F09&side_b=3"
```

**Response** `200`

```json
{
  "a": "F04",
  "side_a": "E",
  "b": "F09",
  "side_b": "W",
  "edge_a": "qBBBBW55444446VVVVVVVVqV",
  "edge_b_reversed": "qBBBBBq544456VVVVVVVVVqV",
  "strip_a": [
    [
      139,
      149,
      "… 1 more"
    ],
    [
      40,
      63,
      "… 1 more"
    ],
    "… 22 more"
  ],
  "strip_b_reversed": [
    [
      152,
      161,
      "… 1 more"
    ],
    [
      37,
      62,
      "… 1 more"
    ],
    "… 22 more"
  ],
  "scores": {
    "color": 0.7032,
    "lcs": 0.8333,
    "edit": 0.7917,
    "motif": 0.4167,
    "hash": 0.4
  },
  "weights": {
    "color": 0.4,
    "lcs": 0.2,
    "edit": 0.15,
    "motif": 0.15,
    "hash": 0.1
  },
  "contributions": {
    "color": 0.2813,
    "lcs": 0.1667,
    "edit": 0.1187,
    "motif": 0.0625,
    "hash": 0.04
  },
  "composite": 0.6692,
  "lcs": {
    "length": 20,
    "subsequence": "qBBBB54446VVVVVVVVqV",
    "pairs": [
      [
        0,
        0
      ],
      [
        1,
        2
      ],
      "… 18 more"
    ]
  },
  "edit": {
    "distance": 5,
    "ops": [
      {
        "op": "match",
        "a": "q",
        "b": "q"
      },
      {
        "op": "match",
        "a": "B",
        "b": "B"
      },
      "… 22 more"
    ]
  },
  "motif": {
    "length": 10,
    "pos_a": 14,
    "pos_b": 14,
    "motif": "VVVVVVVVqV",
    "kmp_ops": 2061,
    "rabin_karp_ops": 131
  },
  "hash": {
    "ngram": 3,
    "shared": 8,
    "union": 20
  },
  "ground_truth_neighbours": true
}
```

## Reconstruction runs

### `POST /api/v1/artifacts/<artifact_id>/runs`

**Run one solver (synchronous).** `algorithm` `greedy`|`best_first`|`dijkstra`|`backtracking`; optional `threshold`, `top_k`, `node_limit` (backtracking, default 150 000). For long runs use a job instead.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/<artifact_id>/runs" \
  -H 'Content-Type: application/json' -d '{"algorithm": "greedy"}'
```

**Response** `201`

```json
{
  "id": "<run_id>",
  "artifact_id": "<artifact_id>",
  "algorithm": "greedy",
  "params": {
    "threshold": 0.0,
    "top_k": null,
    "node_limit": 150000,
    "seed": null
  },
  "elapsed_ms": 0.43,
  "operations": {
    "score_lookups": 216
  },
  "total_score": 6.3081,
  "neighbour_accuracy": 1.0,
  "direct_accuracy": 1.0,
  "coverage": 1.0,
  "truncated": false,
  "meta": {
    "seed": "F08",
    "unplaced": []
  },
  "created_at": "2026-11-15T10:00:00Z",
  "placements": [
    {
      "fragment_id": "<fragment_id F08>",
      "label": "F08",
      "row": 1,
      "col": 1,
      "rot": 0
    },
    {
      "fragment_id": "<fragment_id F09>",
      "label": "F09",
      "row": 2,
      "col": 1,
      "rot": 0
    },
    "… 7 more"
  ],
  "trace": [
    {
      "step": 1,
      "action": "seed",
      "message": "Seed F08: strongest total edge weight",
      "data": {
        "fragment": "F08",
        "row": 0,
        "col": 0,
        "rot": 0
      }
    },
    {
      "step": 2,
      "action": "place",
      "message": "Place F09 at (1, 0) rot 0° — best local score 0.608 from 1 neighbou…",
      "data": {
        "fragment": "F09",
        "row": 1,
        "col": 0,
        "rot": 0,
        "score": 0.6079
      }
    },
    "… 7 more"
  ],
  "trace_dropped": {}
}
```

### `GET /api/v1/artifacts/<artifact_id>/runs`

**Runs of an artifact.** Newest first, without placements and trace.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/runs"
```

**Response** `200`

```json
[
  {
    "id": "<run_id>",
    "artifact_id": "<artifact_id>",
    "algorithm": "greedy",
    "params": {
      "threshold": 0.0,
      "top_k": null,
      "node_limit": 150000,
      "seed": null
    },
    "elapsed_ms": 0.43,
    "operations": {
      "score_lookups": 216
    },
    "total_score": 6.3081,
    "neighbour_accuracy": 1.0,
    "direct_accuracy": 1.0,
    "coverage": 1.0,
    "truncated": false,
    "meta": {
      "seed": "F08",
      "unplaced": []
    },
    "created_at": "2026-11-15T10:00:00Z"
  }
]
```

### `GET /api/v1/runs/<run_id>`

**One run with placements and trace.** Placements are normalised to start at (0, 0); trace coordinates are the solver's own.

```bash
curl -s "http://localhost:8000/api/v1/runs/<run_id>"
```

**Response** `200`

```json
{
  "id": "<run_id>",
  "artifact_id": "<artifact_id>",
  "algorithm": "greedy",
  "params": {
    "threshold": 0.0,
    "top_k": null,
    "node_limit": 150000,
    "seed": null
  },
  "elapsed_ms": 0.43,
  "operations": {
    "score_lookups": 216
  },
  "total_score": 6.3081,
  "neighbour_accuracy": 1.0,
  "direct_accuracy": 1.0,
  "coverage": 1.0,
  "truncated": false,
  "meta": {
    "seed": "F08",
    "unplaced": []
  },
  "created_at": "2026-11-15T10:00:00Z",
  "placements": [
    {
      "fragment_id": "<fragment_id F08>",
      "label": "F08",
      "row": 1,
      "col": 1,
      "rot": 0
    },
    {
      "fragment_id": "<fragment_id F09>",
      "label": "F09",
      "row": 2,
      "col": 1,
      "rot": 0
    },
    "… 7 more"
  ],
  "trace": [
    {
      "step": 1,
      "action": "seed",
      "message": "Seed F08: strongest total edge weight",
      "data": {
        "fragment": "F08",
        "row": 0,
        "col": 0,
        "rot": 0
      }
    },
    {
      "step": 2,
      "action": "place",
      "message": "Place F09 at (1, 0) rot 0° — best local score 0.608 from 1 neighbou…",
      "data": {
        "fragment": "F09",
        "row": 1,
        "col": 0,
        "rot": 0,
        "score": 0.6079
      }
    },
    "… 7 more"
  ],
  "trace_dropped": {}
}
```

### `POST /api/v1/artifacts/<artifact_id>/benchmark`

**Run several solvers.** Default: all four. Returns one RunDetail per algorithm.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/<artifact_id>/benchmark" \
  -H 'Content-Type: application/json' -d '{"algorithms": ["greedy", "backtracking"], "node_limit": 5000}'
```

**Response** `200`

```json
[
  {
    "id": "<run_id greedy>",
    "artifact_id": "<artifact_id>",
    "algorithm": "greedy",
    "params": {
      "threshold": 0.0,
      "top_k": null,
      "node_limit": 5000,
      "seed": null
    },
    "elapsed_ms": 0.43,
    "operations": {
      "score_lookups": 216
    },
    "total_score": 6.3081,
    "neighbour_accuracy": 1.0,
    "direct_accuracy": 1.0,
    "coverage": 1.0,
    "truncated": false,
    "meta": {
      "seed": "F08",
      "unplaced": []
    },
    "created_at": "2026-11-15T10:00:00Z",
    "placements": [
      {
        "fragment_id": "<fragment_id F08>",
        "label": "F08",
        "row": 1,
        "col": 1,
        "rot": 0
      },
      {
        "fragment_id": "<fragment_id F09>",
        "label": "F09",
        "row": 2,
        "col": 1,
        "rot": 0
      },
      "… 7 more"
    ],
    "trace": [
      {
        "step": 1,
        "action": "seed",
        "message": "Seed F08: strongest total edge weight",
        "data": {
          "fragment": "F08",
          "row": 0,
          "col": 0,
          "rot": 0
        }
      },
      {
        "step": 2,
        "action": "place",
        "message": "Place F09 at (1, 0) rot 0° — best local score 0.608 from 1 neighbou…",
        "data": {
          "fragment": "F09",
          "row": 1,
          "col": 0,
          "rot": 0,
          "score": 0.6079
        }
      },
      "… 7 more"
    ],
    "trace_dropped": {}
  },
  {
    "id": "<run_id backtracking>",
    "artifact_id": "<artifact_id>",
    "algorithm": "backtracking",
    "params": {
      "threshold": 0.0,
      "top_k": null,
      "node_limit": 5000,
      "seed": null
    },
    "elapsed_ms": 1.62,
    "operations": {
      "search_nodes": 203,
      "score_lookups": 404
    },
    "total_score": 6.3081,
    "neighbour_accuracy": 1.0,
    "direct_accuracy": 1.0,
    "coverage": 1.0,
    "truncated": false,
    "meta": {
      "nodes": 203,
      "pruned": 173,
      "node_limit": 5000,
      "incumbent_score": 6.3081,
      "improved_on_incumbent": false
    },
    "created_at": "2026-11-15T10:00:00Z",
    "placements": [
      {
        "fragment_id": "<fragment_id F01>",
        "label": "F01",
        "row": 0,
        "col": 0,
        "rot": 0
      },
      {
        "fragment_id": "<fragment_id F07>",
        "label": "F07",
        "row": 0,
        "col": 1,
        "rot": 0
      },
      "… 7 more"
    ],
    "trace": [
      {
        "step": 1,
        "action": "incumbent",
        "message": "Start from heuristic solution, score 6.308",
        "data": {
          "score": 6.3081
        }
      },
      {
        "step": 2,
        "action": "place",
        "message": "Try F01 at (0, 0) rot 0° (+0.000)",
        "data": {
          "fragment": "F01",
          "row": 0,
          "col": 0,
          "rot": 0,
          "score": 0.0
        }
      },
      "… 398 more"
    ],
    "trace_dropped": {
      "place": 61,
      "prune": 54,
      "backtrack": 63
    }
  }
]
```

### `POST /api/v1/benchmark/scaling`

**Scaling experiment (nothing stored).** Same sample at growing grid sizes (2–8). Rate limited per client (`RELICX_SCALING_RATE_PER_MIN`, default 10).

```bash
curl -s -X POST "http://localhost:8000/api/v1/benchmark/scaling" \
  -H 'Content-Type: application/json' -d '{"sample": "manuscript", "sizes": [2, 3], "algorithms": ["greedy"], "node_limit": 1000}'
```

**Response** `200`

```json
{
  "sample": "manuscript",
  "rotate": false,
  "points": [
    {
      "size": 2,
      "n": 4,
      "match": {
        "fragments": 4,
        "side_pairs_total": 24,
        "side_pairs_scored": 24,
        "side_pairs_skipped": 0,
        "cache_hits": 0,
        "elapsed_ms": 9.04,
        "operations": {
          "prefilter_checks": 24,
          "dp_cells": 27648,
          "char_comparisons": 49511
        },
        "match_accuracy": 1.0
      },
      "runs": {
        "greedy": {
          "elapsed_ms": 0.1,
          "operations": 22,
          "total_score": 3.0871,
          "truncated": false,
          "neighbour_accuracy": 1.0,
          "direct_accuracy": 1.0,
          "coverage": 1.0
        }
      }
    },
    {
      "size": 3,
      "n": 9,
      "match": {
        "fragments": 9,
        "side_pairs_total": 144,
        "side_pairs_scored": 127,
        "side_pairs_skipped": 17,
        "cache_hits": 0,
        "elapsed_ms": 53.91,
        "operations": {
          "prefilter_checks": 144,
          "dp_cells": 146304,
          "char_comparisons": 260948
        },
        "match_accuracy": 0.75
      },
      "runs": {
        "greedy": {
          "elapsed_ms": 0.33,
          "operations": 216,
          "total_score": 6.2824,
          "truncated": false,
          "neighbour_accuracy": 0.6667,
          "direct_accuracy": 0.6667,
          "coverage": 1.0
        }
      }
    }
  ]
}
```

### `DELETE /api/v1/runs/<run_id greedy>`

**Delete a run.** 

```bash
curl -s -X DELETE "http://localhost:8000/api/v1/runs/<run_id greedy>"
```

**Response** `204`

No body.

## Background jobs

### `POST /api/v1/artifacts/<artifact_id>/jobs`

**Start a solver in the background.** Same body as `/runs`. Preconditions (404/409/422) are checked **before** the 202.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/<artifact_id>/jobs" \
  -H 'Content-Type: application/json' -d '{"algorithm": "backtracking", "node_limit": 5000}'
```

**Response** `202`

```json
{
  "job_id": "<job_id>",
  "status": "queued",
  "progress": 0.0
}
```

### `GET /api/v1/jobs/<job_id>`

**Poll a job.** `status` `queued` → `running` → `done` (then `GET /runs/{run_id}`) or `failed` (`error` says why). `progress` moves during backtracking only. Poll about once a second.

```bash
curl -s "http://localhost:8000/api/v1/jobs/<job_id>"
```

**Response** `200`

```json
{
  "job_id": "<job_id>",
  "status": "done",
  "progress": 1.0,
  "run_id": "<run_id of the job>",
  "error": null
}
```

## CSV exports

### `GET /api/v1/runs/<run_id>/export.csv`

**Run placements as CSV.** With the ground-truth cell and rotation.

```bash
curl -s "http://localhost:8000/api/v1/runs/<run_id>/export.csv"
```

**Response** `200` · `Content-Disposition: attachment; filename="relicx-mughal-tile-panel-greedy-placements.csv"`

```csv
run_id,algorithm,fragment,row,col,rot_degrees,true_row,true_col,scramble_rot_degrees
<run_id>,greedy,F01,0,0,0,0,0,0
<run_id>,greedy,F07,0,1,0,0,1,0
<run_id>,greedy,F03,0,2,0,0,2,0
…
```

### `GET /api/v1/runs/<run_id>/trace.csv`

**Run trace as CSV.** Every recorded solver decision.

```bash
curl -s "http://localhost:8000/api/v1/runs/<run_id>/trace.csv"
```

**Response** `200` · `Content-Disposition: attachment; filename="relicx-mughal-tile-panel-greedy-trace.csv"`

```csv
step,action,fragment,row,col,rot_degrees,score,message
1,seed,F08,0,0,0,,Seed F08: strongest total edge weight
2,place,F09,1,0,0,0.6079,"Place F09 at (1, 0) rot 0° — best local score 0.608 from 1 neighbour(s)"
3,place,F04,1,-1,0,0.6692,"Place F04 at (1, -1) rot 0° — best local score 0.669 from 1 neighbour(s)"
…
```

### `GET /api/v1/artifacts/<artifact_id>/benchmark.csv`

**Benchmark as CSV.** Latest run per algorithm; 409 if none.

```bash
curl -s "http://localhost:8000/api/v1/artifacts/<artifact_id>/benchmark.csv"
```

**Response** `200` · `Content-Disposition: attachment; filename="relicx-mughal-tile-panel-benchmark.csv"`

```csv
algorithm,run_id,created_at,elapsed_ms,operations_total,total_score,neighbour_accuracy,direct_accuracy,coverage,truncated,search_nodes,conflicts,node_limit,threshold,top_k
greedy,<run_id>,2026-11-15T10:00:00Z,0.43,216,6.3081,1.0,1.0,1.0,False,,,150000,0.0,
backtracking,<run_id of the job>,2026-11-15T10:00:00Z,1.04,607,6.3081,1.0,1.0,1.0,False,203,,5000,0.0,
```

### `POST /api/v1/benchmark/scaling.csv`

**Scaling experiment as CSV.** Same body and rate limit as `/benchmark/scaling`.

```bash
curl -s -X POST "http://localhost:8000/api/v1/benchmark/scaling.csv" \
  -H 'Content-Type: application/json' -d '{"sample": "manuscript", "sizes": [2], "algorithms": ["greedy"], "node_limit": 1000}'
```

**Response** `200` · `Content-Disposition: attachment; filename="relicx-scaling-manuscript.csv"`

```csv
size,n,algorithm,elapsed_ms,operations,total_score,neighbour_accuracy,direct_accuracy,coverage,truncated,match_accuracy,match_elapsed_ms
2,4,greedy,0.1,22,3.0871,1.0,1.0,1.0,False,1.0,8.98
```

## Re-fragmenting and deleting

### `POST /api/v1/artifacts/<upload_id>/fragment`

**Re-cut an artifact.** New grid and damage settings. **Deletes its matches and runs.**

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/<upload_id>/fragment" \
  -H 'Content-Type: application/json' -d '{"rows": 2, "cols": 3, "rotate": true}'
```

**Response** `200`

```json
[
  {
    "id": "<new fragment_id F01>",
    "label": "F01",
    "width": 53,
    "height": 53,
    "image_url": "/api/v1/fragments/<new fragment_id F01>/image",
    "true_row": 1,
    "true_col": 0,
    "scramble_rot": 3,
    "edges": {
      "N": "kkkkkkkkkkkkkkkkkkkkkkkk",
      "E": "kkkkkkkkkkkkkkkkkkkkkkkk",
      "S": "kkkkkkkkkkkkkkkkkkkkkkkk",
      "W": "kkkkkkkkkkkkkkkkkkkkkkkk"
    }
  },
  {
    "id": "<new fragment_id F02>",
    "label": "F02",
    "width": 53,
    "height": 53,
    "image_url": "/api/v1/fragments/<new fragment_id F02>/image",
    "true_row": 0,
    "true_col": 1,
    "scramble_rot": 3,
    "edges": {
      "N": "kkkkkkkkkkUUUUUUkkkkkkkk",
      "E": "kkkkkkkkkkkkkkkkkkkkkkkk",
      "S": "kkkkkkkkkkkkkkkkkkkkkkkk",
      "W": "kkkkkkkkkkkkkkkkkkkkkkkk"
    }
  },
  {
    "id": "<new fragment_id F03>",
    "label": "F03",
    "width": 53,
    "height": 53,
    "image_url": "/api/v1/fragments/<new fragment_id F03>/image",
    "true_row": 0,
    "true_col": 0,
    "scramble_rot": 2,
    "edges": {
      "N": "kkkkkklkkkkkkkkkkkkkkkkk",
      "E": "kkkkkkkkkkUUUUUUUUUkkkkk",
      "S": "kkkkkkkkkkkUUUUUUUUUUUkk",
      "W": "kkkkkkkkkkkkkkkkkkkkkkkk"
    }
  },
  "… 3 more"
]
```

### `DELETE /api/v1/artifacts/<real_id>`

**Delete an artifact.** Cascades to fragments, matches, runs, jobs and stored images.

```bash
curl -s -X DELETE "http://localhost:8000/api/v1/artifacts/<real_id>"
```

**Response** `204`

No body.

## Errors

Every error has the same body: `{"error": {"code", "message", "details"}}`.

| HTTP | `code` | When |
|---|---|---|
| 401 | `unauthorized` | `RELICX_API_KEY` is set and a POST/DELETE has no or a wrong `X-API-Key` |
| 404 | `not_found` | Unknown artifact, fragment, run or job |
| 409 | `precondition_failed` | A pipeline step is missing (solving before matching; benchmark CSV with no runs) |
| 413 | `payload_too_large` | Upload over `RELICX_MAX_UPLOAD_MB` |
| 422 | `invalid_input` | Semantically invalid (not an image, unknown sample, too many fragments) |
| 422 | `validation_error` | Schema validation failed; `details.errors` lists the fields |
| 429 | `rate_limited` | Scaling experiment called too often; see `Retry-After` |
| 500 | `internal_error` | Unexpected; logged with the request ID |

Examples:

### `POST /api/v1/artifacts/<upload_id>/runs`

**Precondition failed.** Solving before matching.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/<upload_id>/runs" \
  -H 'Content-Type: application/json' -d '{"algorithm": "greedy"}'
```

**Response** `409`

```json
{
  "error": {
    "code": "precondition_failed",
    "message": "run matching first (POST /artifacts/{id}/match)",
    "details": {}
  }
}
```

### `POST /api/v1/artifacts/sample`

**Validation error.** Schema violation; `details.errors` lists each field.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/sample" \
  -H 'Content-Type: application/json' -d '{"name": "x", "fragment": {"rows": 99}}'
```

**Response** `422`

```json
{
  "error": {
    "code": "validation_error",
    "message": "request validation failed",
    "details": {
      "errors": [
        {
          "type": "less_than_equal",
          "loc": [
            "body",
            "fragment",
            "… 1 more"
          ],
          "msg": "Input should be less than or equal to 8",
          "input": 99,
          "ctx": {
            "le": 8
          }
        }
      ]
    }
  }
}
```

### `GET /api/v1/artifacts/does-not-exist`

**Not found.** 

```bash
curl -s "http://localhost:8000/api/v1/artifacts/does-not-exist"
```

**Response** `404`

```json
{
  "error": {
    "code": "not_found",
    "message": "artifact does-not-exist not found",
    "details": {}
  }
}
```

### `POST /api/v1/artifacts/sample`

**Unauthorized.** Only when the server sets `RELICX_API_KEY`; send `X-API-Key`.

```bash
curl -s -X POST "http://localhost:8000/api/v1/artifacts/sample" \
  -H 'Content-Type: application/json' -d '{"name": "x"}'
```

**Response** `401`

```json
{
  "error": {
    "code": "unauthorized",
    "message": "missing or wrong X-API-Key header",
    "details": {}
  }
}
```

### `POST /api/v1/benchmark/scaling`

**Rate limited.** Wait `Retry-After` seconds.

```bash
curl -s -X POST "http://localhost:8000/api/v1/benchmark/scaling" \
  -H 'Content-Type: application/json' -d '{"sample": "manuscript", "sizes": [2], "algorithms": ["greedy"], "node_limit": 200}' \
  -H 'X-API-Key: <key>'
```

**Response** `429` · `Retry-After: 60`

```json
{
  "error": {
    "code": "rate_limited",
    "message": "too many requests: at most 1 per minute; retry in 60 s",
    "details": {
      "retry_after": 60
    }
  }
}
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RELICX_DATABASE_URL` | `sqlite:///./relicx.db` | SQLAlchemy URL (`postgresql+psycopg://…` in Docker) |
| `RELICX_STORAGE_DIR` | `./storage` | Where source and fragment images are kept |
| `RELICX_AUTO_CREATE_SCHEMA` | `true` | Create tables at startup (dev); Docker uses Alembic instead (`false`) |
| `RELICX_CORS_ORIGINS` | `http://localhost:5173,http://localhost:8080` | Allowed browser origins |
| `RELICX_MAX_UPLOAD_MB` | `15` | Upload size limit |
| `RELICX_MAX_FRAGMENTS` | `64` | Fragments per artifact |
| `RELICX_JOB_WORKERS` | `2` | Background job threads |
| `RELICX_API_KEY` | unset | Require `X-API-Key` on writes |
| `RELICX_SCALING_RATE_PER_MIN` | `10` | Scaling experiment calls per client per minute |
| `RELICX_LOG_LEVEL` | `INFO` | Log level |
