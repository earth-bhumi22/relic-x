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
| `VITE_MAX_UPLOAD_MB` | app | `15` | Client-side upload cap (MB) for the create wizard. Keep equal to the server's `RELICX_MAX_UPLOAD_MB`. |
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
(data, overrides, call log) and `localStorage` are reset, and mock latency is 0. Real mode is the default in every test regardless of
`VITE_USE_MOCKS` in your shell or CI; opt in to mock mode with `mockApi.enable()` / `useMockApi()`. Tests must not use the real
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

## Pages

### Projects (`/`, T23)

`src/pages/ProjectsPage.tsx` lists artifacts as cards (thumbnail with fallback, name, description, source badge, grid,
fragment count, runs, best accuracy or "—", ground-truth indicator, created date) with **Open** (to
`/artifacts/:id/gallery`) and **Delete** (accessible confirmation dialog; the card is removed only on success). It asks
the API for `limit=24` pages ordered newest first and offers **Load more** when a full page came back.

**New artifact** opens `ArtifactWizard`, a three-step modal (focus trapped, Esc closes, focus returns to the trigger):

1. **Source**: a bundled *sample* (`POST /artifacts/sample`, JSON), an *uploaded image* (`POST /artifacts/upload`,
   multipart with `params` as a JSON string) or *real fragments* (`POST /artifacts/fragments-upload`, repeated `files`,
   no ground truth; the grid must have one cell per image).
2. **Parameters** (sample/upload): rows, columns, rotate, noise, erosion, missing, seed. Defaults and limits live in
   `src/lib/artifactForm.ts` only (a test pins the defaults to the generated OpenAPI ones). Noise is capped at 30 because
   the server rejects more, even though the OpenAPI text says "0-255".
3. **Review and create**: name (required, trimmed, at most 120), optional description, summary.

On success the wizard closes and navigates to the new artifact's gallery. Server errors keep the wizard open with the
input intact: `validation_error` field messages appear next to their fields, `payload_too_large` shows the size limit,
anything else (including a network failure) shows code and message with a Retry button. The wizard never runs matching:
the gallery works straight away, but the graph and reconstruction pages need `POST /artifacts/{id}/match` first (the
API answers 409 `precondition_failed` until it has run).

**States worth capturing for the user guide (T44):** list loading; empty state with "Create your first artifact"; list
error with Retry; the card grid at 1280 px and 360 px in both themes; a card with and without ground truth and with "—"
accuracy; the delete confirmation and its error; wizard step 1 for each source (sample thumbnails, image preview, fragment
previews); step 2 with validation messages; step 3 while submitting; a 422 field error and a 413 message.

### Fragment gallery (`/artifacts/:id/gallery`, T24)

Header (artifact name, grid, counts, links to Graph / Reconstruct / back to Projects), the **matching panel**, and a
grid of fragment tiles. Tiles are buttons; the order is a deterministic shuffle seeded by the artifact id ("scrambled
pieces"), with a **Sorted by label** toggle. **Show ground truth** reveals true cell and scramble rotation (tiles and
dialog); uploaded fragments show "No ground truth (uploaded fragments)". Selecting a tile opens the fragment dialog and
puts `?fragment=F07` in the URL, so a fragment can be linked; Esc / Close returns focus to the tile.

The dialog shows the image with N / E / S / W (clockwise) around it, four **edge bead strips**, an optional numeric
strip row (`GET /fragments/{id}`, the colour before quantising) and metadata.

- **`EdgeBeads`** (`components/EdgeBeads.tsx`), reusable by T25/T26: props `edge`, `reversed`, `highlight`
  (`[{from, to, kind}]`, `to` exclusive, indices in the string as given), `size` (`sm|md|lg`), `label`, `side`
  (outline colour from `--bead-*`), `levels`, `showSymbols`. `StripSwatches` draws a numeric strip.
