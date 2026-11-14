"""ORM models (see planning/ARCHITECTURE.md §Database for the ER diagram).

artifacts 1─* fragments
artifacts 1─* pair_matches *─1 fragments (x2)
artifacts 1─* reconstruction_runs 1─* placements *─1 fragments
                                   1─* trace_steps

Integrity rules live in the schema (CHECK / UNIQUE / FK ON DELETE CASCADE),
not only in Python, so bad rows cannot be written by any client.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

ALGORITHMS = ("greedy", "best_first", "dijkstra", "backtracking")
JOB_STATUSES = ("queued", "running", "done", "failed")


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(UTC)


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    source_kind: Mapped[str] = mapped_column(String(16))  # sample | upload | fragments
    source_path: Mapped[str | None] = mapped_column(String(255))
    grid_rows: Mapped[int] = mapped_column(Integer)
    grid_cols: Mapped[int] = mapped_column(Integer)
    tile: Mapped[int] = mapped_column(Integer, default=0)
    has_ground_truth: Mapped[bool] = mapped_column(Boolean, default=False)
    fragment_params: Mapped[dict | None] = mapped_column(JSON)
    match_config: Mapped[dict | None] = mapped_column(JSON)
    match_stats: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    fragments: Mapped[list[Fragment]] = relationship(
        back_populates="artifact", cascade="all, delete-orphan", passive_deletes=True, order_by="Fragment.label"
    )
    runs: Mapped[list[ReconstructionRun]] = relationship(
        back_populates="artifact", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (
        CheckConstraint("grid_rows BETWEEN 1 AND 16", name="grid_rows_range"),
        CheckConstraint("grid_cols BETWEEN 1 AND 16", name="grid_cols_range"),
        CheckConstraint("source_kind IN ('sample','upload','fragments')", name="source_kind_enum"),
    )


class Fragment(Base):
    __tablename__ = "fragments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(16))  # F01, F02 ... (engine id)
    image_path: Mapped[str] = mapped_column(String(255))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    # Ground truth (synthetic fragments only)
    true_row: Mapped[int | None] = mapped_column(Integer)
    true_col: Mapped[int | None] = mapped_column(Integer)
    scramble_rot: Mapped[int | None] = mapped_column(Integer)
    features: Mapped[dict | None] = mapped_column(JSON)

    artifact: Mapped[Artifact] = relationship(back_populates="fragments")

    __table_args__ = (
        UniqueConstraint("artifact_id", "label", name="uq_fragments_artifact_label"),
        CheckConstraint("scramble_rot IS NULL OR scramble_rot BETWEEN 0 AND 3", name="scramble_rot_range"),
    )


class PairMatch(Base):
    __tablename__ = "pair_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"))
    frag_a: Mapped[str] = mapped_column(ForeignKey("fragments.id", ondelete="CASCADE"))
    side_a: Mapped[int] = mapped_column(Integer)
    frag_b: Mapped[str] = mapped_column(ForeignKey("fragments.id", ondelete="CASCADE"))
    side_b: Mapped[int] = mapped_column(Integer)
    color: Mapped[float] = mapped_column(Float)
    lcs: Mapped[float] = mapped_column(Float)
    edit: Mapped[float] = mapped_column(Float)
    motif: Mapped[float] = mapped_column(Float)
    hash: Mapped[float] = mapped_column(Float)
    composite: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        UniqueConstraint("artifact_id", "frag_a", "side_a", "frag_b", "side_b", name="uq_pair_matches_join"),
        CheckConstraint("side_a BETWEEN 0 AND 3 AND side_b BETWEEN 0 AND 3", name="side_range"),
        CheckConstraint("frag_a <> frag_b", name="no_self_join"),
        CheckConstraint("composite BETWEEN 0 AND 1", name="composite_range"),
        Index("ix_pair_matches_artifact_score", "artifact_id", "composite"),
    )


class ReconstructionRun(Base):
    __tablename__ = "reconstruction_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"), index=True)
    algorithm: Mapped[str] = mapped_column(String(32))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    elapsed_ms: Mapped[float] = mapped_column(Float)
    operations: Mapped[dict] = mapped_column(JSON, default=dict)
    total_score: Mapped[float] = mapped_column(Float)
    neighbour_accuracy: Mapped[float | None] = mapped_column(Float)
    direct_accuracy: Mapped[float | None] = mapped_column(Float)
    coverage: Mapped[float | None] = mapped_column(Float)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    trace_dropped: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    artifact: Mapped[Artifact] = relationship(back_populates="runs")
    # passive_deletes: the database's ON DELETE CASCADE removes children in one
    # statement; the ORM must not load and delete them row by row as well.
    placements: Mapped[list[RunPlacement]] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    trace: Mapped[list[TraceStep]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="TraceStep.step_no"
    )

    __table_args__ = (
        CheckConstraint("algorithm IN ('greedy','best_first','dijkstra','backtracking')", name="algorithm_enum"),
    )


class RunPlacement(Base):
    __tablename__ = "placements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("reconstruction_runs.id", ondelete="CASCADE"), index=True)
    fragment_id: Mapped[str] = mapped_column(ForeignKey("fragments.id", ondelete="CASCADE"))
    cell_row: Mapped[int] = mapped_column(Integer)
    cell_col: Mapped[int] = mapped_column(Integer)
    rot: Mapped[int] = mapped_column(Integer)

    __table_args__ = (
        UniqueConstraint("run_id", "fragment_id", name="uq_placements_run_fragment"),
        UniqueConstraint("run_id", "cell_row", "cell_col", name="uq_placements_run_cell"),
        CheckConstraint("rot BETWEEN 0 AND 3", name="rot_range"),
    )


class TraceStep(Base):
    __tablename__ = "trace_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("reconstruction_runs.id", ondelete="CASCADE"), index=True)
    step_no: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(24))
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class Job(Base):
    """A solver run executed in the background (T20; CONTRACT §5.1).

    queued -> running -> done (run_id set) | failed (error set)
    """

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"), index=True)
    algorithm: Mapped[str] = mapped_column(String(32))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_runs.id", ondelete="SET NULL"))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('queued','running','done','failed')", name="status_enum"),
        CheckConstraint("progress BETWEEN 0 AND 1", name="progress_range"),
        CheckConstraint("algorithm IN ('greedy','best_first','dijkstra','backtracking')", name="algorithm_enum"),
    )
