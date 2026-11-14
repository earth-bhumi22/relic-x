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
## Backtracking + branch & bound