- **Symbol → colour** (`lib/beads.ts`) decodes exactly what `features.quantize` encodes: `index = (qR·L + qG)·L + qB`,
  `symbol = ALPHABET[index]`, and a bead shows the bucket centre `(q + ½)·256/L` (L = 4: 32 / 96 / 160 / 224).
  `lib/beads.test.ts` checks it against symbols produced by the real backend function.
- **Matching panel / prompt** (`components/MatchPanel.tsx`, `hooks/useMatchStatus.ts`): shows "Not matched yet" or the
  stats, runs `POST /artifacts/{id}/match` (advanced: `strip_len`, `levels`, `top_k`, `allow_rotation`). Other pages
  should use `isPreconditionFailed(error)` and render `<MatchRequired artifactId onMatched />` instead of a dead 409.

**States worth capturing for the user guide (T44):** gallery loading; shuffled grid; sorted grid; empty fragments; 404
artifact; matching panel "Not matched yet" / running / matched with stats / failed; fragment dialog with four bead
strips (light and dark, 360 px and 1280 px); numeric strips shown; ground truth shown; ground truth missing (uploaded
fragments); a deep link (`?fragment=F07`).

### Similarity graph (`/artifacts/:id/graph`, T25)

Lazy-loaded at route level (`React.lazy`), so Cytoscape 3.33.1 (the only graph library; types bundled) lives in its own
chunk. Data comes from `GET /graph` (`threshold`, `top_k`, `traversal`); a 409 shows the matching prompt, which runs
matching and reloads the graph.

- **Controls:** threshold slider (0–1, step 0.01, plus an editable number; default 0 = the API default), top-k (off, or
  an integer 1–16; below 1 is blocked client-side), BFS | DFS, a ground-truth hint toggle and a BFS-vs-DFS compare.
  Changes are debounced (250 ms), stale responses are ignored, and the previous graph stays visible with a busy badge.
- **Canvas** (`components/graph/GraphCanvas.tsx`, a thin adapter): node label = fragment label, colour = component
  (`COMPONENT_PALETTE` in `lib/graphView.ts`, Okabe–Ito based; also in the tooltip and legend), edge width/opacity =
  weight, edge colour = `true_neighbours`. `cose` layout with `randomize: false`, re-run only when the topology changes.
- **Traversal:** visit-order numbers on nodes and in a list; Step / Play / Show all / Reset; `prefers-reduced-motion`
  jumps to the final state.
- **Selection:** click a node (incident edges + neighbours with weights) or an edge, in the canvas or the accessible
  **edge table** (sortable by weight, filterable by node). An edge yields `MatchSelection
  {a, sideA, b, sideB}` (labels + integer sides via `sideLetterToIndex`), exposed through the `onSelectMatch` prop and
  the URL `?why=F03:E:F11:W`. A card with a disabled "Why matched?" button waits for T26.
- **Tests:** page logic runs against a stubbed canvas; `GraphCanvas.test.tsx` mounts real Cytoscape headless
  (`headless` defaults on in test mode because jsdom has no canvas).

**States worth capturing (T44):** the same artifact at three thresholds (0, 0.6, 0.95); top-k 1; BFS vs DFS compare;
step mid-play; node and edge selected; the edge table; empty state; the 409 prompt; error with retry; light and dark at
360 px and 1280 px.

### "Why matched?" drawer (`components/WhyMatchedDrawer.tsx`, T26)

Not a route: a side panel (full-width sheet at 360 px) any page can mount with only `artifactId` and `match`:

```tsx
<WhyMatchedDrawer artifactId={id} match={{ a: "F03", sideA: 1, b: "F11", sideB: 3 }} onClose={...} />
```

