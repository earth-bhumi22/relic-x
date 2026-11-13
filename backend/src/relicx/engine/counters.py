"""Operation counters.

Every algorithm in the engine accepts an optional ``OpCounter``. It counts the
elementary operation that dominates that algorithm's running time (a character
comparison, a DP cell, a score lookup, a search node). The dashboard reports
these counts next to wall-clock time, so complexity claims can be checked
against measured numbers instead of being asserted.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class OpCounter:
    """Named tallies of elementary operations."""

    counts: dict[str, int] = field(default_factory=dict)

    def add(self, name: str, n: int = 1) -> None:
        self.counts[name] = self.counts.get(name, 0) + n

    def get(self, name: str) -> int:
        return self.counts.get(name, 0)

    @property
    def total(self) -> int:
        return sum(self.counts.values())


def tick(counter: OpCounter | None, name: str, n: int = 1) -> None:
    """Increment ``counter`` if one was supplied (keeps call sites short)."""
    if counter is not None:
        counter.add(name, n)
