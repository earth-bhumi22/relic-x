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
## Best-first (Prim)
## Dijkstra
## Backtracking + branch & bound
