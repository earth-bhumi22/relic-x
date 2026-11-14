# RELIC-X — Viva notes

At least three likely questions per algorithm, with short answers you can say out loud.
Owners: **B** fills Part I (T40), **A** fills Part II (T43). Read each other's part before the viva.

## Shared

**Q: Why classical algorithms instead of deep learning?**
A: The ADA goal is explainable, measurable behaviour: every join decomposes into scores, every
placement into a trace step, and every complexity claim is checked against counted operations.

**Q: How do you measure accuracy without knowing the answer?**
A: We fragment a known image ourselves (synthetic ground truth). Uploaded real fragments are
reconstructed, but no accuracy is reported for them.

# Part I — Strings & Matching (B)

## KMP
## Rabin-Karp
## Longest motif
## LCS
## Edit distance
## Hashing pre-filter

# Part II — Graph & Search (A)

## Fragment graph, BFS / DFS

**Q: Why do BFS and DFS give the same connected components?**
A: A component is exactly the set of nodes reachable from its start node, and both traversals explore everything
reachable. Only the order differs: BFS by hop distance, DFS down one strong chain first. We test this against a
union-find oracle on random graphs.

**Q: Why mutual top-k and not plain top-k?**
A: Plain top-k keeps an edge if either end likes it, so one popular fragment drags in spurious edges. Mutual means
both ends rank each other in their top k, so E ≤ k·V/2 (each node has k votes, an edge needs two) and the surviving
edges are far more often true neighbours (100% for the mosaic at k = 1, 2).

**Q: What does the threshold trade off?**
A: Low threshold: many edges, mostly false (16% true at 0.0 on a 5×5), everything one component. High threshold:
precise edges but the graph shatters (mosaic: 25 components at 0.8). Mutual top-k is adaptive per fragment, so it
keeps weak-but-best matches that a global threshold would cut.

**Q: Why is DFS iterative, and what does it cost?**
A: Recursion overflows on a long path (5,000+ fragments). With an explicit stack, marking on pop and pushing the
weakest neighbour first gives the same order as recursion, but the stack can hold O(E) entries (K64: 1,954).

**Q: What is the complexity?**
A: Traversals O(V + E) plus neighbour sorting Σ deg log deg; build O(M) (+ E log E for top-k). Measured edge_visits
= 2E exactly, and time is linear in V + E (R² ≈ 0.996).

**Q: How would you handle 10⁶ fragments?**
A: Matching all pairs is O(V²) and is the real bottleneck: use the hash pre-filter / spatial or LSH candidates so M
stays near O(V·k). Then mutual top-k keeps E ≤ kV/2 and BFS/DFS stay linear; prefer BFS (O(V) queue) to avoid the
O(E) DFS stack, and use integer ids instead of string labels.
## Greedy

**Q: What is the greedy-choice property and why does it fail here?**
A: It says that some optimal solution contains the locally best choice. For placement it fails: a choice fixes a
fragment's cell and rotation, which constrains all later neighbours, and one strong join can beat two medium joins
locally while losing in total. Counterexample (ALGORITHMS §10): the 0.85 join C-over-B is taken first, total 1.05;
the optimum D A / C B uses 0.80 + 0.60 = 1.40 and never uses the 0.85 join.

**Q: Why O(n³)?**
A: n steps, each tries every frontier cell (≤ 4n), every unplaced fragment (≤ n) and every rotation R, each with ≤ 4
lookups: Σ 16·R·t·(n − t) = O(R·n³). The frontier of a compact blob is about √n, so in practice about n^2.5 (measured
exponent of `score_lookups` 2.6).

**Q: Why does greedy not need the graph, and what would you change so it can recover from mistakes?**
A: It scores every candidate against all placed neighbours straight from the compat table, so pruning never
affects it. To recover, keep the greedy result as an incumbent and search around it (that is what our backtracking
solver does with branch and bound), or allow removing the lowest-scored placement and re-placing it (local search).

**Q: What happens when all scores are zero?**
A: The seed is the smallest id and every step ties at score 0; the strict `>` keeps the first candidate in sorted
order, so the layout is deterministic but arbitrary.
## Best-first (Prim)

**Q: How is best-first related to Prim and Kruskal?**
A: It is Prim with a max-heap on the fragment graph: always take the strongest join leaving the placed set. If
every pop is accepted, the joins form a maximum spanning tree (cut property); Kruskal gives the same tree.
Placement breaks it only through conflicts (cell taken, outside the grid, rotation not allowed) and fallbacks, which
the trace records.

**Q: Why lazy deletion?**
A: A binary heap cannot find an entry to decrease its key. We push each join once and discard entries whose target is
already placed when they pop, one O(log E) pop each. Pushes are ≤ E (each edge is pushed by the endpoint placed first),
so the heap work is O(E log E).

**Q: What happens on a conflict, and is dropping the join OK?**
A: A `conflict` is logged and the join is dropped. That loses nothing: occupied cells stay occupied, the bounding box
only grows and the rotation is fixed by the parent, so the same join could never succeed later. The fragment can still
arrive through another join or, at the end, the fallback.

**Q: Why does best-first need the graph while greedy does not, and which is better?**
A: It only sees edges of the (pruned) graph, so threshold / top-k change its result. It is much faster
(1.4 ms against 21 ms at n = 64) but less accurate on average (73% against 81% clean), because it judges one join at a
time. Both fall into the same trap (the §10 counterexample scores 1.05 for each).
## Dijkstra

**Q: Why is the edge cost 1 − w, and why must it be non-negative?**
A: Dijkstra minimises a sum, and a strong join (w near 1) should be cheap, so cost = 1 − w ≥ 0 because scores are in [0, 1].
Non-negativity is what makes a settled distance final: with a negative edge a later node could lower it, the proof
breaks and you would need Bellman-Ford. We clamp with `max(0, 1 − w)` so a weight slightly above 1 cannot break it.

