# RELIC-X — Database

**Owner:** B — Bhumi · **Issue:** T42 · **Schema revision:** `0003` (`backend/migrations/versions/`)

The database stores what the engine produces so the UI can show it again without recomputing: artifacts, their fragments, the scored edge pairs, every reconstruction run with its placements and trace, and background jobs. The engine never touches it (`tests/engine/test_engine_purity.py`); only `repositories/` does.

- **Development and tests:** SQLite (`backend/relicx.db` by default; each test gets a fresh file).
- **Docker and CI:** PostgreSQL 16. CI runs the migrations, the smoke pipeline and the API, CLI and constraint tests against it.
- One schema for both, written once in `backend/src/relicx/db/models.py`; Alembic turns it into migrations.

---

## 1. Entity-relationship diagram

```mermaid
erDiagram
    artifacts ||--o{ fragments : "cut into"
    artifacts ||--o{ pair_matches : "scored pairs"
    artifacts ||--o{ reconstruction_runs : "solved by"
    artifacts ||--o{ jobs : "queued for"
    fragments ||--o{ pair_matches : "frag_a / frag_b"
    fragments ||--o{ placements : "placed as"
    reconstruction_runs ||--o{ placements : "puts"
    reconstruction_runs ||--o{ trace_steps : "explains"
    reconstruction_runs |o--o{ jobs : "result of"

    artifacts {
        string id PK
        string name
        string source_kind "sample | upload | fragments"
        int grid_rows "1..16"
        int grid_cols "1..16"
        int tile
        bool has_ground_truth
        json fragment_params
        json match_config
        json match_stats
        datetime created_at
        datetime updated_at
    }
    fragments {
        string id PK
        string artifact_id FK
        string label "F01.. unique per artifact"
        string image_path
        int width
        int height
        int true_row "ground truth, nullable"
        int true_col
        int scramble_rot "0..3, nullable"
        json features
    }
    pair_matches {
        int id PK
        string artifact_id FK
        string frag_a FK
        int side_a "0..3"
        string frag_b FK
        int side_b "0..3"
        float color
        float lcs
        float edit
        float motif
        float hash
        float composite "0..1"
    }
    reconstruction_runs {
        string id PK
        string artifact_id FK
        string algorithm "greedy | best_first | dijkstra | backtracking"
        json params
        float elapsed_ms
        json operations
        float total_score
        float neighbour_accuracy
        float direct_accuracy
        float coverage
        bool truncated
        json meta
        json trace_dropped
        datetime created_at
    }
    placements {
        int id PK
        string run_id FK
        string fragment_id FK
        int cell_row
        int cell_col
        int rot "0..3"
    }
    trace_steps {
        int id PK
        string run_id FK
        int step_no
        string action
        text message
        json data
    }
    jobs {
        string id PK
        string artifact_id FK
        string algorithm
        json params
        string status "queued | running | done | failed"
        float progress "0..1"
        string run_id FK "nullable, SET NULL"
        text error
        datetime created_at
        datetime started_at
        datetime finished_at
    }
```

**Reading it.** An artifact is cut into fragments. The matcher (Strings & Matching) scores fragment edges against each other and stores one `pair_matches` row per candidate join: "side `side_a` of `frag_a` next to side `side_b` of `frag_b`", with the five sub-scores and the weighted `composite`. A solver (Graph & Search) reads those rows and writes a run: one `placements` row per fragment (cell and rotation) and the `trace_steps` the UI replays. A job is the background wrapper around one run; when it finishes, `jobs.run_id` points at the run it produced.

Sides are numbered 0 = top, 1 = right, 2 = bottom, 3 = left; rotations are quarter turns clockwise (`docs/ALGORITHMS.md` §1).

---

## 2. Constraints and the bug each one prevents

The database checks these itself, so a bug in the service layer, a hand-written SQL fix or a future client cannot store data the engine would choke on. Each row has a "bad row / good twin" pair in **`backend/tests/test_constraints.py`**: the bad row must be rejected and an almost identical good row must be accepted, so a test cannot pass just because the row was broken in some other way. The suite runs on SQLite and, in CI, on PostgreSQL.

Names follow `NAMING` in `db/base.py` (`ck_<table>_<name>`, `uq_<table>_<col>`, `fk_<table>_<col>_<target>`), so they are identical on both databases and in every migration.

### CHECK

