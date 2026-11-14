# RELIC-X frontend

Owner: **A — Arvind**. React 18 + TypeScript + Vite; tests with Vitest + React Testing Library.
The app shell (routing, layout, theme, API client with mock mode) is in place; the real pages are built in
T23–T28 (see [planning/WORKFLOW.md](../planning/WORKFLOW.md) and [ROLE_A_FRONTEND.md](../planning/roles/ROLE_A_FRONTEND.md)).

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /api to http://localhost:8000; backend must be running)
npm run dev:mock     # same UI on mock data — no backend needed
npm test             # Vitest + React Testing Library
npm run test:coverage
npm run lint         # ESLint        (npm run format / format:check for Prettier)
npm run typecheck
npm run build
npm run gen:types    # regenerate src/api/schema.d.ts from the running backend (never edit it by hand)
```

## Environment variables

| Variable | Read by | Default | Purpose |
|---|---|---|---|
| `VITE_USE_MOCKS` | app | `false` | `true` serves every API call from `src/api/mocks` instead of `fetch`. `npm run dev:mock` sets it via `.env.mock`. |
| `VITE_MOCK_LATENCY_MS` | app (mock mode) | `350` | Simulated latency so loading states are visible. Tests set it to `0`. |
| `VITE_API_BASE` | app | empty | Origin prepended to `/api/v1`. Leave empty to use relative URLs (works behind the dev proxy and nginx). |
| `VITE_API_PROXY` | `vite.config.ts` | `http://localhost:8000` | Where the dev server proxies `/api`. |

See [.env.example](.env.example). The frontend only ever talks to `/api/v1`.

## Testing

Vitest + React Testing Library (jsdom). Tests live next to the code (`*.test.ts(x)`); shared helpers are in
`src/test/` and are never part of the build.

```bash
npm test                 # run once
npm run test:watch       # watch mode
npm run test:coverage    # run once + coverage (text and lcov in coverage/)
npx vitest run src/routes.test.tsx -t "retries"   # one file / one test
```

Isolation is automatic: spies, stubbed globals and stubbed env vars are undone after every test, the mock API
(data, overrides, call log) and `localStorage` are reset, and mock latency is 0. Tests must not use the real
network or depend on order. Query by role / label / text, not by implementation details.

### Helpers (`src/test/`)

| Helper | Use |
|---|---|
| `renderWithProviders(ui, { route, path })` | Renders inside `MemoryRouter` + `ThemeProvider`. Give `path` (e.g. `"/artifacts/:id/graph"`) when `ui` reads `useParams`. Render `<AppRoutes />` to test whole pages with the layout. |
| `mockApi` / `useMockApi()` | Switches the API client to mock mode for the test, then overrides single endpoints: `respond(method, path, data, { delayMs })` (use `[]` for an empty state), `fail(method, path, status, code, message, details)` for a CONTRACT §4 error, `calls(method, path)` to see what was requested. Unmocked endpoints serve the seeded data. |
| `fixtures` | CONTRACT §6 payloads built from the same generators as the mocks: `artifactFixture()`, `fragmentsFixture()`, `matchesFixture()`, `matchSummaryFixture()`, `graphFixture()`, `explanationFixture(a, sideA, b, sideB)`, `runFixture(algorithm)`, `ARTIFACT_ID`. |

```tsx
import { screen } from "@testing-library/react";
import { ARTIFACT_ID, fragmentsFixture } from "../test/fixtures";
import { mockApi, useMockApi } from "../test/mockApi";
import { renderWithProviders } from "../test/renderWithProviders";
import GalleryPage from "./GalleryPage";

describe("GalleryPage", () => {
  useMockApi(); // mock mode on, everything reset after each test

  const route = `/artifacts/${ARTIFACT_ID}/gallery`;
  const path = "/artifacts/:id/gallery";

  it("shows the fragments", async () => {
    mockApi.respond("GET", `/artifacts/${ARTIFACT_ID}/fragments`, fragmentsFixture());
    renderWithProviders(<GalleryPage />, { route, path });
    expect(await screen.findByAltText("F01")).toBeInTheDocument();
  });

  it("shows the error state with the API's code", async () => {
    mockApi.fail("GET", `/artifacts/${ARTIFACT_ID}/fragments`, 404, "not_found", "artifact not found");
    renderWithProviders(<GalleryPage />, { route, path });
    expect(await screen.findByRole("alert")).toHaveTextContent("not_found");
  });
});
```

`src/smoke.test.tsx` renders the whole app in mock mode and clicks through Projects → Gallery → Graph →
Reconstruct → Lab; any `console.error` or `console.warn` fails it, so new pages that warn will break it.

### Lint, format, coverage

ESLint (typescript-eslint, react-hooks, testing-library, jest-dom) and Prettier (`printWidth` 120). The generated
`src/api/schema.d.ts` is excluded from lint, format and coverage. Coverage has a starting floor of **70 % lines** on
`src/api` and `src/components` (see `vite.config.ts`); ratchet it up as the pages (T23–T28) land with their tests.

### What CI checks

The `frontend` job in `.github/workflows/ci.yml` (Node 20, npm cache, `VITE_USE_MOCKS=true`) runs, in order:
`npm ci` → `npm run lint` → `npm run format:check` → `npm run typecheck` → `npm run test:coverage` → `npm run build`,
then uploads `frontend/coverage` as the `frontend-coverage` artifact. Run the same commands locally before pushing.
Branch protection (T02, owned by B) must list the check named **Frontend · lint + type-check + tests + build (Node 20)**
as required; the job was renamed from "Frontend · type-check + tests + build (Node 20)", so update it there if it
was already added.

## Layout

```text
src/
  routes.tsx            route table (/, /artifacts/:id/{gallery,graph,reconstruct}, /lab, *)
  theme.tsx             light/dark provider (data-theme on <html>, persisted in localStorage)
  styles.css            design tokens (bead colours, status colours, surface, border) + base styles
  api/
    client.ts           api() wrapper + typed helper per endpoint; mock mode switch
    errors.ts           ApiError (CONTRACT §4 shape)
    sides.ts            sideIndexToLetter / sideLetterToIndex (0=N,1=E,2=S,3=W)
    types.ts            types for endpoints the OpenAPI spec leaves untyped
    schema.d.ts         GENERATED by `npm run gen:types` — do not edit
    mocks/              data.ts (seeded payloads from CONTRACT §6) + index.ts (router, errors, latency)
  components/           Loading, EmptyState, ErrorState (reused by every page), layout/
  hooks/useAsync.ts     loading/success/error state for a promise
  test/                 test helpers (renderWithProviders, mockApi, fixtures); not part of the build
  pages/                placeholder pages (replaced by T23–T28)
```

## Mock mode

Two artifacts are available: **Mughal tile panel** (4×4, matched, one greedy run) and
**Pottery band (unmatched)** (4×4, not matched — `matches`, `graph`, `explain` and `runs` return
`409 precondition_failed` until `matchArtifact` is called). Unknown ids return `404 not_found`;
bad input returns `422`. Uploads are not available in mock mode. Call `resetMocks()` from
`src/api/mocks` to restore the initial data.
