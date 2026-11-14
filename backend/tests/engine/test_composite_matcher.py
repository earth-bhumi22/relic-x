"""T13 — edge features (clockwise reading, reversal) and the composite score.

Owner: B. The clockwise convention is what lets one comparison rule
("side a of i vs REVERSED side b of j") work for every rotation; these tests
pin it down, together with how the five component scores are combined.
"""

import numpy as np
import pytest

from relicx.engine import MatchConfig, extract_features, match_all
from relicx.engine.matcher import DEFAULT_WEIGHTS, color_similarity


def tiles(image, size=90):
    return image[:size, :size], image[:size, size : 2 * size], image[size : 2 * size, :size], image[-size:, -size:]


def test_reversed_edges_line_up_for_horizontal_and_vertical_neighbours(smooth_image):
    left, right, below, far = tiles(smooth_image)
    fl, fr, fb, ff = (extract_features(t) for t in (left, right, below, far))
    # E of left (top->bottom) vs W of right (bottom->top): must be reversed to line up.
    aligned = color_similarity(fl.strips[1], np.asarray(fr.strips[3])[::-1], 40)
    misaligned = color_similarity(fl.strips[1], fr.strips[3], 40)
    unrelated = color_similarity(fl.strips[1], np.asarray(ff.strips[3])[::-1], 40)
    # The strips sit a few pixels apart on a steep test gradient, so "aligned" is not 1.0;
    # what matters is the margin over the wrong reading and over an unrelated tile.
    assert aligned > 0.5 and aligned > misaligned + 0.4 and aligned > unrelated + 0.4
    # S of top (right->left) vs N of below (left->right): same rule.
    assert color_similarity(fl.strips[2], np.asarray(fb.strips[0])[::-1], 40) > 0.5


@pytest.mark.parametrize("k", [1, 2, 3])
def test_one_rule_works_for_every_rotation(smooth_image, k):
    """Turn the right-hand tile k quarter turns clockwise: its old W side is now side (3 + k) % 4,
    and comparing with that side REVERSED gives exactly the same strip as before."""
    left, right, _, _ = tiles(smooth_image)
    plain = extract_features(right)
    turned = extract_features(np.ascontiguousarray(np.rot90(right, k=-k)))
    assert turned.strings[(3 + k) % 4] == plain.strings[3]
    fl = extract_features(left)
    a = color_similarity(fl.strips[1], np.asarray(plain.strips[3])[::-1], 40)
    b = color_similarity(fl.strips[1], np.asarray(turned.strips[(3 + k) % 4])[::-1], 40)
    assert a == pytest.approx(b)


def _feats(image):
    from relicx.engine import fragment_image

    fr = fragment_image(image, 3, 3, noise=3, erosion=0.2, seed=4)
    return {f"F{k}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}


def test_composite_is_the_weighted_mean_of_components(smooth_image):
    w = DEFAULT_WEIGHTS
    for m in match_all(_feats(smooth_image)).matches:
        expected = sum(w[c] * getattr(m, c) for c in w) / sum(w.values())
        assert m.composite == pytest.approx(expected, abs=1e-3)  # components are rounded to 4 dp


def test_scaling_all_weights_changes_nothing(smooth_image):
    feats = _feats(smooth_image)
    base = [m.composite for m in match_all(feats).matches]
    doubled = MatchConfig(weights={k: 2 * v for k, v in DEFAULT_WEIGHTS.items()})
    assert [m.composite for m in match_all(feats, doubled).matches] == base


def test_zero_weight_removes_a_component(smooth_image):
    feats = _feats(smooth_image)
    cfg = MatchConfig.from_dict({"weights": {"motif": 0.0}})
    rest = {k: v for k, v in DEFAULT_WEIGHTS.items() if k != "motif"}
    for m in match_all(feats, cfg).matches:
        expected = sum(rest[c] * getattr(m, c) for c in rest) / sum(rest.values())
        assert m.composite == pytest.approx(expected, abs=1e-3)


def test_config_from_dict_merges_partial_weights_and_ignores_unknown_keys():
    cfg = MatchConfig.from_dict({"weights": {"lcs": 0.9}, "strip_len": 32, "not_a_field": 1})
    assert cfg.weights["lcs"] == 0.9
    assert cfg.weights["color"] == DEFAULT_WEIGHTS["color"]
    assert cfg.strip_len == 32 and not hasattr(cfg, "not_a_field")
    assert MatchConfig.from_dict(None).weights == DEFAULT_WEIGHTS


def test_quantisation_is_deterministic_and_coarse(smooth_image):
    t = smooth_image[:90, :90]
    assert extract_features(t).strings == extract_features(t.copy()).strings
    # One grey level of noise almost never changes a symbol (bins are 64 levels wide at levels=4).
    noisy = np.clip(t.astype(int) + 1, 0, 255).astype(np.uint8)
    same = sum(
        a == b
        for s1, s2 in zip(extract_features(t).strings, extract_features(noisy).strings, strict=True)
        for a, b in zip(s1, s2, strict=True)
    )
    assert same / (4 * 24) > 0.9
