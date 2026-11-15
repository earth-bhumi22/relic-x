import os
import tempfile

# Point the import-time app at a throwaway location before relicx.main loads.
_tmp = tempfile.mkdtemp(prefix="relicx-test-")
os.environ.setdefault("RELICX_DATABASE_URL", f"sqlite:///{_tmp}/import.db")
os.environ.setdefault("RELICX_STORAGE_DIR", f"{_tmp}/storage")

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402


@pytest.fixture()
def db_url(tmp_path):
    """Database for one test (T30).

    Default: a fresh SQLite file. With RELICX_TEST_DATABASE_URL set (CI's PostgreSQL job),
    the same tests run against that server, starting from an empty schema every time.
    """
    url = os.environ.get("RELICX_TEST_DATABASE_URL")
    if not url:
        yield f"sqlite:///{tmp_path}/test.db"
        return
    from relicx.db import models  # noqa: F401  (registers every table)
    from relicx.db.base import Base

    engine = create_engine(url)
    with engine.begin() as conn:
        Base.metadata.drop_all(conn)
    engine.dispose()
    yield url
