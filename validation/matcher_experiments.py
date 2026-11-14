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


# --------------------------------------------------------------------------- T11
def edge_pairs(sample: str, size: int, noise: float, erosion: float, seed: int, strip_len: int = 24):
    """True E/W and S/N neighbour pairs, plus every non-neighbour opposite-side pair."""
    from relicx.engine import extract_features, fragment_image
    from relicx.samples import sample_array

    fr = fragment_image(sample_array(sample), size, size, noise=noise, erosion=erosion, seed=seed)
    feats = [(f.true_row, f.true_col, extract_features(f.pixels, strip_len=strip_len)) for f in fr.fragments]
    true_pairs, false_pairs = [], []
    for ra, ca, fa in feats:
        for rb, cb, fb in feats:
            if (ra, ca) == (rb, cb):
                continue
            for side_a, side_b, dr, dc in ((1, 3, 0, 1), (2, 0, 1, 0)):  # E-W, S-N
                pair = (fa.strings[side_a], fb.strings[side_b][::-1], fa.strips[side_a], fb.strips[side_b][::-1])
                (true_pairs if (rb - ra, cb - ca) == (dr, dc) else false_pairs).append(pair)
    return true_pairs, false_pairs


def separation(true_scores, false_scores) -> float:
    """Probability that a random true pair scores higher than a random false pair (= ROC AUC)."""
    t, f = np.asarray(true_scores), np.asarray(false_scores)
    return float(((t[:, None] > f[None, :]).mean() + 0.5 * (t[:, None] == f[None, :]).mean()))


