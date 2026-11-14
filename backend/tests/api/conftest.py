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


@pytest.fixture(scope="session")
def smooth_image_api():
    import numpy as np
    from PIL import Image

    rng = np.random.default_rng(1)
    small = (rng.random((24, 24, 3)) * 255).astype(np.uint8)
    return np.asarray(Image.fromarray(small).resize((360, 360), Image.BICUBIC))
