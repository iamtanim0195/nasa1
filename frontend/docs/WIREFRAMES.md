# EARTH-METAMORPHOSIS — Wireframes

> All wireframes describe the implementation in `src/` as it exists. Region labels in
> `<angle brackets>` are component or element names, not decoration. Box-drawing is
> schematic: real spacing is set by Tailwind classes quoted in each callout list.

Legend used throughout:

```
░  glass surface (rgba backdrop + blur)      ·  empty globe / imagery
▓  opaque chrome surface                     ▲  interactive control
─ │ ┌ ┐ └ ┘  borders                          →  measured width or emphasis
```

---

## 1. Desktop dashboard — `/` at ≥ 1280 px

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ <HeaderBar>  h-14 (56px) · bg-space-950/78 · backdrop-blur-xl · border-b · z-chrome           │
│ ┌────┐ ┌──────────────────────┐  ┌───────────────────────────────────────────┐  ┌───────────┐ │
│ │    │ │ ◉ Earth-Metamorphosis│  │ [◉ Active  [◉ Monitored  [◉ Scenes  [◉ Up- │  │ Dashboard │ │
│ │ ⊕  │ │   NISAR Change …     │  │  events]   486.3K km²]  1.8K]    time]    │  │ Analyze   │ │
│ │menu│ └──────────────────────┘  └──────────── xl:flex (hidden < 1280) ───────┘  │ Results ▲ │ │
│ └────┘    (lg:hidden)                 <Metric> ×4                               │ ● Feed live│ │
│                                                                                 │ ▲ ⟳  ▲ ANALYZE▾│
├──────────────────────────────┬──────────────────────────────────────────────────┴───────────┤
│ <Sidebar>  w-344px           │ <main> flex-1  relative                                       │
│ bg-space-950/72 blur-xl      │                                                               │
│ border-r · overflow-y-auto   │  ┌─ <GlobeViewer> absolute inset-0 ──────────────────────────┐ │
│ ░                            │  │  ·  Cesium canvas (aria-hidden)            ·           ·  │ │
│ ░ ┌────────────────────────┐ │  │        ·              ·        ·                      ·   │ │
│ ░ │ <SearchBar>  h-11      │ │  │   ·          ·            ·            ·                 │ │
│ ░ │ ⌕ Search country, city…│ │  │             ▲ <rail collapse>  (left-4 top-4, lg:block)   │ │
│ ░ │   <Selected AOI chip>  │ │  │  ·        ·        ·        ·        ·        ·           │ │
│ ░ └────────────────────────┘ │  │                                                          │ │
│ ░ ┌────────────────────────┐ │  │              ·            ·           ·                  │ │
│ ░ │ <BrandingCard> glass-  │ │  │   ·             ▲ split marker overlay (2 layers)        │ │
│ ░ │ strong · sheen         │ │  │        ·            ·             ·                       │ │
│ ░ │ [logo] ◉ Earth-Meta…   │ │  │                                                          │ │
│ ░ │  NISAR Change Detect…  │ │  │  ┌────────────────────────────────────────────────────┐  │ │
│ ░ │  ● Live   ◉ NISAR·L    │ │  │  │ <GlobeTelemetry>  bottom-4 left-4                 │  │ │
│ ░ └────────────────────────┘ │  │  │ LAT 23.810N  LON 90.413E  ALT 180.0 km  HDG 000°   │  │ │
│ ░                            │  │  └────────────────────────────────────────────────────┘  │ │
│ ░ ┌ <CollapsiblePanel> ────┐ │  │                                                          │ │
│ ░ │ ▾ ◈ Layers           0│ │  │                                                          │ │
│ ░ │   Basemap and imagery  │ │  │  ┌──────────────────────┐        ┌────────────────────┐  │ │
│ ░ │ ┌─────────┬──────────┐ │ │  │  │ ▲ Activate slider    │        │ <GlobeLegend>      │  │ │
│ ░ │ │ ▤ ░░░░  │ ▤ ░░░░   │ │ │  │  │   bottom-16 left-4   │        │  bottom-16 right-4 │  │ │
│ ░ │ │ Default │ Satellite│ │ │  │  └──────────────────────┘        │  ● Critical sev.   │  │ │
│ ░ │ ├─────────┼──────────┤ │ │  │                                  │  ● High severity   │  │ │
│ ░ │ │ ▤ ░░░░  │ ▤ ░░░░   │ │ │  │                                  │  ● Medium severity │  │ │
│ ░ │ │ Terrain │ Dark  ✓  │ │ │  │                                  │  ● Low severity    │  │ │
│ ░ │ └─────────┴──────────┘ │ │  │                                  │  ◉ Selected AOI    │  │ │
│ ░ └────────────────────────┘ │  │                                  │  ── Flood/Landsl.  │  │ │
│ ░                            │  │                                  └────────────────────┘  │ │
│ ░ ┌ <CollapsiblePanel> ────┐ │  │                                  hidden < lg · max-w-13rem│ │
│ ░ │ ▾ ⚙ Control Panel      │ │  │  ┌────────────────────────────────────────────┐          │ │
│ ░ │   Job definition       │ │  │  │ ◉ Analysis running — view pipeline         │          │ │
│ ░ │ Location Input         │ │  │  │   bottom-4 right-4  (when isRunning)       │          │ │
│ ░ │ ┌────────────────────┐ │ │  │  └────────────────────────────────────────────┘          │ │
│ ░ │ │ ◎ Dhaka, Bangladesh│ │ │  │                                                          │ │
│ ░ │ │   23.8103°N, 90.4125°E │ │ │  ┌────────────────────────────────────────────┐          │ │
│ ░ │ │              clear │ │ │  │  │ ⚠ Globe offline — panels and analysis …    │          │ │
│ ░ │ └────────────────────┘ │ │  │  │   top-4 centred  (when globeFailed)        │          │ │
│ ░ │ ▲Dhak ▲Sund ▲Sylhet …  │ │  │  └────────────────────────────────────────────┘          │ │
│ ░ │ ────────────────────   │ │  │                                                          │ │
│ ░ │ DETECTION MODE         │ │  │  ⚠ If the Cesium runtime cannot load, the whole viewer    │ │
│ ░ │ [ Flood Detection ▾ ]  │ │  │    is replaced by "Globe unavailable" + "Retry globe"     │ │
│ ░ │  Surface-water extent… │ │  │                                                          │ │
│ ░ │  ▭Water ▭Rivers ▭Shore │ │  └──────────────────────────────────────────────────────────┘ │
│ ░ │ ────────────────────   │ │                                                               │
│ ░ │ OBSERVATION WINDOW 157d│ │                                                               │
│ ░ │ BEFORE DETECTION DATE  │ │                                                               │
│ ░ │ [▦ 2025-01-15       ✕] │ │                                                               │
│ ░ │ AFTER DETECTION DATE   │ │                                                               │
│ ░ │ [▦ 2025-06-20       ✕] │ │                                                               │
│ ░ │ ─────── Ingest ─────── │ │                                                               │
│ ░ │ ┌────────────────────┐ │ │                                                               │
│ ░ │ │ ⇧ Drag & drop SAR  │ │ │                                                               │
│ ░ │ │   .tif·.tiff·.h5…  │ │ │                                                               │
│ ░ │ │   [ Browse files ] │ │ │                                                               │
│ ░ │ └────────────────────┘ │ │                                                               │
│ ░ │ [   ◉ Run Analysis   ] │ │                                                               │
│ ░ └────────────────────────┘ │                                                               │
│ ░ ┌ <CollapsiblePanel> ────┐ │                                                               │
│ ░ │ ▾ ◎ Events          (26)│ │                                                              │
│ ░ │   Detected changes     │ │                                                               │
│ ░ │ ┌───────┬───────┬─────┐│ │                                                               │
│ ░ │ │ 26    │ 14    │ 3.2K││ │   Detections / Critical / Area                            │ │
│ ░ │ └───────┴───────┴─────┘│ │                                                               │
│ ░ │ [⌕ Filter by ID or … ✕]│ │                                                               │
│ ░ │ ▲Flood ▲Landsl ▲Earthq…│ │                                                               │
│ ░ │ ▲Crit ▲High ▲Med ▲Low  │ │                                                               │
│ ░ │ Min confidence      0% │ │                                                               │
│ ░ │ ═══════════════════════│ │                                                               │
│ ░ │ 26 shown        ⟳ Reset│ │                                                               │
│ ░ │ ┌────────────────────┐ │ │                                                               │
│ ░ │ │ ◈ EM-2400    Crit. │ │ │                                                               │
│ ░ │ │ [Flood]  12 Jun 2025│ │ │                                                              │ │
│ ░ │ │ ⌖ Sundarbans, Bang… │ │ │                                                               │
│ ░ │ │ Confidence 92.4%    │ │ │                                                               │
│ ░ │ │ ████████████░ 142 km²│ │ │                                                              │
│ ░ │ └────────────────────┘ │ │                                                               │
│ ░ │  … more <EventCard> …  │ │                                                               │
│ ░ └────────────────────────┘ │                                                               │
├──────────────────────────────┴───────────────────────────────────────────────────────────────┤
│ <ComparisonSlider>   fixed inset-0 z-slider   (only when isComparisonActive)                  │
│ <LoadingOverlay>     fixed inset-0 z-overlay  (only when overlay.visible — see note)          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Callout list — desktop