**Q: What is the complexity and why?**
A: O((V + E) log V). Each node is settled once and its adjacency list scanned once (relaxations = 2E, measured exactly).
With lazy deletion the heap holds at most E entries, so each operation is O(log E) = O(log V). Plus O(U·F·R) for the
fallbacks, which dominates as n grows because conflicts grow about linearly (n^2.06 for score lookups).

**Q: Why does Dijkstra place worse than Prim here?**
A: Its objective is the *sum* along a path from the seed, but a fragment's correct cell depends on its single best join.
A fragment with one excellent join to a far fragment gets hung on a nearer one by a mediocre join. Counterexample
(ALGORITHMS §12): B joins A with 0.25 (cost 0.75) or C with 0.60 but C is 0.65 away, so the route through C costs 1.05;
Dijkstra totals 0.60, Prim 0.95 (the optimum). Measured at 5×5, noise 4: 38–49% accuracy against 84%.

**Q: What is a conflict and what do you do about it?**
A: The cell the parent join dictates is taken, outside the grid, or needs a rotation we do not allow (or the fragment is
unreachable in the pruned graph). We log a `conflict` and put the fragment in the best free frontier slot. Its own
children are then placed relative to that actual cell, so an error propagates down the tree.

**Q: Could a bottleneck (minimax) path work better?**
A: Yes, it is closer to the right objective: the cost of a path is its weakest join, so a chain of strong joins stays cheap
and one weak join is what counts. It can be computed with the same heap by replacing the sum with max, and a maximum
spanning tree (what Prim builds) contains such minimax paths.

**Q: Why lazy deletion?**
A: A binary heap cannot find an entry to lower its key. We push a new entry on every improving relaxation and discard a stale
entry (node already settled) when it pops. It costs at most one extra pop per push and keeps O(log E) per operation.
## Backtracking + branch & bound

**Q: What exactly is the search, and what is the state space?**
A: Fill cells in row-major order; at each cell try every unused fragment (in every allowed rotation) or leave it `EMPTY` while
enough empties remain. An arrangement is an injective map from fragments to cells times a rotation each: `C!/(C−n)!·R^n`;
for a full grid without rotation that is n! leaves and `Σ n!/(n−k)!` tree nodes (65 for n = 4, 1,957 for n = 6, 9.9 million
for n = 10). Each adjacent pair is scored once, when its later cell is filled.

**Q: What are the two upper bounds and why are they valid?**
A: `score + min(M·adj_after, Σ_unused v_best)`. (1) Only the adjacencies of the cells still to fill are unbooked; each is at
most the largest compat value M, and there are `adj_after[k]` of them. (2) A future gain belongs to an unused fragment in
its cell: its west and north joins are each at most the best join its W/N sides could ever have (best over rotations), so
the sum over unused fragments bounds everything. `EMPTY` adds 0, so both still hold. If `bound ≤ best`, nothing below
can beat `best`, so we prune. `<=` means ties are cut (the first layout of the best score is kept). Tests brute-force the
true best completion at every partial arrangement of 2×2 and 2×3 and check both terms.

**Q: Why start from greedy, and what does it buy?**
A: It gives a real `best` from node 1 so pruning starts immediately, and it is a floor when the node limit hits: a truncated
run is never worse than greedy. Honest number: on random tables the node saving is small (945 → 878 at n = 6, 25,441 →
25,304 at n = 8); on synthetic images the search stays small anyway (n = 16 clean: ~1.9 thousand nodes, damaged: reaches
the 300,000 limit on 2 of 6 instances).

**Q: What happens when the node limit is hit?**
A: We stop and return the best complete layout so far with `truncated = true` and a `limit` step. The limit is only enforced
once one complete arrangement exists, so the result is always a valid full layout. (A bug I fixed: with no incumbent and
a tiny limit it used to return an empty layout.) Growth is exponential: ln(nodes) vs n has slope ≈ 1.54 (×4.7 per extra
fragment, R² = 0.998 on three points), and with a 300,000 limit truncation starts at n = 10.

**Q: Can dynamic programming do better? When does it stop working?**
A: For a two-row strip yes. State = (set of used fragments, the top and bottom option of the last column); a column adds
`H(t,t') + H(b,b') + V(t',b')`, so `S_{j+1}(mask+t'+b', t', b') = max S_j(mask, t, b) + …`. States ≈ `2^K·K²·R²` (K = 2c):
11,520 at c = 5, 67,584 at c = 6, 372,736 at c = 7, and over 1.5 million at c = 8, where my guard stops it. It gives the
optimum where truncated backtracking does not (c = 5…7). It does not generalise: for more rows the profile has to carry
the whole boundary row, so the state count explodes, which is why the general solver is branch and bound.

**Q: How do the neighbour and direct accuracies differ, and what do they not tell you?**
A: Neighbour accuracy counts true adjacent pairs reproduced (with correct net orientation); direct accuracy counts fragments
in the right cell after the best global rotation and shift. Both ignore a global rotation or shift, a mirror image scores below
1, and missing pieces count against both. Neither dominates: two correct halves with a gap give 2/3 neighbour vs 2/4 direct; a
swapped pair in a 2×2 gives 1/4 vs 2/4. Without ground truth the functions return 1.0, which is vacuous (the API shows no
accuracy for uploads).

**Q: Is the best score the best reconstruction?**
A: No. The optimum of the total compatibility is only as good as the matcher's scores. On the clean 3×3 images backtracking
raised the mean score from 7.395 to 7.603 and neighbour accuracy from 89 % to 100 %; on 4×4 clean it matched greedy. A
higher score can still point at the wrong picture when the matcher is wrong.
