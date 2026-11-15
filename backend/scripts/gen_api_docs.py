# ruff: noqa: E501  (markdown template text)
"""Generate docs/API.md from REAL requests against a throwaway instance (T41).

Owner: B. Every example response in the reference is what the API actually
returned when this script last ran, so the docs cannot drift from the code:

    cd backend && python scripts/gen_api_docs.py        # rewrites ../docs/API.md

Long arrays are shortened to their first items, long strings are cut, and
random ids / timestamps are replaced with stable placeholders so the file only
changes when the API does. tests/test_api_docs.py fails if a route is missing.
"""

from __future__ import annotations

import io
import json
import re
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from relicx.core.config import Settings  # noqa: E402
from relicx.main import create_app  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "API.md"
BASE = "http://localhost:8000"
API = "/api/v1"


def shorten(x, depth=0):
    if isinstance(x, list):
        keep = 2 if depth else 3
        items = [shorten(v, depth + 1) for v in x[:keep]]
        return items + ([f"… {len(x) - keep} more"] if len(x) > keep else [])
    if isinstance(x, dict):
        return {k: shorten(v, depth + 1) for k, v in x.items()}
    if isinstance(x, str) and len(x) > 70:
        return x[:67] + "…"
    if isinstance(x, float):
        return round(x, 4)
    return x


