"""T10 — KMP, Rabin-Karp and the longest-motif binary search.

Owner: B. Covers correctness against brute force, the exact amortised
comparison bounds of KMP, forced hash collisions in Rabin-Karp, and the
monotonicity property that makes binary search over motif length valid.
"""

import random

import pytest

from relicx.engine.counters import OpCounter
from relicx.engine.strings import kmp_contains, kmp_search, longest_common_motif, prefix_function, rabin_karp_search
from relicx.engine.strings import rabin_karp as rk


def brute_prefix(p: str) -> list[int]:
    out = []
    for i in range(len(p)):
        s = p[: i + 1]
        out.append(max((k for k in range(len(s)) if s[:k] == s[len(s) - k :]), default=0))
    return out


def brute_search(t: str, p: str) -> list[int]:
    return [i for i in range(len(t) - len(p) + 1) if t[i : i + len(p)] == p] if p else []


def brute_longest_common_substring(a: str, b: str) -> int:
    best = 0
    for i in range(len(a)):
        for j in range(i + 1, len(a) + 1):
            if j - i > best and a[i:j] in b:
                best = j - i
    return best


def fibonacci_word(n: int) -> str:
    a, b = "b", "a"
    while len(b) < n:
        a, b = b, b + a
    return b[:n]


ADVERSARIAL = [
    ("a" * 200, "a" * 10 + "b"),  # classic naive worst case: many partial matches
    ("ab" * 100, "abab" + "c"),
    (fibonacci_word(233), fibonacci_word(21)),  # highly self-overlapping
    ("a" * 200, "a" * 15),  # every position is a hit
]


# ---------------------------------------------------------------- prefix function
@pytest.mark.parametrize("seed", range(30))
def test_prefix_function_matches_brute_force(seed):
    rng = random.Random(seed)
    p = "".join(rng.choice("ab") for _ in range(rng.randint(1, 25)))
    assert prefix_function(p) == brute_prefix(p)


@pytest.mark.parametrize("p", ["aaaaaaab", "abababab", "abaababaab", fibonacci_word(55), "abcdefgh"])
def test_prefix_function_comparisons_at_most_2m_minus_3(p):
    c = OpCounter()
    prefix_function(p, c)
    assert c.get("char_comparisons") <= 2 * len(p) - 3


# ---------------------------------------------------------------- KMP search
@pytest.mark.parametrize("seed", range(40))
def test_kmp_matches_brute_force(seed):
    rng = random.Random(seed)
    t = "".join(rng.choice("ab") for _ in range(rng.randint(0, 80)))
    p = "".join(rng.choice("ab") for _ in range(rng.randint(1, 6)))
    assert kmp_search(t, p) == brute_search(t, p)
    assert kmp_contains(t, p) == (brute_search(t, p) or [-1])[0]


@pytest.mark.parametrize("text,pattern", ADVERSARIAL)
def test_kmp_search_comparisons_at_most_2n_minus_1(text, pattern):
    table, total = OpCounter(), OpCounter()
    prefix_function(pattern, table)
    assert kmp_search(text, pattern, total) == brute_search(text, pattern)
    scan = total.get("char_comparisons") - table.get("char_comparisons")
    assert scan <= 2 * len(text) - 1


def test_kmp_finds_overlapping_occurrences():
    assert kmp_search("aaaa", "aa") == [0, 1, 2]
    assert kmp_search("abababa", "aba") == [0, 2, 4]


def test_kmp_edge_cases():
    assert kmp_search("", "a") == []
    assert kmp_search("abc", "") == []
    assert kmp_search("ab", "abc") == []
    assert kmp_contains("xyz", "z") == 2


# ---------------------------------------------------------------- Rabin-Karp
@pytest.mark.parametrize("seed", range(40))
def test_rabin_karp_matches_brute_force(seed):
    rng = random.Random(1000 + seed)
    t = "".join(rng.choice("abc") for _ in range(rng.randint(0, 80)))
    p = "".join(rng.choice("abc") for _ in range(rng.randint(1, 6)))
    assert rabin_karp_search(t, p) == brute_search(t, p)


def test_rabin_karp_survives_forced_collisions(monkeypatch):
    """With a tiny modulus almost every window collides; verification keeps results exact."""
    monkeypatch.setattr(rk, "MOD", 7)
    rng = random.Random(3)
    t = "".join(rng.choice("abcd") for _ in range(300))
    p = "abca"
    c = OpCounter()
    assert rabin_karp_search(t, p, c) == brute_search(t, p)
    assert c.get("spurious_hits") > 0


def test_rabin_karp_worst_case_is_n_times_m(monkeypatch):
    """MOD = 1 makes every window collide: exactly (n - m + 1) * m character comparisons."""
    monkeypatch.setattr(rk, "MOD", 1)
    t, p = "ab" * 100, "abc"
    c = OpCounter()
    assert rabin_karp_search(t, p, c) == []
    assert c.get("char_comparisons") == (len(t) - len(p) + 1) * len(p)
    assert c.get("spurious_hits") == len(t) - len(p) + 1


def test_rabin_karp_has_no_spurious_hits_with_real_modulus():
    rng = random.Random(4)
    t = "".join(rng.choice("ABCDEFGH") for _ in range(2000))
    c = OpCounter()
    rabin_karp_search(t, "ABCDE", c)
    assert c.get("spurious_hits") == 0
    assert c.get("hash_checks") == len(t) - 5 + 1


def test_rolling_hash_equals_direct_hash():
    s = "relicx-edge-string"
    for i, h in rk.rolling_hashes(s, 5):
        assert h == rk.poly_hash(s[i : i + 5])


# ---------------------------------------------------------------- longest motif
@pytest.mark.parametrize("seed", range(30))
def test_motif_length_matches_brute_force(seed):
    rng = random.Random(2000 + seed)
    a = "".join(rng.choice("abc") for _ in range(rng.randint(3, 24)))
    b = "".join(rng.choice("abc") for _ in range(rng.randint(3, 24)))
    expected = brute_longest_common_substring(a, b)
    for method in ("kmp", "rabin_karp"):
        m = longest_common_motif(a, b, method=method, min_len=1)
        assert m["length"] == expected
        if expected:
            assert a[m["pos_a"] : m["pos_a"] + expected] == b[m["pos_b"] : m["pos_b"] + expected] == m["motif"]


@pytest.mark.parametrize("seed", range(20))
def test_shared_runs_are_monotone(seed):
    """If a run of length L is shared, every L' < L is shared too: the binary-search invariant."""
    rng = random.Random(3000 + seed)
    a = "".join(rng.choice("ab") for _ in range(20))
    b = "".join(rng.choice("ab") for _ in range(20))

    def shared(length):
        return any(a[i : i + length] in b for i in range(len(a) - length + 1))

    flags = [shared(length) for length in range(1, 21)]
    assert flags == sorted(flags, reverse=True)  # True...True False...False


def test_motif_respects_min_len():
    assert longest_common_motif("xxABxx", "yyAByy", min_len=3)["length"] == 0
    assert longest_common_motif("xxABxx", "yyAByy", min_len=2)["length"] == 2


def test_rabin_karp_motif_uses_fewer_operations_on_long_strings():
    rng = random.Random(5)
    a = "".join(rng.choice("ABCDEFGH") for _ in range(96))
    b = a[10:60] + "".join(rng.choice("ABCDEFGH") for _ in range(46))
    ck, cr = OpCounter(), OpCounter()
    assert (
        longest_common_motif(a, b, "kmp", 3, ck)["length"] == longest_common_motif(a, b, "rabin_karp", 3, cr)["length"]
    )
    assert cr.total < ck.total