`match` is a `MatchSelection` (labels, integer sides 0–3; `null` renders nothing). It calls `GET /explain` through
`useAsync` (re-fetched when the match changes, stale responses ignored) and shows: header (`F03 · E ↔ F11 · W`, composite,
ground-truth badge), both edges as aligned bead strips (edge B **reversed**, with the reason), a stacked **weighted score
bar** with a `score × weight = contribution` table, and one section per signal: colour swatches, LCS (highlighted beads
plus SVG connector lines), edit-operation cells (`=` `≠` `+` `−`, not colour-only), shared motif with KMP vs Rabin-Karp
operation counts, and hash overlap (Jaccard bar, safe for an empty union). It is built on `Modal` (focus in and back,
Esc and backdrop close, page scroll locked without a layout shift). States: skeleton, 409 → `MatchRequired`, 404, 422,
generic error with retry, and an error boundary for a payload it cannot draw.

- **On the graph page** the selection lives in `?why=F03:E:F11:W`: choosing an edge opens the drawer, closing removes the
  parameter, and a link reopens it.
- **Signal order and colours** are defined once in `lib/signals.ts` (`SIGNALS`: colour, lcs, edit, motif, hash) with
  `--sig-*` tokens for both themes and a fill pattern each; T28 should reuse them.
- LCS pairs are `[i, j]`, `i` indexing `edge_a` and `j` indexing `edge_b_reversed` (checked against the backend).

**States worth capturing (T44):** a true-neighbour match and a false match side by side; LCS connectors; the edit strip;
a motif of length 0; the score bar; the 409 prompt, loading skeleton and error states; 360 px sheet and 1280 px panel in
both themes.

### Reconstruction canvas (`/artifacts/:id/reconstruct`, T27)

Run a solver, replay its trace, see how sure each placement is, and (optionally) compare with the ground truth.

- **Run controls** (`components/run/RunControls.tsx`, rules in `lib/solvers.ts`): algorithm picker with a one-line
  description and complexity each; `threshold` (0–1), `top_k` (1–16 or empty) and, for backtracking only, `node_limit`
  (100–2,000,000, default 5000 so a synchronous run stays short). Validated against the API bounds; server 422s are
  mapped back onto the fields. `createRun` only gets `node_limit` for backtracking.
- **Swappable solver call** (`lib/runSolver.ts`): the page only calls `runSolver(artifactId, request, {signal,
  onProgress})`. It is a synchronous `POST /runs` today (indeterminate busy state, Cancel via `AbortController`; the
  server may still finish the run). When T20's async jobs land (`POST /artifacts/{id}/jobs`, poll `GET /jobs/{id}`
  about every second, CONTRACT §5.1), replace that one function body.
- **History** (`RunHistory`): newest first; open a run (`?run=<id>` in the URL, so it can be shared and compared by
  switching), delete one (`deleteRun`). A 404 run or artifact has its own message.
- **Canvas** (`components/ReconstructionCanvas.tsx`): a CSS grid sized from the placements (never the artifact grid),
  tiles rotated `rot × 90°` clockwise (CONTRACT D13). Fragments missing from the layout go to a tray with a count.
- **Confidence rings** (`lib/confidence.ts`): the mean composite score (from `listMatches`) of a tile's joins with its
  currently placed neighbours; unscored joins count as 0, a lone tile shows "—". Bands: low < 0.40 (dotted red),
  medium < 0.70 (dashed amber), high ≥ 0.70 (solid green). The number is on every tile, in the hover / focus text and in the
  placements table, so colour is never the only signal.
- **Trace player** (`components/TracePlayer.tsx`, replay in `lib/replay.ts`): play / pause, step, jump, scrubber, 0.5×–4×,
  keyboard (Space, ←, →, Home, End on the focused player), reduced-motion safe, no timer leaks. Every frame is derived from
  `stepIndex`; the message is shown with the action as a badge.
- **Trace coordinates** are solver-internal (the seed is at (0,0); cells can be negative). The shift is derived as
  `placement − trace` coordinates and must be identical for every fragment. A backtracking trace or a capped trace
  (`trace_dropped`) cannot rebuild the final layout, so the replay plays the recorded steps and then jumps to the final
  layout with a notice ("trace truncated: N steps not recorded"). If nothing lines up, only the final layout is drawn.
