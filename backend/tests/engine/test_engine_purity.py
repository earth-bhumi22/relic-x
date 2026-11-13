"""Architecture guard: the algorithm engine stays independent of web and DB.

This is what lets every algorithm be unit-tested and benchmarked on its own
(synopsis §4). A PR that imports FastAPI or SQLAlchemy into the engine fails.
"""

import ast
from pathlib import Path

import relicx.engine

FORBIDDEN = ("fastapi", "sqlalchemy", "alembic", "starlette", "relicx.api", "relicx.db", "relicx.services")


def test_engine_has_no_framework_imports():
    root = Path(relicx.engine.__file__).parent
    offenders = []
    for path in root.rglob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module]
            offenders += [f"{path.name}: {n}" for n in names if n.startswith(FORBIDDEN)]
    assert not offenders, offenders