def section_t11() -> str:
    from relicx.engine.strings import edit_distance, edit_similarity, lcs_length, lcs_ratio

    out = ["## T11 · LCS and edit distance (dynamic programming)\n"]
    rng = random.Random(11)
    Ls = [8, 16, 24, 32, 48, 64, 96, 128]
    cells, ms_lcs, ms_edit = [], [], []
    for L in Ls:
        a, b = rand_str(rng, L), rand_str(rng, L)
        c = OpCounter()
        lcs_length(a, b, c)
        cells.append(c.get("dp_cells"))
        for fn, acc in ((lcs_length, ms_lcs), (edit_distance, ms_edit)):
            best = min(_timed(fn, a, b) for _ in range(5))
            acc.append(best * 1000)
    out.append("**Cost vs strip length L** (random strings, both length L; best of 5 runs).\n")
    out.append("| L | DP cells | LCS ms | edit ms |")
    out.append("|---|---|---|---|")
    for L, c, t1, t2 in zip(Ls, cells, ms_lcs, ms_edit, strict=True):
        out.append(f"| {L} | {c:,} | {t1:.3f} | {t2:.3f} |")
    out.append("")
    out.append(f"- DP cells are exactly L² every time (the counter ticks one per cell); {fit_line('LCS time', Ls, ms_lcs, 'L')},"
               f" {fit_line('edit time', Ls, ms_edit, 'L')}.")
    out.append("- Memory is two rows of L + 1 integers, O(L), for the scores; only the \"Why matched?\" alignment"
               " builds the full (L + 1)² table, for one pair at a time.\n")
    (HERE / "matcher_dp_cost.svg").write_text(svg_chart(
        "LCS / edit distance time vs strip length", "strip length L", "time (ms)",
        [{"name": "LCS", "points": list(zip(Ls, ms_lcs, strict=True)), "line": True},
         {"name": "edit distance", "points": list(zip(Ls, ms_edit, strict=True)), "line": True}]))
    out.append("![DP time vs L](matcher_dp_cost.svg)\n")

    erosions = [0.0, 0.2, 0.4, 0.6]
    rows, auc_lcs, auc_edit, auc_motif = [], [], [], []
    for e in erosions:
        tl, fl, te, fe, tm, fm = [], [], [], [], [], []
        for sample in ("mosaic-tile", "pottery-band", "manuscript"):
            tp, fp = edge_pairs(sample, 4, noise=4.0, erosion=e, seed=7)
            for pairs, lcs_acc, ed_acc, mo_acc in ((tp, tl, te, tm), (fp, fl, fe, fm)):
                for sa, sb, _, _ in pairs:
                    lcs_acc.append(lcs_ratio(sa, sb))
                    ed_acc.append(edit_similarity(sa, sb))
                    mo_acc.append(longest_common_motif(sa, sb, "kmp", 3)["length"] / len(sa))
        a1, a2, a3 = separation(tl, fl), separation(te, fe), separation(tm, fm)
        auc_lcs.append((e, a1))
        auc_edit.append((e, a2))
        auc_motif.append((e, a3))
        rows.append(f"| {e:.1f} | {np.mean(tl):.2f} / {np.mean(fl):.2f} | {np.mean(te):.2f} / {np.mean(fe):.2f} |"
                    f" {a1:.3f} | {a2:.3f} | {a3:.3f} |")
    out.append("**Do the scores separate true neighbours from wrong pairs?** All three samples, 4×4, noise σ = 4,\n"
               "erosion varied. Every truly adjacent E–W / S–N edge pair vs every other opposite-side pair\n"
               "(3 samples × 24 = 72 true and 3 × 456 = 1 368 false pairs per erosion level). *Separation* = probability that a random true pair scores\n"
               "higher than a random false pair (ROC AUC: 0.5 = useless, 1.0 = perfect).\n")
    out.append("| erosion | LCS ratio true / false (mean) | edit sim. true / false (mean) | LCS separation | edit separation | motif separation |")
    out.append("|---|---|---|---|---|---|")
    out += rows
    out.append("")
    out.append("- LCS and edit similarity both separate true from false pairs far better than chance, and degrade"
               " gracefully as erosion chips more of each edge: gaps cost LCS a little, a substitution costs edit"
               " distance 1, neither collapses.")
    out.append("- The contiguous motif is the most fragile signal: a single chipped segment breaks a run, which is"
               " why it is combined with the gap-tolerant DP scores instead of used alone (T13).\n")
    (HERE / "matcher_dp_separation.svg").write_text(svg_chart(
        "True-vs-false separation (ROC AUC) vs erosion", "erosion probability per side", "separation (AUC)",
        [{"name": "LCS ratio", "points": auc_lcs, "line": True},
         {"name": "edit similarity", "points": auc_edit, "line": True},
         {"name": "longest motif", "points": auc_motif, "line": True}]))
    out.append("![separation vs erosion](matcher_dp_separation.svg)\n")
    return "\n".join(out)


def _timed(fn, a, b) -> float:
    import time

    t0 = time.perf_counter()
    fn(a, b)
    return time.perf_counter() - t0


