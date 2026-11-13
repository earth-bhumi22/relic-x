"""Synthetic fragmentation with ground truth.

Cuts a known image into a rows x cols grid of *square* tiles, then optionally
damages it so reconstruction is not trivially easy:

* ``rotate``  - each tile gets a random 0/90/180/270 degree clockwise turn
* ``noise``   - Gaussian pixel noise (sigma in 0-255 units)
* ``erosion`` - probability that each side gets a chipped segment
* ``missing`` - number of tiles removed entirely (lost fragments)

The true position and the applied rotation are kept so accuracy can be
measured after reconstruction.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class SyntheticFragment:
    pixels: np.ndarray
    true_row: int
    true_col: int
    scramble_rot: int  # clockwise quarter turns applied when scrambling


@dataclass
class FragmentationResult:
    fragments: list[SyntheticFragment]
    rows: int
    cols: int
    tile: int
    missing_cells: list[tuple[int, int]]


def _chip_edge(tile: np.ndarray, side: int, rng: np.random.Generator) -> None:
    """Overwrite a random segment of one border with dull 'damage' colour."""
    size = tile.shape[0]
    seg = int(size * rng.uniform(0.2, 0.45))
    start = int(rng.integers(0, max(1, size - seg)))
    depth = max(2, size // 16)
    colour = np.array([92, 78, 64]) + rng.integers(-12, 12, 3)
    if side == 0:
        tile[:depth, start : start + seg] = colour
    elif side == 1:
        tile[start : start + seg, -depth:] = colour
    elif side == 2:
        tile[-depth:, start : start + seg] = colour
    else:
        tile[start : start + seg, :depth] = colour


def fragment_image(
    image: np.ndarray,
    rows: int,
    cols: int,
    *,
    rotate: bool = False,
    noise: float = 0.0,
    erosion: float = 0.0,
    missing: int = 0,
    seed: int = 7,
) -> FragmentationResult:
    if rows < 1 or cols < 1:
        raise ValueError("rows and cols must be >= 1")
    if missing < 0 or missing >= rows * cols:
        raise ValueError("missing must be in [0, rows*cols)")
    rng = np.random.default_rng(seed)
    h, w = image.shape[:2]
    tile = min(h // rows, w // cols)
    if tile < 8:
        raise ValueError("image too small for this grid")
    img = image[: tile * rows, : tile * cols, :3].astype(np.int16)

    cells = [(r, c) for r in range(rows) for c in range(cols)]
    missing_idx = set(rng.choice(len(cells), size=missing, replace=False).tolist()) if missing else set()
    frags: list[SyntheticFragment] = []
    for k, (r, c) in enumerate(cells):
        if k in missing_idx:
            continue
        t = img[r * tile : (r + 1) * tile, c * tile : (c + 1) * tile].copy()
        if noise > 0:
            t = t + rng.normal(0, noise, t.shape)
        for side in range(4):
            if erosion > 0 and rng.random() < erosion:
                _chip_edge(t, side, rng)
        t = np.clip(t, 0, 255).astype(np.uint8)
        rot = int(rng.integers(0, 4)) if rotate else 0
        # np.rot90 with k=-rot turns clockwise `rot` times.
        frags.append(SyntheticFragment(np.ascontiguousarray(np.rot90(t, k=-rot)), r, c, rot))
    order = rng.permutation(len(frags))  # shuffle so input order leaks nothing
    return FragmentationResult(
        fragments=[frags[i] for i in order],
        rows=rows,
        cols=cols,
        tile=tile,
        missing_cells=[cells[i] for i in sorted(missing_idx)],
    )