| # | Region | Component / element | Detail and responsive behaviour |
| --- | --- | --- | --- |
| 1 | Mission status bar | `<HeaderBar>` in `components/HeaderBar/HeaderBar.tsx` | `h-14` (56 px), `z-chrome`, `bg-space-950/78 backdrop-blur-xl`, `border-b border-white/8`. Persistent on all three routes. `shrink-0`. |
| 2 | Rail toggle | `<Button size="icon" variant="ghost">` | `className="lg:hidden"` — visible only below 1024 px; `aria-expanded={sidebarOpen}`. |
| 3 | Identity block | inline in `HeaderBar` | Satellite glyph in a bordered square is `hidden sm:grid` (appears ≥ 640 px); the "NISAR Change Detection Platform" tagline is `hidden sm:block`. |
| 4 | KPI strip | `<Metric>` ×4 (local component) | Active events / Monitored km² / Scenes / Uptime, each `formatCompact` or `formatPercent(…, 2)`. Container is `ml-2 hidden items-center gap-2 xl:flex` — **hidden below 1280 px**. Values pulse (`animate-pulse`) while `isLoading`. Data: `useMissionSummary()` → `['mission','summary']`, polled every 60 s. |
| 5 | Route nav | `<Link>` ×3 | Dashboard `/`, Analyze `/analyze`, Results `/results`; `aria-current="page"` on the active one. Labels are `hidden lg:inline`, so below 1024 px only the icons remain. |
| 6 | Feed status badge | `<Badge tone={success|warning|danger} dot>` | Derived from `useMissionSummary()`: `isError` → Offline (danger), `isLoading` → Syncing (warning), else Feed live (success). |
| 7 | Auto-rotate toggle | `<Button size="icon">` | `aria-pressed={autoRotate}`, `aria-label` swaps between "Pause globe rotation" / "Resume globe rotation"; icon `Pause` when on, `Play` when off. Initial state `autoRotate: true`. |
| 8 | ANALYZE dropdown | `<AnalysisDropdown>` | Top-right of the **header bar**, not floating over the globe. `aria-haspopup="menu"`, panel `role="menu"` at `right-0 top-[calc(100%+6px)] w-[19rem] z-chrome`. Header shows a spinner + `progress%` while running, `Ready` badge when `jobId` exists, `No job` otherwise. Each of the four items shows `stageStates[…].status` (Idle / Running / Ready) and navigates to `/analyze?stage=<id>`. |
| 9 | Left rail | `<Sidebar>` in `components/Sidebar/Sidebar.tsx` | `flex h-full w-[var(--sidebar-width)]` = **344 px**, `max-w-[88vw]`, `border-r`, `bg-space-950/72 backdrop-blur-xl`, body `overflow-y-auto p-3 scrollbar-mission`. Below `lg` the desktop instance is `hidden` (see §2). Collapsing the rail applies `lg:hidden` and is undone by the collapse button (region 13). |
| 10 | Search | `<SearchBar>` | `h-11` combobox. Below it, when a location is selected and the list is closed, a compact AOI chip shows `name` + `formatCoordinate(…, 2)`. Result panel is absolutely positioned under the input (`max-h-[19rem]`, `z-chrome`) with `role="listbox"`. |
| 11 | Branding card | `<BrandingCard>` | `glass-strong sheen`, 48×48 `logo.svg` via `assetPath()`, status badge (Live/Degraded/Offline, currently always `online` because `Workspace` does not pass `status`), `◉ NISAR · L-band`. |
| 12 | Panels 1–3 | `<CollapsiblePanel panelId="layers"|"control"|"events">` | Order is fixed workflow order: what am I looking at → what am I computing → what did it find. Open state lives in `appStore.openPanels` and is toggled through `togglePanel`. Header is a real `<button aria-expanded aria-controls>`; the body is `role="region"` and gets the `hidden` attribute when closed. |
| 12a | LAYERS body | `<LayersPanel>` | `role="radiogroup"`, 2×2 grid of radio cards. Each card = CSS-gradient swatch (`SWATCH`) + `bg-grid-faint` graticule + icon + label; the active card gets `border-accent/55 shadow-glow-accent` and a check pip. Radio cards, not a dropdown, because "which map am I looking at" is safety-critical context. |
| 12b | CONTROL PANEL body | `<ControlPanel>` | Location block (selected AOI card with `clear`, otherwise a dashed prompt) → 6 quick `AOI_PRESETS` chips → `PanelDivider` → `Select` for detection mode + description + `extracts` chips → `PanelDivider` → observation window with a live day count and two `<DateField>`s (each opens a `role="dialog"` calendar) → `PanelDivider label="Ingest"` → `<SarDropzone>` → "Run Analysis" (`variant="accent"`, disabled unless a location and both dates are valid) with a contextual hint line. |
| 12c | EVENTS body | `<EventsPanel>` | 3-up summary tiles (Detections / Critical / Area) → free-text filter (see limitation below) → detection-type chips → severity chips → min-confidence range → "N shown / Querying…" + Reset + Refresh → scrolling `<ul>` of `<EventCard>` (`max-h-[26rem] lg:max-h-[30rem]`, `scrollbar-mission`) → footer badges of the top 4 detection types. States: `<ErrorState compact>` / `<SkeletonRows rows={4}>` / `<EmptyState compact>`. |
| 13 | Rail collapse button | inline `<button>` inside `GlobeViewer` children | `absolute left-4 top-4 z-chrome hidden … lg:block`; `aria-pressed={railCollapsed}`; icon `PanelLeftClose`/`PanelLeftOpen`. This is the only way back to the rail once collapsed. |
| 14 | Globe canvas | `<GlobeViewer>` in `components/GlobeViewer/GlobeViewer.tsx` | `relative h-full w-full`, host `<div class="cesium-host absolute inset-0" aria-hidden>`. Three non-interactive overlays sit above the canvas: a radial vignette, a 28-height top gradient and a 28-height bottom gradient, so chrome stays legible over bright imagery. |
| 15 | Telemetry HUD | `<GlobeTelemetry>` | `absolute bottom-4 left-4 z-chrome`, `pointer-events-none`, inside the viewer. Four readouts; **HDG is `hidden sm:flex`** (dropped below 640 px). Updated by DOM writes on a 220 ms interval, never React state. |
| 16 | Comparison trigger | `<Button>` inside `GlobeViewer` children | `absolute bottom-16 left-4 z-chrome`. Label toggles `Activate slider` ⇄ `Exit slider`; variant switches `subtle` ⇄ `accent` with `isComparisonActive`. |
| 17 | Legend | `<GlobeLegend className="absolute bottom-16 right-4 z-chrome hidden max-w-[13rem] lg:block">` | Rendered by `Workspace`, not by the viewer. Four severity rows, a pulsing "Selected AOI" row, a divider, then seven detection-type swatches. **Entirely hidden below 1024 px**; severity is then conveyed by `SeverityBadge` and the card stripe in the events list. |
| 18 | Analysis-in-progress affordance | inline `<button>` in `Workspace` | `absolute bottom-4 right-4 z-chrome`, rendered only while `isRunning`; clicking routes to `/analyze`. |
| 19 | Globe-offline notice | inline `<button>` in `Workspace` | `absolute left-1/2 top-4 z-chrome -translate-x-1/2`, rendered only when the viewer reports an error; its click handler calls the events `refetch()` so the console stays useful. |
| 20 | Globe failure state | inside `<GlobeViewer>` | Replaces the whole canvas: `AlertTriangle` + "Globe unavailable" + the precise failure text + "Retry globe" (which increments `attempt` and re-runs the creation effect). Copy explicitly states the panels and analysis remain usable. |
| 21 | Global overlays | `<ComparisonSlider>` + `<LoadingOverlay>` | Both `fixed`, rendered by `Workspace` outside the flex row. Overlay visibility is store-driven; **note that nothing currently calls `showOverlay`, so `<LoadingOverlay>` never appears in practice** (Architecture §12, gap 1). |

