# EARTH-METAMORPHOSIS

**NISAR-based Earth Observation and Change Detection Platform — a frontend-only mission
console: a 3D Cesium globe, a four-stage analysis pipeline (D-SAR-D → Extracting →
Analyzing → Result), and an API-ready service layer that runs end-to-end with no backend.**

> Frontend only. No SAR processing, no machine learning, no backend logic lives in this
> repository. Everything that would come from a server goes through `src/services/`, which
> is currently backed by a deterministic in-repo mock. The contract the backend must
> implement is in [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md).

---

## Features

| Feature               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3D globe**          | Full-screen Cesium viewer loaded at runtime from a CDN (not bundled). Chrome-free scene, basemap swap without rebuilding the viewer, event footprints as polygons or size-derived ellipses, severity-coloured markers, a pulsing AOI marker, picking with hover/select, slow self-centred auto-rotation that suspends while the pointer is over the globe and resumes when it leaves, free 3D navigation (spin, tilt, zoom from 20 m to 60 000 km), double-click / double-tap to zoom in, and a camera telemetry HUD. |
| **Search**            | One box, several grammars: country, region, city or raw coordinates (`23.81, 90.41`, `23.81N 90.41E`, `23.81° N, 90.41° E`). Free text hits `GET /api/search-location`; a coordinate pair is resolved locally with no round trip and never duplicated against a remote hit. Keyboard-first (↑ ↓ Enter Esc).                                                                                                                                                                                                           |
| **Layers**            | Four token-free basemaps — Default (OpenStreetMap), Satellite (Esri World Imagery), Terrain (OpenTopoMap, opts into Cesium World Terrain only when an Ion token is present) and Dark (CARTO). Radio cards, not a dropdown, so the active basemap is always visible.                                                                                                                                                                                                                                                   |
| **Control panel**     | The job definition: location (search result, or one of eight AOI presets — six shown as quick chips), detection mode (7 hazard domains with their extracted classes), observation window (two in-house ISO calendars with inclusive bounds and a live day count), SAR ingest via drag &amp; drop (`.tif .tiff .h5 .nc .zip`, up to 2 GB), and a "Run Analysis" action gated on a valid location and window.                                                                                                           |
| **Events**            | Live detection feed with a 3-up summary (detections / critical / area), detection-type chips, severity chips, a minimum-confidence slider, sorting, refresh, per-card confidence bars, empty/loading/error states, and two-way linking with the globe — hovering a card highlights its footprint and vice versa.                                                                                                                                                                                                      |
| **Comparison slider** | Full-screen before/after swipe. It is **not** two synchronised maps: one Cesium viewer renders both imagery layers and a single `scene.splitPosition` decides the split, so the halves cannot drift, there is one WebGL context, and moving the handle is one uniform write per frame. Draggable, keyboard-nudgeable (← →) and Escape-closable.                                                                                                                                                                       |
| **Analyze pipeline**  | `/analyze?stage=…` with a four-tab pipeline. Each stage renders only what the API reports: the D-SAR-D step cards and processing timeline, the extraction category grid with a dominant-class table, the per-domain risk widgets with sparklines, and the result dashboard. Each downstream request is unlocked by the stage rank, so nothing is fetched before its stage.                                                                                                                                            |
| **Result charts**     | Four chart types over one `ResultDataset` — donut pie, histogram, area/line trend with a reference series, and a bar chart — each with a dark console tooltip, legends, brush zoom on long series, PNG export at 2× and a globe snapshot. `/results` renders all four side by side as a comparative chart pack.                                                                                                                                                                                                       |

Routes: `/` (dashboard), `/analyze` (pipeline), `/results` (visualisation and export).

---

## Tech stack

