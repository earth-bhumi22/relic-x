"""Artifact lifecycle: create (sample / upload / real fragments), fragment, delete."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from .. import samples as sample_lib
from ..core.config import Settings
from ..core.errors import InvalidInput
from ..db.models import Artifact, Fragment
from ..engine import extract_features, fragment_image
from ..repositories import ArtifactRepository, FragmentRepository
from .storage import LocalStorage, decode_image

DEFAULT_FEATURES = {"strip_len": 24, "levels": 4, "depth": 2}


@dataclass
class FragmentSpec:
    rows: int = 4
    cols: int = 4
    rotate: bool = False
    noise: float = 4.0
    erosion: float = 0.2
    missing: int = 0
    seed: int = 7


class ArtifactService:
    def __init__(self, db: Session, storage: LocalStorage, settings: Settings) -> None:
        self.db = db
        self.storage = storage
        self.settings = settings
        self.artifacts = ArtifactRepository(db)
        self.fragments = FragmentRepository(db)

    # -- create ------------------------------------------------------------------
    def create_from_sample(
        self, name: str, sample: str, spec: FragmentSpec, description: str | None = None
    ) -> Artifact:
        if sample not in sample_lib.SAMPLES:
            raise InvalidInput(f"unknown sample {sample!r}", details={"available": list(sample_lib.SAMPLES)})
        image = sample_lib.make_sample(sample)
        return self._create_with_source(name, "sample", image, spec, description or sample_lib.SAMPLES[sample])

    def create_from_upload(
        self, name: str, data: bytes, spec: FragmentSpec, description: str | None = None
    ) -> Artifact:
        image = decode_image(data, self.settings.max_upload_bytes)
        return self._create_with_source(name, "upload", image, spec, description)

    def _create_with_source(self, name, kind, image: Image.Image, spec: FragmentSpec, description) -> Artifact:
        self._check_spec(spec)
        art = self.artifacts.add(
            Artifact(name=name, description=description, source_kind=kind, grid_rows=spec.rows, grid_cols=spec.cols)
        )
        art.source_path = self.storage.save_png(f"artifacts/{art.id}/source.png", image)
        self.fragment(art, spec, image)
        return art

    def create_from_fragments(self, name: str, files: list[bytes], rows: int, cols: int) -> Artifact:
        """Real (non-synthetic) fragments: no ground truth, accuracy not reported."""
        if not files:
            raise InvalidInput("no fragment images uploaded")
        if len(files) > min(rows * cols, self.settings.max_fragments):
            raise InvalidInput(f"{len(files)} fragments do not fit a {rows}x{cols} grid")
        images = [decode_image(f, self.settings.max_upload_bytes) for f in files]
        tile = min(min(im.size) for im in images)
        if tile < 16:
            raise InvalidInput("fragments must be at least 16x16 pixels")
        art = self.artifacts.add(
            Artifact(name=name, source_kind="fragments", grid_rows=rows, grid_cols=cols, tile=tile, fragment_params={})
        )
        frags = []
        for k, im in enumerate(images):
            sq = im.resize((tile, tile), Image.LANCZOS)
            frags.append(self._make_fragment(art, k, sq, None))
        self.fragments.replace_all(art.id, frags)
        return art

    # -- fragment ---------------------------------------------------------------------
    def fragment(self, art: Artifact, spec: FragmentSpec, image: Image.Image | None = None) -> list[Fragment]:
        if art.source_kind == "fragments":
            raise InvalidInput("artifact was created from real fragments and has no source image to cut")
        self._check_spec(spec)
        image = image or self.storage.load_rgb(art.source_path)
        res = fragment_image(
            np.asarray(image),
            spec.rows,
            spec.cols,
            rotate=spec.rotate,
            noise=spec.noise,
            erosion=spec.erosion,
            missing=spec.missing,
            seed=spec.seed,
        )
        self.storage.delete_tree(f"artifacts/{art.id}/fragments")
        frags = [
            self._make_fragment(art, k, Image.fromarray(f.pixels), (f.true_row, f.true_col, f.scramble_rot))
            for k, f in enumerate(res.fragments)
        ]
        art.grid_rows, art.grid_cols, art.tile = spec.rows, spec.cols, res.tile
        art.has_ground_truth = True
        art.fragment_params = {**spec.__dict__, "missing_cells": res.missing_cells}
        art.match_config = None
        art.match_stats = None
        return self.fragments.replace_all(art.id, frags)

    def _make_fragment(self, art: Artifact, k: int, image: Image.Image, truth) -> Fragment:
        label = f"F{k + 1:02d}"
        rel = self.storage.save_png(f"artifacts/{art.id}/fragments/{label}.png", image)
        feats = extract_features(np.asarray(image), **DEFAULT_FEATURES)
        return Fragment(
            artifact_id=art.id,
            label=label,
            image_path=rel,
            width=image.width,
            height=image.height,
            true_row=truth[0] if truth else None,
            true_col=truth[1] if truth else None,
            scramble_rot=truth[2] if truth else None,
            features={**feats.to_dict(), "params": DEFAULT_FEATURES},
        )

    def _check_spec(self, spec: FragmentSpec) -> None:
        n = spec.rows * spec.cols - spec.missing
        if n > self.settings.max_fragments:
            raise InvalidInput(f"at most {self.settings.max_fragments} fragments are allowed")
        if spec.missing >= spec.rows * spec.cols:
            raise InvalidInput("cannot remove every fragment")

    # -- read / delete ----------------------------------------------------------------
    def get(self, artifact_id: str) -> Artifact:
        return self.artifacts.get(artifact_id)

    def list(self, limit: int, offset: int) -> list[Artifact]:
        return self.artifacts.list(limit, offset)

    def count(self) -> int:
        return self.artifacts.count()

    def delete(self, artifact_id: str) -> None:
        art = self.artifacts.get(artifact_id)
        self.artifacts.delete(art)
        self.storage.delete_tree(f"artifacts/{artifact_id}")
