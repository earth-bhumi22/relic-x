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
**Rule.** Place the seed (the fragment whose four sides have the largest sum of best match weights; with all-zero
scores the smallest id) at (0, 0). Then, n − 1 times, look at every frontier cell c, every unplaced fragment f and
every allowed rotation r, score it as s(f, c, r) = Σ compat over the already-placed neighbours of c, and commit the
maximum (ties: more placed neighbours, then first in the order cell, id, rotation). Placements are never undone. The
greedy step reads the full `compat` table, **not** the pruned graph, so threshold / top-k do not affect it.

**Greedy-choice property: what holds and what does not.** Each step is locally optimal by construction: the committed
triple has the highest score among all candidates *for the current layout*. For this to give a global optimum we would
need (a) the greedy-choice property, i.e. some optimal layout contains the committed placement, and (b) optimal
substructure, i.e. what remains is the same problem on the rest. Neither holds: a placement fixes a fragment's cell
*and* rotation, which constrains every later neighbour, and the objective (sum over all adjacent pairs of the final
layout) rewards two medium joins more than one strong join, whereas greedy compares them one at a time. An exchange
argument fails because swapping the strongest join into an optimal layout moves its other neighbours.

**Counterexample (2×2, no rotation, fragments A–D).** Only five compat entries are non-zero (b is right of a means
side E of a matches side W of b; b is below a means side S of a matches side N of b):

| pair | relation | weight |
|---|---|---|
| C, B | B below C | 0.85 |
| D, C | C below D | 0.80 |
| D, A | A right of D | 0.60 |
| B, A | A right of B | 0.15 |
| D, A | A below D | 0.05 |

Seed: C (best sides 0.85 + 0.80 = 1.65, the largest sum). Step 1 commits the strongest join, B below C (0.85). Step 2: A
right of B (0.15) is the best remaining score. Step 3: D must go top right, above A (0.05); nothing else is left.
Greedy layout `C D / B A`, total 0.85 + 0.15 + 0.05 = **1.05**. The optimum is `D A / C B` (D over C 0.80, A right of D
0.60) = **1.40**, which never uses the 0.85 join: one strong join beats two medium ones locally, but the two medium ones
add up to more. Best-first falls into the same trap (it also takes 0.85 first, 1.05); backtracking finds 1.40. The same
instance is `COUNTEREXAMPLE` in `tests/engine/test_greedy_best_first.py` and a row in `validation/results.md`.
Exhaustive search over random 2×2 / 2×3 tables (results.md) shows greedy reaches the optimum in 48% / 25% of cases and
best-first in 33% / 10%.

**Time.** Let t fragments be placed. The frontier has F_t ≤ 4t cells, there are n − t unplaced fragments, R rotations
(1 or 4) and each `placement_score` does at most 4 lookups, so the step costs ≤ 4·R·F_t·(n − t) ≤ 16·R·t·(n − t) lookups
and the total is at most 16·R·Σ t(n − t) = 16·R·(n³ − n)/6 = **O(R·n³)**. Best case (a 1×n strip, F_t ≤ 2) is O(R·n²).
Computing the frontier costs O(t) per fit check and O(t²) per step (`Layout.bbox` is recomputed), which is O(n³) in
total and does not change the bound. **Space** O(n) for the layout and the unplaced list (plus the capped trace).
*In practice* the frontier of a compact blob is about its perimeter, F_t ≈ √t, giving about n^2.5·R. Measured on the
damaged 3×3…8×8 runs (`validation/results.md`): `score_lookups` grows as n^2.62 (R² 0.9998), wall time as about n^2.3;
profiling the 8×8 case shows `placement_score` and the lookups it makes take most of the time, the frontier little.
The cubic bound is a worst case that the grid shape prevents.

**Space of the result, determinism.** Everything is deterministic: candidates are iterated in sorted order and ties
use a strict `>`. A fragment that fits nowhere (grid too small) is reported in `meta["unplaced"]` and a `stop` trace
step is written.


