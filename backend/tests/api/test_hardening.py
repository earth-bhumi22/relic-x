"""T22 — pagination headers, optional API key, rate limit on the scaling experiment."""

import pytest
from fastapi.testclient import TestClient

from relicx.core.config import Settings
from relicx.core.ratelimit import RateLimited, TokenBucket
from relicx.main import create_app

API = "/api/v1"
SCALING = {"sizes": [2], "algorithms": ["greedy"], "node_limit": 200}


def make(tmp_path, **kw):
    return TestClient(
        create_app(Settings(database_url=f"sqlite:///{tmp_path}/h.db", storage_dir=str(tmp_path / "s"), **kw))
    )


# ------------------------------------------------------------------ pagination
def test_x_total_count_on_artifacts(client):
    for i in range(5):
        client.post(f"{API}/artifacts/sample", json={"name": f"a{i}", "fragment": {"rows": 2, "cols": 2}})
    r = client.get(f"{API}/artifacts", params={"limit": 2, "offset": 1})
    assert r.headers["X-Total-Count"] == "5" and len(r.json()) == 2


def test_x_total_count_and_offset_on_matches(client):
    art = client.post(f"{API}/artifacts/sample", json={"name": "m", "fragment": {"rows": 3, "cols": 3}}).json()
    client.post(f"{API}/artifacts/{art['id']}/match", json={})
    full = client.get(f"{API}/artifacts/{art['id']}/matches", params={"limit": 5000}).json()
    r = client.get(f"{API}/artifacts/{art['id']}/matches", params={"limit": 4, "offset": 2})
    assert r.headers["X-Total-Count"] == str(len(full))
    assert r.json() == full[2:6]
    high = client.get(f"{API}/artifacts/{art['id']}/matches", params={"min_score": 0.6})
    assert int(high.headers["X-Total-Count"]) == sum(m["composite"] >= 0.6 for m in full)


def test_cors_exposes_the_new_headers(tmp_path):
    with make(tmp_path, cors_origins=["http://localhost:5173"]) as c:
        r = c.get(f"{API}/artifacts", headers={"Origin": "http://localhost:5173"})
        exposed = r.headers["access-control-expose-headers"]
        for h in ("X-Total-Count", "Retry-After", "Content-Disposition"):
            assert h in exposed


# ------------------------------------------------------------------ API key
def test_api_key_off_by_default(client):
    assert (
        client.post(f"{API}/artifacts/sample", json={"name": "open", "fragment": {"rows": 2, "cols": 2}}).status_code
        == 201
    )


def test_api_key_guards_writes_only(tmp_path):
    with make(tmp_path, api_key="s3cret") as c:
        body = {"name": "x", "fragment": {"rows": 2, "cols": 2}}
        r = c.post(f"{API}/artifacts/sample", json=body)
        assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
        assert c.post(f"{API}/artifacts/sample", json=body, headers={"X-API-Key": "wrong"}).status_code == 401
        ok = c.post(f"{API}/artifacts/sample", json=body, headers={"X-API-Key": "s3cret"})
        assert ok.status_code == 201
        # Reads stay open
        assert c.get(f"{API}/artifacts").status_code == 200
        assert c.get(f"{API}/health").status_code == 200
        assert c.get(ok.json()["image_url"]).status_code == 200
        # DELETE is a write too
        assert c.delete(f"{API}/artifacts/{ok.json()['id']}").status_code == 401
        assert c.delete(f"{API}/artifacts/{ok.json()['id']}", headers={"X-API-Key": "s3cret"}).status_code == 204


# ------------------------------------------------------------------ rate limit
def test_scaling_is_rate_limited_with_retry_after(tmp_path):
    with make(tmp_path, scaling_rate_per_min=2) as c:
        assert c.post(f"{API}/benchmark/scaling", json=SCALING).status_code == 200
        assert c.post(f"{API}/benchmark/scaling.csv", json=SCALING).status_code == 200  # same bucket
        r = c.post(f"{API}/benchmark/scaling", json=SCALING)
        assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"
        assert int(r.headers["Retry-After"]) >= 1
        # other endpoints are not limited
        assert c.get(f"{API}/samples").status_code == 200


def test_token_bucket_refills_over_time():
    now = [0.0]
    bucket = TokenBucket(capacity=3, period=60.0, clock=lambda: now[0])
    for _ in range(3):
        bucket.take("ip")
    with pytest.raises(RateLimited) as exc:
        bucket.take("ip")
    assert exc.value.details["retry_after"] == 20  # one token every 20 s
    bucket.take("other-ip")  # buckets are per client
    now[0] = 20.0
    bucket.take("ip")  # refilled one token
    with pytest.raises(RateLimited):
        bucket.take("ip")
    now[0] = 1000.0
    for _ in range(3):  # never more than capacity
        bucket.take("ip")
    with pytest.raises(RateLimited):
        bucket.take("ip")
