# RELIC-X — Algorithms

Each algorithm gets the same structure: **idea → recurrence / pseudocode → correctness →
time and space complexity → measured behaviour → where it shows in the app**. Each owner
fills their own slice's sections (TEAM_ROLES §1, DSA quota items 3 and 4).

| Slice | Owner | Issue |
|---|---|---|
| Strings & Matching | **B — Bhumi** | T40 (writes up T10 – T13) |
| Graph & Search | **A — Arvind** | T43 (writes up T14 – T17) |

---

## 0. Problem formulation (shared)

Given fragments F = {f₁ … fₙ}, each a square tile with 4 sides (N, E, S, W read clockwise), find
a placement `(row, col, rot)` for each fragment on an R × C grid that maximises

    Σ over adjacent pairs (i, j) of compat(i, side facing j, j, side facing i)

where `compat ∈ [0, 1]` comes from the matcher. Without rotation the search space is n!
arrangements; with rotation it is n! · 4ⁿ.

---

# Part I — Strings & Matching (owner: B)

## 1. Edge features (`engine/features.py`)
<!-- T13: clockwise reading convention and why it makes "compare with reversed" rotation-proof; resampling; quantisation into 64 symbols. -->

## 2. KMP (`engine/strings/kmp.py`)
<!-- T10: prefix function, amortised O(n + m) proof, measured char comparisons vs n. -->

## 3. Rabin-Karp (`engine/strings/rabin_karp.py`)
<!-- T10: rolling hash, spurious hits, expected O(n + m), worst O(nm); KMP vs RK chart. -->

## 4. Longest shared motif (`engine/strings/motif.py`)
<!-- T10: monotonicity → binary search over length; total complexity with each decision procedure. -->

## 5. LCS (`engine/strings/lcs.py`)
<!-- T11: recurrence, optimal substructure, two-row O(min(m,n)) space, traceback. -->

## 6. Edit distance (`engine/strings/edit_distance.py`)
<!-- T11: recurrence, operation script, interpretation as "damage cost". -->

## 7. Hashing pre-filter and memo cache (`engine/strings/hashing.py`, `matcher.py`)
<!-- T12: n-gram signatures, Jaccard, top-k survivors; P·L + P'·L² instead of P·L²; cache hit rate. -->

## 8. Composite matcher (`engine/matcher.py`)
<!-- T13: weights, weight-sweep experiment, accuracy vs noise/erosion (from T31). -->

---

# Part II — Graph & Search (owner: A)

## 9. Fragment graph, pruning, BFS / DFS (`engine/graph.py`)
<!-- T14: G=(V,E), threshold + mutual top-k pruning, O(V+E) traversals, BFS vs DFS visit order. -->

## 10. Greedy (`engine/solvers/greedy.py`)
<!-- T15: greedy-choice rule, O(n³) analysis, concrete counterexample where greedy fails. -->

## 11. Best-first / Prim (`engine/solvers/best_first.py`)
<!-- T15: max-heap with lazy deletion, O(E log E), relation to maximum spanning tree. -->

## 12. Dijkstra (`engine/solvers/dijkstra.py`)
<!-- T16: cost = 1 − w ≥ 0, correctness, why a path-sum objective underperforms (validation/results.md). -->

## 13. Backtracking + branch & bound (`engine/solvers/backtracking.py`)
<!-- T17: state space, both upper bounds and why they are valid, greedy starting solution, node count vs n, truncation, DP extension. -->

## 14. Accuracy metrics (`engine/metrics.py`)
<!-- T14/T17: neighbour vs direct accuracy, invariance to global rotation and shift. -->

---

## 15. Summary table (both)

| Algorithm | Time | Space | Owner |
|---|---|---|---|
| KMP | O(n + m) | O(m) | B |
| Rabin-Karp | O(n + m) expected, O(nm) worst | O(1) | B |
| LCS / Edit distance | O(mn) | O(min(m, n)) | B |
| n-gram pre-filter | O(L) per edge, O(P·L) total | O(L) | B |
| BFS / DFS | O(V + E) | O(V) | A |
| Greedy | O(n³) | O(n) | A |
| Best-first (Prim) | O(E log E) | O(E) | A |
| Dijkstra | O((V + E) log V) | O(V) | A |
| Backtracking | O((n·R)ⁿ) worst | O(n) | A |