**Known behaviour limitation at region 12c:** the free-text filter writes
`eventFilter.query` (which is part of the query key but is *not* forwarded to
`fetchEvents`) and `useEvents` returns the store array unfiltered, so typing there does not
change the list. The detection-type, severity and min-confidence controls *are* sent to the
server. See Architecture §12, gap 2.

---

## 2. Tablet — 768–1023 px

```
┌────────────────────────────────────────────────────────────────────┐
│ <HeaderBar> h-14                                                   │
│ ┌────┐ ┌────────────────────┐        ┌────────────────────────────┐ │
│ │ ⊕  │ │ ◉ Earth-Metamorph. │        │ Dashboard  Analyze  Results│ │
│ │menu│ │   NISAR Change …   │        │  (icons only: lg:hidden)   │ │
│ └────┘ └────────────────────┘        │ ● Feed live  ▲ ⟳  ▲ANALYZE▾│ │
│   ▲ lg:hidden                        └────────────────────────────┘ │
│   KPI strip (<Metric> ×4) hidden — requires ≥ 1280 px              │
├────────────────────────────────────────────────────────────────────┤
│ <main> full width — the rail is NOT rendered at this size          │
│  ┌─ <GlobeViewer> ───────────────────────────────────────────────┐ │
│  │   ·        ·           ·            ·          ·              │ │
│  │            ·        ▲ split marker overlay        ·           │ │
│  │  ┌──────────────────────────────────────────────────────────┐ │ │
│  │  │ <GlobeTelemetry> bottom-4 left-4                          │ │ │
│  │  │ LAT 23.810N  LON 90.413E  ALT 180.0 km  HDG 000°  ← sm:flex│ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │  ┌───────────────────┐                                        │ │
│  │  │ ▲ Activate slider │   legend hidden < lg →                 │ │
│  │  └───────────────────┘   severity shown in the events list    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  rail-collapse button hidden (< lg)                                │
└────────────────────────────────────────────────────────────────────┘

── with the sheet open (tapping ⊕) ──────────────────────────────────
┌────────────────────────────────────────────────────────────────────┐
│ <HeaderBar>  (unchanged)                                           │
├────────────────────────────────────────────────────────────────────┤
│ ▓▓▓ <button aria-label="Close controls"> backdrop ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓▓▓ fixed inset-0 z-chrome bg-space-950/70 backdrop-blur-sm ▓▓▓▓▓ │
│ ▓▓▓┌────────────────────────────────────┐  (tap to dismiss) ▓▓▓▓▓▓ │
│ ▓▓▓│ <Sidebar> fixed top-14 bottom-0    │                  ▓▓▓▓▓▓ │
│ ▓▓▓│  left-0 · animate-fade-up          │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ ┌────────────────────────────────┐ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │ MISSION CONTROLS          ▲ ✕ │ │  ← lg:hidden row      ▓▓▓▓ │
│ ▓▓▓│ ├────────────────────────────────┤ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │ <SearchBar>                    │ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │ <BrandingCard>                 │ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │ ▾ Layers                       │ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │ ▾ Control Panel                │ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │ ▾ Events                       │ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ │   … same three panels, scroll …│ │                  ▓▓▓▓▓▓ │
│ ▓▓▓│ └────────────────────────────────┘ │                  ▓▓▓▓▓▓ │
│ ▓▓▓└────────────────────────────────────┘                  ▓▓▓▓▓▓ │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 Callout list — tablet

| Region | Detail |
| --- | --- |
| Header | Identical component; the menu button is now the only rail entry point. Route-nav labels are still hidden (they return at `lg`). The 4-metric KPI strip is still hidden. |
| Rail | Not rendered: `Sidebar` has `hidden shrink-0 lg:flex`. All three panels are reachable only through the sheet. |
| Sheet | Backdrop `<button>` (`fixed inset-0 z-chrome bg-space-950/70 backdrop-blur-sm lg:hidden`) plus a `fixed bottom-0 left-0 top-14 lg:hidden` container. Height is bounded by `top-14`, i.e. exactly below the 56 px header, so the header stays interactive. Sheet body scrolls with `scrollbar-mission`. |
| Sheet close | Two exits: the backdrop and the `✕` button in the `lg:hidden` "MISSION CONTROLS" row. Escape is not wired here. There is no focus trap. |
| Legend | Hidden. The severity channel is carried by `SeverityBadge` and the `borderLeft` colour on each `EventCard`. |
| Telemetry | HDG is visible from 640 px up (`hidden sm:flex`). |
| Rail collapse | Hidden (`lg:block` only) — there is no rail to collapse. |
| Globe | Full-bleed; comparison trigger remains at `bottom-16 left-4`; the "Analysis running" pill remains at `bottom-4 right-4`. |
| Multi-column content | Analysis grids step to `sm:grid-cols-2` (and `lg:grid-cols-3`/`4` later), so at this size the extracting grid and the widget grid are 2-up; the comparative chart pack on `/results` is a single column until `xl`. |

---

## 3. Mobile — < 768 px

```
┌─────────────────────────────────────┐
│ <HeaderBar> h-14                    │
│ ┌──┐ ┌────────────────────────┐     │
│ │⊕ │ │ ◉ Earth-Metamorphosis  │     │   ← brand icon block
│ └──┘ └────────────────────────┘     │      hidden < sm (640)
│  ▲ lg:hidden                        │
│  tagline hidden < sm                │
│        ┌───────────────────────┐    │
│        │  Dashboard │ Analyze  │    │   ← icons only (< lg)
│        │  Results              │    │
│        │  ● Feed live  ▲ANALYZE▾│   │
│        └───────────────────────┘    │
│   KPI strip hidden (< xl)           │
├─────────────────────────────────────┤
│ <main> full width                   │
│ ┌─ <GlobeViewer> ─────────────────┐ │
│ │   ·       ·        ·      ·     │ │
│ │  ┌───────────────────────────┐  │ │
│ │  │ <GlobeTelemetry>          │  │ │
│ │  │ LAT 23.810N LON 90.413E   │  │ │
│ │  │ ALT 180.0 km   (HDG ✂<sm) │  │ │
│ │  └───────────────────────────┘  │ │
│ │  ┌────────────────┐             │ │
│ │  │ ▲ Activate     │             │ │
│ │  │   slider       │             │ │
│ │  └────────────────┘             │ │
│ └─────────────────────────────────┘ │
│  ┌───────────────────────────────┐  │
│  │ ◉ Analysis running — view … ▲ │  │  ← bottom-4 right-4
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
   Rail, legend and rail-collapse are all absent; the ⊕ sheet is the
   only way to reach search, layers, control and events.

