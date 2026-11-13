"""RELIC-X algorithm engine.

Pure Python + NumPy. This package must never import the web framework or the
database layer (enforced by ``tests/engine/test_engine_purity.py``), so every
algorithm can be unit-tested and benchmarked on its own.
"""

from .counters import OpCounter
from .features import SIDES, EdgeFeatures, extract_features
from .fragmenter import fragment_image
from .graph import FragmentGraph, bfs_components, build_graph, dfs_components
from .matcher import MatchConfig, MatchResult, SideMatch, compat_table, match_all
from .metrics import Truth, direct_accuracy, match_accuracy, neighbour_accuracy
from .pipeline import SolveParams, evaluate, run_solver, synthetic_experiment

__all__ = [
    "SIDES",
    "EdgeFeatures",
    "FragmentGraph",
    "MatchConfig",
    "MatchResult",
    "OpCounter",
    "SideMatch",
    "SolveParams",
    "Truth",
    "bfs_components",
    "build_graph",
    "compat_table",
    "dfs_components",
    "direct_accuracy",
    "evaluate",
    "extract_features",
    "fragment_image",
    "match_accuracy",
    "match_all",
    "neighbour_accuracy",
    "run_solver",
    "synthetic_experiment",
]
