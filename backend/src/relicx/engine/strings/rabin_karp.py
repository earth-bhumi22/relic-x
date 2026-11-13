"""Rabin-Karp string matching with a polynomial rolling hash.

Time  : O(n + m) expected, O(n * m) worst case (every window collides)
Space : O(1) beyond the input

Same job as KMP (motif search). Implemented separately so the two can be
benchmarked against each other on identical inputs.
"""

from __future__ import annotations

from collections.abc import Iterator

from ..counters import OpCounter, tick

BASE = 257
MOD = 1_000_000_007


def poly_hash(s: str) -> int:
    h = 0
    for ch in s:
        h = (h * BASE + ord(ch)) % MOD
    return h


def rolling_hashes(s: str, m: int) -> Iterator[tuple[int, int]]:
    """Yield (start_index, hash) for every length-m window of ``s`` in O(n)."""
    n = len(s)
    if m == 0 or m > n:
        return
    high = pow(BASE, m - 1, MOD)
    h = poly_hash(s[:m])
    yield 0, h
    for i in range(1, n - m + 1):
        h = (h - ord(s[i - 1]) * high) % MOD
        h = (h * BASE + ord(s[i + m - 1])) % MOD
        yield i, h


def rabin_karp_search(text: str, pattern: str, counter: OpCounter | None = None) -> list[int]:
    """Return every start index where ``pattern`` occurs in ``text``."""
    n, m = len(text), len(pattern)
    if m == 0 or m > n:
        return []
    target = poly_hash(pattern)
    hits: list[int] = []
    for i, h in rolling_hashes(text, m):
        tick(counter, "hash_checks")
        if h == target:
            # Verify to rule out a hash collision (spurious hit).
            tick(counter, "char_comparisons", m)
            if text[i : i + m] == pattern:
                hits.append(i)
    return hits


def rabin_karp_contains(text: str, pattern: str, counter: OpCounter | None = None) -> int:
    hits = rabin_karp_search(text, pattern, counter)
    return hits[0] if hits else -1