| Package                 | Version | Role                                                                      |
| ----------------------- | ------- | ------------------------------------------------------------------------- |
| `next`                  | 15.1.6  | App Router (`src/app`), three build targets, `optimizePackageImports`     |
| `react`                 | 19.0.0  | UI runtime                                                                |
| `react-dom`             | 19.0.0  | DOM renderer                                                              |
| `typescript`            | 5.7.3   | `strict: true`; the only build gate (`npm run typecheck`)                 |
| `tailwindcss`           | 3.4.17  | Design tokens in `tailwind.config.ts`; utilities in `src/app/globals.css` |
| `postcss`               | 8.4.49  | CSS pipeline                                                              |
| `autoprefixer`          | 10.4.20 | Vendor prefixing                                                          |
| `zustand`               | 5.0.3   | Client/UI state (`src/store/appStore.ts`, `src/store/toastStore.ts`)      |
| `@tanstack/react-query` | 5.64.1  | All server state, polling and retry policy (`src/hooks/use*.ts`)          |
| `axios`                 | 1.7.9   | HTTP client with one normalised `ApiError` class                          |
| `recharts`              | 2.15.0  | Pie / histogram / line / bar charts                                       |
| `lucide-react`          | 0.469.0 | Icons, via a curated 59-name registry (`src/components/ui/Icon.tsx`)      |
| `date-fns`              | 4.1.0   | Calendar maths for `DateField`                                            |
| `clsx`                  | 2.1.1   | Conditional class names                                                   |
| `tailwind-merge`        | 2.6.0   | Tailwind-aware class merging (`cn()`)                                     |
| `cross-env`             | 7.0.3   | Sets `BUILD_TARGET=static` for the static build on every platform         |

