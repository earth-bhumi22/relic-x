"""Pairwise matching, the fragment graph and the "Why matched?" explanation."""

from __future__ import annotations

import numpy as np
from sqlalchemy.orm import Session

from ..core.errors import InvalidInput, PreconditionFailed
from ..db.models import Artifact, Fragment
from ..engine import (
    SIDES,
    EdgeFeatures,
    MatchConfig,
    OpCounter,
    SideMatch,
    Truth,
    bfs_components,
    build_graph,
    dfs_components,
    extract_features,
    match_accuracy,
    match_all,
)
from ..engine.matcher import color_similarity
from ..engine.strings import edit_alignment, jaccard, lcs_alignment, longest_common_motif, ngram_signature
from ..repositories import ArtifactRepository, FragmentRepository, MatchRepository
from .storage import LocalStorage


def truth_of(frags: list[Fragment]) -> dict[str, Truth]:
    return {f.label: Truth(f.true_row, f.true_col, f.scramble_rot or 0) for f in frags if f.true_row is not None}


class MatchingService:
    def __init__(self, db: Session, storage: LocalStorage) -> None:
        self.db = db
        self.storage = storage
        self.artifacts = ArtifactRepository(db)
        self.fragments = FragmentRepository(db)
        self.matches = MatchRepository(db)

    # -- features ---------------------------------------------------------------
    def features_for(self, frags: list[Fragment], cfg: MatchConfig) -> dict[str, EdgeFeatures]:
        """Stored features if extracted with the same parameters, else re-extract."""
        want = {"strip_len": cfg.strip_len, "levels": cfg.levels, "depth": cfg.depth}
        out = {}
        for f in frags:
            if f.features and f.features.get("params") == want:
                out[f.label] = EdgeFeatures.from_dict(f.features)
            else:
                pixels = np.asarray(self.storage.load_rgb(f.image_path))
                out[f.label] = extract_features(pixels, **want)
        return out

    # -- compute ------------------------------------------------------------------
    def compute(self, artifact_id: str, cfg: MatchConfig) -> dict:
        art = self.artifacts.get(artifact_id)
        frags = self.fragments.list_for(artifact_id)
        if len(frags) < 2:
            raise PreconditionFailed("artifact needs at least two fragments")
        if cfg.motif_method not in {"kmp", "rabin_karp"}:
            raise InvalidInput("motif_method must be 'kmp' or 'rabin_karp'")
        if art.fragment_params is not None and art.fragment_params.get("rotate"):
            cfg.allow_rotation = True
        counter = OpCounter()
        result = match_all(self.features_for(frags, cfg), cfg, counter)
        id_of = {f.label: f.id for f in frags}
        rows = [
            {
                "artifact_id": art.id,
                "frag_a": id_of[m.a],
                "side_a": m.side_a,
                "frag_b": id_of[m.b],
                "side_b": m.side_b,
                "color": m.color,
                "lcs": m.lcs,
                "edit": m.edit,
                "motif": m.motif,
                "hash": m.hash,
                "composite": m.composite,
            }
            for m in result.matches
        ]
        self.matches.replace_all(art.id, rows)
        stats = dict(result.stats)
        truth = truth_of(frags)
        if truth:
            stats["match_accuracy"] = round(match_accuracy(result.matches, truth, cfg.allow_rotation), 4)
        art.match_config = cfg.to_dict()
        art.match_stats = stats
        return stats

    def side_matches(self, art: Artifact) -> tuple[list[str], list[SideMatch]]:
        if not art.match_config:
            raise PreconditionFailed("run matching first (POST /artifacts/{id}/match)")
        frags = self.fragments.list_for(art.id)
        label = {f.id: f.label for f in frags}
        out = [
            SideMatch(
                label[m.frag_a],
                m.side_a,
                label[m.frag_b],
                m.side_b,
                m.color,
                m.lcs,
                m.edit,
                m.motif,
                m.hash,
                m.composite,
            )
            for m in self.matches.list_for(art.id)
        ]
        return [f.label for f in frags], out

    def list_matches(self, artifact_id: str, min_score: float, limit: int, offset: int = 0) -> tuple[list[dict], int]:
        """Matches with composite >= min_score, best first; returns (page, total)."""
        art = self.artifacts.get(artifact_id)
        _, matches = self.side_matches(art)
        kept = [m.__dict__ for m in matches if m.composite >= min_score]
        return kept[offset : offset + limit], len(kept)

    # -- graph ------------------------------------------------------------------------
    def graph(self, artifact_id: str, threshold: float, top_k: int | None, traversal: str) -> dict:
        art = self.artifacts.get(artifact_id)
        labels, matches = self.side_matches(art)
        frags = {f.label: f for f in self.fragments.list_for(artifact_id)}
        full = build_graph(labels, matches)
        g = build_graph(labels, matches, threshold=threshold, top_k=top_k)
        counter = OpCounter()
        comps, order = (bfs_components if traversal == "bfs" else dfs_components)(g, counter)
        truth = truth_of(list(frags.values()))
        true_pairs = set()
        for f, t in truth.items():
            for g2, t2 in truth.items():
                if abs(t.row - t2.row) + abs(t.col - t2.col) == 1:
                    true_pairs.add((f, g2))
        return {
            "nodes": [
                {"id": lab, "fragment_id": frags[lab].id, "component": next(i for i, c in enumerate(comps) if lab in c)}
                for lab in labels
            ],
            "edges": [
                {
                    "source": e.u,
                    "target": e.v,
                    "weight": e.weight,
                    "side_source": SIDES[e.side_u],
                    "side_target": SIDES[e.side_v],
                    "side_source_index": e.side_u,
                    "side_target_index": e.side_v,
                    "true_neighbours": (e.u, e.v) in true_pairs if truth else None,
                }
                for e in sorted(g.edges, key=lambda e: -e.weight)
            ],
            "components": comps,
            "traversal": {"method": traversal, "order": order, "edge_visits": counter.get("edge_visits")},
            "stats": {
                "edges_before_pruning": len(full.edges),
                "edges_after_pruning": len(g.edges),
                "threshold": threshold,
                "top_k": top_k,
            },
        }

    # -- explain --------------------------------------------------------------------------
    def explain(self, artifact_id: str, a: str, side_a: int, b: str, side_b: int) -> dict:
        art = self.artifacts.get(artifact_id)
        if not (0 <= side_a <= 3 and 0 <= side_b <= 3):
            raise InvalidInput("sides must be 0..3 (N, E, S, W)")
        cfg = MatchConfig.from_dict(art.match_config)
        fa, fb = self.fragments.by_label(artifact_id, a), self.fragments.by_label(artifact_id, b)
        feats = self.features_for([fa, fb], cfg)
        s_a = feats[a].strings[side_a]
        s_b_rev = feats[b].strings[side_b][::-1]
        strip_a = np.asarray(feats[a].strips[side_a])
        strip_b_rev = np.asarray(feats[b].strips[side_b])[::-1]
        lcs = lcs_alignment(s_a, s_b_rev)
        edit = edit_alignment(s_a, s_b_rev)
        motif_kmp, motif_rk = OpCounter(), OpCounter()
        motif = longest_common_motif(s_a, s_b_rev, "kmp", cfg.min_motif, motif_kmp)
        longest_common_motif(s_a, s_b_rev, "rabin_karp", cfg.min_motif, motif_rk)
        sig_a, sig_b = ngram_signature(s_a, cfg.ngram), ngram_signature(s_b_rev, cfg.ngram)
        L = max(len(s_a), len(s_b_rev))
        scores = {
            "color": color_similarity(strip_a, strip_b_rev, cfg.color_scale),
            "lcs": lcs["length"] / L,
            "edit": 1 - edit["distance"] / L,
            "motif": motif["length"] / max(1, min(len(s_a), len(s_b_rev))),
            "hash": jaccard(sig_a, sig_b),
        }
        wsum = sum(cfg.weights.values())
        contributions = {k: round(cfg.weights[k] * v / wsum, 4) for k, v in scores.items()}
        truth = truth_of([fa, fb])
        return {
            "a": a,
            "side_a": SIDES[side_a],
            "b": b,
            "side_b": SIDES[side_b],
            "edge_a": s_a,
            "edge_b_reversed": s_b_rev,
            "strip_a": np.round(strip_a).astype(int).tolist(),
            "strip_b_reversed": np.round(strip_b_rev).astype(int).tolist(),
            "scores": {k: round(v, 4) for k, v in scores.items()},
            "weights": cfg.weights,
            "contributions": contributions,
            "composite": round(sum(contributions.values()), 4),
            "lcs": {"length": lcs["length"], "subsequence": lcs["subsequence"], "pairs": lcs["pairs"]},
            "edit": edit,
            "motif": {**motif, "kmp_ops": motif_kmp.total, "rabin_karp_ops": motif_rk.total},
            "hash": {"ngram": cfg.ngram, "shared": len(sig_a & sig_b), "union": len(sig_a | sig_b)},
            "ground_truth_neighbours": (
                abs(truth[a].row - truth[b].row) + abs(truth[a].col - truth[b].col) == 1 if len(truth) == 2 else None
            ),
        }