── single-column content below sm ────────────────────────────────────
 <StageTabs>        grid-cols-2   (becomes sm:grid-cols-4)
 <ChartTypeSelector> grid-cols-2  (becomes sm:grid-cols-4)
 extracting grid    grid-cols-1   (becomes sm:grid-cols-2 …)
 widget grid        grid-cols-1   (becomes lg:grid-cols-2 …)
 comparison handle  h-14 w-14 (56 px) — unchanged, still the primary target
```

### 3.1 Callout list — mobile

| Region | Detail |
| --- | --- |
| Header | `px-3`. The identity icon square and the tagline both drop out below 640 px, leaving the wordmark, icons-only nav, status badge, auto-rotate and ANALYZE. |
| KPI strip | Hidden (`xl:flex`). Mission KPIs are unavailable on mobile. |
| Sidebar | Only reachable as the sheet described in §2; the sheet is `max-w-[88vw]` through the `Sidebar` root class, so the backdrop stays tappable. |
| Legend | Hidden. |
| Telemetry | LAT/LON/ALT only; HDG is dropped. |
| Touch targets | `Button` `sm` is `h-8` (32 px) and `icon` is `h-9 w-9` (36 px); the comparison handle is 56 px; the comparison root is `touch-none` with pointer capture. Cesium's canvas sets `touch-action: none` so globe gestures are not stolen by page scroll. |
| Viewport | `maximumScale: 1`, `userScalable: false` — page pinch-zoom is disabled so two-finger gestures reach Cesium (an accessibility trade-off; Architecture §10). |
| Overlays | `ComparisonSlider` and `LoadingOverlay` are `fixed inset-0` and therefore already full-screen at this size. |

---

## 4. Analysis views — `/analyze?stage=<id>`

All four views share the same shell: `<HeaderBar>`, a page header (AOI + observation
window, `jobId` badge, `isRunning` percentage badge, "Start analysis" when there is no
job), the pipeline error banner (`error.code` + `error.message` + Retry), `<StageTabs>`,
and the stage body in a `role="tabpanel"` with `animate-fade-up`.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ <HeaderBar>                                                                │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌ Analysis Workspace ────────────────────────────────────────────────────┐ │
│ │ max-w-[1600px] · p-4 lg:p-6 · Dhaka · 2025-01-15 → 2025-06-20          │ │
│ │                                   [job-xxxx] [⟳ 47%] [Start analysis]  │ │
│ ├────────────────────────────────────────────────────────────────────────┤ │
│ │ <StageTabs>  role="tablist"  grid-cols-2 sm:grid-cols-4                │ │
│ │ ┌──────────────┬──────────────┬──────────────┬──────────────┐          │ │
│ │ │ ◈ D-SAR-D    │ ◈ Extracting │ ◈ Analyzing  │ ◈ Result     │          │ │
│ │ │ 100% · done  │ 62% · running│ pending      │ pending      │          │ │
│ │ │ ████████████ │ ███████░     │              │              │          │ │
│ │ └──────────────┴──────────────┴──────────────┴──────────────┘          │ │
│ │ ███████████████████░░░░░░░░░░░  47% overall                            │ │
│ ├────────────────────────────────────────────────────────────────────────┤ │
│ │  ▾ one of the four panels below                                        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 D-SAR-D — `<DsardPanel>`

```
┌── Job header (sheen, border-accent/25) ────────────────────────────────────┐
│ [job-8f3a] [⟳ Running]                          ┌ Pipeline ──────────────┐ │
│ Dhaka, Bangladesh                               │ ███████░░░░░ 48%       │ │
│ Started 20 Jun 2025, 14:02 UTC · ETA 7s         │        4/8 steps       │ │
│ ┌ message ──────────────────────────────────┐   └────────────────────────┘ │
│ │ DSARD stage · 48%                         │                              │
│ └───────────────────────────────────────────┘                              │
├── lg:grid-cols-[1.35fr_1fr] ───────────────────────────────────────────────┤
│ ┌ Step cards <ol aria-label="Processing steps"> ──┐ ┌ Progress timeline ─┐ │
│ │ ① ⇧ SAR Ingest & Orbit Correction        done   │ │ ●─ SAR Ingest…     │ │
│ │    Apply precise orbit ephemeris…               │ │   20 Jun, 14:02    │ │
│ │ ② ◉ Radiometric Calibration            running  │ │ ●─ Radiometric …   │ │
│ │    Convert DN to sigma-nought…                  │ │   20 Jun, 14:02    │ │
│ │ ③ ○ Speckle Filtering                  pending  │ │ ◉─ Speckle Filt.   │ │
│ │    Refined Lee / NL-SAR despeckling…            │ │   awaiting         │ │
│ │ ④ ○ Coregistration                      pending │ │ ○─ Coregistration  │ │
│ │ ⑤ ○ Interferometric Coherence           pending │ │ ○─ Interferometric │ │
│ │ ⑥ ○ Adaptive Thresholding               pending │ │ ○─ Adaptive Thresh.│ │
│ │ ⑦ ○ Change Classification               pending │ │ ○─ Change Classif. │ │
│ │ ⑧ ○ Vectorisation & Statistics          pending │ │ ○─ Vectorisation   │ │
│ │                                                  │ │ [View extraction →]│ │
│ └──────────────────────────────────────────────────┘ └────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

