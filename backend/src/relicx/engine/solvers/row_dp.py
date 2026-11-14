"""Row-profile dynamic programme for 2 x n strips (optional extension; NOT registered in ``ALGORITHMS``).

Backtracking explores arrangements of the 2n fragments one cell at a time and needs branch and bound to survive.
For a strip of two rows the future of a partial arrangement depends only on

    (set of fragments already used, the two fragments + rotations in the LAST column),

because the next column's score only looks at the last column (left neighbours) and at itself (top/bottom).
That is a classic profile DP: columns are appended left to right and the best score for each state is kept.

    S_c(mask, t, b)  = best score of a valid 2 x c prefix using exactly the fragments in ``mask`` whose last column
                       has t on top and b below (t, b are (fragment, rotation) options)
    S_1(mask, t, b)  = V(t, b)
    S_{c+1}(mask + t' + b', t', b') = max over (t, b) of  S_c(mask, t, b) + H(t, t') + H(b, b') + V(t', b')

where H(x, y) is the compatibility of x's east side with y's west side and V(x, y) that of x's south side with y's
north side (same convention as ``Layout.total_score``). The transition is split in two half steps (choose t', then b')
so that each costs O(n R) instead of O((n R)^2): see docs/ALGORITHMS.md section 13 for the complexity.

Only complete 2 x n strips are supported (``len(ids) == 2 * cols``); anything else raises ``ValueError``. The state
count grows like 2^(2n) / poly, so ``max_states`` guards memory. It does not generalise to a full r x c grid: the
profile would then have to remember a whole row of c fragments (O(n^c) states).
"""

from __future__ import annotations

import time

from ..counters import OpCounter
from ..layout import Compat, Layout, Placement, side_facing
from .common import SolverResult, TraceRecorder


def solve_row_dp(
    ids: list[str],
    compat: Compat,
    cols: int,
    allow_rotation: bool = False,
    max_states: int = 3_000_000,
) -> SolverResult:
    t0 = time.perf_counter()
    counter, trace = OpCounter(), TraceRecorder()
    ids = sorted(ids)
    k = len(ids)
    if cols < 1 or k != 2 * cols:
        raise ValueError(f"row DP needs exactly 2 * cols fragments, got {k} for {cols} columns")
    rots = [0, 1, 2, 3] if allow_rotation else [0]
    r_n = len(rots)
    n_opt = k * r_n  # option o = fragment index * R + rotation index

    def lookup(f, s, g, t):
        return compat.get((ids[f], s, ids[g], t), 0.0)

    horiz = [[0.0] * n_opt for _ in range(n_opt)]
    vert = [[0.0] * n_opt for _ in range(n_opt)]
    for a in range(n_opt):
        fa, ra = divmod(a, r_n)
        for b in range(n_opt):
            fb, rb = divmod(b, r_n)
            if fa == fb:
                continue
            horiz[a][b] = lookup(fa, side_facing(1, rots[ra]), fb, side_facing(3, rots[rb]))  # a's E <-> b's W
            vert[a][b] = lookup(fa, side_facing(2, rots[ra]), fb, side_facing(0, rots[rb]))  # a's S <-> b's N

    # layer: (mask, top option, bottom option) -> (value, key of the previous layer's state)
    layer: dict[tuple[int, int, int], tuple[float, tuple | None]] = {}
    for t in range(n_opt):
        for b in range(n_opt):
            if t // r_n != b // r_n:
                layer[((1 << (t // r_n)) | (1 << (b // r_n)), t, b)] = (vert[t][b], None)
    layers = [layer]
    stored = len(layer)
    counter.add("dp_states", len(layer))

    for _ in range(cols - 1):
        # half step 1: choose the new top t2 -> intermediate (mask', bottom of the last column, t2)
        mid: dict[tuple[int, int, int], tuple[float, tuple]] = {}
        for key, (val, _prev) in layer.items():
            mask, t, b = key
            for t2 in range(n_opt):
                f2 = t2 // r_n
                if mask >> f2 & 1:
                    continue
                counter.add("dp_transitions")
                cand = val + horiz[t][t2]
                mkey = (mask | 1 << f2, b, t2)
                if mkey not in mid or cand > mid[mkey][0]:
                    mid[mkey] = (cand, key)
        # half step 2: choose the new bottom b2
        nxt: dict[tuple[int, int, int], tuple[float, tuple]] = {}
        for (mask, b, t2), (val, origin) in mid.items():
            for b2 in range(n_opt):
                f3 = b2 // r_n
                if mask >> f3 & 1:
                    continue
                counter.add("dp_transitions")
                cand = val + horiz[b][b2] + vert[t2][b2]
                nkey = (mask | 1 << f3, t2, b2)
                if nkey not in nxt or cand > nxt[nkey][0]:
                    nxt[nkey] = (cand, origin)
        counter.add("dp_states", len(nxt))
        stored += len(nxt)
        if stored > max_states:
            raise ValueError(f"row DP state limit exceeded ({stored:,} > {max_states:,}); use fewer columns")
        layer = nxt
        layers.append(layer)

    final_key = max(layer, key=lambda kk: (layer[kk][0], [-x for x in kk]))  # best value, ties: smallest key
    best_value = layer[final_key][0]
    key = final_key
    columns = []
    for c in range(cols - 1, -1, -1):
        columns.append((c, key[1], key[2]))
        key = layers[c][key][1]
    out = Layout(2, cols, allow_rotation)
    for c, t, b in columns:
        out.place(Placement(ids[t // r_n], 0, c, rots[t % r_n]))
        out.place(Placement(ids[b // r_n], 1, c, rots[b % r_n]))
    trace.log("best", f"Row DP optimum for 2 x {cols}: score {best_value:.3f}", score=round(best_value, 4))
    return SolverResult(
        algorithm="row_dp",
        placements=out.normalised(),
        total_score=round(out.total_score(compat), 4),
        elapsed_ms=round((time.perf_counter() - t0) * 1000, 2),
        operations=dict(counter.counts),
        trace=trace.steps,
        trace_dropped=trace.dropped,
        meta={"dp_value": round(best_value, 4), "states_stored": stored, "columns": cols},
    )