# --------------------------------------------------------------------------- T12
def sample_features(sample: str, size: int, rotate: bool, noise: float = 4.0, erosion: float = 0.2, seed: int = 7):
    from relicx.engine import Truth, extract_features, fragment_image
    from relicx.samples import sample_array

    fr = fragment_image(sample_array(sample), size, size, rotate=rotate, noise=noise, erosion=erosion, seed=seed)
    feats = {f"F{k:02d}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
    truth = {f"F{k:02d}": Truth(f.true_row, f.true_col, f.scramble_rot) for k, f in enumerate(fr.fragments)}
    return feats, truth


def true_pair_recall(matches, truth) -> float:
    kept = {(m.a, m.b) for m in matches} | {(m.b, m.a) for m in matches}
    by_cell = {(t.row, t.col): f for f, t in truth.items()}
    pairs = [(f, by_cell[(t.row + dr, t.col + dc)]) for f, t in truth.items()
             for dr, dc in ((0, 1), (1, 0)) if (t.row + dr, t.col + dc) in by_cell]
    return sum(p in kept for p in pairs) / len(pairs)


def section_t12() -> str:
    import time

    from relicx.engine import MatchConfig, match_accuracy, match_all

    out = ["## T12 · Hashing pre-filter (n-gram signatures + colour) and memo cache\n"]
    out.append("Stage 1 scores **every** allowed side pair cheaply (n-gram Jaccard + colour continuity, O(L)); each side\n"
               "keeps its `top_k` best partners; stage 2 runs LCS, edit distance and the motif search (O(L²)) only on the\n"
               "union of those lists. Mean over the three samples, noise σ = 4, erosion 0.2. *Recall* = share of truly\n"
               "adjacent fragment pairs that survive the filter; *match acc.* = share of true neighbours ranked first.\n")
    for size, rotate in ((5, False), (4, True)):
        label = f"{size}×{size}{' with rotation (16 side combinations per pair)' if rotate else ''}"
        out.append(f"**{label}**\n")
        out.append("| top_k | pairs scored | DP cells | recall | match acc. | matching ms |")
        out.append("|---|---|---|---|---|---|")
        data = {}
        for k in (1, 2, 3, 4, 6, 8, 12, 10_000):
            sc, cells, rec, acc, ms, tot = [], [], [], [], [], []
            for sample in ("mosaic-tile", "pottery-band", "manuscript"):
                feats, truth = sample_features(sample, size, rotate)
                c = OpCounter()
                t0 = time.perf_counter()
                res = match_all(feats, MatchConfig(top_k=k, allow_rotation=rotate), c)
                ms.append((time.perf_counter() - t0) * 1000)
                sc.append(res.stats["side_pairs_scored"])
                tot.append(res.stats["side_pairs_total"])
                cells.append(c.get("dp_cells"))
                rec.append(true_pair_recall(res.matches, truth))
                acc.append(match_accuracy(res.matches, truth, rotate))
            data[k] = (np.mean(sc), np.mean(tot), np.mean(cells), np.mean(rec), np.mean(acc), np.mean(ms))
            kk = "all (no filter)" if k == 10_000 else str(k)
            out.append(f"| {kk} | {np.mean(sc):,.0f} / {np.mean(tot):,.0f} ({np.mean(sc) / np.mean(tot):.0%}) |"
                       f" {np.mean(cells):,.0f} | {np.mean(rec):.0%} | {np.mean(acc):.0%} | {np.mean(ms):.0f} |")
        out.append("")
        nofilter, default = data[10_000], data[6]
        out.append(f"- Default `top_k = 6` scores {default[0] / nofilter[0]:.0%} of the pairs, does"
                   f" {default[2] / nofilter[2]:.0%} of the DP work and runs {nofilter[5] / default[5]:.1f}× faster than no"
                   f" filter, with recall {default[3]:.0%} and match accuracy {default[4]:.0%}"
                   f" (no filter: {nofilter[4]:.0%}).\n")
        if rotate:
            pts = [(k, data[k][2]) for k in (1, 2, 3, 4, 6, 8, 12)]
            rec_pts = [(k, data[k][3] * 100) for k in (1, 2, 3, 4, 6, 8, 12)]
            (HERE / "matcher_prefilter.svg").write_text(svg_chart(
                f"Pre-filter on {size}×{size} with rotation", "top_k", "true-pair recall (%)",
                [{"name": "recall %", "points": rec_pts, "line": True},
                 {"name": "match accuracy %", "points": [(k, data[k][4] * 100) for k in (1, 2, 3, 4, 6, 8, 12)],
                  "line": True}]))
            (HERE / "matcher_prefilter_cost.svg").write_text(svg_chart(
                f"DP work vs top_k ({size}×{size}, rotation)", "top_k", "DP cells",
                [{"name": "with filter", "points": pts, "line": True},
                 {"name": "no filter", "points": [(1, data[10_000][2]), (12, data[10_000][2])], "line": True}]))
    out.append("![recall vs top_k](matcher_prefilter.svg)\n")
    out.append("![DP work vs top_k](matcher_prefilter_cost.svg)\n")

    # Cache: identical edge strings (plain regions) are scored once.
    from relicx.engine import extract_features, fragment_image

    rows = []
    for name, img in (("flat colour (worst case for duplicates)", np.full((480, 480, 3), (150, 110, 70), np.uint8)),):
        fr = fragment_image(img, 4, 4, seed=1)
        feats = {f"F{k}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
        r = match_all(feats, MatchConfig(top_k=10_000)).stats
        rows.append(f"| {name} | {r['side_pairs_scored']} | {r['cache_hits']} | {r['cache_hits'] / r['side_pairs_scored']:.0%} |")
    for sample in ("mosaic-tile", "pottery-band", "manuscript"):
        feats, _ = sample_features(sample, 5, False, noise=0.0, erosion=0.0)
        r = match_all(feats, MatchConfig(top_k=10_000)).stats
        rows.append(f"| {sample} 5×5, clean | {r['side_pairs_scored']} | {r['cache_hits']} | {r['cache_hits'] / r['side_pairs_scored']:.0%} |")
    out.append("**Memo cache.** String scores are keyed by the (edge, reversed edge) pair, so identical pairs are computed\n"
               "once. No filter, so every pair is a candidate.\n")
    out.append("| artifact | pairs scored | cache hits | hit rate |")
    out.append("|---|---|---|---|")
    out += rows
    out.append("")
    out.append("- The cache fires exactly where edges repeat: every pair of a flat artifact, about one pair in eight on the"
               " pottery sample (its plain clay bands give identical edge strings), never on the busy mosaic and"
               " manuscript. It costs one dict lookup per pair, so plain regions cannot blow up matching time.\n")
    return "\n".join(out)


# --------------------------------------------------------------------------- T13
COMPONENTS = ("color", "lcs", "edit", "motif", "hash")


class Dataset:
    """Component scores of every kept side pair, indexed for fast re-weighting."""

    def __init__(self, sample, size, rotate, noise, erosion, seed, **feat_kw):
        from relicx.engine import MatchConfig, Truth, extract_features, fragment_image, match_all
        from relicx.samples import sample_array

        fr = fragment_image(sample_array(sample), size, size, rotate=rotate, noise=noise, erosion=erosion, seed=seed)
        self.feats = {f"F{k:02d}": extract_features(f.pixels, **feat_kw) for k, f in enumerate(fr.fragments)}
        truth = {f"F{k:02d}": Truth(f.true_row, f.true_col, f.scramble_rot) for k, f in enumerate(fr.fragments)}
        cfg = MatchConfig(allow_rotation=rotate)
        for key, val in feat_kw.items():
            setattr(cfg, key, val)
        self.matches = match_all(self.feats, cfg).matches
        self.V = np.array([[getattr(m, c) for c in COMPONENTS] for m in self.matches])
        # For every side that has a true right/down neighbour: candidate rows and which rows are the truth.
        cand: dict = {}
        for idx, m in enumerate(self.matches):
            cand.setdefault((m.a, m.side_a), []).append((idx, m.b))
            cand.setdefault((m.b, m.side_b), []).append((idx, m.a))
        by_cell = {(t.row, t.col): f for f, t in truth.items()}
        self.queries = []
        for f, t in truth.items():
            for d, (dr, dc) in ((1, (0, 1)), (2, (1, 0))):
                g = by_cell.get((t.row + dr, t.col + dc))
                if g is None:
                    continue
                side = (d + t.scramble_rot) % 4 if rotate else d
                rows = cand.get((f, side), [])
                idx = np.array([r for r, _ in rows], dtype=int)
                hit = np.array([p == g for _, p in rows], dtype=bool)
                self.queries.append((idx, hit))

    def accuracy(self, w) -> float:
        scores = self.V @ np.asarray(w, float)
        ok = 0
        for idx, hit in self.queries:
            if len(idx) and hit[int(np.argmax(scores[idx]))]:
                ok += 1
        return ok / len(self.queries)


def datasets(seed: int, noise: float = 4.0, erosion: float = 0.3, **kw):
    out = []
    for sample in ("mosaic-tile", "pottery-band", "manuscript"):
        for size, rotate in ((4, False), (5, False), (4, True)):
            out.append(Dataset(sample, size, rotate, noise, erosion, seed, **kw))
    return out


def mean_acc(ds, w) -> float:
    return float(np.mean([d.accuracy(w) for d in ds]))


def section_t13() -> str:
    import itertools
    import time

    from relicx.engine.matcher import DEFAULT_WEIGHTS

    out = ["## T13 · Edge features and the composite matcher\n"]
    default = [DEFAULT_WEIGHTS[c] for c in COMPONENTS]
    tune = datasets(seed=7)
    held = datasets(seed=21) + datasets(seed=42)
    out.append("**Setup.** 9 artifacts per seed (3 samples × {4×4, 5×5, 4×4 rotated}), noise σ = 4, erosion 0.3. Component\n"
               "scores are computed once per artifact (the pre-filter does not depend on the weights), then re-weighted.\n"
               "*Match accuracy* = share of true neighbours ranked first by their side. Weights are **tuned on seed 7** and\n"
               "**checked on seeds 21 and 42** (18 unseen artifacts) to avoid overfitting.\n")

    # Ablation: each component alone, and the default without each component.
    out.append("**Ablation** (held-out seeds 21 + 42).\n")
    out.append("| scores used | match accuracy |")
    out.append("|---|---|")
    out.append(f"| default weights {dict(zip(COMPONENTS, default, strict=True))} | **{mean_acc(held, default):.1%}** |")
    alone = {}
    for i, c in enumerate(COMPONENTS):
        w = [0.0] * 5
        w[i] = 1.0
        alone[c] = mean_acc(held, w)
        out.append(f"| {c} only | {alone[c]:.1%} |")
    for i, c in enumerate(COMPONENTS):
        w = list(default)
        w[i] = 0.0
        out.append(f"| default without {c} | {mean_acc(held, w):.1%} |")
    out.append("")

    # Grid search on the tuning seed, validated on held-out seeds.
    t0 = time.perf_counter()
    grid = [w for w in itertools.product(range(5), repeat=5) if any(w)]
    scored = sorted(((mean_acc(tune, w), w) for w in grid), reverse=True)
    best_tune, best_w = scored[0]
    top10 = scored[:10]
    held_best = mean_acc(held, best_w)
    held_top = [mean_acc(held, w) for _, w in top10]
    out.append(f"**Grid search.** Every weight in {{0, 1, 2, 3, 4}} (relative; {len(grid):,} combinations), ranked on seed 7"
               f" ({time.perf_counter() - t0:.0f} s).\n")
    out.append("| weights (color, lcs, edit, motif, hash) | tuning acc. (seed 7) | held-out acc. (21 + 42) |")
    out.append("|---|---|---|")
    out.append(f"| default (0.4, 0.2, 0.15, 0.15, 0.1) | {mean_acc(tune, default):.1%} | {mean_acc(held, default):.1%} |")
    for (acc, w), h in zip(top10[:5], held_top[:5], strict=True):
        out.append(f"| best-ranked {w} | {acc:.1%} | {h:.1%} |")
    out.append("")
    n_held = sum(len(d.queries) for d in held)
    gain_held = held_best - mean_acc(held, default)
    out.append(f"- Held-out set: {n_held} ranking decisions, so one decision is {1 / n_held:.1%}. The best tuned weights"
               f" gain {gain_held:+.1%} ({round(gain_held * n_held)} decisions); the top-10 grid points average"
               f" {np.mean(held_top):.1%} vs {mean_acc(held, default):.1%} for the default. All within 1 point: a plateau,"
               " so **the defaults are kept**. Moving them would fit noise.")
    out.append(f"- **Colour carries most of the signal** (alone {alone['color']:.1%}; removing it costs"
               f" {mean_acc(held, default) - mean_acc(held, [0.0] + default[1:]):.1%}). The string scores add"
               f" {mean_acc(held, default) - alone['color']:+.1%} on top of colour: each is weaker alone, but they fail on"
               " different pairs than colour does.")
    out.append(f"- **The motif does not help ranking on these artifacts** (alone {alone['motif']:.1%}; the best weights set it"
               " to 0, and removing it changes accuracy by less than 1 point). It stays in the score at a small weight because"
               " it is the most *explainable* evidence in the \"Why matched?\" panel (\"these 10 symbols continue across the"
               " break\"); its weight can be set to 0 per request via `MatchParams.weights`.\n")
    _T13_RESULT.update(best_w=best_w, gain_held=gain_held, default_held=mean_acc(held, default), n_held=n_held)

    # Robustness of the default weights.
    out.append("**Robustness of the default weights** (3 samples × 3 layouts, seed 21).\n")
    noises, erosions = (0.0, 4.0, 8.0, 12.0, 20.0), (0.0, 0.2, 0.4, 0.6)
    out.append("| noise σ \\ erosion | " + " | ".join(f"{e:.1f}" for e in erosions) + " |")
    out.append("|---|" + "---|" * len(erosions))
    curves = {e: [] for e in erosions}
    for nz in noises:
        cells = []
        for e in erosions:
            acc = mean_acc(datasets(seed=21, noise=nz, erosion=e), default)
            curves[e].append((nz, acc * 100))
            cells.append(f"{acc:.0%}")
        out.append(f"| {nz:g} | " + " | ".join(cells) + " |")
    out.append("")
    out.append("- Erosion hurts more than pixel noise: σ = 20 costs 1–8 points, 60 % erosion costs 16–23, because a chipped"
               " segment replaces a whole run of symbols while noise only flips a few bins. Small non-monotone steps"
               " (e.g. σ 0 → 4 at erosion 0.6) come from the 9-artifact sample size.\n")
    (HERE / "matcher_robustness.svg").write_text(svg_chart(
        "Match accuracy vs noise (default weights)", "pixel noise σ", "match accuracy (%)",
        [{"name": f"erosion {e:.1f}", "points": curves[e], "line": True} for e in erosions]))
    out.append("![robustness](matcher_robustness.svg)\n")

    # Feature resolution: quantisation levels and strip length.
    out.append("**Feature resolution** (seed 21, noise σ = 4, erosion 0.3; time = feature extraction + matching).\n")
    out.append("| levels | strip_len | match accuracy | ms per artifact |")
    out.append("|---|---|---|---|")
    for levels in (3, 4):
        for strip_len in (16, 24, 32):
            t0 = time.perf_counter()
            ds = datasets(seed=21, levels=levels, strip_len=strip_len)
            ms = (time.perf_counter() - t0) * 1000 / len(ds)
            mark = " (default)" if (levels, strip_len) == (4, 24) else ""
            out.append(f"| {levels} | {strip_len}{mark} | {mean_acc(ds, default):.1%} | {ms:.0f} |")
    out.append("")
    out.append("- All six settings are within about 2 points; cost grows with L² as expected. `levels = 4, strip_len = 24`"
               " stays the default: middle cost, and 64 symbols keep the strings readable in the UI.\n")
    return "\n".join(out)


_T13_RESULT: dict = {}

SECTIONS = {"t10": section_t10, "t11": section_t11, "t12": section_t12, "t13": section_t13}


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
        "Generated by `validation/matcher_experiments.py` (owner: B). Fixed seeds: counts and accuracies are identical on\n"
        "every run; wall-clock times (ms, speed-ups) vary by a few percent.\n"
        "Solver results are in [results.md](results.md).\n\n"
    )
    body = header + "".join(f"<!-- {k} -->\n{blocks[k]}<!-- /{k} -->\n\n" for k in SECTIONS if k in blocks)
    OUT.write_text(body)
    print(body)


if __name__ == "__main__":
    main()