- **Ground-truth overlay** (`lib/truth.ts`, off by default, disabled with an explanation without ground truth): tiles are
  classified by their true neighbours, so a layout shifted or turned as a whole is still correct (symbols ✓ ◐ ✗ as well as
  colour). Lists the wrongly placed fragments, the best global alignment and a ground-truth picture.
- **Mock mode** serves all four algorithms with traces shaped like the real ones (negative internal coordinates, a
  conflict, a fallback, backtrack steps, a capped `node_limit < 1000` run with `trace_dropped` and `truncated`), a history that
  grows, `DELETE /runs/{id}`, and 409 until the artifact is matched.

### Lab / benchmark (`/lab`, T28)

Two tabs (`?tab=benchmark|scaling`, accessible tabs with ←/→/Home/End; both stay mounted so a form is not lost). The page
is lazy-loaded, so **Recharts 2.15.4 (pinned, the only chart library) ships only in the Lab chunk** (about 434 kB, 121 kB gzip;
the main bundle is unchanged).

- **Benchmark an artifact** (`components/lab/BenchmarkPanel.tsx`): artifact picker (`?artifact=<id>` in the URL; an empty
  state links to Projects; an unknown id says "not found"), algorithm checkboxes (all four, at least one), `node_limit`
  (100–2,000,000, default 5000, only used for backtracking; warns above 100,000). It sends **one `POST /benchmark` per
  algorithm** in order, because the real endpoint is all-or-nothing and this gives a genuine partial failure (the other
  results still show, the failed one is listed), plus a progress line. Cancel aborts the waiting (the server may still
  finish). A 409 shows the match prompt and re-runs after matching; 422s are mapped onto the fields.
  The sortable table (`BenchmarkTable.tsx`) shows time, total operations (the per-counter breakdown expands), score,
  accuracies and `truncated`; `null` reads "—"; the best value per column carries a ★ and "best" for screen readers.
  Four grouped-bar charts follow (time, operations with a log toggle, score, accuracy). A truncated backtracking run is
  dashed, marked with `*` and explained: "node limit reached: best found, optimality not guaranteed". A plain-language
  reading is computed from the numbers (`readResult` in `lib/labData.ts`).
