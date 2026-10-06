# EARTH-METAMORPHOSIS — Frontend Architecture

> Documentation snapshot: written against the frozen `src/` tree (80 files) at the
> time of writing. Every claim below is traceable to a file in this repository.
> Anything described as planned/absent is called out explicitly in
> [Known gaps](#12-known-gaps).

---

## 1. Product framing

EARTH-METAMORPHOSIS is the frontend of a NISAR-based Earth Observation and Change
Detection platform: a full-screen mission console in which an analyst defines an
area of interest and an observation window, dispatches a four-stage change-detection
pipeline (D-SAR-D → Extracting → Analyzing → Result), watches detections accumulate on
a 3D Cesium globe, and reads the aggregated result as charts and tables. The
application contains **no** SAR processing, no machine learning and no backend logic —
every value that would come from a server is fetched through one centralised,
API-ready service layer (`src/services/`), which today is backed either by the
built-in mock transport (`NEXT_PUBLIC_USE_MOCK_API=true`, the default) or by real
axios HTTP calls against `NEXT_PUBLIC_API_BASE_URL`, with no change to any component.
The full contract the backend must implement is in [`API-CONTRACT.md`](./API-CONTRACT.md).

Three routes exist, all under the Next.js 15 App Router in `src/app`:

| Route | File | Nature | Purpose |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | server component | Mission dashboard: globe + side rail. Renders `<Workspace />`. |
| `/analyze` | `src/app/analyze/page.tsx` | client component | Stage-by-stage pipeline view, seeded by `?stage=`. |
| `/results` | `src/app/results/page.tsx` | client component | Presentation route: hero result view plus a comparative chart pack. |

---

## 2. Layered architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PRESENTATION — src/app/**, src/components/**                                 │
│   Routes (3) → shell (Workspace, HeaderBar) → panels → ui primitives          │
│   MAY import: @/hooks, @/store, @/lib, @/types, @/components/ui              │
│   MAY NOT import: @/services (two documented exceptions, see below)           │
│   MAY NOT import: axios, @tanstack/react-query, or read window.Cesium         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ props down · callbacks up · store selectors
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ HOOKS / ORCHESTRATION — src/hooks/**                                         │
│   useMap · useEvents · useAnalysis · useSarData · useLocationSearch ·         │
│   useMissionSummary · useMediaQuery · useDebouncedValue                       │
│   Owns: query keys, polling cadence, error normalisation, cross-store mirrors │
│   MAY import: @/services, @/store, @/lib/cesium, @/lib/constants, @/types     │
└──────────┬──────────────────────────────────────────────┬────────────────────┘
           │ server state                                  │ client state
┌──────────▼───────────────────────────┐   ┌──────────────▼────────────────────┐
│ SERVICES — src/services/**            │   │ STORES — src/store/**             │
│   apiClient.ts   axios + ApiError      │   │   appStore.ts   (mission/UI)      │
│   endpoints.ts   path catalogue        │   │   toastStore.ts (notifications)   │
│   apiService.ts  one fn per endpoint   │   │   Zustand 5.0.3, no persistence   │
│   index.ts       public barrel         │   └───────────────────────────────────┘
└──────────┬───────────────────────────┬─┘
           │ USE_MOCK_API === true     │ USE_MOCK_API === false
┌──────────▼────────────────┐  ┌───────▼──────────────────────────────────────┐
│ MOCK TRANSPORT            │  │ HTTP TRANSPORT                               │
│   lib/mock/transport.ts   │  │   axios instance (apiClient)                 │
│   lib/mock/fixtures.ts    │  │   request interceptor: x-request-id, x-client│
│   deterministic, seeded   │  │   response interceptor: → ApiError.from()    │
└───────────────────────────┘  └───────┬──────────────────────────────────────┘
                                       │  ApiEnvelope<T> = { data, meta }
                              ┌────────▼────────┐
                              │ BACKEND         │
                              │ (not in repo)   │
                              └─────────────────┘
```

### Import rules (as actually enforced in the tree)

| From | May import | Evidence |
| --- | --- | --- |
| `src/app/**` | anything under `@/` | `page.tsx` → `@/components/Workspace`; `analyze/page.tsx` → `@/hooks/useAnalysis`, `@/store/appStore` |
| `src/components/**` | `@/hooks`, `@/store`, `@/lib`, `@/types`, `@/components/ui` | e.g. `SearchBar.tsx` imports `useLocationSearch` + `useMap` + `useAppStore`, never `@/services` |
| `src/hooks/**` | `@/services`, `@/store`, `@/lib`, `@/types` | `useAnalysis.ts` imports `ApiError, createAnalysisJob, fetchAnalysisJob, …` from `@/services` |
| `src/services/**` | `@/lib`, `@/types` | `apiService.ts` imports `@/lib/mock/*`, `@/lib/constants` |
| `src/lib/mock/**` | `@/services/apiClient` (for `ApiError` only), `@/lib`, `@/types` | `transport.ts` imports `ApiError` to reject like a real transport would |
| `src/lib/cesium/**` | `@/lib/constants`, `@/types` | `viewer.ts`, `entities.ts`; the Cesium namespace is a **parameter**, never an import |
| `src/types/**` | nothing | pure type declarations |

**Two component-level exceptions to "components never import services", both
intentional and both narrow:**

1. `src/components/ui/StateViews.tsx` imports the `ApiError` **class** so that
   `ErrorState` can branch on `isOffline` / `isTimeout` / `isValidation` and print
   `error.code` — i.e. one error type shared by the whole app rather than a
   re-implementation in the view layer.
2. `src/components/Workspace/Workspace.tsx` imports the `CreateAnalysisPayload`
   **type** only (`import type`) to assemble the request body in the one place where
   "start an analysis" is composed.

No component imports `axios`, calls `apiClient`, or subscribes to React Query
directly. Components read the Cesium namespace only via
`window.Cesium` in `GlobeTelemetry.tsx` (a deliberate escape hatch for
`Cesium.Math.toDegrees`) and via the `GlobeController` for everything else.

---

## 3. Component hierarchy

`C` = `'use client'` boundary. Files without the directive are shared render-only
modules (they contain no hooks/state) that become part of the client bundle when a
client component imports them.

```
src/app/layout.tsx                                   [server]
└── <Providers>                                      [C] src/app/providers.tsx
    │   creates QueryClient in useState (never shared across SSR requests)
    ├── {children}
    └── <ToastViewport>                              [C] components/ui/ToastViewport.tsx

── Route "/" ─────────────────────────────────────────────────────────────────
src/app/page.tsx                                     [server]
└── <Workspace>                                      [C] components/Workspace/Workspace.tsx
    │   composition root: owns sidebarOpen, railCollapsed, globeFailed;
    │   the only place CreateAnalysisPayload is assembled
    ├── <HeaderBar>                                  [C] components/HeaderBar/HeaderBar.tsx
    │   │   mission status bar (h-14), route nav, auto-rotate, KPI strip
    │   ├── <Metric> ×4                              local fn component (Radio/Globe2/Activity/Gauge)
    │   └── <AnalysisDropdown>                       [C] components/AnalysisDropdown/
    │           ANALYZE menu; per-stage live status from stageStates
    ├── <Sidebar>  (desktop instance)                [C] components/Sidebar/Sidebar.tsx
    │   │   className "hidden shrink-0 lg:flex" (+ "lg:hidden" when railCollapsed)
    │   ├── <SearchBar>                              [C] components/SearchBar/SearchBar.tsx
    │   ├── <BrandingCard>                           [C] components/BrandingCard/BrandingCard.tsx
    │   ├── <CollapsiblePanel panelId="layers">      [C] components/ui/CollapsiblePanel.tsx
    │   │   └── <LayersPanel>                        [C] components/LayersPanel/LayersPanel.tsx
    │   ├── <CollapsiblePanel panelId="control">
    │   │   └── <ControlPanel>                       [C] components/ControlPanel/ControlPanel.tsx
    │   │       ├── <Select>                         [shared] components/ui/Select.tsx
    │   │       ├── <DateField> ×2                   [C] components/ControlPanel/DateField.tsx
    │   │       ├── <SarDropzone>                    [C] components/ControlPanel/SarDropzone.tsx
    │   │       │   ├── <ProgressBar>                [shared] components/ui/ProgressBar.tsx
    │   │       │   └── <Button>                     [C] components/ui/Button.tsx
    │   │       ├── <Icon>                           [shared] components/ui/Icon.tsx
    │   │       └── <PanelDivider>                   [shared] components/ui/GlassPanel.tsx
    │   └── <CollapsiblePanel panelId="events">
    │       └── <EventsPanel>                        [C] components/EventsPanel/EventsPanel.tsx
    │           ├── <EventCard> ×n                   [C] components/EventsPanel/EventCard.tsx
    │           │   └── <Badge>/<SeverityBadge>      [shared] components/ui/Badge.tsx
    │           └── <EmptyState>/<ErrorState>/<SkeletonRows>  [C] components/ui/StateViews.tsx
    ├── <Sidebar>  (mobile sheet instance)           same component, wrapped in
    │       fixed inset backdrop button + <div class="fixed bottom-0 left-0 top-14 lg:hidden">
    ├── <main>
    │   └── <GlobeViewer>                            [C] components/GlobeViewer/GlobeViewer.tsx
    │       │   React owns the container; Cesium owns everything inside it
    │       ├── <GlobeTelemetry viewer={viewerHandle}/>  [C] GlobeViewer/GlobeTelemetry.tsx
    │       │       bottom-4 left-4 HUD: LAT/LON/ALT/HDG written straight to the DOM
    │       └── {children}  ← overlay chrome supplied by Workspace:
    │           ├── rail collapse button            (absolute left-4 top-4, lg only)
    │           ├── "Activate slider" button         (absolute bottom-16 left-4)
    │           └── <GlobeLegend>                    [shared] GlobeViewer/GlobeLegend.tsx
    │                   absolute bottom-16 right-4, "hidden … lg:block", max-w-[13rem]
    │       └── (GlobeViewer's own overlay states) loading spinner / error panel + "Retry globe"
    │   └── "Analysis running — view pipeline" button  (bottom-4 right-4, when isRunning)
    │   └── "Globe offline" notice                     (top-centre, when globeFailed)
    ├── <ComparisonSlider active onClose>            [C] components/ComparisonSlider/
    └── <LoadingOverlay>                             [C] components/LoadingOverlay/

── Route "/analyze" ──────────────────────────────────────────────────────────
src/app/analyze/page.tsx                             [C]
└── <Suspense>  (required: AnalyzeContent calls useSearchParams)
    └── <AnalyzeContent>                             local component
        ├── <HeaderBar>                              (no sidebar toggle on this route)
        ├── <StageTabs active onChange>              [C] components/Analyze/StageTabs.tsx
        └── role="tabpanel" body, one of:
            ├── <DsardPanel onStart>                 [C] components/Analyze/DsardPanel.tsx
            ├── <ExtractingPanel>                    [C] components/Analyze/ExtractingPanel.tsx
            ├── <AnalyzingPanel>                     [C] components/Analyze/AnalyzingPanel.tsx
            │   └── <Sparkline> → recharts AreaChart (local fn component)
            └── <ResultPanel>                        [C] components/Analyze/ResultPanel.tsx
                ├── <ChartTypeSelector>              [C] components/ResultCharts/ChartTypeSelector.tsx
                └── <ResultCharts dataset chartType> [C] components/ResultCharts/ResultCharts.tsx
                    └── pie | bar | line | histogram (recharts 2.15.0)

── Route "/results" ──────────────────────────────────────────────────────────
src/app/results/page.tsx                             [C]
├── <HeaderBar>
├── <div id="results-pack"> → <ResultPanel/>          chart + KPI + detection table
└── section "Comparative chart pack"
    └── <ResultCharts> ×3                             every chart type except the hero one
```

**Ownership notes**

* `GlobeLegend` is rendered by `Workspace` (bottom-right), **not** by `GlobeViewer`.
  `GlobeTelemetry` is the only HUD that lives inside the viewer (bottom-left).
* `Workspace` renders `Sidebar` twice — one instance for the desktop rail
  (`hidden … lg:flex`) and one inside the mobile sheet (`lg:hidden`). At most one is
  visible at any breakpoint.
* `Workspace` is also the only component that calls `useAutoFlyToSelection` and
  `useAutoFocusEvent`, so camera-follows-state behaviour is mounted exactly once and
  only on `/`.

---

## 4. Folder structure

```
earth-metamorphosis/
├── .env.example                     Environment template (all vars are build-time inlined)
├── .gitignore                       Ignores .next/, out/, .env*.local, and /public/cesium
├── .tools/
│   ├── check-icons.mjs              Asserts the 61 lucide names exist in 0.469.0
│   ├── check-cesium-members.mjs     Audits every `cesium.<Member>` in src/ against the shipped .d.ts
│   ├── rotation-check.mjs           Behavioural test for the globe spin (npm run test:rotation)
│   └── serve-out.mjs                Static file server used to preview out/ (npm run serve:out)
├── next.config.mjs                  Three build targets, basePath/assetPrefix, optimizePackageImports
├── package.json                     Scripts + pinned dependency versions
├── postcss.config.mjs               tailwindcss + autoprefixer
├── tailwind.config.ts               Design tokens (space/accent/signal/ink, shadows, keyframes, z-index)
├── tsconfig.json                    strict: true, target ES2022, path alias "@/*" -> "./src/*"
├── docs/
│   ├── ARCHITECTURE.md              This file
│   ├── API-CONTRACT.md              Backend contract for every endpoint
│   └── WIREFRAMES.md                ASCII wireframes + region callouts
├── public/
│   └── logo.svg                     Brand mark consumed by BrandingCard via assetPath()
└── src/
    ├── app/
    │   ├── layout.tsx               Root layout: metadata, viewport, <html>/<body>, <Providers>
    │   ├── providers.tsx            'use client' QueryClientProvider + ToastViewport
    │   ├── globals.css              Tailwind layers, CSS tokens, .glass/.telemetry/.scanline, Cesium + reduced-motion rules
    │   ├── page.tsx                 Route "/" — server component mounting <Workspace/>
    │   ├── analyze/page.tsx         Route "/analyze" — Suspense + useSearchParams('stage')
    │   └── results/page.tsx         Route "/results" — presentation route + comparative chart pack
    ├── components/
    │   ├── Workspace/
    │   │   ├── Workspace.tsx        Composition root; assembles CreateAnalysisPayload; owns rail/sheet state
    │   │   └── index.ts             Barrel export
    │   ├── HeaderBar/
    │   │   ├── HeaderBar.tsx        Mission status bar: identity, KPI strip, route nav, auto-rotate, ANALYZE
    │   │   └── index.ts             Barrel export
    │   ├── Sidebar/
    │   │   ├── Sidebar.tsx          Left rail: SearchBar + BrandingCard + 3 CollapsiblePanels
    │   │   └── index.ts             Barrel export
    │   ├── SearchBar/
    │   │   ├── SearchBar.tsx        Combobox over useLocationSearch; ↑↓/Enter/Esc; coordinate shortcut
    │   │   └── index.ts             Barrel export
    │   ├── BrandingCard/
    │   │   ├── BrandingCard.tsx     Wordmark + live/degraded/offline status badge; assetPath(logo)
    │   │   └── index.ts             Barrel export
    │   ├── LayersPanel/
    │   │   ├── LayersPanel.tsx      Four basemaps as radio cards with CSS-gradient swatches
    │   │   └── index.ts             Barrel export
    │   ├── ControlPanel/
    │   │   ├── ControlPanel.tsx     Job definition: location, detection mode, dates, ingest, "Run Analysis"
    │   │   ├── DateField.tsx        In-house ISO calendar popup with inclusive min/max bounds (date-fns)
    │   │   ├── SarDropzone.tsx      Drag&drop ingest target + dataset status card + progress
    │   │   └── index.ts             Barrel export
    │   ├── EventsPanel/
    │   │   ├── EventsPanel.tsx      Summary strip, filters, list, footer stats
    │   │   ├── EventCard.tsx        One detection row: id, severity, type, date, location, confidence, area
    │   │   └── index.ts             Barrel export
    │   ├── GlobeViewer/
    │   │   ├── GlobeViewer.tsx      Cesium container + lifecycle + GlobeController registration
    │   │   ├── GlobeTelemetry.tsx   Camera HUD writing to the DOM on a 220 ms interval
    │   │   ├── GlobeLegend.tsx      Severity + detection-type + AOI legend (rendered by Workspace)
    │   │   └── index.ts             Barrel export
    │   ├── ComparisonSlider/
    │   │   ├── ComparisonSlider.tsx Full-screen divider chrome over ONE viewer's scene.splitPosition
    │   │   └── index.ts             Barrel export
    │   ├── AnalysisDropdown/
    │   │   ├── AnalysisDropdown.tsx ANALYZE menu: 4 stages with live status, navigates to ?stage=
    │   │   └── index.ts             Barrel export
    │   ├── LoadingOverlay/
    │   │   ├── LoadingOverlay.tsx   Blocking overlay driven by appStore.overlay
    │   │   └── index.ts             Barrel export
    │   ├── Analyze/
    │   │   ├── StageTabs.tsx        role="tablist" for the four stages + overall progress
    │   │   ├── DsardPanel.tsx       Step cards + vertical timeline from AnalysisJob.steps
    │   │   ├── ExtractingPanel.tsx  Category card grid + sort control + dominant-class table
    │   │   ├── AnalyzingPanel.tsx   Per-domain widget cards with risk index + recharts sparkline
    │   │   ├── ResultPanel.tsx      KPI tiles + chart switcher + largest-detections table
    │   │   └── index.ts             Barrel export
    │   ├── ResultCharts/
    │   │   ├── ResultCharts.tsx     Four recharts variants + custom tooltip + PNG export
    │   │   ├── ChartTypeSelector.tsx Radiogroup for pie/histogram/line/bar
    │   │   └── index.ts             Barrel export
    │   └── ui/
    │       ├── Button.tsx           6 variants × 4 sizes, loading state, forwardRef
    │       ├── Badge.tsx            Tone chips + SeverityBadge driven by SEVERITY_MAP
    │       ├── ProgressBar.tsx      Determinate bar (+ IndeterminateBar, currently unrendered)
    │       ├── GlassPanel.tsx       Glass surface + PanelHeader + PanelDivider
    │       ├── CollapsiblePanel.tsx Accessible <button aria-expanded> + role="region" section
    │       ├── StateViews.tsx       Spinner, Skeleton, SkeletonRows, EmptyState, ErrorState, LoadingRow
    │       ├── StatTile.tsx         KPI tile + MetricRow for detail tables
    │       ├── SegmentedControl.tsx Radiogroup control (defined, not currently rendered)
    │       ├── Select.tsx           Native <select> with dark chrome
    │       ├── Icon.tsx             Curated 59-name lucide registry + fallback
    │       └── ToastViewport.tsx    Global notification stack mounted by <Providers>
    ├── hooks/
    │   ├── useMap.ts                GlobeController registry + useMap façade + auto-fly/focus effects
    │   ├── useAnalysis.ts           Start mutation, job polling, stage gating, stageStates ladder
    │   ├── useEvents.ts             Event feed query + mirror into store + EventStats
    │   ├── useSarData.ts            Upload mutation + two-phase ingest polling + validateSarFile
    │   ├── useLocationSearch.ts     Debounced search query + local coordinate resolution
    │   ├── useMissionSummary.ts     Top-bar KPI poll (60 s)
    │   ├── useMediaQuery.ts         SSR-safe matchMedia + useIsDesktop/useIsTablet/usePrefersReducedMotion
    │   ├── useDebouncedValue.ts     useDebouncedValue + useDelayedFlag
    │   └── index.ts                 Barrel export
    ├── lib/
    │   ├── constants.ts             Catalogue: DETECTION_TYPES, LAYERS, COMPARISON_BASEMAPS, SEVERITIES,
    │   │                            CHART_TYPES, DSARD_PIPELINE, EXTRACTION_CATEGORIES, AOI_PRESETS,
    │   │                            SAR_ACCEPTED_FORMATS, SAR_MAX_FILE_BYTES, CHART_PALETTE, DEFAULT_BBOX
    │   ├── utils.ts                 cn, formatters, parseCoordinates, bbox maths, ringAround, seededRandom,
    │   │                            hashString, assetPath
    │   ├── chartExport.ts           exportElementAsPng (SVG→2× PNG), downloadBlob, downloadDataUrl, slugify
    │   ├── cesium/
    │   │   ├── loader.ts            CDN script/style injection, memoised promise, window.Cesium cache
    │   │   ├── viewer.ts            Viewer creation, basemap swap, split comparison, camera flights, teardown
    │   │   ├── entities.ts          Event entities, selection marker, ScreenSpaceEventHandler picking
    │   │   └── index.ts             Barrel export of the whole Cesium surface
    │   └── mock/
    │       ├── transport.ts         mockRequest(): latency, envelope, __fail simulation
    │       └── fixtures.ts          Deterministic generators (gazetteer, events, extractions, widgets, results)
    ├── services/
    │   ├── apiClient.ts             axios instance, ApiError taxonomy, envelope unwrap
    │   ├── endpoints.ts             ENDPOINTS catalogue (paths + id builders)
    │   ├── apiService.ts            One function per endpoint, mock/HTTP switch, mock job state machine
    │   └── index.ts                 Public barrel: ApiError, apiClient, httpRequest, ENDPOINTS, apiService
    ├── store/
    │   ├── appStore.ts              Mission/UI Zustand store + pure selectors
    │   └── toastStore.ts            Transient notifications + non-React `toast` helper
    └── types/
        └── index.ts                 Domain model: all shared interfaces and unions
```

There are **no** barrel-less component folders left over from scaffolding and **no**
`src/components/**` directory without at least one implementation file.

---

## 5. State management flow

### 5.1 The split

| Concern | Owner | Why |
| --- | --- | --- |
| Active basemap, auto-rotate, globe ready/error | **Zustand** | Purely client; the globe is imperative and outside React |
| Search query text, search results mirror, selected AOI | **Zustand** | UI state that outlives a fetch; the selected AOI also drives the camera effect |
| Detection type, date range, SAR dataset, upload flag/progress | **Zustand** | Job-definition state, read by several panels and by the payload builder |
| Event array mirror, event filter, selected/hovered event id | **Zustand** | The globe renders from the same array as the list; hover/selection are transient UI |
| Analysis job mirror, extractions, widgets, result dataset, chart type | **Zustand** | Mirrored so `/analyze` and `/results` can render synchronously; `chartType` is pure client state |
| Panel open/closed, comparison active, blocking overlay | **Zustand** | Global chrome state shared across panels |
| Locations, events (authoritative), SAR ingest status, analysis job polling, extractions, widgets, results, mission summary | **React Query** | Server state: caching, deduplication, polling, retry policy, staleness |

Each hook that fetches also **mirrors the latest response into the store** with a
`useEffect`, so the imperative Cesium layer and the panels read one array rather than
holding their own copies:

```ts
useEffect(() => { if (query.data) setEvents(query.data.data.items); }, [query.data, setEvents]);
```

The mirror is one-way (server → store). The store never writes back to the cache, and
`queryClient` is only touched by `useAnalysis.cancel()` (which removes the `['analysis']`
query family) and `useSarData.reset()` (which invalidates `['sar-dataset']`).

The store has **no persistence middleware** — a reload clears the job, the dataset and
every mirrored array. This is deliberate (a demo console should not pretend to own
history) but it means deep-linking to `/analyze` or `/results` in a fresh session shows
the empty state, because `useAnalysis` is gated on `appStore.jobId`.

### 5.2 Query keys and cache policy

Global defaults from `Providers.createQueryClient()`:

| Option | Value |
| --- | --- |
| `staleTime` | `30_000` ms |
| `gcTime` | `5 * 60_000` ms |
| `refetchOnWindowFocus` | `false` |
| `retry` | only if `ApiError.isRetryable`, then `failureCount < 2` (max 2 retries) |
| `retryDelay` | `min(1_000 * 2 ** attempt, 8_000)` |
| `mutations.retry` | `0` |

Per-query keys and overrides:

| Query key | Defined in | `staleTime` | `gcTime` | `retry` | `refetchInterval` |
| --- | --- | --- | --- | --- | --- |
| `['location-search', trimmed.toLowerCase()]` | `useLocationSearch.ts` | `5 * 60_000` | `10 * 60_000` | `1` | — |
| `['events', detectionTypes, severities, minConfidence, query]` | `useEvents.ts` | `30_000` | inherited | inherited | — |
| `['sar-dataset', dataset?.id]` | `useSarData.ts` | inherited | inherited | inherited | `1_200` |
| `['analysis', 'job', jobId]` | `useAnalysis.ts` | inherited | inherited | inherited | `1_200` |
| `['analysis', 'extractions', jobId]` | `useAnalysis.ts` | `Infinity` | inherited | inherited | — |
| `['analysis', 'widgets', jobId]` | `useAnalysis.ts` | `Infinity` | inherited | inherited | — |
| `['analysis', 'results', jobId]` | `useAnalysis.ts` | `Infinity` | inherited | inherited | — |
| `['mission', 'summary']` | `useMissionSummary.ts` | `45_000` | inherited | `2` | `60_000` |

**Polling cadence constants**

| Constant | Value | Location | Applies to |
| --- | --- | --- | --- |
| job poll interval | `1_200` ms | `useAnalysis.ts` (`refetchInterval`) | `GET /api/analyze/:jobId` |
| ingest poll interval | `1_200` ms | `useSarData.ts` (`refetchInterval`) | `GET /api/load-sar-data/:id` |
| KPI refresh | `60_000` ms | `useMissionSummary.ts` | `GET /api/mission/summary` |
| search debounce | `300` ms | `useLocationSearch.ts` → `useDebouncedValue` | search input |
| telemetry HUD tick | `220` ms | `GlobeTelemetry.tsx` (DOM writes, not React) | camera readout |
| mock stage duration | `3_400` ms × 4 = `13_600` ms | `apiService.ts` (mock only) | simulated pipeline |
| mock ingest duration | `5_000` ms | `apiService.ts` (mock only) | simulated ingest |

Every `refetchInterval` is a **function of the last response**, so polling stops the
moment the terminal condition is reached rather than relying on the caller to disable
the query:

```ts
refetchInterval: (query) => {
  const snapshot = query.state.data?.data;
  if (!snapshot) return 1_200;
  return snapshot.progress >= 100 ? false : 1_200;      // analysis job
}
refetchInterval: (query) => {
  const snapshot = query.state.data?.data;
  if (!snapshot) return 1_200;
  return snapshot.status === 'ready' || snapshot.status === 'error' ? false : 1_200;  // ingest
}
```

### 5.3 Why the split is drawn where it is

* **Server truth stays in the cache.** Locations, events, job snapshots and result
  aggregates have a request lifecycle (dedup, retry, poll, invalidate). React Query
  already implements that; re-implementing it in Zustand would mean hand-rolling
  in-flight flags and retry timers — which is exactly what `useEvents.isLoading` /
  `isFetching` / `refetch` expose to the UI for free.
* **Client intent stays in the store.** `activeLayer`, `eventFilter`, `openPanels`,
  `chartType` and `selectedEventId` are not responses to anything; caching them would
  give them a staleness semantics they do not have.
* **The imperative globe needs a non-React read path.** `GlobeViewer` must project
  props onto the scene, and `Workspace` must feed it the same event array the list
  renders. A Zustand store is readable outside React (`useAppStore.getState()`), which
  a query cache is not meant to be.
* **Derived data is computed, not stored.** `EventStats` (`useEvents.computeStats`) and
  `stageStates` (`useAnalysis`) are `useMemo` derivations over already-mirrored state,
  so there is exactly one copy of every number.

### 5.4 Data flow

```
 analyst gesture (click / drag / keystroke)
        │
        ▼
 ┌───────────────────────────┐   store action (setActiveLayer, togglePanel, setChartType,
 │ presentational component  │   selectEvent, hoverEvent, setDateRange, …)
 └──────────┬────────────────┘
            │ subscribes with narrow selectors: useAppStore((s) => s.activeLayer)
            ▼
 ┌───────────────────────────┐        ┌──────────────────────────────────────────┐
 │ useAppStore (Zustand)     │◄───────┤ use* hooks mirror every response:        │
 │ client/UI + mirrored      │        │   setEvents / setJob / setExtractions /   │
 │ server snapshots          │        │   setWidgets / setResultDataset /         │
 └──────────┬────────────────┘        │   setSearchResults / setDataset           │
            │                          └────────────────▲─────────────────────────┘
            │ read outside React                        │ ApiEnvelope<T>.data
            ▼                                           │
 ┌───────────────────────────┐        ┌─────────────────┴─────────────────────────┐
 │ GlobeController registry  │◄───────┤ React Query cache                          │
 │ (own tiny Zustand store   │        │  queryKey / queryFn / refetchInterval      │
 │  inside hooks/useMap.ts)  │        └────────────────▲─────────────────────────┘
 └──────────┬────────────────┘                         │
            │ flyToLocation / focusEvent /             │ Promise<ApiEnvelope<T>>
            │ setSplitPosition / captureCanvas         │
            ▼                                          │
 ┌───────────────────────────┐        ┌────────────────┴──────────────────────────┐
 │ Cesium Viewer (imperative)│        │ src/services/apiService.ts                 │
 │  scene, camera, entities  │        │  USE_MOCK_API ? mockRequest(...)           │
 └───────────────────────────┘        │               : httpRequest(...)           │
                                      └───────┬────────────────────┬───────────────┘
                                              │                    │
                                 lib/mock/transport.ts      apiClient (axios)
                                 fixtures + latency         ApiError.from(error)
                                 __fail → ApiError 503      TIMEOUT/NETWORK_OFFLINE/HTTP_*
```

---

## 6. Cesium globe implementation structure

Cesium is **not** an npm dependency. It is fetched at runtime and cached on `window`.

### 6.1 Loader lifecycle — `src/lib/cesium/loader.ts`

```
loadCesium()
  ├─ typeof window === 'undefined'  → throw (client-only; keeps SSR safe)
  ├─ window.Cesium already present  → return it (no network)
  ├─ loaderPromise already pending  → return the SAME promise (concurrent callers share one fetch)
  └─ first call:
       window.CESIUM_BASE_URL = getCesiumBaseUrl()      ← Cesium resolves Workers/Assets from this
       injectStylesheet(base): <link id="cesium-runtime-style" href="{base}/Widgets/widgets.css">
       injectScript(base):     <script id="cesium-runtime-script" src="{base}/Cesium.js"
                                       async crossOrigin="anonymous">
       → assert window.Cesium exists ("loaded but did not register the global namespace")
       → if NEXT_PUBLIC_CESIUM_ION_TOKEN is set, assign cesium.Ion.defaultAccessToken
       → return the namespace
  on rejection: loaderPromise = null   (a transient CDN failure can be retried)
```

| Constant / function | Value / behaviour |
| --- | --- |
| `CESIUM_VERSION` | `'1.126.0'` (pinned; "bump deliberately, then re-run the smoke test") |
| `DEFAULT_BASE_URL` | `https://cdn.jsdelivr.net/npm/cesium@1.126.0/Build/Cesium` |
| `getCesiumBaseUrl()` | `NEXT_PUBLIC_CESIUM_BASE_URL` when non-empty, else `DEFAULT_BASE_URL` |
| `isCesiumLoaded()` | `typeof window !== 'undefined' && Boolean(window.Cesium)` |
| `unloadCesium()` | removes script + style, clears the promise, deletes `window.Cesium` — documented as test-only, and not called anywhere in `src/` |
| Script identity | Fixed element ids mean React 19 StrictMode double-mounting in dev cannot inject two runtimes; a second call attaches `load`/`error` listeners to the existing element |

**Why a loader rather than `import * as Cesium from 'cesium'`** (the rationale stated in
the module header and borne out by `next.config.mjs`): Cesium is ~1.4 MB of JS plus a
Workers/Assets/Widgets tree; bundling it means webpack worker-URL rewriting and a very
slow cold build for a dependency that only ever runs in the browser. The consequences
are: first paint is not blocked by Cesium, the globe is a lazily-mounted client
component with a real loading state, and self-hosting is a one-line env change.

### 6.2 Viewer creation — `src/lib/cesium/viewer.ts`

`createViewer(cesium, container, options)` constructs a chrome-free viewer. Every
widget is disabled because the dashboard draws its own controls:

```
animation: false            timeline: false          baseLayerPicker: false
geocoder: false             homeButton: false        infoBox: false
sceneModePicker: false      selectionIndicator: false navigationHelpButton: false
fullscreenButton: false     vrButton: false
creditContainer: <detached div>      ← attribution is rendered by our own footer
shouldAnimate: true                  ← the clock ticks, which drives auto-rotate
baseLayer: false                     ← layer 0 is added by applyBaseLayer (version-safe)
requestRenderMode: false             ← continuous rendering (see §9)
contextOptions: { webgl: { preserveDrawingBuffer: true } }   ← required by captureCanvas()
```

Post-construction scene tuning: globe base colour `#040711`, `enableLighting` false,
ground atmosphere on, `depthTestAgainstTerrain` false; sky atmosphere with hue `-0.02`,
saturation `+0.18`, brightness `-0.12`; fog enabled at density `0.00018`;
`highDynamicRange = true`; background `#02040A`; camera controller opened fully —
`enableInputs` / `enableTranslate` / `enableZoom` / `enableRotate` / `enableTilt` /
`enableLook` all `true`, `minimumZoomDistance` 20 m, `maximumZoomDistance` 60 000 000 m,
`inertiaSpin` 0.72, `inertiaTranslate` 0.72, `inertiaZoom` 0.6. Cesium's inertia defaults
are 0.9 / 0.9 / 0.8, and coasting after a released drag is exactly what makes a globe feel
uncontrollable; these settle where the operator let go. `viewer.trackedEntity = undefined`.

`CreateViewerOptions` (`shouldAnimate`, `lighting`, `minimumZoomDistance`) are
forwarded by `GlobeViewer`, which passes `{ shouldAnimate: true, lighting: false }`.

### 6.3 Viewer created once, projected onto via effects

`GlobeViewer` has exactly one creation effect, keyed only by a retry counter:

```ts
useEffect(() => { /* loadCesium → createViewer → createPickHandler → createAutoRotate
                     → registerGlobeController(buildController) → setStatus('ready') */ },
          [attempt]);
