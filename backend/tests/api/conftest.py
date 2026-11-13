import pytest
from fastapi.testclient import TestClient

from relicx.core.config import Settings
from relicx.main import create_app


@pytest.fixture()
def client(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/test.db",
        storage_dir=str(tmp_path / "storage"),
        auto_create_schema=True,
        max_upload_mb=2,
    )
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture()
def artifact(client):
    r = client.post(
        "/api/v1/artifacts/sample",
        json={
            "name": "Test tile",
            "sample": "mosaic-tile",
            "fragment": {"rows": 3, "cols": 3, "noise": 2, "erosion": 0.1},
        },
    )
    assert r.status_code == 201, r.text
    return r.json()