Callouts: step status drives the icon (`CheckCircle2` / `Loader2` / `AlertTriangle` /
index number) and the card border tone; the timeline duplicates the same statuses as
markers on a vertical spine and prints `step.finishedAt` or "awaiting". Empty state (no
`jobId`) is an `EmptyState` with a Radar icon and a "Start analysis" button. The
"View extraction results" button only calls `setActiveStage('extracting')` — it does not
force the `?stage=` query parameter, so the URL is unchanged (the store is authoritative on
this page).

### 4.2 Extracting — `<ExtractingPanel>`

```
┌ Summary strip ─ sm:grid-cols-2 lg:grid-cols-4 ─────────────────────────────┐
│ Classes 7        Features 24.1K     Total area 6.4K km²   Mean conf. 81.2% │
├────────────────────────────────────────────────────────────────────────────┤
│ Extraction classes            [ area | count | confidence ]  ← sort control │
│ ┌ Water Bodies ─────┐ ┌ Vegetation ──────┐ ┌ Buildings ──────┐ ┌ Roads ────┐│
│ │ ◈            +12% │ │ ◈           −4%  │ │ ◈          +31% │ │ ◈     −2% ││
│ │ Water Bodies      │ │ Vegetation       │ │ Buildings       │ │ Roads     ││
│ │ 8.2K features 1.8K│ │ 5.1K feats 1.2K  │ │ 4.4K     980 km²│ │ 3.0K 640  ││
│ │ Confidence 88.4%  │ │ Confidence 74.1% │ │ Conf. 91.2%     │ │ Conf 79%  ││
│ │ ████████████░     │ │ ██████████░      │ │ █████████████   │ │ ███████   ││
│ └───────────────────┘ └──────────────────┘ └─────────────────┘ └───────────┘│
│ sm:grid-cols-2 · lg:grid-cols-3 · xl:grid-cols-4                           │
├ Dominant class · Water Bodies ─────────────────────────────────────────────┤
│ Feature count  8231                                                        │
│ Area           1846.2 km²                                                  │
│ Confidence     88.4 %                                                      │
│ Change vs reference  12.4 %                                                │
└────────────────────────────────────────────────────────────────────────────┘
```

