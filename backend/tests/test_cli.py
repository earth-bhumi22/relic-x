"""T05: `relicx seed` creates the demo set, is idempotent, and --reset recreates it."""

import io

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from relicx.cli import DEMO, main, seed
from relicx.core.config import Settings
from relicx.db.models import Artifact, ReconstructionRun
from relicx.engine.solvers import ALGORITHMS


def _settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path}/seed.db", storage_dir=str(tmp_path / "storage"))


def _artifacts(settings):
    with Session(create_engine(settings.database_url)) as db:
        arts = list(db.scalars(select(Artifact)))
        runs = {
            a.id: [
                r.algorithm for r in db.scalars(select(ReconstructionRun).where(ReconstructionRun.artifact_id == a.id))
            ]
            for a in arts
        }
        return {a.name: a for a in arts}, runs


def test_seed_creates_demo_set_with_matches_and_runs(tmp_path):
    s = _settings(tmp_path)
    created = seed(s, node_limit=2_000, out=io.StringIO())
    assert created == [d.name for d in DEMO]
    arts, runs = _artifacts(s)
    assert set(arts) == {d.name for d in DEMO}
    for art in arts.values():
        assert art.match_config is not None and art.has_ground_truth
        assert sorted(runs[art.id]) == sorted(ALGORITHMS)
    rotated = arts["Demo · Pottery band, rotated (4×4)"]
    assert rotated.match_config["allow_rotation"] is True
    assert arts["Demo · Manuscript leaf, one piece lost (5×5)"].fragment_params["missing"] == 1


def test_seed_is_idempotent_and_reset_recreates(tmp_path):
    s = _settings(tmp_path)
    seed(s, node_limit=2_000, out=io.StringIO())
    first, _ = _artifacts(s)

    out = io.StringIO()
    assert seed(s, node_limit=2_000, out=out) == []
    assert out.getvalue().count("exists") == len(DEMO)
    again, _ = _artifacts(s)
    assert {a.id for a in again.values()} == {a.id for a in first.values()}

    seed(s, reset=True, node_limit=2_000, out=io.StringIO())
    fresh, _ = _artifacts(s)
    assert len(fresh) == len(DEMO)
    assert not {a.id for a in fresh.values()} & {a.id for a in first.values()}


def test_seed_keeps_user_artifacts(tmp_path):
    s = _settings(tmp_path)
    seed(s, node_limit=2_000, out=io.StringIO())
    with Session(create_engine(s.database_url)) as db:
        db.add(Artifact(name="My own artifact", source_kind="sample", grid_rows=2, grid_cols=2))
        db.commit()
    seed(s, reset=True, node_limit=2_000, out=io.StringIO())
    arts, _ = _artifacts(s)
    assert "My own artifact" in arts  # --reset only touches the demo artifacts


def test_cli_entrypoint(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RELICX_DATABASE_URL", f"sqlite:///{tmp_path}/cli.db")
    monkeypatch.setenv("RELICX_STORAGE_DIR", str(tmp_path / "st"))
    assert main(["seed", "--node-limit", "1000"]) == 0
    assert capsys.readouterr().out.count("created") == len(DEMO)
