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
**Model.** G = (V, E): V are fragments; an undirected edge {u, v} exists when some side of u matched some side
of v well enough. Its weight is the best composite score over all side pairings of that pair, and the winning
side pair is kept (CONTRACT side numbers 0=N 1=E 2=S 3=W). `FragmentGraph.edges` lists each undirected edge once
as (u < v), sorted, so E is never double counted.

**Build.** `build_graph(nodes, matches, threshold, top_k)`:
1. Scan the M side matches once. Drop self-matches and any with composite `< threshold` (equal is kept). Keep the
   best match per unordered pair; ties go to the smaller side numbers so input order never matters. O(M) time.
2. If `top_k` is set, every node ranks its incident edges by (weight desc, neighbour id) and votes for its top k.
   An edge survives only if **both** endpoints voted for it ("best buddies"), so each edge is counted once, however
   many sides matched. Sorting costs Σ deg(v) log deg(v) ≤ 2E log E. `top_k < 1` raises `ValueError` (the old
   `if top_k:` silently treated 0 as "no pruning").
Total: O(M) without top-k, O(M + E log E) with it; space O(V + E) for the adjacency maps.

**Why mutual top-k shrinks the graph.** Each node casts at most k votes, so there are at most kV votes, and an
edge needs two: **E ≤ k·V/2**. Plain top-k ("either endpoint voted") only guarantees E ≤ kV and keeps a hub's
spurious edges because a *different* node chose it. Measured on the 5×5 samples (`validation/results.md`):
for k = 3 the bound is 37 edges and the graphs have 24–30, down from 231–236 unpruned.

**BFS / DFS** (`bfs_components`, `dfs_components`). Both start from the sorted node ids, visit neighbours
strongest-first (weight desc, id asc) and return (components, visit order). Every node is marked once and every
adjacency entry is scanned once, i.e. 2E `edge_visits`; sorting each neighbour list adds Σ deg log deg, so the
honest bound is **O(V + E + Σ deg log deg) = O(V + E log E) time**, which is O(V + E) when degrees are bounded
(as after top-k, where deg ≤ k). Extra space: BFS queue O(V); DFS stack O(E) (below).
- **Same components, different order.** A component is the set reachable from its start node; both traversals
  explore exactly that set, so the partition is identical (tested against a union-find oracle). They differ only in
  *when* a node is reached: BFS by hop distance (layers, so it gives fewest-hops paths), DFS by following one strong
  chain as deep as possible. Prefer BFS when distance/levels matter or the graph is deep; DFS when you want to commit
  to the strongest chain first (as backtracking does) and the memory use is acceptable.
- **DFS is iterative.** A path of 5,000 fragments would overflow Python's recursion limit. The stack version marks a
  node *when popped* and pushes neighbours weakest-first so the strongest pops first; this reproduces recursive DFS
  order exactly (tested), unlike the "mark on push" variant. The price: a node can sit on the stack once per incident
  edge, so the peak is O(E), not O(V). Measured: K64 peaks at 1,954 entries (97% of E) while the BFS queue peaks at 63.

**Measured** (seeded, `validation/results.md`): `edge_visits` = 2E exactly (slope 2.000, R² 1.0000 against E);
time against V + E fits a line with R² 0.996 (BFS) and 0.997 (DFS), ≈ 0.35–0.38 s per 10⁶ (V + E) on this machine.
Against V + E alone the operation count has R² 0.983, not 1, because its true coefficient is 2E, i.e. it depends on
the E/V ratio of each graph.

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
