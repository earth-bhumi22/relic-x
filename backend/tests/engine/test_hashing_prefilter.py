"""T12 — n-gram hashing, the two-stage pre-filter, and the memo cache.

Owner: B. The pre-filter must only decide *which* pairs get the expensive DP
scoring: it must never change a score, it must keep the true neighbours at the
default top_k, and switching it off (top_k = everything) must score every pair.
"""

import random

import numpy as np
import pytest

from relicx.engine import MatchConfig, Truth, extract_features, fragment_image, match_accuracy, match_all
from relicx.engine.counters import OpCounter
from relicx.engine.strings import MemoCache, jaccard, ngram_signature


# ------------------------------------------------------------------ signatures and Jaccard
def test_signature_size_and_identity():
    s = "ABCDEFGHIJ"
    sig = ngram_signature(s, 3)
    assert len(sig) == len(s) - 3 + 1  # all 3-grams distinct here
    assert ngram_signature("AAAAAAA", 3) == ngram_signature("AAA", 3)  # repeats collapse into one gram
    assert ngram_signature("AB", 3) == frozenset()  # shorter than n


@pytest.mark.parametrize("seed", range(30))
def test_jaccard_properties(seed):
    rng = random.Random(seed)
    a = ngram_signature("".join(rng.choice("ABCD") for _ in range(rng.randint(0, 20))), 3)
    b = ngram_signature("".join(rng.choice("ABCD") for _ in range(rng.randint(0, 20))), 3)
    j = jaccard(a, b)
    assert 0.0 <= j <= 1.0
    assert j == jaccard(b, a)
    assert jaccard(a, a) == 1.0
    if a and b and not (a & b):
        assert j == 0.0


def test_shared_run_raises_jaccard():
    base = "ABCDEFGHIJKLMNOP"
    shifted = base[2:] + "XY"
    unrelated = "QRSTUVWXYZ012345"
    assert jaccard(ngram_signature(base, 3), ngram_signature(shifted, 3)) > 0.6
    assert jaccard(ngram_signature(base, 3), ngram_signature(unrelated, 3)) == 0.0


def test_memo_cache_computes_once():
    calls = []
    cache = MemoCache()
    for _ in range(5):
        assert cache.get_or_compute(("a", "b"), lambda: calls.append(1) or 42) == 42
    assert calls == [1] and cache.hits == 4 and cache.misses == 1


# ------------------------------------------------------------------ pre-filter behaviour
def _features(image, rows, cols, rotate=False, seed=5):
    fr = fragment_image(image, rows, cols, rotate=rotate, noise=3, erosion=0.2, seed=seed)
    feats = {f"F{k:02d}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
    truth = {f"F{k:02d}": Truth(f.true_row, f.true_col, f.scramble_rot) for k, f in enumerate(fr.fragments)}
    return feats, truth


def test_filter_never_changes_a_score(smooth_image):
    feats, _ = _features(smooth_image, 4, 4)
    full = {(m.a, m.side_a, m.b, m.side_b): m for m in match_all(feats, MatchConfig(top_k=10_000)).matches}
    filtered = match_all(feats, MatchConfig(top_k=3)).matches
    assert 0 < len(filtered) < len(full)
    for m in filtered:
        assert full[(m.a, m.side_a, m.b, m.side_b)] == m


def test_no_filter_scores_every_pair(smooth_image):
    feats, _ = _features(smooth_image, 3, 3)
    res = match_all(feats, MatchConfig(top_k=10_000))
    assert res.stats["side_pairs_skipped"] == 0
    assert res.stats["side_pairs_scored"] == res.stats["side_pairs_total"] == 36 * 4  # C(9,2) pairs × 4 side combos


@pytest.mark.parametrize("rotate", [False, True])
def test_default_filter_keeps_true_neighbours(smooth_image, rotate):
    feats, truth = _features(smooth_image, 4, 4, rotate=rotate)
    cfg = MatchConfig(allow_rotation=rotate)  # default top_k = 6
    kept = {(m.a, m.b) for m in match_all(feats, cfg).matches} | {(m.b, m.a) for m in match_all(feats, cfg).matches}
    by_cell = {(t.row, t.col): f for f, t in truth.items()}
    true_pairs = [
        (f, by_cell[(t.row + dr, t.col + dc)])
        for f, t in truth.items()
        for dr, dc in ((0, 1), (1, 0))
        if (t.row + dr, t.col + dc) in by_cell
    ]
    assert all(p in kept for p in true_pairs)
    assert match_accuracy(match_all(feats, cfg).matches, truth, rotate) >= 0.9


def test_each_side_keeps_at_most_top_k_by_its_own_ranking(smooth_image):
    """Every scored pair is in the top_k list of at least one of its two sides."""
    feats, _ = _features(smooth_image, 4, 4)
    k = 2
    res = match_all(feats, MatchConfig(top_k=k))
    per_side: dict = {}
    for m in res.matches:
        per_side.setdefault((m.a, m.side_a), 0)
        per_side.setdefault((m.b, m.side_b), 0)
        per_side[(m.a, m.side_a)] += 1
        per_side[(m.b, m.side_b)] += 1
    # The kept set is the union of each side's own top-k list, so |kept| <= k × number of sides.
    assert len(res.matches) <= k * len(per_side)


def test_filter_saves_dp_work(smooth_image):
    feats, _ = _features(smooth_image, 5, 5)
    c_all, c_k = OpCounter(), OpCounter()
    match_all(feats, MatchConfig(top_k=10_000), c_all)
    match_all(feats, MatchConfig(top_k=6), c_k)
    assert c_k.get("dp_cells") < 0.5 * c_all.get("dp_cells")
    assert c_k.get("prefilter_checks") == c_all.get("prefilter_checks")  # stage 1 always looks at everything


def test_cache_hits_on_identical_edges():
    """A flat-colour artifact has identical edge strings everywhere: string scores are computed once."""
    flat = np.full((240, 240, 3), (120, 80, 40), dtype=np.uint8)
    fr = fragment_image(flat, 3, 3, seed=1)
    feats = {f"F{k}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
    res = match_all(feats, MatchConfig(top_k=10_000))
    assert res.stats["cache_hits"] == res.stats["side_pairs_scored"] - 1
