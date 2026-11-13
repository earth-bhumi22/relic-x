"""Shared solver types: result object and trace recorder."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..layout import Placement


@dataclass
class TraceRecorder:
    """Collects human-readable decision steps.

    Exponential solvers can produce millions of events, so only the first
    ``cap`` are stored verbatim; the rest are counted by action type.
    """

    cap: int = 400
    steps: list[dict] = field(default_factory=list)
    dropped: dict[str, int] = field(default_factory=dict)

    def log(self, action: str, message: str, **data) -> None:
        if len(self.steps) < self.cap:
            self.steps.append({"step": len(self.steps) + 1, "action": action, "message": message, **data})
        else:
            self.dropped[action] = self.dropped.get(action, 0) + 1


@dataclass
class SolverResult:
    algorithm: str
    placements: list[Placement]
    total_score: float
    elapsed_ms: float
    operations: dict[str, int]
    trace: list[dict]
    trace_dropped: dict[str, int]
    truncated: bool = False
    meta: dict = field(default_factory=dict)
