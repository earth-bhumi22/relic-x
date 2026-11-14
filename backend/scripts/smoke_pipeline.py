"""End-to-end smoke test against a RUNNING RELIC-X API (any database).

Owner: B (T01). Used to verify a deployment — e.g. docker compose on PostgreSQL:

    python backend/scripts/smoke_pipeline.py                     # http://localhost:8000
    python backend/scripts/smoke_pipeline.py --base http://host:8000

Exercises every endpoint group and prints one line per check. Exit code 1 on
the first failure. Creates artifacts named "smoke-*" and deletes them again.
"""

from __future__ import annotations

import argparse
import io
import sys
import time

import httpx
from PIL import Image

ALGORITHMS = ["greedy", "best_first", "dijkstra", "backtracking"]


class Smoke:
    def __init__(self, base: str) -> None:
        self.c = httpx.Client(base_url=base.rstrip("/") + "/api/v1", timeout=120)
        self.failures = 0

    def check(self, label: str, ok: bool, detail: str = "") -> None:
        print(f"{'PASS' if ok else 'FAIL'}  {label}{'  — ' + detail if detail else ''}")
        if not ok:
            self.failures += 1

    def req(self, method: str, path: str, expect: int, **kw):
        t0 = time.perf_counter()
        r = self.c.request(method, path, **kw)
        ms = (time.perf_counter() - t0) * 1000
        self.check(f"{method} {path} → {expect}", r.status_code == expect, f"got {r.status_code} in {ms:.0f} ms")
        if r.status_code != expect:
            print("      body:", r.text[:300])
            raise SystemExit(1)
        return r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else r

    def run(self) -> int:
        h = self.req("GET", "/health", 200)
        self.check("database reachable", h["database"] is True)

        samples = self.req("GET", "/samples", 200)
        self.check("3 samples listed", len(samples) == 3)

        for rotate in (False, True):
            art = self.req(
                "POST",
                "/artifacts/sample",
                201,
                json={
                    "name": f"smoke-{'rot' if rotate else 'plain'}",
                    "sample": "pottery-band",
                    "fragment": {"rows": 4, "cols": 4, "rotate": rotate, "noise": 4, "erosion": 0.3, "missing": 1},
                },
            )
            aid = art["id"]
            self.check("15 fragments (one missing)", art["fragment_count"] == 15)
            frags = self.req("GET", f"/artifacts/{aid}/fragments", 200)
            self.req("GET", f"/fragments/{frags[0]['id']}", 200)
            img = self.req("GET", f"/fragments/{frags[0]['id']}/image", 200)
            self.check("fragment image is PNG", img.headers["content-type"] == "image/png")

            self.req("POST", f"/artifacts/{aid}/runs", 409, json={"algorithm": "greedy"})
            m = self.req("POST", f"/artifacts/{aid}/match", 200, json={"motif_method": "rabin_karp"})
            self.check("allow_rotation follows fragmenting", m["config"]["allow_rotation"] is rotate)
            self.check(
                "pre-filter skipped some pairs",
                m["stats"]["side_pairs_skipped"] > 0,
                f"match accuracy {m['stats']['match_accuracy']:.0%}",
            )

            graph_q = {"threshold": 0.4, "top_k": 3, "traversal": "dfs"}
            g = self.req("GET", f"/artifacts/{aid}/graph", 200, params=graph_q)
            e = g["edges"][0]
            ex = self.req(
                "GET",
                f"/artifacts/{aid}/explain",
                200,
                params={
                    "a": e["source"],
                    "side_a": e["side_source_index"],
                    "b": e["target"],
                    "side_b": e["side_target_index"],
                },
            )
            self.check("explain composite matches graph weight", abs(ex["composite"] - e["weight"]) < 0.01)

            for algo in ALGORITHMS:
                run = self.req("POST", f"/artifacts/{aid}/runs", 201, json={"algorithm": algo, "node_limit": 20000})
                self.check(
                    f"{algo}: placements + trace",
                    len(run["placements"]) == 15 and len(run["trace"]) > 0,
                    f"neighbour acc {run['neighbour_accuracy']:.0%}, {run['elapsed_ms']:.0f} ms",
                )
            runs = self.req("GET", f"/artifacts/{aid}/runs", 200)
            self.req("GET", f"/runs/{runs[0]['id']}", 200)
            bench = self.req("POST", f"/artifacts/{aid}/benchmark", 200, json={"node_limit": 5000})
            self.check("benchmark ran all algorithms", [b["algorithm"] for b in bench] == ALGORITHMS)

            self.req("POST", f"/artifacts/{aid}/fragment", 200, json={"rows": 3, "cols": 3})
            again = self.req("GET", f"/artifacts/{aid}", 200)
            self.check("re-fragment clears runs + matches", again["run_count"] == 0 and again["match_config"] is None)
            self.req("DELETE", f"/artifacts/{aid}", 204)
            self.req("GET", f"/artifacts/{aid}", 404)

        buf = io.BytesIO()
        Image.new("RGB", (200, 200), (180, 90, 40)).save(buf, format="PNG")
        up = self.req(
            "POST",
            "/artifacts/upload",
            201,
            data={"name": "smoke-upload", "params": '{"rows":2,"cols":2}'},
            files={"image": ("a.png", buf.getvalue(), "image/png")},
        )
        self.req("DELETE", f"/artifacts/{up['id']}", 204)
        bad = self.c.post("/artifacts/upload", data={"name": "x"}, files={"image": ("a.txt", b"nope", "text/plain")})
        bad_ok = bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_input"
        self.check("bad upload → 422 invalid_input", bad_ok)

        scaling = {"sizes": [2, 3], "algorithms": ["greedy"], "node_limit": 1000}
        sc = self.req("POST", "/benchmark/scaling", 200, json=scaling)
        self.check("scaling experiment", [p["n"] for p in sc["points"]] == [4, 9])

        print(f"\n{'ALL CHECKS PASSED' if not self.failures else f'{self.failures} CHECK(S) FAILED'}")
        return 1 if self.failures else 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost:8000")
    sys.exit(Smoke(p.parse_args().base).run())
