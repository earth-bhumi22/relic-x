"""Data-access layer: the only code that builds SQLAlchemy queries.

Services call repositories; routes call services. Nothing above this layer
writes a query, which keeps persistence swappable and testable.
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from ..core.errors import NotFound
from ..db.models import Artifact, Fragment, PairMatch, ReconstructionRun, RunPlacement, TraceStep


class ArtifactRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, artifact: Artifact) -> Artifact:
        self.db.add(artifact)
        self.db.flush()
        return artifact

    def get(self, artifact_id: str) -> Artifact:
        art = self.db.get(Artifact, artifact_id)
        if art is None:
            raise NotFound(f"artifact {artifact_id} not found")
        return art

    def list(self, limit: int = 100, offset: int = 0) -> list[Artifact]:
        stmt = select(Artifact).order_by(Artifact.created_at.desc()).limit(limit).offset(offset)
        return list(self.db.scalars(stmt))

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(Artifact)) or 0

    def delete(self, artifact: Artifact) -> None:
        self.db.delete(artifact)


class FragmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for(self, artifact_id: str) -> list[Fragment]:
        stmt = select(Fragment).where(Fragment.artifact_id == artifact_id).order_by(Fragment.label)
        return list(self.db.scalars(stmt))

    def get(self, fragment_id: str) -> Fragment:
        frag = self.db.get(Fragment, fragment_id)
        if frag is None:
            raise NotFound(f"fragment {fragment_id} not found")
        return frag

    def by_label(self, artifact_id: str, label: str) -> Fragment:
        frag = self.db.scalar(select(Fragment).where(Fragment.artifact_id == artifact_id, Fragment.label == label))
        if frag is None:
            raise NotFound(f"fragment {label} not found in artifact {artifact_id}")
        return frag

    def replace_all(self, artifact_id: str, fragments: Iterable[Fragment]) -> list[Fragment]:
        """Delete existing fragments (and, by cascade, matches/runs) and insert new."""
        self.db.execute(delete(ReconstructionRun).where(ReconstructionRun.artifact_id == artifact_id))
        self.db.execute(delete(PairMatch).where(PairMatch.artifact_id == artifact_id))
        self.db.execute(delete(Fragment).where(Fragment.artifact_id == artifact_id))
        items = list(fragments)
        self.db.add_all(items)
        self.db.flush()
        return items


class MatchRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def replace_all(self, artifact_id: str, rows: list[dict]) -> int:
        self.db.execute(delete(PairMatch).where(PairMatch.artifact_id == artifact_id))
        if rows:
            self.db.execute(PairMatch.__table__.insert(), rows)  # one bulk INSERT
        return len(rows)

    def list_for(self, artifact_id: str, min_score: float = 0.0, limit: int | None = None) -> list[PairMatch]:
        stmt = (
            select(PairMatch)
            .where(PairMatch.artifact_id == artifact_id, PairMatch.composite >= min_score)
            .order_by(PairMatch.composite.desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        return list(self.db.scalars(stmt))


class RunRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, run: ReconstructionRun, placements: list[RunPlacement], steps: list[TraceStep]) -> ReconstructionRun:
        run.placements = placements
        run.trace = steps
        self.db.add(run)
        self.db.flush()
        return run

    def get(self, run_id: str) -> ReconstructionRun:
        stmt = (
            select(ReconstructionRun)
            .where(ReconstructionRun.id == run_id)
            .options(selectinload(ReconstructionRun.placements), selectinload(ReconstructionRun.trace))
        )
        run = self.db.scalar(stmt)
        if run is None:
            raise NotFound(f"run {run_id} not found")
        return run

    def list_for(self, artifact_id: str) -> list[ReconstructionRun]:
        stmt = (
            select(ReconstructionRun)
            .where(ReconstructionRun.artifact_id == artifact_id)
            .order_by(ReconstructionRun.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def delete(self, run: ReconstructionRun) -> None:
        self.db.delete(run)