```

Its cleanup reverses everything (`registerGlobeController(null)`, dispose pick handler,
dispose auto-rotate, `destroyViewer`). Because prop identity changes must never remount
the WebGL context, callbacks are read through a ref:

```ts
const callbacks = useRef({ onSelectEvent, onHoverEvent, onReady, onError });
callbacks.current = { onSelectEvent, onHoverEvent, onReady, onError };
```

State is then projected onto the live scene by five narrow effects, each guarded by
`status !== 'ready'` and depending on the smallest possible input set:

| Effect | Dependency array | Applied via |
| --- | --- | --- |
| Basemap swap | `[activeLayer, status]` | `applyBaseLayer` (removes layer 0, adds the replacement at index 0, keeps camera + entities) |
| Before/after split | `[comparisonActive, status]` | `enableSplitComparison` / `disableSplitComparison` |
| Selected AOI marker | `[selectedLocation, status]` | `upsertSelectionMarker` |
| Event footprints | `[events, selectedEventId, hoveredEventId, status]` | `renderEventEntities` |
| Auto-rotation | `[autoRotate, status]` | `createAutoRotate().start()/stop()` |

`applyBaseLayer` also swaps the terrain provider: `World Terrain` only when the active
layer sets `useWorldTerrain` **and** an Ion token exists **and**
`cesium.createWorldTerrainAsync` is available; otherwise `EllipsoidTerrainProvider`.
A rejected terrain promise is swallowed, leaving the ellipsoid.

### 6.4 `GlobeController` — keeping the imperative scene out of React

`src/hooks/useMap.ts` owns a **second, tiny Zustand store** (`useGlobeRegistry`) that
holds a single `controller: GlobeController | null`. `GlobeViewer` calls
`registerGlobeController(buildController())` on mount and `null` on unmount. This is the
mechanism that lets any component command the camera without a ref threaded through
props, and it deliberately keeps the 3D scene out of the React tree.

```ts
export interface GlobeController {
  flyToLocation(location: GeoLocation, duration?: number): void;
  flyToPoint(lat: number, lng: number, altitude?: number, duration?: number): void;
  flyToBoundingBox(bbox: BoundingBox, duration?: number): void;
  focusEvent(event: DetectedEvent): void;
  setSplitPosition(ratio: number): void;   // 0..1, only meaningful while comparing
  supportsSplit(): boolean;                // true once the scene exposes splitPosition
  captureCanvas(): string | null;          // PNG data URL, or null if unreadable
  getScene(): unknown;                     // escape hatch for advanced consumers
}
```

Notes on the implementation (`buildController`):

* Every method goes through a `withViewer(fn)` guard that returns early if the namespace
  or viewer ref is null, so panel clicks during boot or after teardown are no-ops.
* `focusEvent` derives the camera altitude from the footprint size —
  `clamp(12_000 + Math.sqrt(event.areaKm2) * 9_000, 12_000, 900_000)` — because `sqrt`
  keeps the mapping perceptually linear between small and regional events.
* `captureCanvas` is wrapped in `try/catch` and returns `null` when the canvas cannot be
  read back (e.g. tainted or unmounted), which is what `/results` renders as a warning
  toast instead of a crash.

`useMap()` is the façade panels use. `flyTo` is the important one: it updates the store
**and** the camera, so the search bar, the control panel and the event list cannot
disagree about where the globe is looking.

```ts
const flyTo = useCallback((location: GeoLocation) => {
  selectLocation(location);              // store: single source of truth
  controller?.flyToLocation(location);   // scene: imperative side-effect
}, [controller, selectLocation]);
```

Two effects are mounted once by `Workspace`:

* `useAutoFlyToSelection(initialLocation)` — seeds the store with the default AOI
  (`AOI_PRESETS[0]`, Dhaka) exactly once if nothing is selected, then flies whenever the
  selected location **id** changes.
* `useAutoFocusEvent()` — flies to the event whose id is `appStore.selectedEventId`, once
  per id.

Both are keyed on **ids, held in a `useRef`, not on object identity**. This is not a
micro-optimisation; it is the difference between a usable globe and an unusable one. The
earlier version had `events` in `useAutoFocusEvent`'s dependency array, and `events` is
rebuilt by every refetch (`staleTime` is 30 s) and by every filter change — so the camera
was re-flown to the selected event roughly every 30 seconds, silently undoing whatever the
operator had panned or zoomed to. Reading it as "the globe is stuck" is exactly right: it
kept snapping back.

Auto-rotation is owned in exactly one place. `autoRotate` (the store) is the operator's
*intent* and starts `true`; `createAutoRotate` suspends the spin on `pointerenter` over the
canvas and resumes it on `pointerleave`. Hovering therefore pauses without ever touching the
flag, which is what keeps the header play/pause button honest. An earlier revision cleared
the flag on any gesture instead, so the button switched itself off the moment the globe was
touched and looked broken.

The spin lives in **`src/lib/cesium/rotation.ts`**, not `viewer.ts`, and that separation is
load-bearing: the module has *no runtime imports*, so `npm run test:rotation` can compile it
and drive it with a fake viewer in plain Node. Two defects had already shipped through this
code, both from writing Cesium API names from memory instead of checking them:

1. **`Clock.deltaTime` does not exist in Cesium 1.126.** The tick read it, got `undefined`,
   fell back to `0`, and returned on its own `deltaSeconds <= 0` guard — every tick, forever.
   The globe never turned and the play button looked dead. The step is now measured locally
   with `performance.now()`; `Clock` exposes no delta at all.
2. **`ImagerySplitDirection` was removed**; the enum is `SplitDirection` (verified members:
   `LEFT = -1`, `NONE = 0`, `RIGHT = 1`). Reading the missing name threw inside the effect
   that enables the comparison slider.

Both are now guarded mechanically: `npm run check:cesium` walks every `cesium.<Member>`
reference in `src/` and fails if the shipped definitions do not declare it.

`moveCamera` in `buildController` is the one other source of suspension: it calls
`pauseFor(flightMs)` so a `flyTo` and the spin do not fight. That is a *temporary* hold, not
an intent change — the spin resumes once the flight has settled, unless the pointer is over
the globe. Double-click and double-tap zoom come from `createDoubleClickZoom`
(`src/lib/cesium/viewer.ts`), which first removes Cesium's own `LEFT_DOUBLE_CLICK` action
(it tracks the picked entity) and adds a two-tap detector for touch, which has no
double-click event. Pinch and wheel zoom are left to Cesium's screen-space controller; a
second handler would double every step.

### 6.5 Entity rendering — `src/lib/cesium/entities.ts`

Naming convention: event entities are prefixed `em:event:`, the AOI marker uses the
fixed id `em:selection`.

`renderEventEntities(cesium, viewer, events, { selectedId, hoveredId, showLabels })`
performs a **full rebuild**: it removes every entity whose id starts with `em:event:`
and re-adds the whole set. The module documents the reasoning and the escape route:

> The event count in this dashboard is in the tens, so a full rebuild is both cheaper to
> reason about and faster than a diff; for thousands of features the same data should go
> through a `CustomDataSource` with `EntityCluster`.

Per event:

| Component | Detail |
| --- | --- |
| `position` | `Cartesian3.fromDegrees(lng, lat)` |
| `properties` | `{ eventId, detectionType }` — read back by the pick handler |
| `point` | `pixelSize` 13 selected / 11 focused / 8 default; colour = `SEVERITY_MAP[severity].hex`; white outline (alpha 0.9 focused / 0.55 otherwise, width 2.5 / 1.2); `disableDepthTestDistance: POSITIVE_INFINITY`; `NearFarScalar(1.5e5, 1.35, 1.6e7, 0.5)` so markers stay legible from orbit |
| `polygon` | Only when `event.footprint.length >= 3`: `Cartesian3.fromDegreesArray(flat)`, fill alpha 0.42 selected / 0.24, outline, `ArcType.GEODESIC`, `height: 0` |
| `ellipse` | Fallback when no footprint: semi-axes `max(600, sqrt(areaKm2) * 1_000)` and `max(600, sqrt(areaKm2) * 800)` |
| `label` | Only for focused/selected events and when `showLabels`: `"{id}  ·  {shortLabel}"`, `600 13px "Segoe UI"`, `LabelStyle.FILL_AND_OUTLINE`, background pill, `Cartesian2(0, -26)` offset |

`upsertSelectionMarker` removes the previous `em:selection` entity and adds a pulsing
marker. The pulse is driven by the Cesium clock, **not** React, using
`CallbackProperty` for both semi-axes and `ColorMaterialProperty` for the fade:

```ts
new cesium.CallbackProperty(() => { const t = performance.now() / 1_000;
  return 18_000 + ((t % 2) / 2) * 26_000; }, false)
