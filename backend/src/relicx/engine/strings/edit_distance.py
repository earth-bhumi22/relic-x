"""Levenshtein edit distance (dynamic programming).

Recurrence:
    D[i][0] = i,  D[0][j] = j
    D[i][j] = D[i-1][j-1]                         if a[i-1] == b[j-1]
    D[i][j] = 1 + min(D[i-1][j],     # delete
                      D[i][j-1],     # insert
                      D[i-1][j-1])   # substitute

Time  : O(m * n)
Space : O(min(m, n)) for the distance only, O(m * n) with the alignment.

Interpreted as "how much damage separates these two edges".
"""

from __future__ import annotations

from ..counters import OpCounter, tick


def edit_distance(a: str, b: str, counter: OpCounter | None = None) -> int:
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        ai = a[i - 1]
        for j in range(1, len(b) + 1):
            if ai == b[j - 1]:
                cur[j] = prev[j - 1]
            else:
                cur[j] = 1 + min(prev[j], cur[j - 1], prev[j - 1])
        tick(counter, "dp_cells", len(b))
        prev = cur
    return prev[-1]


def edit_similarity(a: str, b: str, counter: OpCounter | None = None) -> float:
    """1 - distance / longer length, in [0, 1]."""
    longest = max(len(a), len(b))
    return 1.0 - edit_distance(a, b, counter) / longest if longest else 1.0


def edit_alignment(a: str, b: str) -> dict:
    """Distance plus the operation script (match/sub/ins/del) for the UI."""
    m, n = len(a), len(b)
    d = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        d[i][0] = i
    for j in range(n + 1):
        d[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = 1 + min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1])
    ops: list[dict] = []
    i, j = m, n
    while i > 0 or j > 0:
        if i > 0 and j > 0 and a[i - 1] == b[j - 1] and d[i][j] == d[i - 1][j - 1]:
            ops.append({"op": "match", "a": a[i - 1], "b": b[j - 1]})
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + 1:
            ops.append({"op": "sub", "a": a[i - 1], "b": b[j - 1]})
            i -= 1
            j -= 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            ops.append({"op": "del", "a": a[i - 1], "b": None})
            i -= 1
        else:
            ops.append({"op": "ins", "a": None, "b": b[j - 1]})
            j -= 1
    ops.reverse()
    return {"distance": d[m][n], "ops": ops}
