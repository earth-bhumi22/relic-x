import os
import tempfile

# Point the import-time app at a throwaway location before relicx.main loads.
_tmp = tempfile.mkdtemp(prefix="relicx-test-")
os.environ.setdefault("RELICX_DATABASE_URL", f"sqlite:///{_tmp}/import.db")
os.environ.setdefault("RELICX_STORAGE_DIR", f"{_tmp}/storage")