**Cesium is deliberately not an npm dependency.** It is fetched at runtime from a pinned
CDN (`cesium@1.126.0`) by `src/lib/cesium/loader.ts` and cached on `window.Cesium`. That
keeps ~1.4 MB plus its Workers/Assets tree out of the bundle, avoids webpack worker
rewriting, keeps first paint unblocked, and makes the globe a lazily-mounted client
component with a real loading state. Self-hosting is a one-line env change (see
[Troubleshooting](#troubleshooting)).

### Theming

Two themes ship, switchable from the sun/moon button in the header. Every colour resolves
through a CSS variable, so flipping themes is one class on `<html>` and no component branches
on the active theme.

| Token family                    | Dark                             | Light                    |
| ------------------------------- | -------------------------------- | ------------------------ |
| `space-950…600`                 | surfaces, darkest → lightest     | the same ladder inverted |
| `ink`, `ink-muted`, `ink-faint` | light text                       | dark text                |
| `elevate`                       | white (raised / hover / sheen)   | slate                    |
| `hairline`                      | white (borders, dividers)        | slate                    |
| `sunken`                        | a dark well (inputs, chart beds) | a pale well              |
| `on-accent`                     | dark — unchanged in both         | dark                     |

`elevate`, `hairline` and `sunken` exist precisely so components never write `bg-white/6`:
that utility is invisible on a white background. Everything raised says `bg-elevate/6`,
which means the same thing in either theme.

The initial theme is decided **before first paint** by a tiny inline script in `<head>`
(stored choice → `prefers-color-scheme` → dark), so a light-theme user never sees a dark
flash. The store adopts that value on mount and owns it afterwards.

### The space is not themed

The theme governs the **chrome** — sidebar, header, panels and cards. The space around the
globe stays dark in both themes, deliberately:

- The map is a sensor view. A pale backdrop washes out imagery, terrain and the change
  markers, and it read on screen as a grey halo around the planet.
- "Space" is not a surface the interface owns, so it should not change because the UI did.

`applySpaceBackdrop` (`src/lib/cesium/viewer.ts`) therefore takes no theme and is applied once
at viewer creation, along with `createStarfieldSkyBox`. The vignette over the globe follows the
same rule — `--vignette-edge` has the same value in both token blocks.

### Stars

The surrounding space carries a procedural starfield: six 1024² cube faces, ~171 KB in total,
generated by `.tools/make-skybox.py` and installed as a custom Cesium `SkyBox`. Density, tint
and the cross-flares on bright stars are all tunable in that script — re-run it to regenerate
the faces in `public/skybox/`.

The motion is real rather than faked: the skybox is fixed in the inertial frame, so when
auto-rotation turns the camera about the polar axis the whole field sweeps past. Nothing
animates per frame.

### Where CSS is not enough

Two things cannot read the CSS variables:

- the **exported chart PNG** background — painted onto a canvas outside the document, so it
  inherits nothing (`exportBackgroundFor` in `src/lib/chartTheme.ts`);
- the **hardcoded fallbacks** in a few inline SVG `style` props, which the chart layer sets
  explicitly.

Recharts' own plot furniture, by contrast, needs no code at all: Recharts emits colours as SVG
presentation attributes, which cannot read CSS variables, but CSS outranks presentation
attributes — so axes, grid, ticks, legends and tooltips follow the theme from `globals.css`
alone.

Severity and detection-type colours are deliberately **not** themed. They encode data, and a
hazard that is "medium" must not change hue because the interface did.

Design tokens (`tailwind.config.ts`): colours `space`, `accent`, `signal`, `ink`, plus the
theme-aware `elevate`/`hairline`/`sunken`/`on-accent`; shadows `glass`, `glow-accent` (plus
`glow-critical`, `inset`); keyframes `pulse-ring`, `float`, `scan`, `fade-up`, `shimmer`,
`spin-slow`; z-index scale `globe`/`chrome`/`slider`/`overlay`/`toast`.

Runtime requirement: Node.js **>= 18.18.0** (`package.json` `engines`).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # on Windows: copy .env.example .env.local
npm run dev                    # http://localhost:3000
```

The defaults in `.env.example` are already runnable: `NEXT_PUBLIC_USE_MOCK_API=true` means
the whole console works with no backend, and the Cesium CDN needs no token for the shipped
basemaps. Open `/`, pick an AOI in the control panel, press **Run Analysis**, then follow
the pipeline on `/analyze`.

Verification:

```bash
npm run typecheck              # tsc --noEmit — currently exits 0
npm run build                  # server/Vercel build
npm run build:static           # static export for GitHub Pages (absolute paths)
npm run build:preview          # static export for local viewing (relative paths)
npm run preview                # build:preview + serve out/ on :3200
```

---

## Environment variables

Every variable is a `NEXT_PUBLIC_*` build-time value and is therefore inlined into the
client bundle. **None of them is a secret** — do not put credentials here.

| Variable                       | Default / example                                          | Purpose                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`     | _(empty)_                                                  | Base URL of the backend implementing [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md). Empty → axios resolves paths against the page origin; used only when the mock is off. |
| `NEXT_PUBLIC_API_TIMEOUT`      | `20000`                                                    | Request timeout in milliseconds, applied to every request including polls and the multipart upload.                                                                        |
| `NEXT_PUBLIC_USE_MOCK_API`     | `true`                                                     | `true` → deterministic in-repo fixtures, no network. Anything **except the exact string `false`** (including unset) keeps the mock enabled.                                |
| `NEXT_PUBLIC_CESIUM_BASE_URL`  | `https://cdn.jsdelivr.net/npm/cesium@1.126.0/Build/Cesium` | Where the Cesium runtime is fetched from. Point it at `/cesium` (prefixed with the base path) to self-host.                                                                |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | _(empty)_                                                  | Optional Cesium Ion token. Required only for Cesium World Terrain / Ion-backed imagery; without it the globe falls back to open, token-free providers and the ellipsoid.   |
| `NEXT_PUBLIC_BASE_PATH`        | _(empty)_                                                  | Sub-path for GitHub Pages style hosting, e.g. `/earth-metamorphosis`. Drives `basePath` + `assetPrefix` and is also applied to `/public` assets by `assetPath()`.          |

---

## Scripts

| Script                  | Command                                                           | What it does                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | `next dev`                                                        | Development server with HMR.                                                                                                                          |
| `npm run build`         | `next build`                                                      | Standard server build (Vercel / Node host).                                                                                                           |
| `npm run build:static`  | `cross-env BUILD_TARGET=static next build`                        | Static export to `out/` for GitHub Pages, S3 or any file host. Absolute `/_next/...` paths, `trailingSlash: true`, honouring `NEXT_PUBLIC_BASE_PATH`. |
| `npm run build:preview` | `cross-env BUILD_TARGET=static NEXT_RELATIVE_ASSETS=1 next build` | Static export to `out/` with **relative** asset paths and flat `.html` files. Renders from any server root — for Live Server and local inspection.    |
| `npm run preview`       | `npm run build:preview && node .tools/serve-out.mjs 3200`         | Builds the preview export and serves it with correct routing on `http://127.0.0.1:3200/`.                                                             |
| `npm run serve:out`     | `node .tools/serve-out.mjs 3200`                                  | Serves an existing `out/` without rebuilding. Accepts `[port] [root]`.                                                                                |
| `npm start`             | `next start`                                                      | Serves the server build. Not applicable to the static export (serve `out/` with any static server).                                                   |
| `npm run typecheck`     | `tsc --noEmit`                                                    | The type gate for the whole project.                                                                                                                  |
| `npm run test:rotation` | `tsc …rotation.ts && node .tools/rotation-check.mjs`              | Behavioural test for the globe spin — axis, rate, hover suspend/resume, stop, `pauseFor`, gap clamping. 15 assertions, no browser required.           |
| `npm run check:cesium`  | `node .tools/check-cesium-members.mjs`                            | Audits every `cesium.<Member>` in `src/` against the shipped Cesium 1.126.0 definitions; fails on a member that does not exist. Requires network.     |

There is **no** `lint` script: no ESLint configuration or dependency is installed, and
`next.config.mjs` sets `eslint: { ignoreDuringBuilds: true }`. There is no general test
runner — `test:rotation` is a self-contained Node script targeting one module, because that
module has twice regressed.

---

## Deployment

### Vercel / Node host

```bash
npm run build
npm start
```

Set `NEXT_PUBLIC_API_BASE_URL` (and `NEXT_PUBLIC_USE_MOCK_API=false`) in the project's
environment settings. All `NEXT_PUBLIC_*` values are inlined at build time, so changing any
of them requires a rebuild, not just a restart.

### GitHub Pages / static file host

```bash
# PowerShell:  $env:NEXT_PUBLIC_BASE_PATH="/earth-metamorphosis"; npm run build:static
NEXT_PUBLIC_BASE_PATH=/earth-metamorphosis npm run build:static
# publish the contents of out/
```

`NEXT_PUBLIC_BASE_PATH` sets both `basePath` and `assetPrefix`. Because `assetPrefix` is not
applied to absolute `/public` asset references on a static export, the frontend routes every
hard-coded asset through `assetPath()` (`src/lib/utils.ts`) — currently `public/logo.svg` in
`BrandingCard`. If you add a `/public` asset, use `assetPath()` for it. Images are exported
unoptimised (`images: { unoptimized: true }`), which is required for `output: 'export'` and
correct here because all imagery is third-party tile URLs.

The static export has no server, so a relative API base URL (an empty
`NEXT_PUBLIC_API_BASE_URL`) cannot work: set an absolute backend URL, or keep the mock
enabled for a pure demo deployment.

---

## Frontend only — the backend boundary

This repository contains no server-side processing. Concretely:

- **Nothing computes change detection.** The D-SAR-D step list, the extraction classes, the
  risk indices and the result aggregates are all _rendered from API responses_. With the
  mock on, they come from deterministic fixtures (`src/lib/mock/fixtures.ts`); the extracted
  "pipeline" is simulated purely from wall-clock elapsed time so that polling behaves like a
  real long-running job.
- **One service layer owns transport.** No component calls `axios` or React Query directly;
  every request goes through `src/services/apiService.ts`, which returns the same
  `ApiEnvelope<T>` whether it is talking to the mock or to HTTP.
- **The switch is two environment variables.** `NEXT_PUBLIC_USE_MOCK_API=false` plus
  `NEXT_PUBLIC_API_BASE_URL` moves the whole app to the real backend with no component
  change.

**The contract the backend must implement is [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md)** —
11 endpoints, the `{ data, meta }` envelope, the full `ApiError` taxonomy with retryability,
the polling semantics for the two long-running jobs, example request/response JSON for every
route, and a migration checklist. That document also lists the exact places where the mock
deliberately differs from correct backend behaviour (for example, a poll for an unknown job
id returns a synthetic completed job rather than a `404`).

---

## Project structure

```
earth-metamorphosis/
├── docs/                        ARCHITECTURE.md · API-CONTRACT.md · WIREFRAMES.md
├── public/logo.svg              Brand mark, referenced through assetPath()
├── src/
│   ├── app/                     Routes: / · /analyze · /results, plus layout, providers, globals.css
│   ├── components/              Workspace, HeaderBar, Sidebar, panels, GlobeViewer,
│   │                            ComparisonSlider, Analyze views, ResultCharts, ui primitives
│   ├── hooks/                   useMap · useAnalysis · useEvents · useSarData ·
│   │                            useLocationSearch · useMissionSummary · media/debounce helpers
│   ├── lib/                     constants, utils, chartExport, cesium/ (loader, viewer, entities), mock/
│   ├── services/                apiClient · endpoints · apiService — the whole transport surface
│   ├── store/                   appStore (mission/UI) · toastStore (notifications)
│   └── types/index.ts           The domain model shared by the UI and the API contract
├── next.config.mjs              Three build targets, basePath/assetPrefix, optimizePackageImports
└── tailwind.config.ts           Design tokens
```

The full architecture — the layered import rules, the component hierarchy, the
Zustand/React-Query split with every query key and polling constant, the Cesium
globe implementation, the analysis stage ladder, and the responsive, performance and
accessibility strategies — is documented in
**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**. Screen-by-screen ASCII wireframes with
region callouts are in **[`docs/WIREFRAMES.md`](docs/WIREFRAMES.md)**.

---

## Troubleshooting

### "Go Live" on a source file renders an unstyled page

The source tree has no `index.html`, so pointing Live Server at a source file has nothing to
serve. The unstyled-HTML symptom itself is explained in
[Viewing the build locally with Live Server](#viewing-the-build-locally-with-live-server)
above — the short version is that `npm run build:static` writes absolute asset paths, and
Live Server must then use `out/` as its root. `npm run build:preview` removes that constraint.

Why the GitHub Pages export behaves this way, each point verifiable in this repository:

1. **The source tree contains no `index.html`.** A recursive search for `*.html` across `src/`
   returns nothing. Routes live in `src/app/page.tsx`, `src/app/analyze/page.tsx` and
   `src/app/results/page.tsx`; Next.js generates the HTML from them.
2. **Tailwind is compiled at build time.** All utility classes are emitted into
   `out/_next/static/css/<hash>.css` (in dev, inside `.next/`). Serve the source folder and
   that file does not exist, so nothing is styled.
3. **That export uses absolute asset paths** — literally `/_next/static/css/<hash>.css`, with a
   leading slash. If Live Server's root is `out/results/` (because you opened
   `out/results/index.html`), the browser requests `out/results/_next/...`, gets a 404, and
   renders unstyled markup. JavaScript 404s too, which is why such a page also reports empty
   states like "No results to visualise".

### Viewing the build locally with Live Server

There is **no `index.html` in the source tree** — this is a Next.js app, so the HTML is
generated. Live Server must serve a _built_ folder, and which build you use decides whether it
works:

```bash
npm run build:preview     # relative asset paths + flat .html files
```

That export references its assets relatively (`./_next/...` instead of `/_next/...`), so the
folder renders identically no matter which directory the server treats as its root. Right-click
`out/index.html` → **Open with Live Server** and it works with no configuration at all, even if
Live Server ignores `liveServer.settings.root`.

By contrast the GitHub Pages build (`npm run build:static`) writes absolute `/_next/...` paths
and `page/index.html` directories. Pressing "Go Live" on a _subpage_ of that export — say
`out/results/index.html` — makes Live Server use `out/results/` as its root, so every
`/_next/...` request resolves to `out/results/_next/...`, 404s, and you get bare unstyled HTML
with empty states. The committed `.vscode/settings.json` pins `liveServer.settings.root` to
`/out` to prevent that.

Two caveats for either build:

- `out/` is a build artifact. Edits under `src/` will not appear until you rebuild.
- Cross-page navigation (the Dashboard / Analyze / Results links) needs a host that maps
  `/analyze` to `analyze.html`. `npm run preview` does; GitHub Pages does. Live Server may not —
  open `http://<host>/analyze.html` and `/results.html` directly if a nav click 404s.

The zero-friction option, which builds and serves in one command with correct routing:

```bash
npm run preview           # build:preview + static server on http://127.0.0.1:3200/
```

For development, still use the dev server — it has HMR and needs no build step:

```bash
npm run dev               # http://localhost:3000
```

In VS Code, `Ctrl+Shift+B` runs the dev server as the default build task.

### The globe does not load (Cesium CDN blocked, or an air-gapped network)

The viewer shows "Globe unavailable" with the exact fetch error and a **Retry globe** button.
The rest of the console — panels, filters, search, analysis — keeps working; the error copy
says so explicitly.

Self-host the runtime instead of using the CDN:

1. Obtain the Cesium **1.126.0** browser distribution. Note that `cesium` is intentionally
   _not_ in `package.json`, so `node_modules/cesium` does not exist in a fresh clone — either
   download the release archive for 1.126.0 and extract it, or install it out-of-band (for
   example `npm i -D cesium@1.126.0`) purely to get `Build/Cesium`.
2. Copy `Build/Cesium` (the whole directory: `Cesium.js`, `Workers/`, `Assets/`, `Widgets/`)
   to `public/cesium`. The build keeps it out of the bundle and serves it verbatim;
   `/public/cesium` is already in `.gitignore`, so the copy is not committed.
3. Point the loader at it:

```bash
# .env.local — prefix with NEXT_PUBLIC_BASE_PATH for sub-path deployments
NEXT_PUBLIC_CESIUM_BASE_URL=/cesium
```

The loader injects `<script src="{base}/Cesium.js">` and
`<link href="{base}/Widgets/widgets.css">` and sets `window.CESIUM_BASE_URL`, so Cesium
resolves its own Workers/Assets relative to that directory. Nothing else changes. The
version is pinned in `src/lib/cesium/loader.ts` (`CESIUM_VERSION`) — bump it deliberately and
re-run the smoke test, and keep the self-hosted copy in step with it.

If the runtime loads but the globe has no terrain or imagery detail, that is the missing Ion
token: `NEXT_PUBLIC_CESIUM_ION_TOKEN`. The token-free basemaps and the ellipsoid terrain are
the intended default; World Terrain is only attached when a token exists.

### The app shows "Analysis service unreachable" / "Request timed out"

These are the two retryable transport failures, and the error panel always prints the exact
`code`:

| Message                        | Code                                                    | Usual cause                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Analysis service unreachable" | `NETWORK_OFFLINE`                                       | No response at all — wrong `NEXT_PUBLIC_API_BASE_URL`, the backend is down, a CORS rejection, or the machine is offline. A CORS misconfiguration is indistinguishable from being offline on the client. |
| "Request timed out"            | `TIMEOUT`                                               | No answer within `NEXT_PUBLIC_API_TIMEOUT` ms (default 20 000).                                                                                                                                         |
| "Invalid request"              | HTTP `400` / `422`                                      | The backend rejected the payload; the message is whatever the API returned.                                                                                                                             |
| "Something went wrong"         | `HTTP_<status>`, `UNEXPECTED`, `MOCK_SIMULATED_FAILURE` | Everything else — check the printed `code`.                                                                                                                                                             |

Queries are retried automatically only for retryable failures (offline, timeout, `408`,
`429`, `5xx`), at most twice, with exponential backoff up to 8 s. Mutations are never
retried. If the API is unreachable and you only want to demo the UI, set
`NEXT_PUBLIC_USE_MOCK_API=true` and restart.

### Demoing error and loading states without a backend

The mock transport simulates failures. Add the token **`__fail`** to a request parameter and
the call rejects with a realistic `ApiError`:

```
code:    MOCK_SIMULATED_FAILURE
status:  503
message: The analysis service rejected this request (simulated upstream failure).
         Retry or clear the "__fail" token.
details: { endpoint, params }
```

Type something containing `__fail` into the **location search box** to trigger it — you will
see the search dropdown render its "Location search failed" branch, and the error still
reports the standard code/status pair. Loading states need no setup at all: every mock
response carries artificial latency (180–520 ms per endpoint, plus up to 160 ms jitter) so
skeletons and spinners are genuinely visible, and the simulated pipeline advances over
4 × 3.4 s while the mock ingest takes 5 s.

**Coverage:** the `__fail` token reaches every mock endpoint. Each call site in
`src/services/apiService.ts` forwards its parameters to the mock transport so the check can
fire; list examples rather than one. The multipart upload bypasses the transport wrapper, so
`uploadSarDataset` applies the same check by hand — name a file `__fail.tif` to exercise the
upload error branch. There is no header-based alternative; the token is the only hook.

### `npm run typecheck` catches what a build would

There is no linter. If a change looks fine in the browser but breaks the build, run
`npm run typecheck` — `tsc --noEmit` under `strict: true` is the project's gate, and a few
files carry `eslint-disable` comments that are currently inert.