- **Scaling: time vs n** (`ScalingPanel.tsx`): sample (default `mosaic-tile`), sizes (1–7 values, each 2–8, default
  3, 4, 5, 6), algorithms, rotate, noise (0–30), erosion (0–1), `node_limit` (100–500,000, default 50,000). The call is
  long: the busy state shows elapsed seconds, Cancel stops waiting, sizes of 7+ warn, and any error shows with a retry (never
  a blank chart; a 429 from the server's rate limit shows its message). Charts: time, operations and direct accuracy against n,
  with **log-y / log-x toggles**, gaps (not zeros) for missing points, hollow markers for truncated points, and an optional
  least-squares fit on log-log (`y ≈ c·n^k`, with R²) computed from the displayed non-truncated points and labelled as a
  fit. The match stage is a table.
- **The two `operations` shapes**: a `RunDetail.operations` is an object of counters; a scaling point's `operations` is
  already one number. `totalOperations()` in `lib/labData.ts` is the single place that converts.
- **Charts** (`components/charts/`): one palette and label set (`--alg-*` tokens, read with `getComputedStyle` and passed to
  Recharts, re-read on a theme change); colour is never alone (marker shape, dash and a text legend); every chart has a
  collapsed data table as its text alternative and sits in an error boundary. Tests render charts at a fixed size
  (`chartSize` / `fixedSize`) because jsdom cannot measure a responsive container.
- **CSV export** (`lib/csv.ts`): generated **in the browser** from exactly what is on screen. `toCsv(rows, columns)` is
  RFC 4180 (CRLF, quoting of `,` `"` newlines), writes `null` as an empty cell and prefixes a leading `= + - @` (or tab / CR)
  with `'`. File names: `relicx-benchmark-<artifact>-<YYYY-MM-DD>.csv`, `relicx-scaling-<sample>[-rotated]-<date>.csv`.
  The download is a Blob + object URL, revoked afterwards. **One-line switch to the server's T21 endpoints:** change
  `CSV_SOURCE` in `lib/csv.ts` (`benchmark: "server"`, `scaling: "server"`); `downloadCsv(req, source)` is the only
  function the panels call. Columns (identical to the server CSVs):
  - benchmark: `algorithm, run_id, created_at, elapsed_ms, operations_total, total_score, neighbour_accuracy, direct_accuracy, coverage, truncated, search_nodes, conflicts, node_limit, threshold, top_k`
  - scaling: `size, n, algorithm, elapsed_ms, operations, total_score, neighbour_accuracy, direct_accuracy, coverage, truncated, match_accuracy, match_elapsed_ms`
- **Mock mode**: all four algorithms; backtracking truncated at a small `node_limit`; a scaling response whose time grows with n
  (backtracking steeply, truncated at larger sizes) with the real bounds and defaults; `null` accuracies for an artifact
  without ground truth; 409 until matched; and a deliberately slow scaling call (latency × 8 × sizes) so the busy state and
  Cancel can be exercised.

**States worth capturing (T44):** the benchmark table with a truncated backtracking run and the best-value stars; the scaling
chart in log-y with the fit shown; the scaling busy state with Cancel; the 409 prompt; a partial failure; the empty states;
360 px and 1280 px in both themes.

## Layout

```text
src/
  routes.tsx            route table (/, /artifacts/:id/{gallery,graph,reconstruct}, /lab (lazy), *)
  theme.tsx             light/dark provider (data-theme on <html>, persisted in localStorage)
  styles.css            design tokens (bead colours, status colours, surface, border) + base styles
  api/
    client.ts           api() wrapper + typed helper per endpoint; mock mode switch
    errors.ts           ApiError (CONTRACT §4 shape)
    sides.ts            sideIndexToLetter / sideLetterToIndex (0=N,1=E,2=S,3=W)
    types.ts            types for endpoints the OpenAPI spec leaves untyped
    schema.d.ts         GENERATED by `npm run gen:types` — do not edit
    mocks/              data.ts (seeded payloads from CONTRACT §6) + index.ts (router, errors, latency)
  components/           Loading, EmptyState, ErrorState (reused by every page), Modal, ArtifactCard, ArtifactWizard,
                        DeleteArtifactDialog, EdgeBeads, FragmentDialog, MatchPanel, layout/
  hooks/useAsync.ts     loading/success/error state for a promise
  test/                 test helpers (renderWithProviders, mockApi, fixtures); not part of the build
  pages/                ProjectsPage (T23), GalleryPage (T24), GraphPage (T25) and ReconstructPage (T27) and LabPage (T28, lazy-loaded with Recharts) are real, with the T26 drawer mounted on the graph page
  lib/artifactForm.ts   wizard parameter defaults, limits, validation, formatting (pure, unit tested)
  lib/beads.ts, shuffle.ts   symbol → colour (mirrors backend quantize), seeded shuffle
```

## Mock mode

`GET /fragments/{id}` returns numeric strips; `POST …/match` validates `strip_len` 8–96, `levels` 2–4, `top_k` 1–64 like the backend and updates the artifact's `match_stats`.

Two artifacts are available: **Mughal tile panel** (4×4, matched, one greedy run) and
**Pottery band (unmatched)** (4×4, not matched — `matches`, `graph`, `explain` and `runs` return
`409 precondition_failed` until `matchArtifact` is called). Unknown ids return `404 not_found`;
bad input returns `422`. Created artifacts (sample, uploaded image, real fragments) and deletes persist for the
session and show up in later list calls. Uploads are not stored: the mock keeps only metadata and generates SVG
thumbnails. Create names that trigger errors by hand: `fail-422` (validation_error on `name`), `fail-413`
(payload_too_large), `fail-500` (internal_error); a non-image file gives 422 and a file over 15 MB gives 413. Call `resetMocks()` from
`src/api/mocks` to restore the initial data.
