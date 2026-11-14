"""Knuth-Morris-Pratt string matching.

Time  : O(n + m)  (prefix function O(m) + scan O(n))
Space : O(m)      (the prefix / failure table)

Used by RELIC-X to find a motif (a run of colour symbols from one fragment
edge) inside the edge string of another fragment.

Every character comparison is counted exactly once in ``char_comparisons``,
so the amortised bounds can be checked by tests (T10):

    prefix_function(pattern) : at most 2m - 3 comparisons  (m >= 2)
    kmp_search(text, pattern): at most 2n - 1 comparisons  (plus the table)

Proof sketch (search): each comparison either ADVANCES (match: i or k moves
forward) or FALLS BACK (mismatch with k > 0: k strictly decreases). A match
increases k by 1, and k never goes below 0, so the total number of fall-backs
is at most the total number of matches, which is at most n. Each i ends with
exactly one "final" comparison, so comparisons <= n + n - 1 = 2n - 1.
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
        while True:
            tick(counter, "char_comparisons")
            if pattern[i] == pattern[k]:
                k += 1
                break
            if k == 0:
                break
            k = pi[k - 1]  # fall back to the next-longest border
        pi[i] = k
    return pi


def kmp_search(text: str, pattern: str, counter: OpCounter | None = None) -> list[int]:
    """Return every start index where ``pattern`` occurs in ``text``."""
    n, m = len(text), len(pattern)
    if m == 0 or m > n:
        return []
    pi = prefix_function(pattern, counter)
    hits: list[int] = []
    k = 0  # number of pattern characters currently matched
    for i in range(n):
        while True:
            tick(counter, "char_comparisons")
            if text[i] == pattern[k]:
                k += 1
                break
            if k == 0:
                break
            k = pi[k - 1]
        if k == m:
            hits.append(i - m + 1)
            k = pi[k - 1]  # keep going: occurrences may overlap
    return hits


def kmp_contains(text: str, pattern: str, counter: OpCounter | None = None) -> int:
    """First occurrence index of ``pattern`` in ``text`` or -1 (stops at the first hit)."""
    n, m = len(text), len(pattern)
    if m == 0 or m > n:
        return -1
    pi = prefix_function(pattern, counter)
    k = 0
    for i in range(n):
        while True:
            tick(counter, "char_comparisons")
            if text[i] == pattern[k]:
                k += 1
                break
            if k == 0:
                break
            k = pi[k - 1]
        if k == m:
            return i - m + 1
    return -1
