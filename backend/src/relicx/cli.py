"""Command-line tools (T05).

    relicx seed            # add the 3 demo artifacts, matched and solved (idempotent)
    relicx seed --reset    # delete the demo artifacts first, then seed again

Uses the same settings as the API (RELICX_DATABASE_URL, RELICX_STORAGE_DIR), so it
works locally and in Docker:  docker compose run --rm api relicx seed
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass

from sqlalchemy import select

from .core.config import Settings
from .db.base import Base
from .db.models import Artifact
from .db.session import make_engine, make_session_factory, session_scope
from .engine import MatchConfig
from .engine.solvers import ALGORITHMS
from .services import ArtifactService, FragmentSpec, LocalStorage, MatchingService, ReconstructionService


@dataclass(frozen=True)
class DemoArtifact:
    name: str
    sample: str
    spec: FragmentSpec
    description: str


DEMO = (
    DemoArtifact(
        "Demo · Mosaic tile panel (4×4)",
        "mosaic-tile",
        FragmentSpec(rows=4, cols=4, noise=4.0, erosion=0.2, seed=7),
        "Clean-ish 4×4 grid: every solver should do well. Good first demo.",
    ),
    DemoArtifact(
        "Demo · Pottery band, rotated (4×4)",
        "pottery-band",
        FragmentSpec(rows=4, cols=4, rotate=True, noise=4.0, erosion=0.3, seed=11),
        "Each fragment turned 0/90/180/270°: shows rotation-aware matching (16 side pairs per fragment pair).",
    ),
    DemoArtifact(
        "Demo · Manuscript leaf, one piece lost (5×5)",
        "manuscript",
        FragmentSpec(rows=5, cols=5, noise=4.0, erosion=0.3, missing=1, seed=3),
        "25 cells, 24 fragments: backtracking must leave one cell empty; greedy vs backtracking differ here.",
    ),
)


def seed(settings: Settings, reset: bool = False, node_limit: int = 20_000, out=None) -> list[str]:
    """Create the demo artifacts (skipping ones that exist). Returns the names created."""
    out = out or sys.stdout
    engine = make_engine(settings.database_url)
    if settings.auto_create_schema:
        Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    storage = LocalStorage(settings.storage_dir)
    names = [d.name for d in DEMO]

    if reset:
        for db in session_scope(factory):
            svc = ArtifactService(db, storage, settings)
            for art in db.scalars(select(Artifact).where(Artifact.name.in_(names))):
                svc.delete(art.id)
                print(f"deleted  {art.name}", file=out)

    created: list[str] = []
    for demo in DEMO:
        t0 = time.perf_counter()
        for db in session_scope(factory):
            if db.scalar(select(Artifact.id).where(Artifact.name == demo.name)):
                print(f"exists   {demo.name}", file=out)
                break
            art = ArtifactService(db, storage, settings).create_from_sample(
                demo.name, demo.sample, demo.spec, demo.description
            )
            MatchingService(db, storage).compute(art.id, MatchConfig())
            runs = ReconstructionService(db, storage).benchmark(art.id, list(ALGORITHMS), {"node_limit": node_limit})
            accs = ", ".join(f"{r.algorithm} {r.neighbour_accuracy:.0%}" for r in runs)
            print(f"created  {demo.name}  [{accs}]  {time.perf_counter() - t0:.1f}s", file=out)
            created.append(demo.name)
    engine.dispose()
    return created


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="relicx", description="RELIC-X command-line tools")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("seed", help="add demo artifacts with matches and runs (idempotent)")
    s.add_argument("--reset", action="store_true", help="delete the demo artifacts first")
    s.add_argument("--node-limit", type=int, default=20_000, help="backtracking node limit (default 20000)")
    args = parser.parse_args(argv)
    if args.command == "seed":
        seed(Settings(), reset=args.reset, node_limit=args.node_limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
