"""ORM -> response-model mapping (keeps route handlers one-liners)."""

from __future__ import annotations

from ..db.models import Artifact, Fragment, ReconstructionRun
from ..engine import SIDES
from ..schemas import ArtifactOut, FragmentDetail, FragmentOut, PlacementOut, RunDetail, RunOut, TraceStepOut

API = "/api/v1"


def artifact_out(a: Artifact) -> ArtifactOut:
    accs = [r.neighbour_accuracy for r in a.runs if r.neighbour_accuracy is not None]
    out = ArtifactOut.model_validate(a)
    out.fragment_count = len(a.fragments)
    out.run_count = len(a.runs)
    out.best_accuracy = max(accs) if accs else None
    out.image_url = f"{API}/artifacts/{a.id}/image" if a.source_path else None
    return out


def fragment_out(f: Fragment, detail: bool = False):
    strings = (f.features or {}).get("strings", [])
    base = dict(
        id=f.id,
        label=f.label,
        width=f.width,
        height=f.height,
        image_url=f"{API}/fragments/{f.id}/image",
        true_row=f.true_row,
        true_col=f.true_col,
        scramble_rot=f.scramble_rot,
        edges={SIDES[i]: s for i, s in enumerate(strings)},
    )
    if detail:
        strips = (f.features or {}).get("strips", [])
        return FragmentDetail(**base, strips={SIDES[i]: s for i, s in enumerate(strips)})
    return FragmentOut(**base)


def run_out(r: ReconstructionRun) -> RunOut:
    return RunOut.model_validate(r)


def run_detail(r: ReconstructionRun, labels: dict[str, str]) -> RunDetail:
    base = RunOut.model_validate(r).model_dump()
    return RunDetail(
        **base,
        placements=[
            PlacementOut(
                fragment_id=p.fragment_id, label=labels[p.fragment_id], row=p.cell_row, col=p.cell_col, rot=p.rot
            )
            for p in r.placements
        ],
        trace=[TraceStepOut(step=s.step_no, action=s.action, message=s.message, data=s.data or {}) for s in r.trace],
        trace_dropped=r.trace_dropped or {},
    )
