"""Grid layout shared by all solvers.

Coordinates are (row, col). Directions are indexed like sides: N=0, E=1,
S=2, W=3. A placement's ``rot`` is the number of clockwise quarter turns
applied to the fragment image.

After rotating by ``rot``, the fragment's original side ``s`` faces direction
``(s + rot) % 4``; equivalently the side facing direction ``d`` is
``(d - rot) % 4``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .counters import OpCounter, tick

DIRS = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # N, E, S, W

Compat = dict[tuple[str, int, str, int], float]


def side_facing(direction: int, rot: int) -> int:
    return (direction - rot) % 4


@dataclass
class Placement:
    fragment: str
    row: int
    col: int
    rot: int = 0


@dataclass
class Layout:
    rows: int
    cols: int
    allow_rotation: bool = False
    cells: dict[tuple[int, int], Placement] = field(default_factory=dict)
    where: dict[str, Placement] = field(default_factory=dict)

    # -- geometry ---------------------------------------------------------------
    def bbox(self, extra: tuple[int, int] | None = None) -> tuple[int, int, int, int]:
        pts = list(self.cells)
        if extra is not None:
            pts.append(extra)
        rs = [p[0] for p in pts]
        cs = [p[1] for p in pts]
        return min(rs), max(rs), min(cs), max(cs)

    def fits(self, cell: tuple[int, int]) -> bool:
        """Would the bounding box still fit the artifact grid with this cell?

        With rotation enabled the whole picture may come out turned 90°, so
        a cols x rows box is also accepted.
        """
        if cell in self.cells:
            return False
        if not self.cells:
            return True
        r0, r1, c0, c1 = self.bbox(cell)
        h, w = r1 - r0 + 1, c1 - c0 + 1
        if h <= self.rows and w <= self.cols:
            return True
        return self.allow_rotation and h <= self.cols and w <= self.rows

    def frontier(self) -> list[tuple[int, int]]:
        out = set()
        for r, c in self.cells:
            for dr, dc in DIRS:
                cell = (r + dr, c + dc)
                if cell not in self.cells and self.fits(cell):
                    out.add(cell)
        return sorted(out)

    # -- mutation -----------------------------------------------------------------
    def place(self, p: Placement) -> None:
        self.cells[(p.row, p.col)] = p
        self.where[p.fragment] = p

    def remove(self, fragment: str) -> None:
        p = self.where.pop(fragment)
        del self.cells[(p.row, p.col)]

    # -- scoring --------------------------------------------------------------------
    def placement_score(
        self, fragment: str, cell: tuple[int, int], rot: int, compat: Compat, counter: OpCounter | None = None
    ) -> tuple[float, int]:
        """Sum of compatibilities with already-placed neighbours of ``cell``.

        Returns (score, number_of_neighbours).
        """
        total, k = 0.0, 0
        for d, (dr, dc) in enumerate(DIRS):
            nb = self.cells.get((cell[0] + dr, cell[1] + dc))
            if nb is None:
                continue
            tick(counter, "score_lookups")
            mine = side_facing(d, rot)
            theirs = side_facing((d + 2) % 4, nb.rot)
            total += compat.get((fragment, mine, nb.fragment, theirs), 0.0)
            k += 1
        return total, k

    def total_score(self, compat: Compat) -> float:
        """Sum of compatibilities over every adjacent pair (each counted once)."""
        total = 0.0
        for (r, c), p in self.cells.items():
            for d in (1, 2):  # E and S only -> each pair once
                dr, dc = DIRS[d]
                nb = self.cells.get((r + dr, c + dc))
                if nb:
                    total += compat.get(
                        (p.fragment, side_facing(d, p.rot), nb.fragment, side_facing((d + 2) % 4, nb.rot)), 0.0
                    )
        return total

    def normalised(self) -> list[Placement]:
        """Placements shifted so the top-left of the bounding box is (0, 0)."""
        if not self.cells:
            return []
        r0, _, c0, _ = self.bbox()
        return [Placement(p.fragment, p.row - r0, p.col - c0, p.rot) for p in self.cells.values()]
