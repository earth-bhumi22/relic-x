import pytest

from relicx.engine import (
    MatchConfig,
    SolveParams,
    Truth,
    bfs_components,
    build_graph,
    compat_table,
    dfs_components,
    direct_accuracy,
    evaluate,
    extract_features,
    fragment_image,
    match_all,
    neighbour_accuracy,
    run_solver,
    synthetic_experiment,
)
from relicx.engine.layout import Placement
from relicx.engine.matcher import SideMatch
from relicx.engine.solvers import ALGORITHMS, solve_backtracking


def _sm(a, sa, b, sb, w):
    return SideMatch(a, sa, b, sb, w, w, w, w, w, w)


def test_graph_threshold_and_components():
    matches = [_sm("A", 1, "B", 3, 0.9), _sm("B", 1, "C", 3, 0.8), _sm("D", 1, "E", 3, 0.7), _sm("A", 2, "D", 0, 0.1)]
    g = build_graph(list("ABCDE"), matches, threshold=0.5)
    assert len(g.edges) == 3
    bfs, _ = bfs_components(g)
    dfs, _ = dfs_components(g)
    norm = lambda cs: sorted(sorted(c) for c in cs)  # noqa: E731
    assert norm(bfs) == norm(dfs) == [["A", "B", "C"], ["D", "E"]]


def test_metrics_invariant_to_global_rotation():
    truth = {"a": Truth(0, 0, 0), "b": Truth(0, 1, 0), "c": Truth(1, 0, 0), "d": Truth(1, 1, 0)}
    exact = [Placement("a", 0, 0), Placement("b", 0, 1), Placement("c", 1, 0), Placement("d", 1, 1)]
    assert neighbour_accuracy(exact, truth) == direct_accuracy(exact, truth) == 1.0
    # whole picture turned 90° clockwise: a b / c d  ->  c a / d b, each piece rot=1
    turned = [Placement("c", 0, 0, 1), Placement("a", 0, 1, 1), Placement("d", 1, 0, 1), Placement("b", 1, 1, 1)]
    assert neighbour_accuracy(turned, truth) == direct_accuracy(turned, truth) == 1.0
    swapped = [Placement("b", 0, 0), Placement("a", 0, 1), Placement("c", 1, 0), Placement("d", 1, 1)]
    assert neighbour_accuracy(swapped, truth) < 1.0


@pytest.mark.parametrize("algorithm", ALGORITHMS)
@pytest.mark.parametrize("rotate", [False, True])
def test_every_solver_solves_a_clean_3x3(smooth_image, algorithm, rotate):
    out = synthetic_experiment(smooth_image, 3, 3, [algorithm], rotate=rotate, seed=2)
    run = out["runs"][algorithm]
    assert run["coverage"] == 1.0
    assert run["neighbour_accuracy"] == 1.0, run


def _prepared(image, rows=3, cols=3):
    fr = fragment_image(image, rows, cols, noise=3, erosion=0.3, seed=9)
    feats = {f"F{k}": extract_features(f.pixels) for k, f in enumerate(fr.fragments)}
    truth = {f"F{k}": Truth(f.true_row, f.true_col, f.scramble_rot) for k, f in enumerate(fr.fragments)}
    return feats, truth, match_all(feats, MatchConfig())


def test_backtracking_never_worse_than_greedy(smooth_image):
    feats, truth, match = _prepared(smooth_image)
    g = run_solver(list(feats), match, 3, 3, False, SolveParams("greedy"))
    b = run_solver(list(feats), match, 3, 3, False, SolveParams("backtracking"))
    assert b.total_score >= g.total_score - 1e-9
    assert evaluate(b, truth)["coverage"] == 1.0


def test_backtracking_node_limit_truncates(smooth_image):
    feats, _, match = _prepared(smooth_image, 4, 4)
    res = solve_backtracking(list(feats), compat_table(match.matches), 4, 4, node_limit=50)
    assert res.truncated and res.meta["nodes"] > 50


def test_trace_is_recorded(smooth_image):
    feats, _, match = _prepared(smooth_image)
    res = run_solver(list(feats), match, 3, 3, False, SolveParams("greedy"))
    assert res.trace[0]["action"] == "seed"
    assert sum(s["action"] == "place" for s in res.trace) == len(feats) - 1
