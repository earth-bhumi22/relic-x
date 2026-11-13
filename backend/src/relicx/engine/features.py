"""Feature extraction: turn each fragment edge into a symbol string.

Sides are numbered clockwise: N=0, E=1, S=2, W=3.

Every side is read *clockwise* around the fragment:
    N: left -> right      E: top -> bottom
    S: right -> left      W: bottom -> top

With that convention, when side ``a`` of one fragment touches side ``b`` of
another, the two strips run in opposite directions along the shared border.
So edge A is always compared with *reversed* edge B, for every rotation.

Pipeline per side:
    1. take the outer ``depth`` pixel rows/columns and average them
    2. resample to ``strip_len`` samples (block averaging)  -> numeric strip
    3. quantise each RGB sample to one of levels^3 symbols   -> edge string
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

SIDES = ("N", "E", "S", "W")
# 64-symbol alphabet (enough for levels=4 -> 4^3 = 64 colours).
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


@dataclass
class EdgeFeatures:
    """Features of one fragment: 4 edge strings + 4 numeric strips."""

    strings: list[str]  # index by side 0..3
    strips: list[list[list[float]]]  # [side][sample][rgb], clockwise order

    def to_dict(self) -> dict:
        return {"strings": self.strings, "strips": self.strips}

    @classmethod
    def from_dict(cls, d: dict) -> EdgeFeatures:
        return cls(strings=list(d["strings"]), strips=d["strips"])


def side_strips(pixels: np.ndarray, depth: int = 2) -> list[np.ndarray]:
    """Return the 4 clockwise border strips of an HxWx3 image as float arrays."""
    px = pixels.astype(np.float32)
    depth = max(1, min(depth, px.shape[0] // 2, px.shape[1] // 2))
    north = px[:depth, :, :].mean(axis=0)  # left -> right
    east = px[:, -depth:, :].mean(axis=1)  # top -> bottom
    south = px[-depth:, :, :].mean(axis=0)[::-1]  # right -> left
    west = px[:, :depth, :].mean(axis=1)[::-1]  # bottom -> top
    return [north, east, south, west]


def resample(strip: np.ndarray, length: int) -> np.ndarray:
    """Block-average a (k, 3) strip down/up to (length, 3)."""
    k = strip.shape[0]
    edges = np.linspace(0, k, length + 1)
    out = np.empty((length, strip.shape[1]), dtype=np.float32)
    for i in range(length):
        lo = int(edges[i])
        hi = max(lo + 1, int(np.ceil(edges[i + 1])))
        out[i] = strip[lo:hi].mean(axis=0)
    return out


def quantize(strip: np.ndarray, levels: int = 4) -> str:
    """Map every RGB sample to a symbol of a levels^3 colour palette."""
    if levels**3 > len(ALPHABET):
        raise ValueError("levels too high for the symbol alphabet")
    q = np.clip((strip * levels / 256.0).astype(int), 0, levels - 1)
    idx = (q[:, 0] * levels + q[:, 1]) * levels + q[:, 2]
    return "".join(ALPHABET[i] for i in idx)


def extract_features(pixels: np.ndarray, strip_len: int = 24, levels: int = 4, depth: int = 2) -> EdgeFeatures:
    strings, strips = [], []
    for raw in side_strips(pixels, depth):
        s = resample(raw, strip_len)
        strings.append(quantize(s, levels))
        strips.append(np.round(s, 2).tolist())
    return EdgeFeatures(strings=strings, strips=strips)
