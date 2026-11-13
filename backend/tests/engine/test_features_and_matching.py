import numpy as np

from relicx.engine import MatchConfig, Truth, extract_features, fragment_image, match_accuracy, match_all
from relicx.engine.features import quantize


def test_rotation_permutes_sides(smooth_image):
    """Turning a fragment 90° clockwise moves original side s to s+1, unchanged."""
    tile = smooth_image[:90, :90]
    f0 = extract_features(tile)
    f1 = extract_features(np.ascontiguousarray(np.rot90(tile, k=-1)))
    for s in range(4):
        assert f0.strings[s] == f1.strings[(s + 1) % 4]


def test_quantize_alphabet():
    strip = np.array([[0, 0, 0], [255, 255, 255]], dtype=float)
    assert quantize(strip, 4) == "A/"


def test_fragmenter_ground_truth(smooth_image):
    res = fragment_image(smooth_image, 3, 4, rotate=True, missing=2, seed=3)
    assert len(res.fragments) == 10
    cells = {(f.true_row, f.true_col) for f in res.fragments}
    assert len(cells) == 10 and not cells & set(res.missing_cells)
    assert all(f.pixels.shape[0] == f.pixels.shape[1] == res.tile for f in res.fragments)


def _setup(image, rows, cols, rotate):
    fr = fragment_image(image, rows, cols, rotate=rotate, noise=3, erosion=0.2, seed=5)
    feats = {f"F{k}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
    truth = {f"F{k}": Truth(f.true_row, f.true_col, f.scramble_rot) for k, f in enumerate(fr.fragments)}
    return feats, truth


def test_matcher_finds_true_neighbours(smooth_image):
    feats, truth = _setup(smooth_image, 3, 3, rotate=False)
    res = match_all(feats, MatchConfig())
    assert match_accuracy(res.matches, truth, allow_rotation=False) >= 0.9
    assert res.stats["side_pairs_skipped"] > 0  # the hash/colour pre-filter did prune
    assert all(0.0 <= m.composite <= 1.0 for m in res.matches)


def test_matcher_with_rotation(smooth_image):
    feats, truth = _setup(smooth_image, 3, 3, rotate=True)
    res = match_all(feats, MatchConfig(allow_rotation=True))
    assert match_accuracy(res.matches, truth, allow_rotation=True) >= 0.9


def test_motif_methods_give_same_scores(smooth_image):
    feats, _ = _setup(smooth_image, 3, 3, rotate=False)
    a = match_all(feats, MatchConfig(motif_method="kmp"))
    b = match_all(feats, MatchConfig(motif_method="rabin_karp"))
    assert [m.composite for m in a.matches] == [m.composite for m in b.matches]
