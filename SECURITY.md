# Security

Owner: **B — Bhumi**

RELIC-X v0.1 is a single-user lab with no login. Run it locally or on a trusted network.

| Area | Protection |
|---|---|
| Uploads | Size limit (`RELICX_MAX_UPLOAD_MB`), format allow-list (PNG/JPEG/WebP/BMP), `PIL.verify()`, decompression-bomb pixel cap |
| File storage | All paths are resolved under the storage root; path traversal is rejected |
| Database | ORM-parameterised queries only; integrity enforced by CHECK / UNIQUE / FK constraints |
| CORS | Explicit origin allow-list (`RELICX_CORS_ORIGINS`) |
| Errors | Uniform error body; stack traces are logged with a request ID, never returned |
| Resource limits | `RELICX_MAX_FRAGMENTS`, backtracking `node_limit`, scaling experiment size cap |
| Secrets | None required; `.env` is git-ignored; CI uses throwaway credentials |
| Scanning | CodeQL (Python + TypeScript) and Dependabot |

Planned in T22: optional `X-API-Key` for write endpoints, rate limit on `/benchmark/scaling`.

To report a problem, open an issue with the `type:bug` label (or contact the maintainers
privately if it exposes data).