| Constraint | Rule | Bug it prevents | Test case |
|---|---|---|---|
| `ck_artifacts_grid_rows_range` | `grid_rows BETWEEN 1 AND 16` | A 0-row grid divides by zero in the fragmenter; above 16 the backtracking search and the match table explode (256 fragments is already ~260k candidate pairs). | `grid_rows below 1` |
| `ck_artifacts_grid_cols_range` | `grid_cols BETWEEN 1 AND 16` | Same, for columns. | `grid_cols above 16` |
| `ck_artifacts_source_kind_enum` | `sample`, `upload` or `fragments` | The UI and the re-fragment endpoint branch on this; an unknown value would show no image and allow re-cutting a set of uploaded pieces. | `unknown source_kind` |
| `ck_fragments_scramble_rot_range` | `NULL` or `0..3` | Rotation 4 is not a quarter turn; accuracy scoring would compare it to 0 and call a correct piece wrong. | `scramble_rot 4` |
| `ck_pair_matches_side_range` | both sides `0..3` | A side index of 4 would read past the four edge strings of a fragment. | `side 4` |
| `ck_pair_matches_no_self_join` | `frag_a <> frag_b` | A fragment matched to itself gives a perfect score (its edge read against its own reversed edge), and greedy would chain it to itself. | `self-join` |
| `ck_pair_matches_composite_range` | `composite BETWEEN 0 AND 1` | Dijkstra uses `1 − composite` as an edge cost; a score above 1 makes a negative edge and breaks it. | `composite above 1` |
| `ck_reconstruction_runs_algorithm_enum` | the four solver names | The comparison chart and the trace player look up the solver by name. | `unknown algorithm` |
| `ck_placements_rot_range` | `rot BETWEEN 0 AND 3` | Same reason as `scramble_rot`; the canvas would draw an impossible rotation. | `placement rot 5` |
| `ck_jobs_status_enum` | `queued`, `running`, `done`, `failed` | Restart recovery fails every job that is not `done`/`failed`; an unknown status would be stuck forever. | `job status paused` |
| `ck_jobs_progress_range` | `progress BETWEEN 0 AND 1` | The progress bar would overflow. | `job progress above 1` |
| `ck_jobs_algorithm_enum` | the four solver names | A job for an unknown solver would only fail later, in the worker. | (covered by the API tests, `tests/api/test_jobs.py`) |

### UNIQUE

| Constraint | Columns | Bug it prevents | Test case |
|---|---|---|---|
| `uq_fragments_artifact_label` | `(artifact_id, label)` | The engine identifies pieces by label (`F01`…); two `F01`s in one artifact would make placements ambiguous. | `duplicate fragment label` |
| `uq_pair_matches_join` | `(artifact_id, frag_a, side_a, frag_b, side_b)` | Re-running the matcher without clearing old rows would double-count joins and skew greedy's ordering. The repository replaces all rows in one transaction; this makes a missed delete fail loudly. | `duplicate join` |
| `uq_placements_run_fragment` | `(run_id, fragment_id)` | A solver bug placing one fragment twice would show the same piece in two cells. | `fragment placed twice in a run` |
| `uq_placements_run_cell` | `(run_id, cell_row, cell_col)` | Two fragments in one cell; the second would be hidden and accuracy would be wrong. | `two fragments in one cell` |

### FOREIGN KEY and what happens on delete

| Foreign key | On delete | Why | Test |
|---|---|---|---|
| `fragments.artifact_id → artifacts` | CASCADE | Fragments have no meaning without their artifact. | `fragment of unknown artifact`, cascade test |
| `pair_matches.artifact_id → artifacts` | CASCADE | Scores belong to the artifact. | cascade test |
| `pair_matches.frag_a`, `frag_b → fragments` | CASCADE | Re-fragmenting deletes the old fragments; their scores must go too or they would point at pieces that no longer exist. | cascade test |
| `reconstruction_runs.artifact_id → artifacts` | CASCADE | Runs belong to the artifact. | cascade test |
| `placements.run_id → reconstruction_runs` | CASCADE | A placement is part of exactly one run. | run-delete test |
| `placements.fragment_id → fragments` | CASCADE | Re-fragmenting invalidates old runs' placements. | cascade test |
| `trace_steps.run_id → reconstruction_runs` | CASCADE | The trace is part of the run. | cascade test |
| `jobs.artifact_id → artifacts` | CASCADE | Jobs belong to the artifact. | cascade test |
| `jobs.run_id → reconstruction_runs` | **SET NULL** | Deleting a run must not erase the record that a job ran; the job stays `done` with no run attached. | `test_deleting_a_run_keeps_its_job_but_clears_run_id` |

