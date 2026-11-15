"""foreign key indexes

PostgreSQL does not index the referencing column of a foreign key. Without these four,
deleting one artifact (or re-fragmenting it) scanned pair_matches and placements once per
fragment: ~340 ms at 300 artifacts, ~4 ms with them. Measured in docs/DATABASE.md.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-15 09:55:06.157339
"""

from __future__ import annotations

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_jobs_run_id"), ["run_id"], unique=False)

    with op.batch_alter_table("pair_matches", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pair_matches_frag_a"), ["frag_a"], unique=False)
        batch_op.create_index(batch_op.f("ix_pair_matches_frag_b"), ["frag_b"], unique=False)

    with op.batch_alter_table("placements", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_placements_fragment_id"), ["fragment_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("placements", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_placements_fragment_id"))

    with op.batch_alter_table("pair_matches", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pair_matches_frag_b"))
        batch_op.drop_index(batch_op.f("ix_pair_matches_frag_a"))

    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_jobs_run_id"))
