"""Pairwise compatibility between fragment edges.

For every candidate join (fragment i side a  <->  fragment j side b):

    composite = w_color * colour continuity      (optional geometric descriptor)
              + w_lcs   * LCS ratio               (DP, damage tolerant)
              + w_edit  * edit similarity         (DP, damage cost)
              + w_motif * longest shared motif    (KMP or Rabin-Karp)
              + w_hash  * n-gram Jaccard          (hashing)

Two-stage search keeps this tractable:
  1. pre-filter : a cheap score (hash Jaccard + colour) for every side pair;
                  keep only the top_k partners of each side.          O(P * L)
  2. full score : LCS / edit / motif only on the survivors.           O(P' * L^2)
where P = number of side pairs, P' << P after filtering, L = strip length.
"""

from __future__ import annotations

import heapq
import time
from dataclasses import asdict, dataclass, field

import numpy as np

from .counters import OpCounter, tick
from .features import EdgeFeatures
from .strings import (
    MemoCache,
    edit_similarity,
    jaccard,
    lcs_ratio,
    longest_common_motif,
    ngram_signature,
)

DEFAULT_WEIGHTS = {"color": 0.4, "lcs": 0.2, "edit": 0.15, "motif": 0.15, "hash": 0.1}


@dataclass
class MatchConfig:
    strip_len: int = 24
    levels: int = 4
    depth: int = 2
    ngram: int = 3
    motif_method: str = "kmp"  # "kmp" | "rabin_karp"
    min_motif: int = 3
    top_k: int = 6
    allow_rotation: bool = False
    color_scale: float = 40.0  # mean abs RGB difference that maps to 0 similarity
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict | None) -> MatchConfig:
        d = dict(d or {})
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        cfg = cls(**known)
        weights = dict(DEFAULT_WEIGHTS)
        weights.update(cfg.weights or {})
        cfg.weights = weights
        return cfg


@dataclass
class SideMatch:
    a: str
    side_a: int
    b: str
    side_b: int
    color: float
    lcs: float
    edit: float
    motif: float
    hash: float
    composite: float


@dataclass
class MatchResult:
    matches: list[SideMatch]
    stats: dict


def allowed_side_pairs(allow_rotation: bool) -> list[tuple[int, int]]:
    """(side of i, side of j) combinations that may touch.

    Without rotation only opposite sides can meet: E-W, W-E, S-N, N-S.
    """
    if allow_rotation:
        return [(a, b) for a in range(4) for b in range(4)]
    return [(1, 3), (3, 1), (2, 0), (0, 2)]


def color_similarity(strip_a, strip_b_reversed, scale: float) -> float:
    a = np.asarray(strip_a, dtype=np.float32)
    b = np.asarray(strip_b_reversed, dtype=np.float32)
    mad = float(np.abs(a - b).mean())
    return max(0.0, 1.0 - mad / scale)


def score_pair(
    s_a: str,
    s_b_rev: str,
    strip_a,
    strip_b_rev,
    cfg: MatchConfig,
    counter: OpCounter | None = None,
    sig_a: frozenset | None = None,
    sig_b: frozenset | None = None,
) -> dict:
    """All component scores for one join (edge B already reversed)."""
    w = cfg.weights
    color = color_similarity(strip_a, strip_b_rev, cfg.color_scale)
    lcs = lcs_ratio(s_a, s_b_rev, counter)
    edit = edit_similarity(s_a, s_b_rev, counter)
    motif_len = longest_common_motif(s_a, s_b_rev, cfg.motif_method, cfg.min_motif, counter)["length"]
    motif = motif_len / max(1, min(len(s_a), len(s_b_rev)))
    sig_a = sig_a if sig_a is not None else ngram_signature(s_a, cfg.ngram)
    sig_b = sig_b if sig_b is not None else ngram_signature(s_b_rev, cfg.ngram)
    hsh = jaccard(sig_a, sig_b)
    composite = (w["color"] * color + w["lcs"] * lcs + w["edit"] * edit + w["motif"] * motif + w["hash"] * hsh) / sum(
        w.values()
    )
    return {
        "color": round(color, 4),
        "lcs": round(lcs, 4),
        "edit": round(edit, 4),
        "motif": round(motif, 4),
        "hash": round(hsh, 4),
        "composite": round(composite, 4),
    }


