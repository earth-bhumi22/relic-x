"""Regression test (found in T01): every write must be committed BEFORE the
response leaves the server, otherwise a fast client re-reading right after a
write (GET after DELETE) can see stale data."""

from fastapi.testclient import TestClient
from sqlalchemy import event

from relicx.core.config import Settings
from relicx.main import create_app


def test_commit_happens_before_response_is_sent(tmp_path):
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/t.db", storage_dir=str(tmp_path / "s")))
    state = {"committed": 0, "late": []}

    @event.listens_for(app.state.session_factory, "after_commit")
    def _count(_session):
        state["committed"] += 1

    async def asgi(scope, receive, send):
        before = state["committed"]

        async def checked_send(message):
            is_write = scope.get("method") in {"POST", "DELETE"}
            if message["type"] == "http.response.start" and is_write and state["committed"] == before:
                state["late"].append(f'{scope["method"]} {scope["path"]}')
            await send(message)

        await app(scope, receive, checked_send)

    with TestClient(asgi) as c:
        art = c.post("/api/v1/artifacts/sample", json={"name": "x", "fragment": {"rows": 2, "cols": 2}}).json()
        c.post(f"/api/v1/artifacts/{art['id']}/match", json={})
        c.post(f"/api/v1/artifacts/{art['id']}/runs", json={"algorithm": "greedy"})
        assert c.delete(f"/api/v1/artifacts/{art['id']}").status_code == 204
        assert c.get(f"/api/v1/artifacts/{art['id']}").status_code == 404

    assert state["late"] == [], f"responses sent before commit: {state['late']}"
