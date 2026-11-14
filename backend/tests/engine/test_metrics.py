"""T17: accuracy metrics (neighbour vs direct accuracy, invariances, limitations)."""

import pytest

from relicx.engine import Truth, direct_accuracy, neighbour_accuracy
from relicx.engine.layout import Placement

TRUTH = {f"F{r}{c}": Truth(r, c, 0) for r in range(2) for c in range(3)}  # 2 x 3 picture


def layout(mapping, rot=0):
    return [Placement(f, r, c, rot) for f, (r, c) in mapping.items()]


EXACT = {f: (t.row, t.col) for f, t in TRUTH.items()}


def both(placements, truth=TRUTH):
    return neighbour_accuracy(placements, truth), direct_accuracy(placements, truth)


def test_exact_layout_scores_one_on_both():
    assert both(layout(EXACT)) == (1.0, 1.0)


def test_shifted_layout_is_still_perfect():
    shifted = {f: (r + 5, c - 7) for f, (r, c) in EXACT.items()}
    assert both(layout(shifted)) == (1.0, 1.0)


@pytest.mark.parametrize("k", [1, 2, 3])
def test_globally_rotated_layout_is_still_perfect(k):
    # rotate the whole picture clockwise k quarter turns: grid vector (dr, dc) -> (dc, -dr), each piece turned k times
    placed = {}
    for f, (r, c) in EXACT.items():
        rr, cc = r, c
        for _ in range(k):
            rr, cc = cc, -rr
        placed[f] = Placement(f, rr, cc, k)
    assert both(list(placed.values())) == (1.0, 1.0)


def test_mirrored_layout_is_not_perfect():
    mirrored = {f: (r, 2 - c) for f, (r, c) in EXACT.items()}  # a reflection is not a rotation
    nb, direct = both(layout(mirrored))
    assert nb < 1.0 and direct < 1.0
    assert nb == pytest.approx(3 / 7)  # only the three vertical pairs survive, of 7 true adjacencies
    assert direct == pytest.approx(2 / 6)  # only the middle column keeps its place


def test_swapped_pair_is_penalised_by_both():
    swapped = dict(EXACT)
    swapped["F00"], swapped["F01"] = EXACT["F01"], EXACT["F00"]
    nb, direct = both(layout(swapped))
    assert nb < 1.0 and direct == pytest.approx(4 / 6)


def test_neighbour_can_exceed_direct_and_vice_versa():
    strip = {f"S{i}": Truth(0, i, 0) for i in range(4)}
    gap = layout({"S0": (0, 0), "S1": (0, 1), "S2": (0, 3), "S3": (0, 4)})  # two correct halves, one gap
    assert both(gap, strip) == (pytest.approx(2 / 3), pytest.approx(2 / 4))  # neighbour > direct
    square = {"a": Truth(0, 0, 0), "b": Truth(0, 1, 0), "c": Truth(1, 0, 0), "d": Truth(1, 1, 0)}
    swapped = layout({"b": (0, 0), "a": (0, 1), "c": (1, 0), "d": (1, 1)})
    nb, direct = both(swapped, square)
    assert (nb, direct) == (pytest.approx(1 / 4), pytest.approx(2 / 4))  # direct > neighbour


def test_missing_pieces_count_against_both_denominators():
    placed = {f: p for f, p in EXACT.items() if f != "F01"}  # the middle top piece was never placed
    nb, direct = both(layout(placed))
    assert nb == pytest.approx(4 / 7)  # the three true adjacencies touching F01 are lost
    assert direct == pytest.approx(5 / 6)


def test_no_ground_truth_is_vacuously_perfect():
    # uploads have no truth: the API reports no accuracy for them; the functions return 1.0 rather than dividing by 0
    assert both(layout(EXACT), {}) == (1.0, 1.0)
    assert both([], {}) == (1.0, 1.0)


def test_empty_layout_against_a_truth_scores_zero():
    assert both([]) == (0.0, 0.0)


def test_scrambled_rotations_in_the_truth_are_accounted_for():
    truth = {"a": Truth(0, 0, 1), "b": Truth(0, 1, 1)}  # both were turned once when scrambling
    # to restore them each must be turned 3 more times (net 0 turns mod 4)
    fixed = [Placement("a", 0, 0, 3), Placement("b", 0, 1, 3)]
    assert both(fixed, truth) == (1.0, 1.0)
    unfixed = [Placement("a", 0, 0, 0), Placement("b", 0, 1, 0)]  # nb: net rot 1 for both -> they sit side by side
    assert neighbour_accuracy(unfixed, truth) == 0.0  # but the direction is not the one a quarter turn implies
