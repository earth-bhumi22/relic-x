"""Hashing utilities: n-gram signatures and a memo cache.

* ``ngram_signature`` turns an edge string into the set of rolling hashes of
  its length-n windows: O(len) to build, O(1) average lookup.
* ``jaccard`` compares two signatures: |A ∩ B| / |A ∪ B|.
  It is cheap, so the matcher uses it as a *pre-filter* to decide which edge
  pairs are worth the O(L^2) LCS / edit-distance work.
* ``MemoCache`` is a hash map keyed by the pair of edge strings, so identical
  edges (e.g. plain background) are never scored twice.
"""

from __future__ import annotations

from collections.abc import Callable, Hashable
from typing import Any

from .rabin_karp import rolling_hashes


def ngram_signature(s: str, n: int = 3) -> frozenset[int]:
    return frozenset(h for _, h in rolling_hashes(s, n))


def jaccard(a: frozenset[int], b: frozenset[int]) -> float:
    if not a and not b:
        return 1.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


class MemoCache:
    """Tiny hash-map memoiser with hit/miss counts (reported in match stats)."""

    def __init__(self) -> None:
        self._store: dict[Hashable, Any] = {}
        self.hits = 0
        self.misses = 0

    def get_or_compute(self, key: Hashable, fn: Callable[[], Any]) -> Any:
        if key in self._store:
            self.hits += 1
            return self._store[key]
        self.misses += 1
        value = fn()
        self._store[key] = value
        return value