`test_deleting_an_artifact_cascades_to_every_child_table` deletes one artifact with plain SQL and checks all six child tables are empty, so the cascade is the database's work, not the ORM's. The ORM relationships use `passive_deletes=True` so SQLAlchemy leaves it to the database instead of loading every child first.

**SQLite note.** SQLite ignores foreign keys unless asked. `db/session.py` runs `PRAGMA foreign_keys=ON` on every new connection; without it none of the FK rows above would hold in development.

---

## 3. Indexes, measured

| Index | Columns | Serves |
|---|---|---|
| `ix_pair_matches_artifact_score` | `(artifact_id, composite)` | `GET /artifacts/{id}/matches?min_score=&limit=`: the best joins first, which greedy, best-first and the match table all read. |
| `ix_fragments_artifact_id`, `ix_reconstruction_runs_artifact_id`, `ix_jobs_artifact_id` | `artifact_id` | Listing an artifact's fragments, runs and jobs. |
| `ix_placements_run_id`, `ix_trace_steps_run_id` | `run_id` | Loading one run's placements and trace. |
| `ix_pair_matches_frag_a`, `ix_pair_matches_frag_b`, `ix_placements_fragment_id`, `ix_jobs_run_id` | one FK column each | Cascade deletes (added in **0003**, see below). |

All measurements: PostgreSQL 16, `EXPLAIN (ANALYZE)`, a scratch database loaded with 300 artifacts (5×5, 7 500 fragments, 115 200 pair matches, 1 200 runs, 30 000 placements, 120 000 trace steps, 300 jobs) plus one 16×16 artifact with every candidate join stored (261 120 pair matches). Times are the median of three runs on a laptop-class machine; the ratios matter, not the milliseconds.

### 3.1 The match list: `ix_pair_matches_artifact_score`

The query the repository sends (`MatchRepository.list_for`):

```sql
SELECT * FROM pair_matches
WHERE artifact_id = :id AND composite >= :min_score
ORDER BY composite DESC
LIMIT 200;
```

**With the index**, on the 16×16 artifact:

```
 Limit (actual time=0.028..0.662 rows=200 loops=1)
   ->  Index Scan Backward using ix_pair_matches_artifact_score on pair_matches (actual time=0.028..0.649 rows=200 loops=1)
         Index Cond: (((artifact_id)::text = 'big'::text) AND (composite >= '0.3'::double precision))
 Execution Time: 0.682 ms
```

PostgreSQL walks the index backwards from this artifact's highest score and stops after 200 rows. Filtering, sorting and the limit are all done by the index order; it never reads the other ~260 000 rows.

**Without it** (dropped inside a transaction, then rolled back):

```
 Limit (actual time=33.967..35.116 rows=200 loops=1)
   ->  Gather Merge (actual time=33.965..35.103 rows=200 loops=1)
         Workers Launched: 2
         ->  Sort (actual time=28.741..28.756 rows=149 loops=3)
               Sort Method: top-N heapsort  Memory: 69kB
               ->  Parallel Seq Scan on pair_matches (actual time=4.987..23.110 rows=60835 loops=3)
                     Filter: ((composite >= '0.3'::double precision) AND ((artifact_id)::text = 'big'::text))
                     Rows Removed by Filter: 64605
 Execution Time: 35.161 ms
```

A parallel scan of the whole table, then a top-N sort: **~35 ms vs ~0.7 ms, about 50×**, and the gap grows with the table.

**Honest caveat.** For a typical 5×5 artifact (~400 rows) the index makes no difference: both plans take ~0.8 ms, and without it PostgreSQL uses the leading `artifact_id` column of `uq_pair_matches_join` instead. The index is for large grids and a growing table, not for the demo artifacts.

### 3.2 Cascade deletes: why migration 0003 exists

While measuring T42 the plan for `DELETE FROM artifacts WHERE id = …` showed where the time went:

```
 Trigger for constraint fk_pair_matches_frag_a_fragments on fragments: time=148.282 calls=25
 Trigger for constraint fk_pair_matches_frag_b_fragments on fragments: time=159.750 calls=25
 Trigger for constraint fk_placements_fragment_id_fragments on fragments: time=37.771 calls=25
 Execution Time: 347.941 ms
```