Callouts: three states — no `jobId` → `EmptyState` ("Nothing extracted yet"); still on
`dsard` with no categories → an accent "Vectorisation has not started" notice plus a
7-card skeleton grid; otherwise the data grid. Card tone/badge is driven by
`category.trend >= 0`; the confidence bar uses `tone="success"` above 0.85. Cards are
`sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` — 1-up on mobile.

### 4.3 Analyzing — `<AnalyzingPanel>`

```
┌ lg:grid-cols-2 xl:grid-cols-3 ─────────────────────────────────────────────┐
│ ┌ Flood ─────────────────────── Severe ┐ ┌ Landslide ──────── Elevated ───┐│
│ │ ◈ Flood exposure index                │ │ ◈ Landslide exposure index    ││
│ │ Risk index                            │ │ Risk index                    ││
│ │ 82/100            ▲ model-scored      │ │ 61/100         ▲ model-scored  ││
│ │ ████████████████████░  (danger)       │ │ ████████████░░░░░  (warning)  ││
│ │ ┌ sparkline (AreaChart, 48px, no axes)│ │ ┌ sparkline ─────────────────┐││
│ │ └─────────────────────────────────────┤ │ └────────────────────────────┘││
│ │ Affected area    1,284.2 km²    +12%  │ │ Affected area  842.0  −3%     ││
│ │ Scenes processed 38             +4%   │ │ Scenes processed 22   +8%     ││
│ │ Mean coherence   0.78           −0.02 │ │ Mean coherence   0.61  +0.05  ││
│ │ Population exp.  214,882        −7%   │ │ Population exp.  98,120 +11%  ││
│ └───────────────────────────────────────┘ └───────────────────────────────┘│
│  … one card per AnalysisWidget (7 for the mock: one per detection domain)  │
└────────────────────────────────────────────────────────────────────────────┘
```

