"""T21 — CSV exports parse cleanly and match the JSON API."""

import csv
import io

API = "/api/v1"


def parse(resp):
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.headers["content-disposition"].startswith('attachment; filename="relicx-')
    return list(csv.DictReader(io.StringIO(resp.text)))


def benchmarked(client):
    art = client.post(
        f"{API}/artifacts/sample", json={"name": "Mughal tile, panel #2", "fragment": {"rows": 3, "cols": 3}}
    ).json()
    client.post(f"{API}/artifacts/{art['id']}/match", json={})
    runs = client.post(f"{API}/artifacts/{art['id']}/benchmark", json={"node_limit": 3000}).json()
    return art, runs


def test_run_placements_csv_matches_the_json_run(client):
    art, runs = benchmarked(client)
    run = runs[0]
    resp = client.get(f"{API}/runs/{run['id']}/export.csv")
    rows = parse(resp)
    assert 'filename="relicx-mughal-tile-panel-2-greedy-placements.csv"' in resp.headers["content-disposition"]
    assert len(rows) == len(run["placements"]) == 9
    by_label = {p["label"]: p for p in run["placements"]}
    for r in rows:
        p = by_label[r["fragment"]]
        assert (int(r["row"]), int(r["col"]), int(r["rot_degrees"])) == (p["row"], p["col"], p["rot"] * 90)
        assert r["true_row"] != "" and r["algorithm"] == "greedy"


def test_trace_csv_has_every_recorded_step(client):
    _, runs = benchmarked(client)
    run = runs[-1]  # backtracking: many actions
    rows = parse(client.get(f"{API}/runs/{run['id']}/trace.csv"))
    assert [int(r["step"]) for r in rows] == [s["step"] for s in run["trace"]]
    assert {r["action"] for r in rows} <= {
        "seed",
        "place",
        "conflict",
        "fallback",
        "prune",
        "backtrack",
        "best",
        "incumbent",
        "limit",
        "stop",
    }


def test_benchmark_csv_has_latest_run_per_algorithm(client):
    art, runs = benchmarked(client)
    rerun = client.post(f"{API}/artifacts/{art['id']}/runs", json={"algorithm": "greedy"}).json()
    rows = parse(client.get(f"{API}/artifacts/{art['id']}/benchmark.csv"))
    assert [r["algorithm"] for r in rows] == ["greedy", "best_first", "dijkstra", "backtracking"]
    assert rows[0]["run_id"] == rerun["id"]  # newest greedy run wins
    bt = rows[-1]
    assert float(bt["neighbour_accuracy"]) == runs[-1]["neighbour_accuracy"]
    assert int(bt["node_limit"]) == 3000 and int(bt["search_nodes"]) > 0


def test_benchmark_csv_without_runs_is_a_precondition_error(client):
    art = client.post(f"{API}/artifacts/sample", json={"name": "fresh", "fragment": {"rows": 2, "cols": 2}}).json()
    r = client.get(f"{API}/artifacts/{art['id']}/benchmark.csv")
    assert r.status_code == 409 and r.json()["error"]["code"] == "precondition_failed"
    assert client.get(f"{API}/runs/nope/export.csv").status_code == 404


def test_scaling_csv_one_row_per_size_and_algorithm(client):
    body = {"sample": "manuscript", "sizes": [2, 3], "algorithms": ["greedy", "backtracking"], "node_limit": 1000}
    resp = client.post(f"{API}/benchmark/scaling.csv", json=body)
    rows = parse(resp)
    assert 'filename="relicx-scaling-manuscript.csv"' in resp.headers["content-disposition"]
    assert [(r["n"], r["algorithm"]) for r in rows] == [
        ("4", "greedy"),
        ("4", "backtracking"),
        ("9", "greedy"),
        ("9", "backtracking"),
    ]
    assert all(0 <= float(r["neighbour_accuracy"]) <= 1 for r in rows)
