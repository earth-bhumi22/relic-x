# RELIC-X backend (`relicx`)

Owner: **B — Bhumi** (Graph & Search engine files: **A — Arvind**). See the root
[README](../README.md) and [planning/ARCHITECTURE.md](../planning/ARCHITECTURE.md).

```bash
pip install -e ".[api,dev]"
uvicorn relicx.main:app --reload    # http://localhost:8000/docs
pytest                              # engine + API + migration tests
ruff check . && black --check .
```

Only the engine (no web/DB) is needed for algorithm work and benchmarks: `pip install -e .`