class Doc:
    def __init__(self, client: TestClient) -> None:
        self.c = client
        self.ids: dict[str, str] = {}
        self.parts: list[str] = []

    def name(self, value: str, placeholder: str) -> None:
        self.ids[value] = placeholder

    def scrub(self, text: str) -> str:
        for value, ph in sorted(self.ids.items(), key=lambda kv: -len(kv[0])):
            text = text.replace(value, ph)
        text = re.sub(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(\+00:00|Z)?", "2026-11-15T10:00:00Z", text)
        return text

    def h(self, text: str) -> None:
        self.parts.append(text)

    def call(
        self,
        method: str,
        path: str,
        title: str,
        about: str,
        *,
        json_body=None,
        data=None,
        files=None,
        params=None,
        headers=None,
        curl_extra: str = "",
        show: bool = True,
        binary: str | None = None,
    ):
        r = self.c.request(method, API + path, json=json_body, data=data, files=files, params=params, headers=headers)
        q = ("?" + "&".join(f"{k}={v}" for k, v in params.items())) if params else ""
        curl = f"curl -s{' -X ' + method if method not in ('GET',) else ''} \"{BASE}{API}{path}{q}\""
        if json_body is not None:
            curl += f" \\\n  -H 'Content-Type: application/json' -d '{json.dumps(json_body)}'"
        curl += curl_extra
        lines = [
            f"### `{method} {API}{self.scrub(path)}`",
            "",
            f"**{title}.** {about}",
            "",
            "```bash",
            self.scrub(curl),
            "```",
            "",
        ]
        status = f"**Response** `{r.status_code}`"
        interesting = [h for h in ("X-Total-Count", "Retry-After", "Content-Disposition") if h.lower() in r.headers]
        if interesting:
            status += " · " + " · ".join(f"`{h}: {self.scrub(r.headers[h])}`" for h in interesting)
        lines.append(status)
        lines.append("")
        ctype = r.headers.get("content-type", "")
        if binary:
            lines.append(f"Binary body: {binary}.")
        elif r.status_code == 204:
            lines.append("No body.")
        elif ctype.startswith("text/csv"):
            head = "\n".join(r.text.splitlines()[:4])
            lines += ["```csv", self.scrub(head) + ("\n…" if len(r.text.splitlines()) > 4 else ""), "```"]
        elif show:
            lines += ["```json", self.scrub(json.dumps(shorten(r.json()), indent=2, ensure_ascii=False)), "```"]
        lines.append("")
        self.parts.append("\n".join(lines))
        return r


def png(color=(180, 120, 60), size=(160, 160)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def build() -> str:
    tmp = tempfile.mkdtemp(prefix="relicx-apidoc-")
    settings = Settings(database_url=f"sqlite:///{tmp}/doc.db", storage_dir=f"{tmp}/storage", scaling_rate_per_min=100)
    with TestClient(create_app(settings)) as client:
        d = Doc(client)
        d.h(HEADER)

        d.h("## Health and samples\n")
        d.call(
            "GET", "/health", "Liveness", "`database` is false if the database cannot be reached (status `degraded`)."
        )
        d.call("GET", "/samples", "Built-in demo artifacts", "Procedurally drawn images (no copyrighted content).")
        d.call("GET", "/samples/mosaic-tile/image", "Sample preview", "Cached for a day.", binary="`image/png`")

        d.h("## Artifacts\n")
        art = d.call(
            "POST",
            "/artifacts/sample",
            "Create from a sample",
            "Cuts the sample into a grid (synthetic fragments **with ground truth**). `fragment` fields are "
            "optional: rows/cols 2–8, `rotate`, `noise` 0–30, `erosion` 0–1, `missing` 0–6, `seed`.",
            json_body={
                "name": "Mughal tile panel",
                "sample": "mosaic-tile",
                "fragment": {"rows": 3, "cols": 3, "noise": 4, "erosion": 0.2},
            },
        ).json()
        aid = art["id"]
        d.name(aid, "<artifact_id>")
        up = d.call(
            "POST",
            "/artifacts/upload",
            "Create from your own image",
            "Multipart. `params` is the same FragmentParams object as JSON. PNG, JPEG, WebP or BMP, up to "
            "`RELICX_MAX_UPLOAD_MB` (default 15).",
            data={"name": "My scan", "params": '{"rows": 2, "cols": 2}'},
            files={"image": ("scan.png", png(), "image/png")},
            curl_extra=" \\\n  -F name='My scan' -F image=@scan.png -F params='{\"rows\": 2, \"cols\": 2}'",
        )
        d.name(up.json()["id"], "<upload_id>")
        real = d.call(
            "POST",
            "/artifacts/fragments-upload",
            "Create from real fragment photos",
            "Multipart, one `files` part per fragment. **No ground truth**, so runs report coverage but no "
            "accuracy.",
            data={"name": "Field finds", "rows": "2", "cols": "2"},
            files=[("files", (f"f{i}.png", png((40 * i, 90, 140), (96, 96)), "image/png")) for i in range(4)],
            curl_extra=" \\\n  -F name='Field finds' -F rows=2 -F cols=2 -F files=@f1.png -F files=@f2.png …",
        )
        d.name(real.json()["id"], "<real_id>")
        d.call(
            "GET",
            "/artifacts",
            "List artifacts",
            "Newest first. `limit` ≤ 200, `offset`; total in `X-Total-Count`.",
            params={"limit": 2, "offset": 0},
        )
        d.call("GET", f"/artifacts/{aid}", "One artifact", "Includes `fragment_count`, `run_count`, `best_accuracy`.")
        d.call(
            "GET", f"/artifacts/{aid}/image", "Source image", "Only for sample/upload artifacts.", binary="`image/png`"
        )

        d.h("## Fragments\n")
        frags = d.call(
            "GET",
            f"/artifacts/{aid}/fragments",
            "Fragments of an artifact",
            "Edge strings per side (`N`, `E`, `S`, `W`, read clockwise).",
        ).json()
        for f in frags:
            d.name(f["id"], f"<fragment_id {f['label']}>")
        fid = frags[0]["id"]
        d.call(
            "GET",
            f"/fragments/{fid}",
            "One fragment with numeric strips",
            "Adds `strips`: the resampled RGB values behind each edge string.",
        )
        d.call(
            "GET",
            f"/fragments/{fid}/image",
            "Fragment image",
            "As cut (and rotated, if `rotate` was set).",
            binary="`image/png`",
        )

        d.h("## Matching, graph and explanation\n")
        d.call(
            "POST",
            f"/artifacts/{aid}/match",
            "Compute pairwise compatibility",
            "Body optional (all MatchParams have defaults: `strip_len` 24, `levels` 4, `top_k` 6, "
            "`motif_method` `kmp`|`rabin_karp`, `weights`). Replaces earlier matches.",
            json_body={"top_k": 6},
        )
        matches = d.call(
            "GET",
            f"/artifacts/{aid}/matches",
            "Scored joins, best first",
            "`min_score`, `limit` ≤ 5000, `offset`; total in `X-Total-Count`. Sides are integers 0–3.",
            params={"min_score": 0.5, "limit": 3},
        ).json()
        g = d.call(
            "GET",
            f"/artifacts/{aid}/graph",
            "Fragment graph",
            "`threshold` 0–1, optional `top_k` (mutual best-buddy pruning), `traversal` `bfs`|`dfs`.",
            params={"threshold": 0.5, "top_k": 3, "traversal": "bfs"},
        ).json()
        e = (
            g["edges"][0]
            if g["edges"]
            else {
                "source": matches[0]["a"],
                "target": matches[0]["b"],
                "side_source_index": matches[0]["side_a"],
                "side_target_index": matches[0]["side_b"],
            }
        )
        d.call(
            "GET",
            f"/artifacts/{aid}/explain",
            '"Why matched?" for one join',
            "Every component score, the weighted contributions, the LCS pairs, the edit script and the motif.",
            params={
                "a": e["source"],
                "side_a": e["side_source_index"],
                "b": e["target"],
                "side_b": e["side_target_index"],
            },
        )

        d.h("## Reconstruction runs\n")
        run = d.call(
            "POST",
            f"/artifacts/{aid}/runs",
            "Run one solver (synchronous)",
            "`algorithm` `greedy`|`best_first`|`dijkstra`|`backtracking`; optional `threshold`, `top_k`, "
            "`node_limit` (backtracking, default 150 000). For long runs use a job instead.",
            json_body={"algorithm": "greedy"},
        ).json()
        d.name(run["id"], "<run_id>")
        d.call("GET", f"/artifacts/{aid}/runs", "Runs of an artifact", "Newest first, without placements and trace.")
        d.call(
            "GET",
            f"/runs/{run['id']}",
            "One run with placements and trace",
            "Placements are normalised to start at (0, 0); trace coordinates are the solver's own.",
        )
        bench = d.call(
            "POST",
            f"/artifacts/{aid}/benchmark",
            "Run several solvers",
            "Default: all four. Returns one RunDetail per algorithm.",
            json_body={"algorithms": ["greedy", "backtracking"], "node_limit": 5000},
        ).json()
        for b in bench:
            d.name(b["id"], f"<run_id {b['algorithm']}>")
        d.call(
            "POST",
            "/benchmark/scaling",
            "Scaling experiment (nothing stored)",
            "Same sample at growing grid sizes (2–8). Rate limited per client (`RELICX_SCALING_RATE_PER_MIN`, default 10).",
            json_body={"sample": "manuscript", "sizes": [2, 3], "algorithms": ["greedy"], "node_limit": 1000},
        )
        d.call("DELETE", f"/runs/{bench[0]['id']}", "Delete a run", "")

        d.h("## Background jobs\n")
        job = d.call(
            "POST",
            f"/artifacts/{aid}/jobs",
            "Start a solver in the background",
            "Same body as `/runs`. Preconditions (404/409/422) are checked **before** the 202.",
            json_body={"algorithm": "backtracking", "node_limit": 5000},
        ).json()
        d.name(job["job_id"], "<job_id>")
        import time

        for _ in range(200):
            body = client.get(f"{API}/jobs/{job['job_id']}").json()
            if body["status"] in ("done", "failed"):
                break
            time.sleep(0.05)
        if body.get("run_id"):
            d.name(body["run_id"], "<run_id of the job>")
        d.call(
            "GET",
            f"/jobs/{job['job_id']}",
            "Poll a job",
            "`status` `queued` → `running` → `done` (then `GET /runs/{run_id}`) or `failed` (`error` says why). "
            "`progress` moves during backtracking only. Poll about once a second.",
        )

        d.h("## CSV exports\n")
        d.call(
            "GET", f"/runs/{run['id']}/export.csv", "Run placements as CSV", "With the ground-truth cell and rotation."
        )
        d.call("GET", f"/runs/{run['id']}/trace.csv", "Run trace as CSV", "Every recorded solver decision.")
        d.call("GET", f"/artifacts/{aid}/benchmark.csv", "Benchmark as CSV", "Latest run per algorithm; 409 if none.")
        d.call(
            "POST",
            "/benchmark/scaling.csv",
            "Scaling experiment as CSV",
            "Same body and rate limit as `/benchmark/scaling`.",
            json_body={"sample": "manuscript", "sizes": [2], "algorithms": ["greedy"], "node_limit": 1000},
        )

        d.h("## Re-fragmenting and deleting\n")
        recut = d.call(
            "POST",
            f"/artifacts/{up.json()['id']}/fragment",
            "Re-cut an artifact",
            "New grid and damage settings. **Deletes its matches and runs.**",
            json_body={"rows": 2, "cols": 3, "rotate": True},
        ).json()
        for f in recut:
            d.name(f["id"], f"<new fragment_id {f['label']}>")
        d.call(
            "DELETE",
            f"/artifacts/{real.json()['id']}",
            "Delete an artifact",
            "Cascades to fragments, matches, runs, jobs and stored images.",
        )

        d.h(ERRORS_INTRO)
        d.call(
            "POST",
            f"/artifacts/{up.json()['id']}/runs",
            "Precondition failed",
            "Solving before matching.",
            json_body={"algorithm": "greedy"},
        )
        d.call(
            "POST",
            "/artifacts/sample",
            "Validation error",
            "Schema violation; `details.errors` lists each field.",
            json_body={"name": "x", "fragment": {"rows": 99}},
        )
        d.call("GET", "/artifacts/does-not-exist", "Not found", "")

    with TestClient(
        create_app(
            Settings(
                database_url=f"sqlite:///{tmp}/k.db", storage_dir=f"{tmp}/s2", api_key="s3cret", scaling_rate_per_min=1
            )
        )
    ) as locked:
        d.c = locked
        d.call(
            "POST",
            "/artifacts/sample",
            "Unauthorized",
            "Only when the server sets `RELICX_API_KEY`; send `X-API-Key`.",
            json_body={"name": "x"},
        )
        body = {"sample": "manuscript", "sizes": [2], "algorithms": ["greedy"], "node_limit": 200}
        locked.post(f"{API}/benchmark/scaling", json=body, headers={"X-API-Key": "s3cret"})
        d.call(
            "POST",
            "/benchmark/scaling",
            "Rate limited",
            "Wait `Retry-After` seconds.",
            json_body=body,
            headers={"X-API-Key": "s3cret"},
            curl_extra=" \\\n  -H 'X-API-Key: <key>'",
        )
    d.h(FOOTER)
    # Scrub once more over the whole document: an id is only known after the request that created it.
    return d.scrub("\n".join(d.parts)).rstrip() + "\n"


HEADER = """# RELIC-X — API reference

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
"""

ERRORS_INTRO = """## Errors

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
"""

FOOTER = """## Configuration

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
"""


if __name__ == "__main__":
    OUT.write_text(build())
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
