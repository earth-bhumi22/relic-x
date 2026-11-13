"""API tests: full pipeline through HTTP, plus error contract."""

import io

from PIL import Image

API = "/api/v1"


def test_health(client):
    r = client.get(f"{API}/health")
    assert r.status_code == 200 and r.json()["database"] is True
    assert "X-Request-ID" in r.headers


def test_samples(client):
    r = client.get(f"{API}/samples")
    assert {s["name"] for s in r.json()} >= {"mosaic-tile", "pottery-band", "manuscript"}
    img = client.get(r.json()[0]["image_url"])
    assert img.headers["content-type"] == "image/png"


def test_full_pipeline(client, artifact):
    aid = artifact["id"]
    assert artifact["fragment_count"] == 9 and artifact["has_ground_truth"]

    frags = client.get(f"{API}/artifacts/{aid}/fragments").json()
    assert len(frags) == 9 and set(frags[0]["edges"]) == {"N", "E", "S", "W"}
    assert client.get(frags[0]["image_url"]).status_code == 200

    # running a solver before matching is a precondition error, not a 500
    r = client.post(f"{API}/artifacts/{aid}/runs", json={"algorithm": "greedy"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "precondition_failed"

    m = client.post(f"{API}/artifacts/{aid}/match", json={"motif_method": "rabin_karp"}).json()
    assert m["stats"]["side_pairs_scored"] > 0 and m["stats"]["match_accuracy"] >= 0.8

    g = client.get(f"{API}/artifacts/{aid}/graph", params={"threshold": 0.5, "top_k": 4}).json()
    assert g["stats"]["edges_after_pruning"] <= g["stats"]["edges_before_pruning"]
    assert len(g["nodes"]) == 9

    e = g["edges"][0]
    ex = client.get(
        f"{API}/artifacts/{aid}/explain",
        params={"a": e["source"], "side_a": e["side_source_index"], "b": e["target"], "side_b": e["side_target_index"]},
    ).json()
    assert abs(ex["composite"] - e["weight"]) < 0.01
    assert set(ex["scores"]) == {"color", "lcs", "edit", "motif", "hash"}

    run = client.post(f"{API}/artifacts/{aid}/runs", json={"algorithm": "greedy"})
    assert run.status_code == 201
    body = run.json()
    assert len(body["placements"]) == 9 and body["trace"][0]["action"] == "seed"
    assert body["neighbour_accuracy"] is not None

    bench = client.post(f"{API}/artifacts/{aid}/benchmark", json={"node_limit": 5000}).json()
    assert [b["algorithm"] for b in bench] == ["greedy", "best_first", "dijkstra", "backtracking"]

    runs = client.get(f"{API}/artifacts/{aid}/runs").json()
    assert len(runs) == 5
    assert client.get(f"{API}/runs/{runs[0]['id']}").status_code == 200

    # re-fragmenting invalidates old matches and runs
    client.post(f"{API}/artifacts/{aid}/fragment", json={"rows": 2, "cols": 3, "rotate": True})
    art = client.get(f"{API}/artifacts/{aid}").json()
    assert art["fragment_count"] == 6 and art["run_count"] == 0 and art["match_config"] is None

    assert client.delete(f"{API}/artifacts/{aid}").status_code == 204
    assert client.get(f"{API}/artifacts/{aid}").status_code == 404


def _png(size=(120, 120), color=(200, 100, 50)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_upload_artifact(client):
    r = client.post(
        f"{API}/artifacts/upload",
        data={"name": "Upload", "params": '{"rows": 2, "cols": 2}'},
        files={"image": ("a.png", _png(), "image/png")},
    )
    assert r.status_code == 201 and r.json()["fragment_count"] == 4


def test_upload_real_fragments(client):
    files = [("files", (f"f{i}.png", _png((64, 64), (i * 40, 80, 120)), "image/png")) for i in range(4)]
    r = client.post(f"{API}/artifacts/fragments-upload", data={"name": "Real", "rows": 2, "cols": 2}, files=files)
    assert r.status_code == 201
    art = r.json()
    assert art["has_ground_truth"] is False
    client.post(f"{API}/artifacts/{art['id']}/match", json={})
    run = client.post(f"{API}/artifacts/{art['id']}/runs", json={"algorithm": "best_first"}).json()
    assert run["neighbour_accuracy"] is None and run["coverage"] == 1.0


def test_rejects_bad_input(client):
    r = client.post(
        f"{API}/artifacts/upload", data={"name": "x"}, files={"image": ("a.txt", b"not an image", "text/plain")}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_input"
    big = b"0" * (3 * 1024 * 1024)
    r = client.post(f"{API}/artifacts/upload", data={"name": "x"}, files={"image": ("a.png", big, "image/png")})
    assert r.status_code == 413
    r = client.post(f"{API}/artifacts/sample", json={"name": "x", "fragment": {"rows": 99}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = client.post(f"{API}/artifacts/sample", json={"name": "x", "sample": "nope"})
    assert r.status_code == 422


def test_scaling(client):
    r = client.post(
        f"{API}/benchmark/scaling", json={"sizes": [2, 3], "algorithms": ["greedy", "backtracking"], "node_limit": 2000}
    )
    pts = r.json()["points"]
    assert [p["n"] for p in pts] == [4, 9]
    assert set(pts[0]["runs"]) == {"greedy", "backtracking"}
