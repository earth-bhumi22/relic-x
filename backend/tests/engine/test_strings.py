import random

import pytest

from relicx.engine.counters import OpCounter
from relicx.engine.strings import (
    edit_alignment,
    edit_distance,
    jaccard,
    kmp_search,
    lcs_alignment,
    lcs_length,
    longest_common_motif,
    ngram_signature,
    prefix_function,
    rabin_karp_search,
)


def naive_search(text, pattern):
    return [i for i in range(len(text) - len(pattern) + 1) if text[i : i + len(pattern)] == pattern] if pattern else []


def test_prefix_function_textbook():
    assert prefix_function("ababaca") == [0, 0, 1, 2, 3, 0, 1]
    assert prefix_function("aaaa") == [0, 1, 2, 3]


@pytest.mark.parametrize("seed", range(25))
def test_kmp_and_rabin_karp_agree_with_naive(seed):
    rng = random.Random(seed)
    text = "".join(rng.choice("ABC") for _ in range(rng.randint(0, 60)))
    pattern = "".join(rng.choice("ABC") for _ in range(rng.randint(1, 4)))
    expected = naive_search(text, pattern)
    assert kmp_search(text, pattern) == expected
    assert rabin_karp_search(text, pattern) == expected


def test_kmp_is_linear():
    c = OpCounter()
    kmp_search("A" * 1000, "A" * 10, c)
    # O(n + m): comparisons stay within a small constant of n + m
    assert c.get("char_comparisons") <= 3 * (1000 + 10)


def test_lcs_textbook():
    assert lcs_length("ABCBDAB", "BDCABA") == 4
    aln = lcs_alignment("ABCBDAB", "BDCABA")
    assert aln["length"] == 4 and len(aln["subsequence"]) == 4
    for i, j in aln["pairs"]:
        assert "ABCBDAB"[i] == "BDCABA"[j]
    assert lcs_length("", "ABC") == 0


def test_edit_distance_textbook():
    assert edit_distance("kitten", "sitting") == 3
    assert edit_distance("", "abc") == 3
    aln = edit_alignment("kitten", "sitting")
    assert aln["distance"] == 3
    assert sum(op["op"] != "match" for op in aln["ops"]) == 3


@pytest.mark.parametrize("seed", range(10))
def test_two_row_dp_matches_full_table(seed):
    rng = random.Random(seed)
    a = "".join(rng.choice("ABCD") for _ in range(rng.randint(0, 20)))
    b = "".join(rng.choice("ABCD") for _ in range(rng.randint(0, 20)))
    assert lcs_length(a, b) == lcs_alignment(a, b)["length"]
    assert edit_distance(a, b) == edit_alignment(a, b)["distance"]


def test_motif_methods_agree():
    a, b = "XXABCDEYY", "QQABCDEZZ"
    for method in ("kmp", "rabin_karp"):
        m = longest_common_motif(a, b, method=method, min_len=3)
        assert m["length"] == 5 and m["motif"] == "ABCDE"
    assert longest_common_motif("AAAA", "BBBB")["length"] == 0


def test_jaccard():
    s = ngram_signature("ABCDEF", 3)
    assert jaccard(s, s) == 1.0
    assert jaccard(s, ngram_signature("UVWXYZ", 3)) == 0.0