```

`clearSelectionMarker(viewer)` exists for explicit removal, but `GlobeViewer` does not
call it: passing `null` to `upsertSelectionMarker` removes the entity, which is how a
"clear" in the control panel is handled.

### 6.6 Picking

`createPickHandler` opens its **own** `ScreenSpaceEventHandler` on
`viewer.scene.canvas` — the Viewer's internal handler is left untouched:

* `MOUSE_MOVE` → `scene.pick(movement.endPosition)` → `readEventId` → `onHover` **only
  when the id actually changed** (a `lastHovered` guard prevents a store write per frame).
* `LEFT_CLICK` → `scene.pick(click.position)` → `onSelect` (may be `null`).

`readEventId(picked)` reads `entity.properties.eventId.getValue()` and falls back to
slicing the `em:event:` prefix, returning `null` for a miss. Handlers are routed through
the callback ref, so hover/selection state changes never recreate the handler. The
returned disposer destroys the handler and is invoked from the mount cleanup.

### 6.7 Telemetry HUD

`GlobeTelemetry` receives `viewerHandle` (React state set once the viewer exists) and
writes LAT/LON/ALT/HDG into `<span>` refs on a `220` ms `setInterval`. It reads
`camera.positionCartographic` and `camera.heading`, converting with
`window.Cesium?.Math?.toDegrees` and falling back to a local `* 180 / Math.PI`, and it
guards with `instance.isDestroyed?.()` plus a `try/catch` for teardown mid-tick. No
React state is involved in the update path. HDG is hidden below the `sm` breakpoint.

### 6.8 Before/after comparison — native split rendering

**The comparison is not two synchronised maps.** `enableSplitComparison` adds two
`ImageryLayer`s (`COMPARISON_BASEMAPS.before` / `.after`, named `comparison:before` /
`comparison:after`), assigns `ImagerySplitDirection.LEFT` and `.RIGHT`, and then sets a
single `viewer.scene.splitPosition = 0.5`. The `ComparisonSlider` component is only
chrome: a divider, corner labels, a position readout, pointer capture and keyboard
handling. Dragging computes `clamp((clientX - rect.left) / rect.width, 0, 1)` and calls
`GlobeController.setSplitPosition(ratio)`, which performs one clamped uniform write:

```ts
setSplitPosition: (ratio) => withViewer((_c, viewer) =>
  { (viewer as any).scene.splitPosition = clamp(ratio, 0, 1); })
