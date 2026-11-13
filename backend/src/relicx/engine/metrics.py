"""Accuracy metrics against synthetic ground truth.

Two standard jigsaw-puzzle measures:

* neighbour accuracy - fraction of truly adjacent fragment pairs that are
  also adjacent, on the correct sides, in the reconstruction. Insensitive
  to the whole picture being shifted or rotated.
* direct accuracy - fraction of fragments in exactly the right cell with the
  right rotation, after the best global rotation and shift are applied.

Plus pairwise *match* accuracy: for each true adjacency, is the true partner
the top-ranked candidate of that side? This measures the matcher alone,
before any solver runs.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from .layout import Placement


@dataclass
class Truth:
    row: int
    col: int
    scramble_rot: int  # clockwise quarter turns applied when scrambling


def _rot_vec(dr: int, dc: int, k: int) -> tuple[int, int]:
    """Rotate a grid vector clockwise k quarter turns: (dr, dc) -> (dc, -dr)."""
    for _ in range(k % 4):
        dr, dc = dc, -dr
    return dr, dc


def neighbour_accuracy(placements: list[Placement], truth: dict[str, Truth]) -> float:
    pos = {p.fragment: p for p in placements}
    by_cell = {(t.row, t.col): f for f, t in truth.items()}
    total = correct = 0
    for f, t in truth.items():
        for dr, dc in ((0, 1), (1, 0)):  # right and down neighbours
            g = by_cell.get((t.row + dr, t.col + dc))
            if g is None:
                continue
            total += 1
            pf, pg = pos.get(f), pos.get(g)
            if not pf or not pg:
                continue
            nf = (t.scramble_rot + pf.rot) % 4  # net orientation of f in the solution
            ng = (truth[g].scramble_rot + pg.rot) % 4
            if nf != ng:
                continue
            if (pg.row - pf.row, pg.col - pf.col) == _rot_vec(dr, dc, nf):
                correct += 1
    return correct / total if total else 1.0


def direct_accuracy(placements: list[Placement], truth: dict[str, Truth]) -> float:
    if not truth:
        return 1.0
    best = 0
    for g in range(4):
        votes: Counter = Counter()
        for p in placements:
            t = truth.get(p.fragment)
            if t is None or (t.scramble_rot + p.rot) % 4 != g:
                continue
            ur, uc = _rot_vec(p.row, p.col, -g)  # undo the global rotation
            votes[(t.row - ur, t.col - uc)] += 1
        if votes:
            best = max(best, votes.most_common(1)[0][1])
    return best / len(truth)


def match_accuracy(matches, truth: dict[str, Truth], allow_rotation: bool) -> float:
    """Share of true adjacencies whose partner is the top-ranked candidate."""
    if allow_rotation:
        return _match_accuracy_rot(matches, truth)
    best: dict[tuple[str, int], tuple[float, str]] = {}
    for m in matches:
        for f, s, g in ((m.a, m.side_a, m.b), (m.b, m.side_b, m.a)):
            if m.composite > best.get((f, s), (-1.0, ""))[0]:
                best[(f, s)] = (m.composite, g)
    by_cell = {(t.row, t.col): f for f, t in truth.items()}
    total = hit = 0
    for f, t in truth.items():
        for side, (dr, dc) in ((1, (0, 1)), (2, (1, 0))):
            g = by_cell.get((t.row + dr, t.col + dc))
            if g is None:
                continue
            total += 1
            hit += best.get((f, side), (0, ""))[1] == g
    return hit / total if total else 1.0


def _match_accuracy_rot(matches, truth: dict[str, Truth]) -> float:
    best: dict[tuple[str, int], tuple[float, str]] = {}
    for m in matches:
        for f, s, g in ((m.a, m.side_a, m.b), (m.b, m.side_b, m.a)):
            if m.composite > best.get((f, s), (-1.0, ""))[0]:
                best[(f, s)] = (m.composite, g)
    by_cell = {(t.row, t.col): f for f, t in truth.items()}
    total = hit = 0
    for f, t in truth.items():
        for d, (dr, dc) in ((1, (0, 1)), (2, (1, 0))):
            g = by_cell.get((t.row + dr, t.col + dc))
            if g is None:
                continue
            total += 1
            # side of the scrambled fragment f that was originally facing d
            side = (d + t.scramble_rot) % 4
            hit += best.get((f, side), (0, ""))[1] == g
    return hit / total if total else 1.0