Callouts: `riskTone()` maps ≥ 75 → danger/"Severe", ≥ 50 → warning/"Elevated", else
success/"Nominal", and the progress bar tone follows. `Sparkline` is an
`<AreaChart>` in a 48 px box (`h-12`) with a gradient `defs` id derived from
`widget.id` — no axes, no grid, tooltip only. Metrics render through `MetricRow`, with
`formatCompact` above 9 999 and signed deltas. When there is a `jobId` but no widgets, the
panel shows a `({stage}, {progress}%)` notice plus a 6-card skeleton grid at
`lg:grid-cols-2 xl:grid-cols-3`.

### 4.4 Result — `<ResultPanel>`

```
┌ KPI row ─ sm:grid-cols-2 lg:grid-cols-4 ───────────────────────────────────┐
│ DETECTIONS  1,284 │ AFFECTED AREA 6.4K km² │ MEAN CONFIDENCE 86.2% │ CLASSES 7│
│ hint job-8f3a     │                        │                       │          │
├ Visualisation ────────────────────── [Pie Chart] [⇩ Globe snapshot] ───────┤
│ ┌ ◉ Pie Chart ──┬ ◉ Histogram ─┬ ◉ Line Graph ─┬ ◉ Bar Graph ─────────────┐│
│ │ Class share   │ Confidence   │ Detection     │ Area by detection class ││
│ │ of affected…  │ distribution │ trend over …  │                         ││
│ └───────────────┴──────────────┴───────────────┴─────────────────────────┘│
│   role="radiogroup" · grid-cols-2 sm:grid-cols-4 — the four chart buttons  │
├ <ResultCharts height={340}> ───────────────────────────────────────────────┤
│ Affected area by class                          [⇩ Export PNG / ✓ Saved]  │
│ 1,284 detections · 6.4K km² · mean confidence 86.2%                        │
│                                                                            │
│            ░░░░░░            Pie (donut 46%→76%) · Legend bottom           │
│         ░░░        ░░░       Histogram → confidenceBands                    │
│         ░░    ◉     ░░       Line      → timeline (2 areas + Brush > 8)    │
│            ░░░░░░            Bar       → categories (Brush > 6)            │
│         label · label · label                                              │
├ Largest detections ──────────────────────────── generated 20 Jun 2025 ─────┤
│ Event     │ Type     │ Location        │ Severity │ Confidence │      Area  │
│ EM-2400   │ ▪Flood   │ Sundarbans, Ban…│ CRITICAL │      92.4% │  142 km²  │
│ EM-2401   │ ▪Landsl. │ Central Himal…  │ HIGH     │      88.1% │  118 km²  │
│  …6 rows (largest by areaKm2 from appStore.events) — row click selects     │
│    the event and flies the globe to it                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

Callouts: three states — no `jobId` → `EmptyState`; `!isComplete || !dataset` → an
"Aggregating results" card with a labelled progress bar, 4 skeleton KPI tiles and a
`h-[320px]` chart skeleton; otherwise the full view. Chart type is pure store state, so
switching never refetches. The detection table is `min-w-[42rem]` inside
`overflow-x-auto`, so it scrolls horizontally on mobile rather than collapsing. The
`/results` route re-renders this whole block inside `<div id="results-pack">` and then
appends a "Comparative chart pack" section (`grid gap-4 xl:grid-cols-2`) rendering the
three non-hero chart types with `height={240}` and a "Promote {label}" button each.

---

## 5. Full-screen comparison slider — `<ComparisonSlider>`

Rendered by `Workspace` when `appStore.isComparisonActive` is true. It is chrome over
**one** Cesium viewer: `enableSplitComparison` assigns `ImagerySplitDirection.LEFT` to the
`comparison:before` layer and `.RIGHT` to `comparison:after`, and the drag writes
`scene.splitPosition`.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  fixed inset-0 z-slider (60) · select-none touch-none · cursor-ew-resize        │
│                                                                                │
│ ┌ Before ──────────┐                              ┌ After ──────────┐          │
│ │ ◁▷ Before        │                              │ ◁▷ After         │          │
│ │ Sentinel-2       │                              │ Current optical  │          │
│ │ cloudless (2020) │                              │ basemap          │          │
│ └──────────────────┘  (top-20 left-4)             └──────────────────┘          │
│                    (top-20 right-4, items-end)                                 │
│                                                                                │
│  LEFT imagery layer                 │  RIGHT imagery layer                      │
│  ImagerySplitDirection.LEFT         │  ImagerySplitDirection.RIGHT              │
│                                     │                                           │
│                                     │                                           │
│                              ┌──────┴──────┐                                   │
│                              │      ◁▷     │  ← 56px grab handle               │
│                              └──────┬──────┘     (h-14 w-14, rounded-full,      │
│                                     │             border-accent/80,             │
│                                     │             scale-110 while dragging)    │
│                                     │                                           │
│                                     50%          ← position readout            │
│                                     │              telemetry, top-[calc(50%+48px)]│
│                                                                                │
│                    ┌──────────────────────────────────────┐                    │
│                    │ Drag or use ← → · Esc to exit  [✕ Exit comparison] │       │
│                    └──────────────────────────────────────┘                    │
│                          bottom-6 left-1/2 -translate-x-1/2                    │
│                                                                                │
│        ⚠ (centre, translate-y-16) when supportsSplit() === false:              │
│        "This browser's WebGL context does not expose split rendering —         │
│         both layers are shown blended."                                        │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Callout list — comparison slider

| Region | Detail |
| --- | --- |
| Root | `role="slider"` + `aria-valuemin=0` / `aria-valuemax=100` / `aria-valuenow={Math.round(position*100)}` + `aria-orientation="horizontal"` + `tabIndex={0}`. `fixed inset-0 z-slider` (60, above `chrome` = 40, below `overlay` = 80). |
| Pointer model | `onPointerDown` ignores non-primary mouse buttons, calls `setPointerCapture`, then `updateFromClientX`; `onPointerMove` only acts while `dragging`; `onPointerUp`/`onPointerCancel` release. Position = `clamp((clientX - rect.left) / rect.width, 0, 1)`. |
| Divider | `pointer-events-none absolute inset-y-0` at `left: {position*100}%`; a 2 px accent line with `shadow-glow-accent`, intensified to `0 0 28px 6px rgba(39,201,255,0.75)` while dragging. |
| Handle | `h-14 w-14` (56 px) circle, `MoveHorizontal` icon, `scale-110` while dragging, plus a concentric `animate-pulse-ring` ring and (on first entry, while not dragging) an extra pulsing ring at the centre so the divider is findable on a busy basemap. |
| Readout | `(position * 100).toFixed(0)%` in tabular monospace. |
| Corner labels | Before (neutral badge, `COMPARISON_BASEMAPS.before.label` = "Sentinel-2 cloudless (2020)") and After (accent badge, "Current optical basemap"), positioned `top-20` to clear the header. |
| Controls | Bottom-centre pill with the hint "Drag or use ← → · Esc to exit" (`hidden … sm:block`) and an "Exit comparison" button. |
| Keyboard | `Escape` → `onClose()`; `ArrowLeft`/`ArrowRight` → ±0.02, clamped. |
| Reset behaviour | Entering comparison resets the divider to `initialPosition` (0.5). Leaving sets `scene.splitPosition = 0` via `disableSplitComparison` and removes both `comparison:` layers. |
| Degraded path | `controller?.supportsSplit() ?? false` — when false the message above is shown; the drag still moves the divider and the readout still updates, but the imagery is blended. |
| Store coupling | `setComparisonActive(false)` is called by `onClose`; the same toggle is the `Exit slider` / `Activate slider` button on the globe. `z-slider` (60) is above `z-chrome` (40) but below `z-overlay` (80) and `z-toast` (90), so toasts remain visible and the loading overlay wins if it ever becomes visible. |

---

## 6. Cross-route chrome summary

| Chrome | `/` | `/analyze` | `/results` |
| --- | --- | --- | --- |
| `<HeaderBar>` | yes, with sidebar toggle | yes, no toggle | yes, no toggle |
| `<Sidebar>` | yes (rail + sheet) | no | no |
| `<GlobeViewer>` | yes | no | no (so `captureCanvas()` → `null`) |
| `<GlobeLegend>` | yes, bottom-right, `lg`+ | no | no |
| `<GlobeTelemetry>` | yes, bottom-left in viewer | no | no |
| `<AnalysisDropdown>` | yes, in the header | yes, in the header | yes, in the header |
| `<ComparisonSlider>` | yes, on demand | no | no |
| `<LoadingOverlay>` | mounted, never shown (Architecture §12.1) | not mounted | not mounted |
| `<ToastViewport>` | mounted once by `<Providers>`, therefore present on every route | |