```

Why this is better than two maps (stated in the component header and structurally
enforced by the code):

| Property | Native split | Two synchronised maps |
| --- | --- | --- |
| WebGL contexts | **1** | 2 (double GPU memory, double tile fetches) |
| Drift between halves | **Impossible** — same camera, same frame, same projection | Must be synchronised on every camera event; any lag or rounding shows as a seam |
| Handle cost | **One uniform write per frame** | Two camera/imagery updates that must both land before the frame is correct |
| Layers | `splitDirection` per `ImageryLayer` | Requires two independent imagery stacks |

Degraded path: `ComparisonSlider` renders `controller?.supportsSplit() ?? false`; when
false it shows "This browser's WebGL context does not expose split rendering — both
layers are shown blended." `disableSplitComparison` removes every layer whose name
starts with `comparison:` (iterating backwards) and resets `scene.splitPosition = 0`.
Comparison mode is entered from the "Activate slider" button and left with Escape or the
"Exit comparison" button; Escape and ←/→ (0.02 steps) are handled in the component.

### 6.9 Teardown discipline

Cesium leaks WebGL contexts if `destroy()` is skipped, so `destroyViewer` is defensive:

```ts
export function destroyViewer(viewer: any): void {
  try { if (!viewer.isDestroyed()) viewer.destroy(); } catch { /* already gone */ }
}
```

The mount cleanup order is: cancel the in-flight boot flag → `registerGlobeController(null)`
→ dispose the pick handler → dispose auto-rotate (which removes the `onTick` listener and
both pointer listeners) → `destroyViewer` → null the refs → `setViewerHandle(null)`.
`createAutoRotate` registers its tick on `viewer.clock.onTick` and its own
`pointerdown`/`pointerup` listeners, and `dispose()` removes all three, so the rotation
cannot outlive the viewer.

---

## 7. Analysis dashboard structure

### 7.1 The four stages

`AnalysisStage = 'dsard' | 'extracting' | 'analyzing' | 'result'` (`src/types/index.ts`).
`useAnalysis.ts` fixes the order:

```ts
const STAGE_ORDER: AnalysisStage[] = ['dsard', 'extracting', 'analyzing', 'result'];
export function stageRank(stage: AnalysisStage): number { return STAGE_ORDER.indexOf(stage); }
```

`STAGE_META` supplies label + description per stage, and the pipeline's inner steps come
from `DSARD_PIPELINE` in `lib/constants.ts` (8 steps: SAR Ingest & Orbit Correction,
Radiometric Calibration, Speckle Filtering, Coregistration, Interferometric Coherence,
Adaptive Thresholding, Change Classification, Vectorisation & Statistics).

| Stage | Route/UI | Data source | Unlock condition |
| --- | --- | --- | --- |
| `dsard` | `DsardPanel` | `job.steps` from `GET /api/analyze/:jobId` | immediately after a job exists |
| `extracting` | `ExtractingPanel` | `GET /api/analyze/:jobId/extractions` | `stageRank(stage) >= stageRank('extracting')` i.e. rank ≥ 1 |
| `analyzing` | `AnalyzingPanel` | `GET /api/analyze/:jobId/widgets` | rank ≥ 2 |
| `result` | `ResultPanel` | `GET /api/results/:jobId` | rank ≥ 3 |

The gate is the query's `enabled` flag, so **no request is issued before its stage**:

```ts
const extractionsQuery = useQuery({
  queryKey: ['analysis', 'extractions', jobId],
  queryFn: () => fetchExtractions(jobId ?? ''),
  enabled: Boolean(jobId) && stageRank(stage) >= stageRank('extracting'),
  staleTime: Number.POSITIVE_INFINITY,
});
```

`staleTime: Infinity` on the three derived queries is correct because a finished
artifact never changes for a given `jobId`; re-running an analysis produces a new job id
and therefore a new key. The stage-shifted `enabled` flags mean the pipeline warms
exactly one request per stage transition — which is also why the panels can render
skeletons and an explicit "this view unlocks when the pipeline reaches X" notice rather
than showing an error.

### 7.2 Job polling and the store mirror

```
startMutation.mutate(payload)
   → createAnalysisJob(payload)                       POST /api/analyze
   → onSuccess: startAnalysis(job)  →  { job, jobId, activeStage: job.stage }
                                       toast.info('Analysis queued', …)
   → onError:   toast.error('Could not start the analysis', ApiError.from(e).message)

