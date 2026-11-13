"""Knuth-Morris-Pratt string matching.

Time  : O(n + m)  (prefix function O(m) + scan O(n))
Space : O(m)      (the prefix / failure table)

Used by RELIC-X to find a motif (a run of colour symbols from one fragment
edge) inside the edge string of another fragment.
"""

from __future__ import annotations

from ..counters import OpCounter, tick


def prefix_function(pattern: str, counter: OpCounter | None = None) -> list[int]:
    """pi[i] = length of the longest proper prefix of pattern[:i+1] that is
    also a suffix of it. This is the KMP "failure table"."""
    m = len(pattern)
    pi = [0] * m
    k = 0
    for i in range(1, m):
        while k > 0 and pattern[i] != pattern[k]:
            tick(counter, "char_comparisons")
            k = pi[k - 1]
        tick(counter, "char_comparisons")
        if pattern[i] == pattern[k]:
            k += 1
        pi[i] = k
    return pi


def kmp_search(text: str, pattern: str, counter: OpCounter | None = None) -> list[int]:
    """Return every start index where ``pattern`` occurs in ``text``."""
    n, m = len(text), len(pattern)
    if m == 0 or m > n:
        return []
    pi = prefix_function(pattern, counter)
    hits: list[int] = []
    k = 0
    for i in range(n):
        while k > 0 and text[i] != pattern[k]:
            tick(counter, "char_comparisons")
            k = pi[k - 1]
        tick(counter, "char_comparisons")
        if text[i] == pattern[k]:
            k += 1
        if k == m:
            hits.append(i - m + 1)
            k = pi[k - 1]
    return hits


def kmp_contains(text: str, pattern: str, counter: OpCounter | None = None) -> int:
    """First occurrence index of ``pattern`` in ``text`` or -1."""
    hits = kmp_search(text, pattern, counter)
    return hits[0] if hits else -1