## 11. Best-first / Prim (`engine/solvers/best_first.py`)
**Algorithm.** Prim's algorithm on the fragment graph with a max-heap of joins `(−weight, u, v)`, u placed, v not yet:
pop the strongest; if v is already placed skip it (lazy deletion); otherwise take the direction
d = (side_u + rot_u) mod 4 that u's joining side faces, put v in the neighbouring cell and rotate it by
rot_v = (d + 2 − side_v) mod 4 so its joining side faces back (the convention of `layout.py`: side s faces
(s + rot) mod 4). If rotation is disabled and rot_v ≠ 0, or the cell is occupied or outside the grid, record a
`conflict` and drop the join; else place v and push its edges to unplaced fragments. Fragments no join attached go to
their best free slot (`fallback`). Heap tuples are `(−weight, id_u, id_v)`, so ties are broken by ids and the order is
deterministic; ids are strings, so no two entries ever compare anything but tuples of comparable fields.

**Time and space.** An undirected edge {a, b} is pushed only by the endpoint committed first (the other sees its
partner already placed), so **pushes ≤ E** (the loose bound 2E counts both directions) and pops ≤ pushes. A heap
operation costs O(log E), so heap work is **O(E log E)**; each pop also tests the target cell with `Layout.fits`, which
rebuilds the bounding box in O(t), giving O(E·n) in the worst case, plus O(U·F·R) for the U unattached fragments, whose
fallback scans the frontier. Space O(E) for the heap and O(V) for the layout. Lazy deletion is preferred to
decrease-key because a binary heap cannot find an entry to update: we simply push every join once and discard stale
ones on pop (each costs one O(log E) pop), which is simpler and keeps O(log E) per operation. Measured (damaged
runs, `validation/results.md`): pushes equal E up to the few fragments placed by fallback (e.g. 233 pushes for E = 233
at n = 25), and since this matcher's graph grows as E ≈ n^1.6 the push count grows with exponent 1.58
(R² 0.9917), time with about 1.7. With a mutual top-3 graph the heap work is tiny (about 40 pushes at n = 64) but the
time exponent rises to about 2.1 because the unattached fragments are then placed one by one by `fallback`, and accuracy
drops (46% against 57% on the full graph at n = 64).

**Relation to maximum spanning trees.** Prim grows a tree from the seed by always adding the heaviest edge crossing
the cut (placed | unplaced). By the cut property the heaviest edge crossing any cut belongs to some maximum spanning
tree, so if **every** pop that reaches an unplaced vertex is accepted, the joins committed form a maximum spanning tree
of the seed's component (unique when weights are distinct). The tests check this against a Kruskal oracle, both on a
clean strip and on random graphs: the join sets are equal unless a `conflict`, `fallback` or `stop` is recorded. Placement breaks
the equivalence in exactly two places: (1) a conflict (cell occupied, outside the grid, or a rotation that is not
allowed) discards the edge, so the result is no longer a spanning tree of the graph. Dropping it for good loses
nothing: occupied cells stay occupied, the bounding box only grows, and rot_v is fixed by u's placement, so the same join
could never succeed later; the fragment may still be attached through another, weaker join. (2) pruned or unattached fragments
are placed by `fallback`, which ignores the graph. Also, the heap key is the weight of the *single* join; the score of
the result sums every adjacency in the grid, so a spanning tree is not even the same objective.

**Why it differs from greedy.** Best-first looks only at the single strongest join, in O(E log E); greedy scores each
candidate cell against **all** its placed neighbours, so it sees closed loops (a piece fitting two sides at once) at
a cost of O(R·n³). Hence best-first needs the (prunable) graph, is much faster (about 1.4 ms against 21 ms at n = 64 clean)
and is less accurate on average (e.g. 73% against 81% clean at n = 64). Both share the weakness shown in §10.


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
