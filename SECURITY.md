# Security

Owner: **B — Bhumi**

RELIC-X is a single-user lab with no login. Run it locally or on a trusted network; for a shared or public
instance, set `RELICX_API_KEY` (below).

| Area | Protection |
|---|---|
| Uploads | Size limit (`RELICX_MAX_UPLOAD_MB`), format allow-list (PNG/JPEG/WebP/BMP), `PIL.verify()`, decompression-bomb pixel cap |
| File storage | All paths are resolved under the storage root; path traversal is rejected |
| Database | ORM-parameterised queries only; integrity enforced by CHECK / UNIQUE / FK constraints |
| CORS | Explicit origin allow-list (`RELICX_CORS_ORIGINS`) |
| Errors | Uniform error body; stack traces are logged with a request ID, never returned |
| Write protection (T22) | Optional `RELICX_API_KEY`: every POST/DELETE under `/api` needs a matching `X-API-Key` header (compared in constant time), otherwise 401. GETs stay open. Off by default |
| Rate limit (T22) | Token bucket on `/benchmark/scaling` and `/benchmark/scaling.csv`: `RELICX_SCALING_RATE_PER_MIN` per client (default 10), then 429 with `Retry-After` |
| Resource limits | `RELICX_MAX_FRAGMENTS`, backtracking `node_limit`, scaling experiment size cap, `RELICX_JOB_WORKERS` background threads |
| Secrets | None required; `.env` is git-ignored; CI uses throwaway credentials |
| Scanning | CodeQL (Python + TypeScript) and Dependabot |

Known limits:
- The rate limiter is in memory and per process; several API replicas each keep their own buckets.
- Behind the bundled nginx every request reaches the API from nginx's address, so the scaling limit is shared by
  all clients together. That is acceptable for a lab; a public deployment should limit per client at the proxy.
- The API key is a single shared secret (no users or roles). Serve over HTTPS so it is not sent in clear text, and
  never put it in the frontend bundle of a public site.

To report a problem, open an issue with the `type:bug` label (or contact the maintainers
privately if it exposes data).
