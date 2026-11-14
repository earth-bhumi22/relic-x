"""T20 — background solver jobs (CONTRACT §5.1)."""

import time

from fastapi.testclient import TestClient

from relicx.core.config import Settings
from relicx.db.models import Job
from relicx.db.session import transaction
from relicx.engine import compat_table, extract_features, fragment_image, match_all
from relicx.engine.solvers import solve_backtracking
from relicx.main import create_app

API = "/api/v1"


def poll(client, job_id, timeout=30.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        body = client.get(f"{API}/jobs/{job_id}").json()
        if body["status"] in ("done", "failed"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish: {body}")


def matched_artifact(client, rows=3, cols=3):
    art = client.post(f"{API}/artifacts/sample", json={"name": "j", "fragment": {"rows": rows, "cols": cols}}).json()
    client.post(f"{API}/artifacts/{art['id']}/match", json={})
    return art["id"]


def test_job_runs_to_done_and_links_the_run(client):
    aid = matched_artifact(client)
    r = client.post(f"{API}/artifacts/{aid}/jobs", json={"algorithm": "backtracking", "node_limit": 5000})
    assert r.status_code == 202
    created = r.json()
    assert (
        created["status"] == "queued"
        and created["progress"] == 0.0
        and set(created) == {"job_id", "status", "progress"}
    )

    done = poll(client, created["job_id"])
    assert done == {
        "job_id": created["job_id"],
        "status": "done",
        "progress": 1.0,
        "run_id": done["run_id"],
        "error": None,
    }
    run = client.get(f"{API}/runs/{done['run_id']}").json()
    assert run["algorithm"] == "backtracking" and len(run["placements"]) == 9
    assert run["params"]["node_limit"] == 5000


def test_every_algorithm_can_run_as_a_job(client):
    aid = matched_artifact(client)
    ids = [
        client.post(f"{API}/artifacts/{aid}/jobs", json={"algorithm": a}).json()["job_id"]
        for a in ("greedy", "best_first", "dijkstra", "backtracking")
    ]
    assert all(poll(client, j)["status"] == "done" for j in ids)
    assert len(client.get(f"{API}/artifacts/{aid}/runs").json()) == 4


def test_preconditions_fail_immediately_not_in_the_worker(client):
    art = client.post(f"{API}/artifacts/sample", json={"name": "unmatched", "fragment": {"rows": 2, "cols": 2}}).json()
    r = client.post(f"{API}/artifacts/{art['id']}/jobs", json={"algorithm": "greedy"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "precondition_failed"
    assert client.post(f"{API}/artifacts/nope/jobs", json={"algorithm": "greedy"}).status_code == 404
    assert client.post(f"{API}/artifacts/{art['id']}/jobs", json={"algorithm": "quantum"}).status_code == 422
    assert client.get(f"{API}/jobs/does-not-exist").status_code == 404


def test_a_crashing_solver_marks_the_job_failed(client, monkeypatch):
    from relicx.services import reconstruction

    aid = matched_artifact(client)

    def boom(self, *a, **kw):
        raise RuntimeError("solver exploded")

    monkeypatch.setattr(reconstruction.ReconstructionService, "run", boom)
    job_id = client.post(f"{API}/artifacts/{aid}/jobs", json={"algorithm": "greedy"}).json()["job_id"]
    failed = poll(client, job_id)
    assert failed["status"] == "failed" and failed["error"] == "solver exploded" and failed["run_id"] is None


def test_unfinished_jobs_are_failed_after_a_restart(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path}/r.db", storage_dir=str(tmp_path / "s"))
    with TestClient(create_app(settings)) as c:
        aid = matched_artifact(c, 2, 2)
    app = create_app(settings)  # "server restarts": a job was left running by the old process
    with transaction(app.state.session_factory) as db:
        db.add(Job(id="orphan", artifact_id=aid, algorithm="greedy", status="running"))
    with TestClient(app) as c:
        body = c.get(f"{API}/jobs/orphan").json()
    assert body["status"] == "failed" and "restarted" in body["error"]


def test_backtracking_reports_increasing_progress(smooth_image_api):
    fr = fragment_image(smooth_image_api, 4, 4, rotate=True, seed=2)
    feats = {f"F{k}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
    compat = compat_table(match_all(feats).matches)
    seen: list[float] = []
    res = solve_backtracking(list(feats), compat, 4, 4, allow_rotation=True, node_limit=20_000, progress=seen.append)
    assert seen, "progress was never reported"
    assert seen == sorted(seen) and seen[0] > 0 and seen[-1] <= 0.99
    assert len(seen) == res.meta["nodes"] // 2048
