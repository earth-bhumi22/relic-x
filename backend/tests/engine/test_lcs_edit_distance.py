"""T11 — LCS and Levenshtein edit distance (dynamic programming).

Owner: B. Recurrence-level properties checked on random strings: symmetry,
bounds, metric axioms, the LCS/indel identity, exact DP-cell counts, and that
the alignments returned to the "Why matched?" panel are internally consistent.
"""

import itertools
import random

import pytest

from relicx.engine.counters import OpCounter
from relicx.engine.strings import edit_alignment, edit_distance, edit_similarity, lcs_alignment, lcs_length, lcs_ratio


def rand(rng, lo=0, hi=14, alphabet="abc"):
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(lo, hi)))


def brute_lcs(a: str, b: str) -> int:
    """Longest common subsequence by trying subsequences of the shorter string (tiny inputs only)."""
    s, t = (a, b) if len(a) <= len(b) else (b, a)
    for k in range(len(s), 0, -1):
        for idx in itertools.combinations(range(len(s)), k):
            sub = "".join(s[i] for i in idx)
            it = iter(t)
            if all(ch in it for ch in sub):
                return k
    return 0


# ------------------------------------------------------------------ LCS
@pytest.mark.parametrize("seed", range(40))
def test_lcs_matches_brute_force(seed):
    rng = random.Random(seed)
    a, b = rand(rng, hi=8), rand(rng, hi=8)
    assert lcs_length(a, b) == brute_lcs(a, b)


@pytest.mark.parametrize("seed", range(40))
def test_lcs_properties(seed):
    rng = random.Random(100 + seed)
    a, b = rand(rng), rand(rng)
    n = lcs_length(a, b)
    assert n == lcs_length(b, a)  # symmetric
    assert 0 <= n <= min(len(a), len(b))
    assert lcs_length(a, a) == len(a)
    assert lcs_length(a + "x", b + "x") == n + 1  # common last character extends the LCS


@pytest.mark.parametrize("seed", range(30))
def test_lcs_alignment_is_a_valid_common_subsequence(seed):
    rng = random.Random(200 + seed)
    a, b = rand(rng), rand(rng)
    aln = lcs_alignment(a, b)
    pairs = aln["pairs"]
    assert aln["length"] == len(pairs) == lcs_length(a, b)
    assert all(a[i] == b[j] for i, j in pairs)
    assert all(i1 < i2 and j1 < j2 for (i1, j1), (i2, j2) in itertools.pairwise(pairs))  # strictly increasing
    assert aln["subsequence"] == "".join(a[i] for i, _ in pairs)


def test_lcs_ratio_bounds():
    assert lcs_ratio("", "") == 1.0
    assert lcs_ratio("abc", "abc") == 1.0
    assert lcs_ratio("abc", "xyz") == 0.0
    assert lcs_ratio("abcd", "ab") == 0.5  # normalised by the LONGER string


# ------------------------------------------------------------------ edit distance
def brute_edit(a: str, b: str) -> int:
    """Plain recursion, no memo (tiny inputs only)."""
    if not a:
        return len(b)
    if not b:
        return len(a)
    if a[0] == b[0]:
        return brute_edit(a[1:], b[1:])
    return 1 + min(brute_edit(a[1:], b), brute_edit(a, b[1:]), brute_edit(a[1:], b[1:]))


@pytest.mark.parametrize("seed", range(40))
def test_edit_distance_matches_recursion(seed):
    rng = random.Random(300 + seed)
    a, b = rand(rng, hi=6), rand(rng, hi=6)
    assert edit_distance(a, b) == brute_edit(a, b)


@pytest.mark.parametrize("seed", range(40))
def test_edit_distance_is_a_metric(seed):
    rng = random.Random(400 + seed)
    a, b, c = rand(rng), rand(rng), rand(rng)
    d = edit_distance
    assert d(a, a) == 0
    assert (d(a, b) == 0) == (a == b)
    assert d(a, b) == d(b, a)
    assert d(a, c) <= d(a, b) + d(b, c)  # triangle inequality


@pytest.mark.parametrize("seed", range(40))
def test_edit_distance_bounds_and_lcs_identity(seed):
    rng = random.Random(500 + seed)
    a, b = rand(rng), rand(rng)
    d = edit_distance(a, b)
    assert abs(len(a) - len(b)) <= d <= max(len(a), len(b))
    # Without substitutions the distance would be m + n - 2·LCS (delete all, insert all, keep the LCS).
    # Substitutions can only help, never hurt:
    assert d <= len(a) + len(b) - 2 * lcs_length(a, b)


def apply_ops(a: str, ops: list[dict]) -> str:
    out, i = [], 0
    for op in ops:
        if op["op"] == "match":
            assert a[i] == op["a"] == op["b"]
            out.append(a[i])
            i += 1
        elif op["op"] == "sub":
            assert a[i] == op["a"] != op["b"]
            out.append(op["b"])
            i += 1
        elif op["op"] == "del":
            assert a[i] == op["a"]
            i += 1
        else:  # ins
            out.append(op["b"])
    assert i == len(a)
    return "".join(out)


@pytest.mark.parametrize("seed", range(30))
def test_edit_script_transforms_a_into_b_with_minimal_cost(seed):
    rng = random.Random(600 + seed)
    a, b = rand(rng), rand(rng)
    aln = edit_alignment(a, b)
    assert apply_ops(a, aln["ops"]) == b
    assert sum(op["op"] != "match" for op in aln["ops"]) == aln["distance"] == edit_distance(a, b)


def test_edit_similarity_bounds():
    assert edit_similarity("", "") == 1.0
    assert edit_similarity("abc", "abc") == 1.0
    assert edit_similarity("abc", "xyz") == 0.0
    assert edit_similarity("abcd", "abce") == 0.75


# ------------------------------------------------------------------ cost model
@pytest.mark.parametrize("m,n", [(1, 1), (5, 9), (24, 24), (30, 7)])
def test_dp_fills_exactly_m_times_n_cells(m, n):
    a, b = "a" * m, "b" * n
    c1, c2 = OpCounter(), OpCounter()
    lcs_length(a, b, c1)
    edit_distance(a, b, c2)
    assert c1.get("dp_cells") == c2.get("dp_cells") == m * n


def test_empty_inputs_cost_nothing():
    c = OpCounter()
    assert lcs_length("", "abc", c) == 0 and edit_distance("", "abc", c) == 3
    assert c.get("dp_cells") == 0
