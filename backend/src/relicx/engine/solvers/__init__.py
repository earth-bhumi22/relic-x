"""Reconstruction strategies. All return a ``SolverResult``."""

from .backtracking import solve_backtracking
from .best_first import solve_best_first
from .common import SolverResult, TraceRecorder
from .dijkstra import dijkstra, solve_dijkstra
from .greedy import pick_seed, solve_greedy

ALGORITHMS = ("greedy", "best_first", "dijkstra", "backtracking")

__all__ = [
    "ALGORITHMS",
    "SolverResult",
    "TraceRecorder",
    "dijkstra",
    "pick_seed",
    "solve_backtracking",
    "solve_best_first",
    "solve_dijkstra",
    "solve_greedy",
]
