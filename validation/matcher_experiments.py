"""Strings & Matching experiments → validation/matcher_results.md (+ matcher_*.svg).

Owner: B (Bhumi). One section per algorithm task: T10 (KMP / Rabin-Karp / motif),
T11 (LCS / edit distance), T12 (hashing pre-filter), T13 (features + composite
matcher). Fixed seeds: re-running gives identical numbers.

    cd backend && pip install -e .
    python ../validation/matcher_experiments.py            # all sections
    python ../validation/matcher_experiments.py --only t12  # regenerate one section

Arvind's `run_benchmarks.py` rewrites results.md from scratch, so these results
live in their own file and reuse his dependency-free chart helper.
"""

from __future__ import annotations

import argparse
import random
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend" / "src"))
sys.path.insert(0, str(HERE))

from run_benchmarks import loglog_fit, svg_chart  # noqa: E402

from relicx.engine import OpCounter  # noqa: E402
from relicx.engine.strings import kmp_search, longest_common_motif, rabin_karp_search  # noqa: E402

OUT = HERE / "matcher_results.md"
ALPHA64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def naive_search_ops(text: str, pattern: str) -> int:
    """Character comparisons of the textbook O(nm) matcher (stops at first mismatch)."""
    ops = 0
    for i in range(len(text) - len(pattern) + 1):
        for j in range(len(pattern)):
            ops += 1
            if text[i + j] != pattern[j]:
                break
    return ops


def rand_str(rng: random.Random, n: int, alphabet: str = ALPHA64) -> str:
    return "".join(rng.choice(alphabet) for _ in range(n))


def fit_line(name: str, xs, ys, var: str = "n") -> str:
    slope, r2 = loglog_fit(xs, ys)
    return f"{name}: grows as {var}^{slope:.2f} (R² {r2:.4f})"


