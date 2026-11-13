"""Longest Common Subsequence (dynamic programming).

Recurrence:
    L[i][j] = 0                              if i == 0 or j == 0
    L[i][j] = L[i-1][j-1] + 1                if a[i-1] == b[j-1]
    L[i][j] = max(L[i-1][j], L[i][j-1])      otherwise

Time  : O(m * n)
Space : O(min(m, n)) for the length only (two rolling rows),
        O(m * n) when the alignment itself is reconstructed.

LCS tolerates gaps, so it still scores two edges as similar when a chipped
fragment has lost a few symbols.
"""

from __future__ import annotations

from ..counters import OpCounter, tick


def lcs_length(a: str, b: str, counter: OpCounter | None = None) -> int:
    if len(a) < len(b):
        a, b = b, a  # keep the DP row as short as possible
    prev = [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        ai = a[i - 1]
        for j in range(1, len(b) + 1):
            if ai == b[j - 1]:
                cur[j] = prev[j - 1] + 1
            else:
                cur[j] = prev[j] if prev[j] >= cur[j - 1] else cur[j - 1]
        tick(counter, "dp_cells", len(b))
        prev = cur
    return prev[-1]


def lcs_ratio(a: str, b: str, counter: OpCounter | None = None) -> float:
    """LCS length normalised to [0, 1] by the longer string."""
    longest = max(len(a), len(b))
    return lcs_length(a, b, counter) / longest if longest else 1.0


def lcs_alignment(a: str, b: str) -> dict:
    """Full-table LCS with traceback, used by the "Why matched?" panel.

    Returns the subsequence plus the matched index pairs so the UI can
    highlight them on both edges.
    """
    m, n = len(a), len(b)
    table = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                table[i][j] = table[i - 1][j - 1] + 1
            else:
                table[i][j] = max(table[i - 1][j], table[i][j - 1])
    i, j = m, n
    pairs: list[tuple[int, int]] = []
    while i > 0 and j > 0:
        if a[i - 1] == b[j - 1]:
            pairs.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif table[i - 1][j] >= table[i][j - 1]:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return {
        "length": table[m][n],
        "subsequence": "".join(a[p] for p, _ in pairs),
        "pairs": pairs,
    }
