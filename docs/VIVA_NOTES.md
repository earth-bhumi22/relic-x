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

**Q: What does the prefix function store, and why is it enough to never move back in the text?**
A: π[i] is the length of the longest proper prefix of P[0..i] that is also its suffix. After a mismatch with k
characters matched, the last k text characters equal P[0..k−1], so the next candidate alignment that could still match
starts at the longest border of that prefix, i.e. π[k−1]. Everything shorter was already ruled out, so the text
pointer never needs to go back.

**Q: Prove KMP is linear.**
A: Each comparison either matches (k increases by 1) or falls back (k strictly decreases). k ≥ 0, so fall-backs ≤ matches
≤ n, and each text position has one final comparison: at most 2n − 1 comparisons for the search and 2m − 3 for the
table. Our code counts every comparison and the tests assert exactly these bounds.

**Q: When does naive matching become quadratic, and what do your numbers show?**
A: On inputs with many partial matches, like text aⁿ and pattern a^{m−1}b: every shift compares about m characters,
Θ(n·m). Measured: naive ≈ 10n, KMP ≈ 2n with m = 10, and the gap grows with m.

**Q: How does KMP handle overlapping occurrences?**
A: After a full match it sets k = π[m−1] instead of 0, so `aaaa` in `aa` gives 0, 1, 2 (tested).

## Rabin-Karp

**Q: How do you update the hash in O(1)?**
A: Subtract the outgoing character times B^{m−1} (precomputed mod M), multiply by B, add the incoming character, all mod
M. The test checks every rolled hash equals the directly computed one.

**Q: What is a spurious hit and why must you verify?**
A: Two different windows with the same hash (a collision). Without verification the algorithm would report false
matches. With M = 7 our test produces many collisions and the results are still exactly the brute-force ones.

**Q: Expected vs worst case?**
A: Expected O(n + m) because a collision has probability ≈ 1/M ≈ 10⁻⁹ per window. Worst case O(n·m) if every window
collides; the test forces it with M = 1 and counts exactly (n − m + 1)·m comparisons.

**Q: Why keep both KMP and Rabin-Karp?**
A: KMP has a deterministic linear bound; Rabin-Karp generalises to many patterns via a hash set, which makes the
motif decision step O(L) instead of O(L²). Same answers (tested), different costs (measured).

## Longest motif

**Q: Why is binary search over the motif length valid?**
A: Monotonicity: if a run of length ℓ is shared, so is every shorter run (cut it). The predicate is True…True
False…False, so binary search finds the boundary in O(log L) checks. Tested on random strings.

**Q: What is the total complexity with each decision procedure?**
A: O(log L) steps × O(L²) with KMP = O(L² log L); × O(L) expected with Rabin-Karp = O(L log L). Measured exponents:
2.38 and 1.31.

**Q: Why ignore runs shorter than 3?**
A: With 64 symbols a 1- or 2-symbol coincidence is common between unrelated edges (especially plain background), so it
carries little evidence; `min_motif` filters it out.

**Q: Is longest common substring the same as LCS?**
A: No. A substring is contiguous; a subsequence may skip characters. The motif rewards an unbroken run; LCS (§5)
tolerates gaps from chipped pixels. We use both because they measure different evidence.
## LCS

**Q: Write the LCS recurrence and explain why it is correct.**
A: L[i][j] = L[i−1][j−1] + 1 if the last characters match, else max(L[i−1][j], L[i][j−1]); 0 on an empty prefix. If the
last characters match, some LCS uses them (exchange argument); if not, at least one of them is unused, so drop it.

**Q: Why dynamic programming and not recursion?**
A: Overlapping subproblems: plain recursion recomputes L[i−1][j−1] and friends exponentially often. The table computes
each of the (m+1)(n+1) values once → Θ(mn).

**Q: How do you get O(min(m, n)) space, and what do you lose?**
A: Row i only needs row i − 1, so keep two rows indexed by the shorter string. You lose the traceback, so the
"Why matched?" panel uses the full table, for one pair at a time.

**Q: Why LCS for fragment edges?**
A: Damage deletes or changes a few symbols. LCS skips them and still rewards the shared order of colours. Measured
separation (AUC) 0.998 clean, 0.977 at 60 % erosion.