PostgreSQL creates an index for a primary key but **not** for the column that references it. Each of the artifact's 25 fragments fired a trigger that scanned all of `pair_matches` (twice, for `frag_a` and `frag_b`) and all of `placements`. The same happens on every re-fragment (`POST /artifacts/{id}/fragment`), which deletes the old fragments.

Migration **0003** indexes the four unindexed FK columns (`pair_matches.frag_a`, `pair_matches.frag_b`, `placements.fragment_id`, `jobs.run_id`). After it:

```
 Trigger for constraint fk_pair_matches_frag_a_fragments on fragments: time=0.508 calls=25
 Trigger for constraint fk_pair_matches_frag_b_fragments on fragments: time=0.414 calls=25
 Trigger for constraint fk_placements_fragment_id_fragments on fragments: time=0.317 calls=25
 Execution Time: 4.085 ms
```

| Operation | Before 0003 | After 0003 |
|---|---|---|
| Delete one artifact (cascade to 6 tables) | ~330 ms | ~5 ms |
| Delete one artifact's fragments (re-fragment) | ~330 ms | ~1.4 ms |

That is about 70× on the delete path, and the cost now depends on the artifact's own rows instead of the whole table. `tests/test_schema_indexes.py` fails if a foreign-key column is ever added without an index leading with it (checked: without 0003 it lists exactly these four columns).

### 3.3 Reproducing the numbers

```bash
createdb -O relicx relicx_vol
RELICX_DATABASE_URL=postgresql+psycopg://relicx:change_me@localhost/relicx_vol alembic upgrade head
# load rows with generate_series (300 artifacts × 25 fragments, ...), then ANALYZE
psql relicx_vol -c "EXPLAIN (ANALYZE, COSTS OFF) SELECT * FROM pair_matches WHERE artifact_id='…' AND composite >= 0.3 ORDER BY composite DESC LIMIT 200"
# compare: BEGIN; DROP INDEX ix_pair_matches_artifact_score; EXPLAIN ANALYZE …; ROLLBACK;
```

Wrapping `DROP INDEX` and `DELETE` in `BEGIN … ROLLBACK` measures them without changing anything.

---

## 4. Migrations

| Revision | File | What it does |
|---|---|---|
| `0001` | `0001_initial_schema.py` | artifacts, fragments, pair_matches, reconstruction_runs, placements, trace_steps, with every constraint in §2 |
| `0002` | `0002_jobs_table.py` | `jobs` table for background runs (T20) |
| `0003` | `0003_foreign_key_indexes.py` | the four FK indexes from §3.2 (T42) |

In Docker a one-shot `migrate` service runs `alembic upgrade head` before the API starts (`docker-compose.yml`), and CI runs it against a fresh PostgreSQL before the tests. `alembic current` shows the revision a database is on.

### Adding a migration

1. **Change the model** in `backend/src/relicx/db/models.py`. Give every new CHECK a short `name=`; the naming convention adds the table prefix.
2. **Generate** against an up-to-date throwaway database:
   ```bash
   cd backend
   export RELICX_DATABASE_URL=sqlite:////tmp/mig.db
   alembic upgrade head
   alembic revision --autogenerate -m "short description" --rev-id 0004
   ```
   Use the next number as `--rev-id`, so revisions sort and read in order.
3. **Read the generated file.** Autogenerate does not notice CHECK constraint changes, server defaults or renamed columns (it sees a drop and an add, which loses data). Fix those by hand, remove the "auto generated" comments, and say *why* in the docstring.
4. **Round-trip it** on both databases:
   ```bash
   alembic downgrade -1 && alembic upgrade head && alembic check   # "No new upgrade operations detected."
   RELICX_DATABASE_URL=postgresql+psycopg://relicx:change_me@localhost/relicx_test alembic upgrade head
   ```
   SQLite cannot alter most constraints in place; Alembic's `batch_alter_table` (already used in 0002 and 0003) copies the table for it.
5. **Tests.** `tests/test_migrations.py` upgrades to head, downgrades to base, upgrades again, and compares the result with the models using `compare_metadata`. It fails if a model change has no migration (drift) or a downgrade is broken. Add a bad-row/good-twin case to `tests/test_constraints.py` for any new constraint.
6. **Document it** in the table above and in `CHANGELOG.md`.

Never edit a migration that is already on `main`: databases that ran it would not run it again. Add a new one.