jobQuery        ['analysis','job',jobId]     refetchInterval 1 200 ms → false at progress >= 100
   → useEffect: setJob(data)  →  { job, jobId, activeStage: job.stage }
   → when isComplete flips true: toast.success('Analysis complete', …)
```

`startAnalysis` sets `activeStage` from the job, so the route and the rail follow the
pipeline; `setJob` keeps doing so on every poll. `cancel()` calls `resetAnalysis()` and
`queryClient.removeQueries({ queryKey: ['analysis'] })`.

`UseAnalysisResult` exposes the whole pipeline surface:

```ts
{
  jobId: string | null;
  job: AnalysisJob | null;   // the full job record, including per-step status
  progress: number;
  stage: AnalysisStage;
  stageStates: StageState[];
  isRunning: boolean;        // Boolean(jobId) && !isComplete
  isComplete: boolean;       // progress >= 100 && job !== null
  start: (payload: CreateAnalysisPayload) => void;
  cancel: () => void;
  error: ApiError | null;    // first of startMutation / job / extractions / widgets / results
  isLoadingJob: boolean;
}
```

`job` is what makes `DsardPanel` possible: it reads `job.steps`, `job.startedAt`,
`job.etaSeconds` and `job.message` directly rather than re-deriving them. Note that
`progress` and `stage` are read from the **store mirror** (`job?.progress ?? 0`,
`job?.stage ?? 'dsard'`), not from the query, so the stage gates are driven by the same
snapshot the panels render.

### 7.3 `stageStates` — the progress ladder

`stageStates` is a `useMemo` over `[stage, progress, isComplete]` that turns one overall
`progress` number into per-stage `{ status, progress }`:

```ts
const status = isComplete || index < currentRank ? 'done'
             : index === currentRank            ? 'running'
             : 'pending';