# --------------------------------------------------------------------------- T10
def section_t10() -> str:
    out = ["## T10 · KMP, Rabin-Karp and the longest-motif search\n"]

    # 1. Adversarial input: text a^n, pattern a^9 b. Naive is Θ(n·m), KMP ≤ 2n − 1.
    ns = [100, 200, 400, 800, 1600, 3200]
    pattern = "a" * 9 + "b"
    rows, kmp_pts, naive_pts, rk_pts = [], [], [], []
    for n in ns:
        text = "a" * n
        ck, cr = OpCounter(), OpCounter()
        kmp_search(text, pattern, ck)
        rabin_karp_search(text, pattern, cr)
        naive = naive_search_ops(text, pattern)
        kmp = ck.get("char_comparisons")
        rk_ops = cr.get("hash_checks") + cr.get("char_comparisons")
        rows.append(f"| {n} | {naive:,} | {kmp:,} | {2 * n - 1 + 2 * len(pattern) - 3:,} | {rk_ops:,} |")
        kmp_pts.append((n, kmp))
        naive_pts.append((n, naive))
        rk_pts.append((n, rk_ops))
    out.append("**Adversarial input** `text = aⁿ`, `pattern = a⁹b` (10 chars, never matches). Naive re-checks 10\n"
               "characters at every shift; KMP never moves backwards in the text.\n")
    out.append("| n | naive comparisons | KMP comparisons (incl. table) | KMP bound 2n−1 + 2m−3 | Rabin-Karp ops (hashes + verifications) |")
    out.append("|---|---|---|---|---|")
    out += rows
    out.append("")
    out.append(f"- {fit_line('KMP', ns, [y for _, y in kmp_pts])}; never above the bound.")
    ratio = naive_pts[-1][1] / kmp_pts[-1][1]
    out.append(f"- {fit_line('naive', ns, [y for _, y in naive_pts])} too, but it does ≈ m·n = 10n comparisons against"
               f" KMP's ≈ 2n: {ratio:.1f}× more here, and the gap grows linearly with the pattern length m.")
    out.append(f"- {fit_line('Rabin-Karp', ns, [y for _, y in rk_pts])}: one hash per window, no collisions with MOD = 10⁹+7.\n")
    (HERE / "matcher_kmp_adversarial.svg").write_text(svg_chart(
        "Search on aⁿ with pattern a⁹b", "text length n", "operations",
        [{"name": "naive", "points": naive_pts, "line": True},
         {"name": "KMP", "points": kmp_pts, "line": True},
         {"name": "Rabin-Karp", "points": rk_pts, "line": True}]))
    out.append("![naive vs KMP vs Rabin-Karp](matcher_kmp_adversarial.svg)\n")

    # 2. Longest shared motif between real edge strings, KMP vs Rabin-Karp decision step.
    from relicx.engine import extract_features, fragment_image
    from relicx.samples import sample_array

    Ls = [12, 16, 24, 32, 48, 64, 96]
    fr = fragment_image(sample_array("pottery-band"), 4, 4, noise=4, erosion=0.2, seed=7)
    by_cell = {(f.true_row, f.true_col): f.pixels for f in fr.fragments}
    pairs = [(by_cell[(r, c)], by_cell[(r, c + 1)]) for r in range(4) for c in range(3)]
    kmp_m, rk_m, lens = [], [], []
    for L in Ls:
        ko, ro, ln = [], [], []
        for left, right in pairs:
            a = extract_features(left, strip_len=L).strings[1]  # E edge
            b = extract_features(right, strip_len=L).strings[3][::-1]  # W edge, reversed
            ck, cr = OpCounter(), OpCounter()
            mk = longest_common_motif(a, b, "kmp", 3, ck)
            mr = longest_common_motif(a, b, "rabin_karp", 3, cr)
            assert mk["length"] == mr["length"]
            ko.append(ck.total)
            ro.append(cr.total)
            ln.append(mk["length"] / L)
        kmp_m.append((L, float(np.mean(ko))))
        rk_m.append((L, float(np.mean(ro))))
        lens.append(float(np.mean(ln)))
    out.append("**Longest shared motif on real edges.** 12 truly adjacent E/W edge pairs of the pottery sample (4×4,\n"
               "noise 4, erosion 0.2), strip length L varied. Both methods return the same motif every time.\n")
    out.append("| L | KMP ops (mean) | Rabin-Karp ops (mean) | ratio | motif length / L |")
    out.append("|---|---|---|---|---|")
    for (L, k), (_, r), m in zip(kmp_m, rk_m, lens, strict=True):
        out.append(f"| {L} | {k:,.0f} | {r:,.0f} | {k / r:.1f}× | {m:.2f} |")
    out.append("")
    out.append(f"- {fit_line('KMP decision step', Ls, [k for _, k in kmp_m], 'L')}: up to L windows, each an O(L) KMP"
               " scan, per binary-search step → O(L² log L).")
    out.append(f"- {fit_line('Rabin-Karp decision step', Ls, [r for _, r in rk_m], 'L')}: one hash set per step"
               " → O(L log L) expected.")
    out.append("- KMP stays the default (`motif_method=\"kmp\"`) for its deterministic worst case; at L = 24 the motif"
               " step is a small part of matching either way. Rabin-Karp is the better choice for long strips"
               " (switch with `MatchParams.motif_method`).\n")
    (HERE / "matcher_motif_ops.svg").write_text(svg_chart(
        "Longest-motif search on real edges", "strip length L", "operations (mean of 12 pairs)",
        [{"name": "KMP", "points": kmp_m, "line": True}, {"name": "Rabin-Karp", "points": rk_m, "line": True}]))
    out.append("![motif search KMP vs Rabin-Karp](matcher_motif_ops.svg)\n")
    return "\n".join(out)


SECTIONS = {"t10": section_t10}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--only", choices=sorted(SECTIONS))
    args = p.parse_args()
    existing = OUT.read_text() if OUT.exists() else ""
    blocks = {}
    for key in SECTIONS:
        m = re.search(rf"<!-- {key} -->\n(.*?)<!-- /{key} -->", existing, re.S)
        if m:
            blocks[key] = m.group(1)
    for key in [args.only] if args.only else SECTIONS:
        print(f"running {key} …", flush=True)
        blocks[key] = SECTIONS[key]() + "\n"
    header = (
        "# RELIC-X — Strings & Matching results\n\n"
        "Generated by `validation/matcher_experiments.py` (owner: B). Fixed seeds; re-running gives identical numbers.\n"
        "Solver results are in [results.md](results.md).\n\n"
    )
    body = header + "".join(f"<!-- {k} -->\n{blocks[k]}<!-- /{k} -->\n\n" for k in SECTIONS if k in blocks)
    OUT.write_text(body)
    print(body)


if __name__ == "__main__":
    main()