## Edit distance

**Q: Recurrence and the meaning of each term?**
A: D[i][j] = D[i−1][j−1] on a match, else 1 + min(delete D[i−1][j], insert D[i][j−1], substitute D[i−1][j−1]); borders
D[i][0] = i, D[0][j] = j.

**Q: On a match you skip the min. Is that safe?**
A: Yes. Adjacent cells differ by at most 1, so the diagonal is never worse than going around it. The plain recursion
with the full min agrees (tested).

**Q: Is edit distance a metric? Why does that matter?**
A: Yes: identity, symmetry, triangle inequality (all tested). Scores then behave consistently: if A is close to B and B to
C, A cannot be far from C.

**Q: How do LCS and edit distance relate?**
A: Without substitutions, distance = m + n − 2·LCS. With substitutions it can only be smaller, so D ≤ m + n − 2·LCS
(tested).

**Q: Why use both?**
A: LCS rewards what is shared, edit distance charges what differs, and a substitution costs edit distance 1 but LCS a
whole match. They disagree on some pairs, which is useful in a weighted score. Edit separates slightly better here
(AUC 0.999 vs 0.998 clean).
## Hashing pre-filter

**Q: What exactly is hashed?**
A: Every length-3 window of an edge string, with the Rabin-Karp rolling hash, giving a set of integers (the n-gram
signature). It is built once per edge and per reversed edge in O(L).

**Q: Why Jaccard of signatures and not LCS for the first pass?**
A: Jaccard is two hash-set operations, O(L) expected; LCS is O(L²). The cheap score only has to put true neighbours
into each side's top-k, not rank them perfectly. Recall at top_k = 6 is 100 %.

**Q: What is the complexity with and without the filter?**
A: Without: O(P·L²) for P side pairs. With: O(P·L) for stage 1 plus O(|K|·L²) for the survivors, where
|K| ≤ k·4n. P grows as n² and |K| as n, so the saving grows with n: ≈ 3× on 5×5, ≈ 6× on a rotated 4×4.

**Q: Can the filter change a match score?**
A: No. It only chooses which pairs are scored; a kept pair gets exactly the score it would get without the filter
(tested). It can only *miss* a pair, so we measure recall: 100 % at the default.

**Q: Why heapq.nlargest instead of sorting?**
A: Selecting k of c candidates with a size-k heap is O(c log k); sorting is O(c log c). Python documents that
nlargest returns exactly sorted(…, reverse=True)[:k], so the results are identical.

**Q: When does the memo cache help?**
A: When edge strings repeat exactly: plain regions. 100 % of pairs on a flat image, 13 % on the pottery sample, 0 % on
the busy ones. It is a dict lookup, so it costs almost nothing when it misses.

## Edge features and the composite score

**Q: How does an image edge become a string?**
A: Average the outer 2 pixel rows of the side, resample to 24 samples, and map each RGB sample to one of 4³ = 64 colour
bins, each written as one symbol. Four strings per fragment, plus the numeric strips for colour.

**Q: Why read every side clockwise, and why compare with the reversed edge?**
A: Two touching sides walk their shared border in opposite directions when both are read clockwise, so the rule is
always "side a vs side b reversed". Rotating a fragment only shifts which position a string sits in, never reverses
it, so the same rule works for all 16 side combinations (tested for k = 1, 2, 3).

**Q: How did you choose the weights?**
A: Grid search over 3 124 weight vectors on 9 artifacts, then checked on 18 unseen ones (528 decisions). The best
tuned weights gain 2 decisions (+0.5 %), so the defaults stay: they are on the same plateau, and changing them would
fit noise.

**Q: Which component matters most?**
A: Colour: alone 88.3 %, and removing it costs 7.6 points. The string scores add 3.5 points on top of colour because
they fail on different pairs.

**Q: Your motif score does not help ranking. Why keep it?**
A: Measured honestly: the best weights set it to 0, and removing it changes accuracy by under 1 point. It stays at a
small weight because it is the clearest explanation for a person ("these symbols continue across the break"), and
it can be switched off per request.

**Q: What breaks the matcher first?**
A: Edge erosion more than pixel noise: σ = 20 noise costs 1–8 points, 60 % erosion 16–23, because a chip replaces a
whole run of symbols.

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