const span = 100 / STAGE_ORDER.length;                            // 25
const progress = status === 'done'   ? 100
               : status === 'pending' ? 0
               : Math.min(100, Math.max(0, (progress - index * span) / span * 100));
```

So the overall percentage is apportioned evenly across four 25 % bands: inside the
running stage the local percentage is `(overall - index * 25) / 25 * 100`, clamped to
0..100 and rounded to one decimal. Consumers:

* `StageTabs` — the tablist's per-stage status dot and inline `ProgressBar`, plus the
  "x % overall" strip.
* `AnalysisDropdown` — the ANALYZE menu's `Idle` / `Running` / `Ready` label per stage
  and the job chip with its own `ProgressBar`.

Both derive purely from the hook, so neither polls and neither can disagree.

### 7.4 Route wiring

* `/analyze` reads `?stage=`, validates it against `STAGE_ORDER` (`isStage`), seeds local
  tab state from it, and pushes the tab back into the store via `setActiveStage`.
  `useSearchParams` forces the `<Suspense>` wrapper. The page also hosts the pipeline-wide
  error banner (`error.code` + `error.message` + Retry) which collapses every query error
  from `useAnalysis` (`startMutation.error ?? jobQuery.error ?? extractionsQuery.error ??
  widgetsQuery.error ?? resultsQuery.error`) into one `ApiError`.
* `/results` re-uses `ResultCharts` three more times, mapping `CHART_TYPES.filter(c => c.id
  !== chartType)`, so the same `ResultDataset` is rendered as all four chart types without
  a single extra request. "Promote {label}" sets `chartType` and scrolls to top.

### 7.5 Result charts

`ResultCharts` is a pure function of `(dataset, chartType)`:

| `chartType` | Recharts composition | Data field |
| --- | --- | --- |
| `pie` | `PieChart` > `Pie` (donut, `innerRadius 46%`, `outerRadius 76%`) + `Legend` bottom | `dataset.categories` |
| `bar` | `BarChart` + `CartesianGrid` + `XAxis`/`YAxis`, `Cell` per bar, `Brush` when `data.length > 6` | `dataset.categories` |
| `line` | `AreaChart` with two `Area`s (`value` = "Affected area", `secondary` = "Reference") and gradient defs, `Brush` when `data.length > 8` | `dataset.timeline` |
| `histogram` | `BarChart` with `barCategoryGap={2}` and a single accent fill | `dataset.confidenceBands` |

Shared pieces: `AXIS_PROPS` / `GRID_PROPS` (console styling), a custom `ChartTooltip`
(dark glass, per-entry colour dot, tabular numerals), and `CHART_PALETTE` for categorical
colours with `SEVERITY_MAP` / `DETECTION_TYPE_MAP` hexes taking precedence where the label
matches. PNG export clones the SVG, pins `font-family`, serialises it, rasterises through
a `2×` canvas and downloads a blob (`lib/chartExport.ts`).

---

## 8. Responsive design strategy

### 8.1 Breakpoints

Tailwind defaults are used, unchanged by `tailwind.config.ts` (the config extends
`theme.extend` only): `sm` 640 px, `md` 768 px, `lg` 1024 px, `xl` 1280 px, `2xl` 1536 px.

| Region | < 640 | 640–1023 | 1024–1279 | ≥ 1280 |
| --- | --- | --- | --- | --- |
| Header identity block | icon hidden (`hidden sm:grid`), tagline hidden | icon + tagline | + nav labels (`hidden lg:inline`) | + 4-metric KPI strip (`hidden xl:flex`) |
| Header rail toggle | visible (`lg:hidden`) | visible | hidden | hidden |
| Sidebar | mobile sheet | mobile sheet | fixed 344 px rail (`hidden … lg:flex`) | fixed 344 px rail (collapsible) |
| Globe overlay: rail collapse | — | — | `lg:block` | `lg:block` |
| Globe overlay: legend | hidden | hidden | `hidden … lg:block`, `max-w-[13rem]` | same |
| Globe overlay: comparison trigger | visible (bottom-16 left-4) | visible | visible | visible |
| Telemetry HDG | hidden (`hidden sm:flex`) | visible | visible | visible |
| Stage tabs | `grid-cols-2` | `grid-cols-2` | `sm:grid-cols-4` | `sm:grid-cols-4` |
| Chart type selector | `grid-cols-2` | `grid-cols-2` | `sm:grid-cols-4` | `sm:grid-cols-4` |
| Comparative chart pack | 1 column | 1 column | 1 column | `xl:grid-cols-2` |
| Extract / widget grids | 1 col | `sm:grid-cols-2` | `lg:grid-cols-3` / `lg:grid-cols-4` | `xl:grid-cols-4` / `xl:grid-cols-3` |

Fitting constants live as CSS custom properties in `globals.css`:
`--chrome-header: 56px` (matches `h-14`), `--chrome-gutter: 16px`,
`--sidebar-width: 344px`. `Sidebar` uses `w-[var(--sidebar-width)] max-w-[88vw]` so the
rail can never exceed a narrow phone width.

The page itself never scrolls (`body { overflow: hidden; overscroll-behavior: none }`);
only panel bodies scroll, with `.scrollbar-mission` styling and `min-h-0` on every flex
ancestor to let `overflow-y-auto` actually clip.

### 8.2 Desktop three-pane layout (≥ 1024 px)

```
┌─ HeaderBar (h-14, z-chrome) ───────────────────────────────────────────────┐
├──────────────┬─────────────────────────────────────────────────────────────┤
│ Sidebar      │ <main>  (flex-1, relative)                                  │
│ 344px        │   GlobeViewer — absolute inset-0 canvas                     │
│ overflow-y   │   overlays: collapse (tl) · slider trigger (bl) · legend (br)│
│ auto         │            telemetry (bl, inside viewer)                    │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

It is a two-pane shell, not three: the "third pane" is the globe's overlay layer
(legend / trigger / telemetry) plus the `ComparisonSlider` and `LoadingOverlay`, which are
`position: fixed` and therefore orthogonal to the pane split. The rail can be collapsed
to zero width via `railCollapsed`, which adds `lg:hidden` to the desktop `Sidebar`
instance and leaves the collapse button as the way back.

### 8.3 Tablet and mobile behaviour

* **Sidebar becomes a sheet.** Below `lg` the desktop instance is `hidden`. The header's
  menu button (`lg:hidden`) toggles `Workspace.sidebarOpen`, which renders a full-viewport
  backdrop `<button aria-label="Close controls">` plus a `fixed bottom-0 left-0 top-14
  lg:hidden` container holding a second `Sidebar` with `animate-fade-up`. The sheet has its
  own close affordance (`lg:hidden` header row with "Mission Controls" and an X). Escape is
  *not* wired for the sheet; the backdrop and the X are the exits.
* **Legend collapses away.** `GlobeLegend` in `Workspace` is `hidden … lg:block`; below
  `lg` severity colour is conveyed by `EventCard`'s `SeverityBadge` and by the card's
  `borderLeft` colour instead.
* **Comparison slider is already full-screen.** `ComparisonSlider` is `fixed inset-0
  z-slider`; on small screens the corner labels and the key-hint text shrink out of the way
  (`hidden text-[10px] sm:block`) and the 56 px handle stays the primary target.
* **Touch targets.** `Button` sizes are `sm: h-8`, `md: h-10`, `lg: h-12`, `icon: h-9 w-9` —
  all ≥ 32 px, most ≥ 36 px. The comparison handle is `h-14 w-14` (56 px) and the slider
  root is `touch-none select-none` with pointer capture, so a drag cannot be stolen by
  page scrolling. Cesium's canvas is `touch-action: none` (globals.css) so pinch/rotate go
  to the globe.
* **Viewport.** `layout.tsx` exports `viewport = { width: 'device-width', initialScale: 1,
  maximumScale: 1, userScalable: false }`, with the comment that pinch-zoom is handled
  inside Cesium. This is a deliberate trade-off, and an accessibility regression compared
  with leaving zoom enabled — see §10.
* **Asset paths under a sub-path.** `assetPath()` prefixes `/public` assets with
  `NEXT_PUBLIC_BASE_PATH`, because `assetPrefix` is not applied to absolute `<img src>` in
  the way a static export needs. `BrandingCard` uses it for `logo.svg`.

### 8.4 Media-query hooks — SSR-safe by construction

`useMediaQuery(query)` returns **`false` on the server and during the first client
render**, then adopts the real value in an effect:

```ts
const [matches, setMatches] = useState(false);          // always false first
useEffect(() => {                                        // real value lands here
  const list = window.matchMedia(query);
  setMatches(list.matches);
  const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}, [query]);
```

