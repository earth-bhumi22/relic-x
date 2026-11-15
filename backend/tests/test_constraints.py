# ruff: noqa: E501  (raw SQL rows are clearer on one line)
"""T30 — every integrity rule is enforced by the DATABASE, not only by Python.

Each case is a pair of raw-SQL rows that differ in ONE value: the bad row must be
rejected with IntegrityError, and its good twin must be accepted. The twin proves
the rejection comes from the rule under test, not from some other missing column.
Runs on SQLite by default and on PostgreSQL in CI (RELICX_TEST_DATABASE_URL).
"""

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from relicx.db import models  # noqa: F401
from relicx.db.base import Base

NOW = "CURRENT_TIMESTAMP"
ART = (
    "INSERT INTO artifacts (id, name, source_kind, grid_rows, grid_cols, tile, has_ground_truth, created_at, updated_at) VALUES ('{id}', 'X', '{kind}', {rows}, {cols}, 0, false, "
    + f"{NOW}, {NOW})"
)
FRAG = "INSERT INTO fragments (id, artifact_id, label, image_path, width, height, scramble_rot) VALUES ('{id}', '{art}', '{label}', 'y.png', 1, 1, {rot})"
MATCH = "INSERT INTO pair_matches (artifact_id, frag_a, side_a, frag_b, side_b, color, lcs, edit, motif, hash, composite) VALUES ('a1', '{a}', {sa}, '{b}', {sb}, 0, 0, 0, 0, 0, {c})"
RUN = (
    "INSERT INTO reconstruction_runs (id, artifact_id, algorithm, params, elapsed_ms, operations, total_score, truncated, meta, trace_dropped, created_at) VALUES ('{id}', 'a1', '{algo}', '{{}}', 1, '{{}}', 1, false, '{{}}', '{{}}', "
    + f"{NOW})"
)
PLACE = "INSERT INTO placements (run_id, fragment_id, cell_row, cell_col, rot) VALUES ('r1', '{f}', {r}, {c}, {rot})"
JOB = (
    "INSERT INTO jobs (id, artifact_id, algorithm, params, status, progress, created_at) VALUES ('{id}', 'a1', 'greedy', '{{}}', '{status}', {p}, "
    + f"{NOW})"
)
TRACE = "INSERT INTO trace_steps (run_id, step_no, action, message, data) VALUES ('r1', 1, 'seed', 'm', '{}')"


def art(id="x", kind="sample", rows=3, cols=3):
    return ART.format(id=id, kind=kind, rows=rows, cols=cols)


def frag(id="fx", art_id="a1", label="F09", rot="NULL"):
    return FRAG.format(id=id, art=art_id, label=label, rot=rot)


def match(a="f1", sa=2, b="f3", sb=0, c=0):
    return MATCH.format(a=a, sa=sa, b=b, sb=sb, c=c)


# label: (bad row, good twin)
CASES = {
    "grid_rows below 1": (art(rows=0), art(rows=1)),
    "grid_cols above 16": (art(cols=17), art(cols=16)),
    "unknown source_kind": (art(kind="scan"), art(kind="upload")),
    "duplicate fragment label": (frag(label="F01"), frag(label="F09")),
    "scramble_rot 4": (frag(rot=4), frag(rot=3)),
    "fragment of unknown artifact": (frag(art_id="nope"), frag(art_id="a1")),
    "side 4": (match(sa=4), match(sa=2)),
    "self-join": (match(b="f1"), match(b="f3")),
    "composite above 1": (match(c=1.5), match(c=1)),
    "duplicate join": (match(sa=1, b="f2", sb=3), match(sa=0, b="f2", sb=2)),
    "unknown algorithm": (RUN.format(id="rx", algo="magic"), RUN.format(id="rx", algo="dijkstra")),
    "placement rot 5": (PLACE.format(f="f2", r=1, c=1, rot=5), PLACE.format(f="f2", r=1, c=1, rot=3)),
    "fragment placed twice in a run": (PLACE.format(f="f1", r=2, c=2, rot=0), PLACE.format(f="f3", r=2, c=2, rot=0)),
    "two fragments in one cell": (PLACE.format(f="f2", r=0, c=0, rot=0), PLACE.format(f="f2", r=0, c=1, rot=0)),
    "job status paused": (JOB.format(id="jx", status="paused", p=0), JOB.format(id="jx", status="queued", p=0)),
    "job progress above 1": (JOB.format(id="jx", status="running", p=1.2), JOB.format(id="jx", status="running", p=1)),
}


@pytest.fixture()
def engine(db_url):
    eng = create_engine(db_url)
    if db_url.startswith("sqlite"):

        @event.listens_for(eng, "connect")
        def _fk(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    with eng.begin() as c:
        c.execute(text(art(id="a1")))
        for fid, label in (("f1", "F01"), ("f2", "F02"), ("f3", "F03")):
            c.execute(text(frag(id=fid, label=label)))
        c.execute(text(RUN.format(id="r1", algo="greedy")))
        c.execute(text(PLACE.format(f="f1", r=0, c=0, rot=0)))
        c.execute(text(match(sa=1, b="f2", sb=3, c=0.5)))
        c.execute(text(TRACE))
        c.execute(text(JOB.format(id="j1", status="done", p=1)))
        c.execute(text("UPDATE jobs SET run_id = 'r1' WHERE id = 'j1'"))
    yield eng
    eng.dispose()


@pytest.mark.parametrize("label", list(CASES))
def test_database_rejects_the_bad_row(engine, label):
    with pytest.raises(IntegrityError), engine.begin() as c:
        c.execute(text(CASES[label][0]))


@pytest.mark.parametrize("label", list(CASES))
def test_database_accepts_the_good_twin(engine, label):
    with engine.begin() as c:
        c.execute(text(CASES[label][1]))


def test_deleting_an_artifact_cascades_to_every_child_table(engine):
    with engine.begin() as c:
        c.execute(text("DELETE FROM artifacts WHERE id = 'a1'"))
    with engine.connect() as c:
        for table in ("fragments", "pair_matches", "reconstruction_runs", "placements", "trace_steps", "jobs"):
            assert c.execute(text(f"SELECT count(*) FROM {table}")).scalar() == 0, table


def test_deleting_a_run_keeps_its_job_but_clears_run_id(engine):
    with engine.begin() as c:
        c.execute(text("DELETE FROM reconstruction_runs WHERE id = 'r1'"))
    with engine.connect() as c:
        assert c.execute(text("SELECT run_id FROM jobs WHERE id = 'j1'")).scalar() is None
        assert c.execute(text("SELECT count(*) FROM placements")).scalar() == 0
        assert c.execute(text("SELECT count(*) FROM fragments")).scalar() == 3  # fragments belong to the artifact
