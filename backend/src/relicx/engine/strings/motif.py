"""Longest shared motif between two edge strings.

A "motif" is a contiguous run of symbols. We want the longest run of edge A
that also appears somewhere in edge B.

Key property (monotonicity): if a run of length L is shared, then a run of
length L-1 is shared too. That lets us binary-search on L, and at each L
ask the decision question "does any length-L window of A occur in B?" with a
real string matcher.

  method="kmp"         : each window of A searched in B with KMP
                         O(log m * m * (n + L))
  method="rabin_karp"  : hash every length-L window of B into a set, then
                         probe with A's windows                O(log m * (m + n)) expected

Both answer the same question, so the dashboard can compare them directly.
"""

from __future__ import annotations

from ..counters import OpCounter, tick
from .kmp import kmp_contains
from .rabin_karp import rolling_hashes


def _shared_window_kmp(a: str, b: str, length: int, counter: OpCounter | None):
    for i in range(len(a) - length + 1):
        pos = kmp_contains(b, a[i : i + length], counter)
        if pos >= 0:
            return i, pos
    return None


def _shared_window_rk(a: str, b: str, length: int, counter: OpCounter | None):
    seen: dict[int, list[int]] = {}
    for j, h in rolling_hashes(b, length):
        tick(counter, "hash_checks")
        seen.setdefault(h, []).append(j)
    for i, h in rolling_hashes(a, length):
        tick(counter, "hash_checks")
        for j in seen.get(h, ()):
            tick(counter, "char_comparisons", length)
            if a[i : i + length] == b[j : j + length]:  # collision check
                return i, j
    return None


def longest_common_motif(
    a: str,
    b: str,
    method: str = "kmp",
    min_len: int = 3,
    counter: OpCounter | None = None,
) -> dict:
    """Return {"length", "pos_a", "pos_b", "motif"} of the longest shared run.

    Runs shorter than ``min_len`` are treated as noise (length 0).
    """
    finder = _shared_window_kmp if method == "kmp" else _shared_window_rk
    lo, hi = min_len, min(len(a), len(b))
    best = {"length": 0, "pos_a": -1, "pos_b": -1, "motif": ""}
    while lo <= hi:
        mid = (lo + hi) // 2
        hit = finder(a, b, mid, counter)
        if hit is not None:
            best = {"length": mid, "pos_a": hit[0], "pos_b": hit[1], "motif": a[hit[0] : hit[0] + mid]}
            lo = mid + 1
        else:
            hi = mid - 1
    return best
