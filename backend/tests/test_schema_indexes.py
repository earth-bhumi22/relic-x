"""Every foreign-key column must lead some index (T42).

PostgreSQL indexes the referenced side of a foreign key (the primary key) but
not the referencing side. An unindexed FK column turns every cascade delete into
a full scan of the child table; docs/DATABASE.md measures the difference.
"""

from __future__ import annotations

from relicx.db import models  # noqa: F401  (registers the tables)
from relicx.db.base import Base


def _leading_columns(table) -> set[str]:
    lead = {idx.columns[0].name for idx in table.indexes if len(idx.columns)}
    for c in table.constraints:
        cols = list(getattr(c, "columns", []))
        if cols and c.__class__.__name__ in ("UniqueConstraint", "PrimaryKeyConstraint"):
            lead.add(cols[0].name)
    return lead


def test_every_foreign_key_column_leads_an_index():
    missing = [
        f"{table.name}.{fk.parent.name}"
        for table in Base.metadata.sorted_tables
        for fk in table.foreign_keys
        if fk.parent.name not in _leading_columns(table)
    ]
    assert not missing, f"unindexed foreign keys: {missing}"
