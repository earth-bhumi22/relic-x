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
**What it computes.** Dijkstra from the seed on the fragment graph with edge cost c(u, v) = 1 − w(u, v), where w is the
join weight (a composite score in [0, 1], CONTRACT §2). It returns the cost `dist` of the cheapest path from the seed to
every reachable fragment and a `parent` pointer for each, i.e. a **shortest-path tree**. `solve_dijkstra` then places
fragments in settle order, each in the cell its parent join dictates (d = (side_u + rot_parent) mod 4, rot =
(d + 2 − side_v) mod 4); a taken or out-of-bounds cell, a forbidden rotation or an unreachable fragment goes to
`_fallback` (best free frontier slot, shared with best-first) and is logged as a `conflict`.

**Non-negativity.** The matcher's composite is a weighted average of terms in [0, 1], so w ∈ [0, 1] and c ≥ 0.
`build_graph` itself does not enforce this, so `edge_cost` clamps to `max(0, 1 − w)`. A clamp was chosen over an
assertion because a weight of 1.0000001 (float noise) or a custom matcher should degrade gracefully, not return a 500;
only w > 1 can break the precondition (w < 0 only gives a cost above 1, which is still legal).

**Correctness sketch.** Invariant: when a node u is settled (popped with a non-stale entry), `dist[u]` is the length of a
shortest seed → u path. Proof by induction on the settle order. Suppose u is the first node settled with
`dist[u]` greater than the true distance δ(u). Take a shortest seed → u path and its first node y not yet settled; its
predecessor x is settled, so by induction `dist[x] = δ(x)` and relaxing the edge (x, y) gave `dist[y] ≤ δ(x) + c(x, y) =
δ(y)`. Because every cost is ≥ 0, δ(y) ≤ δ(u) along the path, so `dist[y] ≤ δ(y) ≤ δ(u) < dist[u]`. But u was popped
before y, so `dist[u] ≤ dist[y]`: contradiction. **Non-negativity is used in the step δ(y) ≤ δ(u)**: with a negative edge
a later node could still lower an already settled distance, settled values would not be final and the algorithm would
be wrong (it would need Bellman-Ford). Lazy deletion instead of decrease-key: a node may be pushed once per improving
relaxation and a stale entry (node already settled) is discarded on pop, which keeps a plain binary heap and O(log E)
per operation. Ties: heap entries are `(dist, id)` and an exactly equal-cost alternative keeps the smaller-id parent
(never re-parenting a settled node), so the tree does not depend on the order of the adjacency lists; costs differing
only by float rounding are not treated as ties. The settle order starts with the seed (the only initial heap entry), and
a parent is recorded only while relaxing from a settled node, so every parent is settled, hence already placed, before
its child.

**Time and space.** Each settled node scans its adjacency list once: relaxations = Σ deg = 2E exactly, and heap pushes
are at most the number of improving relaxations, so the heap holds at most E entries and log E = O(log V). Total
**O((V + E) log V)** (worst case, many improving relaxations); best case O(V + E) (every node is reached once through
its cheapest edge, e.g. a path). Space O(V + E). The placement step adds **O(U·F·R)** for the U conflict or unreachable
fallbacks, each scanning F ≤ 4t frontier cells and R rotations. Measured (damaged 3×3…8×8, `validation/results.md`):
relaxations equal 2E exactly (ratio 1.00 at every n) and grow as n^1.58 like E itself, `heap_pops` as n^1.18 (0.13–0.30 of
E, the rest of the pushes are never needed), but the number of conflicts grows roughly linearly with n (16 per run at
n = 25, 49 at n = 64) so `score_lookups` from the fallbacks grow as n^2.06 against n^1.58 for the heap work (wall time about n^2): the fallbacks,
not the heap, are what grows fastest.

**Why a path-sum objective underperforms for assembly.**
(a) A hop never costs less than 0, so cost accumulates with depth: a fragment with one excellent join to a far-away
fragment can be reached more cheaply through a nearby fragment by a mediocre join, so the tree hangs it there. (b) Path cost
measures distance from the **seed**, but where a fragment belongs depends on the **single join** to its neighbour, not on
how far it is from the seed. (c) A wrong placement propagates: a conflicting child is re-seated by `_fallback` at its actual
cell and its own children are placed relative to that cell (tested), so one error shifts a whole subtree. (d) Prim's key is the
single-edge weight, which is the quantity that matters; the closer path objective is a **bottleneck (minimax) path**, where
the cost of a path is its weakest join. Measured: on 5×5 grids the mean join weight in Dijkstra's tree is 0.517 against
0.685 for the maximum spanning tree at noise 4 / erosion 0.3, and 62% of fragments get a different parent than in the
maximum spanning tree (clean: 0.703 against 0.820, 40%); the gap widens with damage (0.285 against 0.442 at noise 32, erosion
0.6). Dijkstra has 16 conflicts per run at 25 fragments (clean: 11) and its neighbour accuracy is 38% on the full graph and
49% on the mutual top-3 graph (the API default), against 84% for best-first and 91% for greedy; at 3×3 it is 73% (full graph)
against 93% (best-first) and the gap grows with n.

**Counterexample (≤ 5 fragments; 2×2 grid, no rotation, seed A).** Fragments A, B, C with three non-zero compat entries
(b right of a means side E of a meets side W of b; b below a means side S meets side N):

| join | weight | cost 1 − w |
|---|---|---|
| B left of A | 0.25 | 0.75 |
| A below C | 0.35 | 0.65 |
| C left of B | 0.60 | 0.40 |

Dijkstra: dist(C) = 0.65 via A; dist(B) = min(0.75 via A, 0.65 + 0.40 = 1.05 via C) = 0.75, so the settle order is A, C, B
and B hangs on A by the mediocre 0.25 join. Layout `. C / B A`, total 0.35 + 0.25 = **0.60**. Prim pops the strongest
crossing edge each time: A–C (0.35), then C–B (0.60) beats A–B (0.25), giving `C B / A .` with total 0.35 + 0.60 =
**0.95**, which equals the exhaustive optimum. The same instance backs `test_dijkstra_counterexample_*` in
`tests/engine/test_dijkstra.py` and a row in `validation/results.md`.

**Things worth knowing.** `meta["conflicts"]` counts conflicts of fragments that had a parent; unreachable fragments are
counted in `meta["unreachable"]` and, like conflicts, appear as `conflict` steps in the trace (the message and the `parent`
field tell them apart), so `trace conflicts = meta conflicts + placed unreachable`. The API runs Dijkstra on the mutual
top-3 graph unless `top_k` is given, which helps it (79% against 63% clean at 25 fragments; fewer, stronger edges leave fewer
candidate parents to choose wrongly).

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
