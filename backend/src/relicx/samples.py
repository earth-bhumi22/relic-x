"""Procedurally generated demo artifacts.

No copyrighted images are bundled: each sample is drawn from code with a
fixed seed, so every run (and every examiner) sees the same artifact.
"""

from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

SIZE = 480

SAMPLES = {
    "mosaic-tile": "Glazed geometric tile panel with star rosettes",
    "pottery-band": "Painted pottery shard with wave and meander bands",
    "manuscript": "Illuminated manuscript leaf with glyph rows and border",
}


def _gradient(size: int, c1, c2, vertical: bool = True, rng: np.random.Generator | None = None) -> Image.Image:
    """Two-colour gradient plus a low-frequency colour field.

    Real artifacts never repeat exactly; the smooth random field makes every
    cut edge unique (a perfectly periodic pattern would make the puzzle
    genuinely ambiguous, for any algorithm).
    """
    t = np.linspace(0, 1, size)[:, None] if vertical else np.linspace(0, 1, size)[None, :]
    t = np.broadcast_to(t, (size, size))[..., None]
    arr = np.array(c1) * (1 - t) + np.array(c2) * t
    if rng is not None:
        field = rng.random((6, 6, 3)) * 255
        field = np.asarray(Image.fromarray(field.astype(np.uint8)).resize((size, size), Image.BICUBIC), dtype=float)
        arr = 0.62 * arr + 0.38 * field
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def _mosaic(rng: np.random.Generator) -> Image.Image:
    img = _gradient(SIZE, (18, 62, 98), (10, 34, 60), rng=rng)
    d = ImageDraw.Draw(img)
    step = 74  # deliberately not a divisor of common grid sizes
    palette = [(212, 164, 64), (196, 72, 52), (236, 228, 206), (52, 132, 120), (120, 52, 98)]
    for gy in range(-20, SIZE, step):
        for gx in range(-31 + (gy // step % 2) * 37, SIZE, step):
            cx, cy = gx + step / 2 + rng.uniform(-6, 6), gy + step / 2 + rng.uniform(-6, 6)
            col = palette[int(rng.integers(len(palette)))]
            pts = []
            for k in range(16):
                rad = step * (0.46 if k % 2 == 0 else 0.22)
                a = math.pi * k / 8 + rng.uniform(-0.05, 0.05)
                pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
            d.polygon(pts, fill=col, outline=(240, 236, 220))
            d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=palette[int(rng.integers(len(palette)))])
    for _ in range(9):
        x0, y0 = rng.integers(0, SIZE, 2)
        d.arc([x0 - 90, y0 - 90, x0 + 90, y0 + 90], 0, int(rng.integers(90, 300)), fill=(240, 236, 220), width=3)
    return img


def _pottery(rng: np.random.Generator) -> Image.Image:
    img = _gradient(SIZE, (190, 112, 66), (150, 80, 44), rng=rng)
    d = ImageDraw.Draw(img)
    for band, y0 in enumerate(range(14, SIZE, 87)):
        d.rectangle([0, y0, SIZE, y0 + 10], fill=(34, 26, 22))
        amp, freq = 14 + 6 * band, 0.03 + 0.01 * band
        pts = [(x, y0 + 46 + amp * math.sin(freq * x + band)) for x in range(0, SIZE + 4, 4)]
        d.line(pts, fill=(28, 22, 18), width=6)
        d.line([(x, y + 12) for x, y in pts], fill=(232, 210, 170), width=3)
        for x in range(int(rng.integers(0, 30)), SIZE, int(rng.integers(47, 71))):
            d.polygon([(x, y0 + 74), (x + 14, y0 + 86), (x + 28, y0 + 74)], fill=(232, 210, 170))
    return img


def _manuscript(rng: np.random.Generator) -> Image.Image:
    img = _gradient(SIZE, (238, 222, 184), (214, 192, 146), vertical=False, rng=rng)
    d = ImageDraw.Draw(img)
    d.rectangle([10, 10, SIZE - 10, SIZE - 10], outline=(128, 32, 28), width=8)
    d.rectangle([24, 24, SIZE - 24, SIZE - 24], outline=(36, 76, 140), width=4)
    d.rectangle([44, 44, 150, 150], fill=(36, 76, 140))
    d.ellipse([60, 60, 134, 134], fill=(212, 164, 64))
    d.line([(97, 64), (97, 130)], fill=(128, 32, 28), width=8)
    for y in range(56, SIZE - 50, 22):
        x = 166 if y < 150 else 48
        while x < SIZE - 60:
            w = int(rng.integers(8, 34))
            shade = int(rng.integers(20, 70))
            d.rectangle([x, y, x + w, y + 9], fill=(shade, shade - 10 if shade > 10 else 0, 10))
            x += w + int(rng.integers(5, 12))
    for _ in range(6):
        cx, cy = int(rng.integers(60, SIZE - 60)), int(rng.integers(60, SIZE - 60))
        d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], outline=(128, 32, 28), width=3)
    return img


def make_sample(name: str, seed: int = 11) -> Image.Image:
    rng = np.random.default_rng(seed)
    if name == "mosaic-tile":
        return _mosaic(rng)
    if name == "pottery-band":
        return _pottery(rng)
    if name == "manuscript":
        return _manuscript(rng)
    raise KeyError(name)


def sample_array(name: str, seed: int = 11) -> np.ndarray:
    return np.asarray(make_sample(name, seed).convert("RGB"))