def match_all(
    features: dict[str, EdgeFeatures],
    cfg: MatchConfig | None = None,
    counter: OpCounter | None = None,
) -> MatchResult:
    cfg = cfg or MatchConfig()
    t0 = time.perf_counter()
    ids = sorted(features)
    pairs = allowed_side_pairs(cfg.allow_rotation)

    # Signatures of forward and reversed edges, built once (hashing).
    fwd_sig = {(i, s): ngram_signature(features[i].strings[s], cfg.ngram) for i in ids for s in range(4)}
    rev_sig = {(i, s): ngram_signature(features[i].strings[s][::-1], cfg.ngram) for i in ids for s in range(4)}
    rev_strip = {(i, s): np.asarray(features[i].strips[s])[::-1] for i in ids for s in range(4)}

    # ---- Stage 1: cheap pre-filter -------------------------------------
    candidates: dict[tuple[str, int], list[tuple[float, str, int]]] = {}
    total_pairs = 0
    for i in ids:
        for j in ids:
            if i >= j:
                continue
            for a, b in pairs:
                total_pairs += 1
                tick(counter, "prefilter_checks")
                cheap = 0.5 * jaccard(fwd_sig[(i, a)], rev_sig[(j, b)]) + 0.5 * color_similarity(
                    features[i].strips[a], rev_strip[(j, b)], cfg.color_scale
                )
                candidates.setdefault((i, a), []).append((cheap, j, b))
                candidates.setdefault((j, b), []).append((cheap, i, a))
    # Top-k selection with a size-k heap: O(c log k) per side instead of sorting
    # all c candidates (O(c log c)). heapq.nlargest is documented to equal
    # sorted(..., reverse=True)[:k], ties included, so results are unchanged.
    keep: set[tuple[str, int, str, int]] = set()
    for (i, a), lst in candidates.items():
        for _, j, b in heapq.nlargest(cfg.top_k, lst, key=lambda t: t[0]):
            keep.add((i, a, j, b) if i < j else (j, b, i, a))

    # ---- Stage 2: full scoring on survivors ---------------------------------
    cache = MemoCache()
    matches: list[SideMatch] = []
    w = cfg.weights
    wsum = sum(w.values())
    for i, a, j, b in sorted(keep):
        s_a = features[i].strings[a]
        s_b_rev = features[j].strings[b][::-1]
        color = color_similarity(features[i].strips[a], rev_strip[(j, b)], cfg.color_scale)

        def string_scores(s_a=s_a, s_b_rev=s_b_rev, i=i, a=a, j=j, b=b):
            lcs = lcs_ratio(s_a, s_b_rev, counter)
            edit = edit_similarity(s_a, s_b_rev, counter)
            ml = longest_common_motif(s_a, s_b_rev, cfg.motif_method, cfg.min_motif, counter)["length"]
            motif = ml / max(1, min(len(s_a), len(s_b_rev)))
            return lcs, edit, motif, jaccard(fwd_sig[(i, a)], rev_sig[(j, b)])

        # Identical edge-string pairs (e.g. plain background) are scored once.
        lcs, edit, motif, hsh = cache.get_or_compute((s_a, s_b_rev), string_scores)
        composite = (
            w["color"] * color + w["lcs"] * lcs + w["edit"] * edit + w["motif"] * motif + w["hash"] * hsh
        ) / wsum
        matches.append(
            SideMatch(
                i,
                a,
                j,
                b,
                color=round(color, 4),
                lcs=round(lcs, 4),
                edit=round(edit, 4),
                motif=round(motif, 4),
                hash=round(hsh, 4),
                composite=round(composite, 4),
            )
        )

    elapsed = (time.perf_counter() - t0) * 1000
    stats = {
        "fragments": len(ids),
        "side_pairs_total": total_pairs,
        "side_pairs_scored": len(matches),
        "side_pairs_skipped": total_pairs - len(matches),
        "cache_hits": cache.hits,
        "elapsed_ms": round(elapsed, 2),
        "operations": dict(counter.counts) if counter else {},
    }
    return MatchResult(matches=matches, stats=stats)


def compat_table(matches: list[SideMatch]) -> dict[tuple[str, int, str, int], float]:
    """Symmetric lookup: compat[(i, a, j, b)] == compat[(j, b, i, a)]."""
    table: dict[tuple[str, int, str, int], float] = {}
    for m in matches:
        table[(m.a, m.side_a, m.b, m.side_b)] = m.composite
        table[(m.b, m.side_b, m.a, m.side_a)] = m.composite
    return table