The module states the contract explicitly: *"Components must therefore be written so the
`false` branch is a valid (if less convenient) layout."* Derived hooks are
`useIsDesktop()` → `(min-width: 1024px)`, `useIsTablet()` → `(min-width: 768px)`, and
`usePrefersReducedMotion()` → `(prefers-reduced-motion: reduce)`.

**Current status:** no component calls `useIsDesktop`, `useIsTablet` or
`usePrefersReducedMotion`; layout responsiveness is implemented entirely with Tailwind
classes, and reduced motion is enforced by CSS (below). The hooks are exported and ready,
but they are not yet on the critical path. Anything that *does* need them (a bottom-sheet
for the legend on phones, a non-Cesium fallback view) must respect the `false`-first rule.

### 8.5 Reduced motion

Two independent mechanisms:

1. `globals.css` `@media (prefers-reduced-motion: reduce)` sets
   `animation-duration: 0.001ms !important`, `animation-iteration-count: 1 !important`,
   `transition-duration: 0.001ms !important` on `*` and its pseudo-elements — so
   `animate-pulse-ring`, `animate-scan`, `animate-shimmer`, `animate-spin-slow` and
   `animate-fade-up` all resolve to effectively static.
2. `usePrefersReducedMotion()` exists for JS-driven motion (it is what would gate the
   globe's auto-rotation), but **is not currently consumed**; `autoRotate` starts `true` in
   the store and is toggled from the header. Hovering the globe suspends the spin without
   clearing the flag, so an explicitly enabled rotation survives a pointer pass.

---

## 9. Theming

Two themes ship. The switch is a single class on `<html>` (`theme-light` / `theme-dark`),
and every colour in the app resolves through the CSS variables those classes set
(`src/app/globals.css`). **No component branches on the active theme.**

That property is what makes the feature cheap, and it is worth stating why it holds. The
original palette mixed two kinds of colour:

* **Roles** — `space-950…600` (surfaces), `ink*` (text), `accent`, `signal-*`. A panel is a
  panel in either theme; these simply get different values.
* **Tints** — `bg-white/6`, `border-white/8`, `bg-black/25`. These were hardcoded neutrals
  scattered across 33 files, and they are invisible on a light background.

The tints became three tokens: `elevate` (raised/hover/sheen), `hairline` (borders and
dividers) and `sunken` (inset wells). Because Tailwind's `/opacity` syntax composes with a
variable-driven colour, `bg-white/6` → `bg-elevate/6` means the same thing in both themes —
6% white over near-black, 6% slate over near-white — so the same alphas survive the flip.

`.tools/migrate-color-tokens.mjs` performed that rename: 163 replacements across 33 files. It
is idempotent and reports any neutral utility it does not know about, which is how the one
deliberate survivor was found (`border-black/40` around the basemap thumbnails, which are
dark gradients in both themes).

### Where CSS is not enough

Three places cannot read the variables, and each is handled at its own level:

| Subsystem | Why CSS cannot reach it | Handled by |
| --- | --- | --- |
| Cesium scene | Backdrop, globe base colour, atmosphere, fog and the skybox live in the WebGL context | `applySpaceBackdrop` + `createStarfieldSkyBox` — `src/lib/cesium/viewer.ts`. **Deliberately takes no theme**: the chrome is themed, the space is not |
| Chart plot furniture | Recharts writes colours as SVG *presentation attributes* | CSS in `globals.css`. Presentation attributes lose to any CSS rule, so axes, grid, ticks, legends and tooltips are themed with no per-chart code |
| Exported chart PNG | Painted onto a canvas outside the document, so it inherits nothing | `exportBackgroundFor(theme)` — `src/lib/chartTheme.ts` |

**The space stays dark in both themes.** The theme governs the chrome. The map is a sensor
view — a pale backdrop washes out imagery, terrain and the change markers, and on screen it
read as a grey halo around the planet. So `applySpaceBackdrop` ignores the theme entirely and
`--vignette-edge` holds the same value in both token blocks. An earlier revision did theme the
scene; that is what this replaced.

**Stars.** `createStarfieldSkyBox` installs six procedurally generated 1024² faces
(`.tools/make-skybox.py` → `public/skybox/`, ~171 KB total) as a custom `SkyBox`. The motion
is a consequence of the geometry rather than an animation: the skybox is fixed in the inertial
frame, so when `createAutoRotate` turns the camera about the polar axis the field sweeps past.

**Initial paint.** A light-theme user must not see a dark flash, so the theme is committed
by an inline script in `<head>` (`THEME_INIT_SCRIPT`, `src/lib/theme.ts`) before first paint:
stored choice → `prefers-color-scheme` → dark. The store starts at the server's default
(`dark`) — so there is no hydration mismatch — and adopts the committed value on mount in
`useTheme`. `src/app/providers.tsx` mounts that sync once for the whole app.

**What is deliberately not themed.** `SEVERITIES` and `DETECTION_TYPES` hold fixed hex
values used for globe markers, legend swatches and confidence bars. They encode data: a
hazard that reads as "medium" must not change hue because the interface did. The same
reasoning keeps `CHART_PALETTE` fixed.

---

## 10. Performance strategy

| Technique | Where | Effect |
| --- | --- | --- |
| Runtime Cesium load | `lib/cesium/loader.ts` | Keeps ~1.4 MB + Workers/Assets out of the bundle graph; no webpack worker rewriting; first paint not blocked |
| Lazy, client-only globe mount | `GlobeViewer` has no server render path; the canvas host is `aria-hidden` and the boot effect runs on mount | The shell, header, panels and KPI strip render and become interactive before Cesium arrives, with a real loading state |
| Memoised loader promise | module-level `loaderPromise` | Concurrent callers share a single network request; retry is possible after failure |
| Viewer created once | creation effect depends only on `[attempt]` | No WebGL context churn on state changes — "rebuilding a WebGL context on every keystroke is the classic way to make a GIS dashboard stutter" |
| Projection via narrow effects | five effects with minimal dependency arrays | A basemap change does not rebuild entities; a hover change does not re-apply the basemap |
| Telemetry HUD writes to the DOM | `GlobeTelemetry` `setInterval(…, 220)` + span refs | The camera changes ~60×/s; re-rendering the tree for four numbers would be the most expensive thing in the dashboard |
| Cesium-native split comparison | `scene.splitPosition` + `ImagerySplitDirection` | One WebGL context and one uniform write per frame instead of two synchronised maps |
| `CallbackProperty`-driven pulse | `upsertSelectionMarker` | The AOI pulse is clock-driven, so it costs zero React renders |
| Event-entity full rebuild | `renderEventEntities` | Correct for tens of features (simpler and faster than a diff); the module documents `CustomDataSource` + `EntityCluster` as the path for thousands |
| Hover de-duplication | `createPickHandler`'s `lastHovered` guard | At most one store write per actual hover transition, not per mouse-move event |
| Search debounce | `useDebouncedValue(query, 300)` before the query key | Typing does not fire a request per keystroke; `staleTime 5 min` + `gcTime 10 min` keeps re-searches instant |
| Curated icon registry | `ui/Icon.tsx` imports 59 named icons explicitly instead of `import * as Icons` | A namespace import "defeats tree-shaking and would ship ~1000 unused icons" |
| Package-import optimisation | `next.config.mjs`: `optimizePackageImports: ['lucide-react', 'recharts', 'date-fns']` | Keeps the heavy GIS/chart barrels out of the initial dashboard payload |
| Chart isolation | `recharts` is imported only by `AnalyzingPanel` (sparklines) and `ResultCharts`/`ChartTypeSelector` | The dashboard route does not pay for the chart library until an analysis view renders |
| Infinite `staleTime` on artifacts | extractions / widgets / results queries | A completed artifact is never refetched |
| Self-terminating polls | `refetchInterval` returning `false` | No idle traffic after completion |
| Static-image strategy | `next.config.mjs`: `images: { unoptimized: true }`; imagery is tile URLs, not `next/image` | Required for `output: 'export'`, and correct because all imagery is third-party XYZ/WMTS tiles |
| Logo loading | `BrandingCard`: `loading="eager"`, `decoding="async"` on a 48×48 SVG | Avoids a layout shift in the rail without a lazy-load round trip |
| PNG export at 2× | `chartExport.ts` (`scale = 2`, `canvas.toBlob(..., 0.95)`) | Report-quality raster without shipping a rendering service |

### 9.1 Deliberate trade-offs, documented in the code

* **`requestRenderMode: false`.** The viewer renders continuously. This is a conscious
  choice, not an oversight: auto-rotation runs off `clock.onTick`, the AOI pulse is a
  `CallbackProperty` evaluated per frame, and `GlobeTelemetry` samples the camera on a
  timer — all three assume a live render loop. Turning on request-render mode would
  require explicitly requesting frames from each of those paths. The cost is a constant
  GPU draw; the benefit is that no animation path can silently stall.
* **`preserveDrawingBuffer: true`.** Required so `captureCanvas()`
  (`canvas.toDataURL('image/png')`) returns pixels rather than a blank buffer, which
  powers the "Globe snapshot" buttons on `/analyze` and `/results`. The constructor calls
  this "a modest cost" — it disables the driver's ability to discard the colour buffer
  after compositing, increasing memory bandwidth. It is enabled unconditionally because
  the snapshot is a first-class feature, not an opt-in.
* **No canvas→DOM fallback.** There is no `<canvas>`-vs-`<svg>` switcher and no
  `preferCanvas` flag, because **no** Cesium entity uses a vector/`Billboard`-as-SVG path:
  every marker is a `point`, `polygon`, `ellipse` or `label`, all of which render into the
  single WebGL canvas. Recharts, by contrast, renders SVG, which is exactly what makes the
  2× PNG export possible — the two libraries take opposite approaches and each is used for
  what it is good at.

---

## 11. Accessibility strategy

**Semantics and roles actually implemented**

| Pattern | Component | Roles/attributes |
| --- | --- | --- |
| Location search | `SearchBar` | `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-autocomplete="list"` on the input; `role="listbox"` container; `role="option"` + `aria-selected` per row |
| Basemap choice | `LayersPanel` | `role="radiogroup" aria-label="Basemap"` + `role="radio" aria-checked` |
| Chart type | `ChartTypeSelector` | `role="radiogroup" aria-label="Chart type"` + `role="radio" aria-checked` |
| Stage navigation | `StageTabs` + `/analyze` body | `role="tablist"`, `role="tab"` with `id="tab-{stage}"`, `aria-selected`, `aria-controls="panel-{stage}"`; body is `role="tabpanel"` with `aria-labelledby` |
| ANALYZE menu | `AnalysisDropdown` | `aria-haspopup="menu"`, `aria-expanded`, `role="menu" aria-label="Analysis stages"`, `role="menuitem"` |
| Collapsible panels | `CollapsiblePanel` | real `<button aria-expanded aria-controls={useId()}>` + `role="region" aria-label` and the `hidden` attribute when closed; deliberately not `<details>`, so the header can host its own buttons without nesting interactive elements |
| Progress | `ProgressBar` | `role="progressbar"` + `aria-valuenow/-min/-max` + `aria-label` |
| Comparison divider | `ComparisonSlider` | `role="slider"`, `aria-valuemin/max/now`, `aria-orientation="horizontal"`, `tabIndex={0}`, `aria-label="Before and after comparison divider"` |
| Blocking overlay | `LoadingOverlay` | `role="dialog" aria-modal="true" aria-busy="true" aria-label={overlay.message}` |
| Date picker | `DateField` | `aria-haspopup="dialog"`, `aria-expanded`, `role="dialog" aria-label`, per-day `aria-pressed` and `aria-current="date"` |
| Toasts | `ToastViewport` / `ToastCard` | `role="status" aria-live="polite"`, per-toast dismiss button with `aria-label` |
| Errors | `ErrorState` | `role="alert"`, human heading chosen from `ApiError` (`isOffline` → "Analysis service unreachable", `isTimeout` → "Request timed out", `isValidation` → "Invalid request"), plus a visible `code:` line and a Retry button |
| Loading rows | `SkeletonRows` | `aria-busy="true" aria-live="polite"` |
| Async buttons | `Button` | `aria-busy` while loading; the spinner is `aria-hidden` and the label swaps via `loadingLabel` |
| Decorative graphics | `Icon` | `aria-hidden` on every icon; legend swatches are `aria-hidden` because the adjacent text carries the meaning |
| Live indicator | `HeaderBar` | status `Badge` with `dot`; `aria-pressed` + `aria-label` on the auto-rotate toggle; `aria-current="page"` on the active nav link |

**Keyboard support**

* `SearchBar`: `ArrowDown`/`ArrowUp` move the active option, `Enter` commits, `Escape`
  closes, and the list closes on outside pointer-down.
* `ComparisonSlider`: `Escape` closes, `ArrowLeft`/`ArrowRight` nudge the split by 0.02.
* `LoadingOverlay`: `Escape` dismisses. `AnalysisDropdown`: `Escape` closes.
  `DateField`: `Escape` closes.
* Native `<select>` is used for detection mode precisely to keep keyboard type-ahead,
  mobile pickers and form autofill working (documented in `Select.tsx`).

**Focus**

`globals.css` defines one global focus ring — `:focus-visible { outline-none ring-2
ring-accent/70 ring-offset-2 ring-offset-space-900 }` — so every interactive element gets a
consistent high-contrast indicator on a dark canvas. Recharts' own focus outlines are
explicitly suppressed (`.recharts-wrapper:focus, .recharts-surface:focus { outline: none }`)
because the surrounding card is not a control and the ring was misleading.

**Colour and contrast**

Severity is never carried by colour alone: `SeverityBadge` always prints the label,
`EventCard` pairs its colour stripe with a text badge and a labelled confidence bar, and
`GlobeLegend` pairs each swatch with text. Chrome text sits on `.glass`/`glass-strong`
surfaces (opaque-ish `rgba(4,7,17,0.92)` / `rgba(7,12,24,0.78)` with blur) rather than
directly on imagery, and the viewer adds top/bottom gradient scrims and a vignette so
overlay text is never placed on a bright tile.

**Known accessibility caveats (honest list)**

1. The Cesium canvas host is `aria-hidden`. Everything the globe conveys (severity
   colour, footprint location) is only available to assistive technology through the
   panels, the legend and the result table — there is no text alternative for the 3D view.
2. `maximumScale: 1` and `userScalable: false` in the exported viewport prevent pinch
   zoom of the page chrome. This is required to hand two-finger gestures to Cesium, and it
   is a real regression for low-vision users on the non-globe surfaces.
3. The mobile sidebar sheet has no Escape handler and no focus trap; the backdrop button
   and the in-sheet close button are the exits.
4. The comparison divider is keyboard-operable, but dragging it to an arbitrary position
   is not possible without a pointer.
5. Reduced motion is honoured for CSS animation only. The globe's auto-rotation runs by
   default and is not suppressed by the preference; `usePrefersReducedMotion()` is the hook
   that would gate it, and it is not wired up.

---

## 12. Testing and verification posture

* No test runner is installed (`package.json` has no `test` script and no test
  dependency). The only automated gate is TypeScript: `npm run typecheck` →
  `tsc --noEmit`, which currently exits `0` under `strict: true`.
* `eslint: { ignoreDuringBuilds: true }` is set in `next.config.mjs` and no ESLint
  configuration or dependency exists; several files still carry
  `eslint-disable @typescript-eslint/…` comments that are inert today. TypeScript is the
  gate.
* `unloadCesium()` and `resetMockServiceState()` exist as test seams (documented as such)
  and are not called from application code.

---

## 13. Known gaps

Verified by reading the frozen tree; each item is shipped-but-unwired or defined-but-unused
rather than "planned".

| # | Gap | Evidence |
| --- | --- | --- |
| 1 | **`LoadingOverlay` can never appear.** `appStore.showOverlay` is defined but never called, and nothing else sets `overlay.visible = true`. Only `hideOverlay` is called (by the overlay's own Dismiss button). | `store/appStore.ts` defines `showOverlay`; a repository-wide search finds no caller outside that file |
| 2 | **The EVENTS free-text filter has no effect on the list.** `useEvents` includes `filter.query` in the query key but does **not** pass `query` to `fetchEvents`, and `selectVisibleEvents` (the client-side equivalent) is never applied — `filtered` is returned as the same array as `events`. A new query key with identical parameters refetches the same page. | `hooks/useEvents.ts` `queryFn` omits `query:`; `selectVisibleEvents` in `store/appStore.ts` has no consumer |
| 3 | **`__fail` error simulation only works on location search.** `mockRequest` honours the token via its `params`, but only `searchLocations` passes `params`; `fetchEvents`, `fetchSarDatasetStatus`, `fetchAnalysisJob`, `fetchExtractions`, `fetchAnalysisWidgets`, `fetchResults` and `fetchMissionSummary` pass none, and `uploadSarDataset`'s mock branch bypasses `mockRequest` entirely. | `services/apiService.ts` `mockRequest({ endpoint, params?, latencyMs })` call sites |
| 4 | **The `x-simulate-error` header is documented but not implemented.** `lib/mock/transport.ts` names it as an alternative trigger; no code reads it. | `transport.ts` header comment vs. `shouldSimulateFailure`, which inspects `params` values only |
| 5 | **The store's `isSidebarOpen` / `toggleSidebar` are dead.** The mobile sheet is driven by `Workspace`'s local `sidebarOpen` state; `isSidebarOpen` is written by `toggleSidebar` and never read. `resetAll` is likewise never called. | `store/appStore.ts` vs `components/Workspace/Workspace.tsx` |
| 6 | **Unrendered UI modules:** `GlassPanel` (the surface — `PanelHeader`/`PanelDivider` from the same file *are* used), `SegmentedControl`, `IndeterminateBar`, `LoadingRow`, `ui/Icon`'s `hasIcon`. | Repository-wide search for `<GlassPanel`, `<SegmentedControl`, `<LoadingRow`, `<IndeterminateBar` returns no hits |
| 7 | **Unconsumed hooks/exports:** `useIsDesktop`, `useIsTablet`, `usePrefersReducedMotion`, `useDelayedFlag`, `severityRank`, `severityHex`, `selectVisibleEvents`, `selectIsAnalyzing`, `unloadCesium`, `isCesiumLoaded`, `clearSelectionMarker`, `resetMockServiceState`. `ProgressSnapshot` (`types/index.ts`) is declared and never used. | Repository-wide searches; `createBaseImageryLayer` and `getCesiumBaseUrl` are the exceptions — used internally by `applyBaseLayer` and `loadCesium` respectively |
| 8 | **No persistence.** The store has no `persist` middleware, so `/analyze` and `/results` render empty states after a reload until a job is started again in that session. | `store/appStore.ts` uses bare `create()` |
| 9 | **`GlobeController` is only ever registered on `/`.** Since `GlobeViewer` mounts only in `Workspace`, the "Globe snapshot" buttons on `/analyze` and `/results` return `null` unless the dashboard has been visited; `/results` reports this as a warning toast. | `Workspace.tsx` is the only `GlobeViewer` consumer; `captureCanvas()` returns `null` when the ref is empty |
| 10 | **Upload cancel is a no-op.** `SarDropzone` renders a hidden Cancel button whose handler is an empty body with the comment that it stays a frontend no-op until the backend exposes an abort route. | `components/ControlPanel/SarDropzone.tsx` |
| 11 | **`Workspace.handleLocationChange` is an empty callback** (`void location`), so the `onLocationChange` prop from `ControlPanel` currently has no effect beyond the camera move that `ControlPanel` performs itself. | `Workspace.tsx` |
| 12 | **`advanceJob`'s unknown-job branch does not throw.** A poll for an unknown `jobId` returns a synthetic `progress: 100` job with the message "Job not found on the analysis service (mock)" instead of a 404, so the UI treats it as complete. A real backend should return `404` with `ApiErrorShape`. | `services/apiService.ts` `advanceJob` |
| 13 | **Mock ignore of request fields.** The mock `POST /api/analyze` ignores `datasetId` and `mode`; the mock upload ignores `fileName`/`sizeBytes` form fields. Documented so the backend team does not infer behaviour from the mock. | `services/apiService.ts` |
