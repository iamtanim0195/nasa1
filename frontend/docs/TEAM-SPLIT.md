# Team split — FE1 & FE2

Two people, one repository. Conflicts do not happen in files nobody else opens; they happen in
the handful of files **both** of you need. So the split is by folder, with an explicit rule for
those few shared files.

| | Owner | Scope | Files (`src/`) | Lines (`src/`) |
| --- | --- | --- | --- | --- |
| **FE1** | you (`@Fardin-Prodhan`) | Chrome, forms, state, theming | 49 | 4,978 |
| **FE2** | friend (`@iamtanim0195`) | 3D rendering, geospatial, charts | 35 | 5,666 |

The two halves are close in size — 4,978 against 5,666, measured over `src/` only — because an
unbalanced split makes one person the bottleneck.

FE2's half is *smaller in lines but denser*: WebGL setup, camera maths and chart rendering carry
far more risk per line than a form component, and his files are the ones that break in ways `tsc`
cannot see. That is why the split is not line-for-line equal.

Those counts exclude the four large markdown documents and the build config, which FE1 owns.
That is why a naive count over the whole folder looks lopsided the other way.

> **Rule 0 — the only rule that really matters.** Never edit a file owned by the other person.
> If you need a change in their half, open a PR that touches only the lines you need, or ask
> them. Everything below is detail.

---

## FE1 — yours: interface, operator input, state

You own how the console **looks and is driven**: the shell, the rail, every form, the theme
system, and the client state they all share.

| Path | Lines | What it is |
| --- | --- | --- |
| `src/app/layout.tsx` | 56 | Root layout, pre-paint theme script, metadata |
| `src/app/providers.tsx` | 49 | React Query client, theme sync, toast viewport |
| `src/app/globals.css` | 313 | **Both token sets** (dark + light), glass, scrollbars, Recharts theming |
| `src/app/page.tsx` | 17 | `/` route — mounts `<Workspace />` |
| `src/components/Workspace/` | 219 | Composition root: layout, overlays, wiring |
| `src/components/Sidebar/` | 132 | The left rail |
| `src/components/SearchBar/` | 246 | Location search (used twice: rail + control panel) |
| `src/components/BrandingCard/` | 76 | Wordmark card |
| `src/components/LayersPanel/` | 87 | Basemap switcher |
| `src/components/ControlPanel/` | 696 | Location input, detection mode, date pickers, SAR dropzone |
| `src/components/HeaderBar/` | 208 | Top bar, nav, KPI strip, theme + rotation toggles |
| `src/components/LoadingOverlay/` | 79 | Blocking operation overlay |
| `src/components/ui/` | 1,019 | **Shared primitives**: Button, Badge, Select, ProgressBar, GlassPanel, CollapsiblePanel, StateViews, StatTile, SegmentedControl, ToastViewport, Icon |
| `src/store/appStore.ts` | 306 | The single client store |
| `src/store/toastStore.ts` | 46 | Notifications |
| `src/hooks/useTheme.ts` | 32 | Theme access |
| `src/hooks/useLocationSearch.ts` | 78 | Search query + coordinate parsing |
| `src/hooks/useSarData.ts` | 132 | Upload + ingest polling |
| `src/hooks/useMissionSummary.ts` | 28 | KPI strip data |
| `src/hooks/useMediaQuery.ts` | 34 | SSR-safe breakpoints |
| `src/hooks/useDebouncedValue.ts` | 20 | Debounce helper |
| `src/lib/theme.ts` | 63 | Theme tokens, storage, pre-paint script |
| `src/lib/utils.ts` | 181 | `cn()`, formatters, coordinate parser, `assetPath()` |
| `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `.prettierrc.json` | — | Build + design tokens |
| `.vscode/` | — | Workspace settings, tasks, debug configs |
| `docs/WIREFRAMES.md` | — | Screen layouts |

**Your speciality:** turning an operator's intent into state, and making that state legible.
Forms, validation, empty/loading/error states, both themes, accessibility.

---

## FE2 — his: rendering, geospatial, analysis output

He owns everything that **draws**: the WebGL globe, the comparison slider, the four analysis
stages, the charts, and the maps of the data.

| Path | Lines | What it is |
| --- | --- | --- |
| `src/lib/cesium/` | 908 | Loader, scene, camera, rotation, entities, skybox, split comparison |
| `src/components/GlobeViewer/` | 502 | The 3D globe: lifecycle, HUD, legend, telemetry |
| `src/components/ComparisonSlider/` | 185 | Full-screen before/after split |
| `src/components/Analyze/` | 890 | D-SAR-D, Extracting, Analyzing, Result panels + stage tabs |
| `src/components/ResultCharts/` | 465 | Pie / histogram / line / bar + chart-type selector |
| `src/components/EventsPanel/` | 339 | Event cards, filters, list |
| `src/components/AnalysisDropdown/` | 180 | The `ANALYZE` menu and pipeline status |
| `src/app/analyze/page.tsx` | 154 | `/analyze` route |
| `src/app/results/page.tsx` | 128 | `/results` route |
| `src/hooks/useMap.ts` | 143 | `GlobeController` registry + camera effects |
| `src/hooks/useAnalysis.ts` | 190 | Job dispatch, polling, stage ladder |
| `src/hooks/useEvents.ts` | 109 | Event feed + stats |
| `src/lib/chartExport.ts` | 90 | PNG rasterisation |
| `src/lib/chartTheme.ts` | 20 | Export background |
| `src/lib/mock/` | 968 | Deterministic fixtures + mock transport |
| `src/services/apiService.ts` | 395 | Every endpoint, mock/real switch |
| `public/skybox/` | — | Six generated starfield faces |
| `.tools/make-skybox.py` | — | Regenerates them |
| `.tools/rotation-check.mjs` | — | Behavioural test for the globe spin |
| `docs/ARCHITECTURE.md` §6–7 | — | Globe + analysis sections |

**His speciality:** pixels and performance. Camera, projection, WebGL, chart rendering,
turning arrays into something an eye can read.

---

## Shared files — the only places you can collide

These are needed by both halves. Each has **one owner**; the other person requests changes.

| File | Owner | How to change it |
| --- | --- | --- |
| `src/types/index.ts` | **FE1** | Add your types inside your own labelled block. One PR at a time, announced. |
| `src/lib/constants.ts` | **FE1** | FE1 owns `LAYERS`, `AOI_PRESETS`, `CHART_TYPES`, `CHART_PALETTE`. FE2 owns `DETECTION_TYPES`, `SEVERITIES`, `DSARD_PIPELINE`, `EXTRACTION_CATEGORIES`. Never edit the other's block. |
| `src/services/apiClient.ts`, `endpoints.ts`, `services/index.ts` | **FE1** | FE2 requests new endpoints; FE1 adds the route and the transport. |
| `src/hooks/index.ts` | **whoever adds the hook** | Append-only barrel. Add your line in the same PR as your hook. |
| `src/components/ui/` | **FE1** | FE2 may **use** primitives freely, and may ask for a variant. Do not fork one locally. |
| `package.json` | **FE1** | Announce a new dependency in the group chat first, so you do not both add different libraries for the same job. |
| `README.md`, `docs/API-CONTRACT.md` | **FE1** | FE2 proposes edits in a PR. |
| `docs/TEAM-SPLIT.md` (this file) | **FE1** | — |

### Why `appStore.ts` and `Workspace.tsx` are both yours

Both are the natural landing place for *anyone's* new state or wiring, which makes them the
single biggest conflict risk in the project. Concentrating them in one person turns a merge
conflict into a message.

**FE2's route to new state:** add it to `src/types/index.ts` (your block) and ask FE1 to add the
slice. For anything self-contained — a chart's selected series, a panel's local tab — keep it in
component state instead. Only genuinely global state belongs in the store.

---

## Workflow

### Branches

```
fe1/<short-topic>     # yours
fe2/<short-topic>     # his
```

Never commit directly to `main`. Open a PR into `main` for every change, however small — a
20-line PR is reviewed in a minute and can never conflict badly.

### Every morning, and before every push

```bash
git switch main
git pull
git switch fe1/<your-branch>
git rebase main          # replay your work on top of his
npm run typecheck        # the gate
```

Rebasing keeps history linear and moves conflicts to *your* machine, where you have the context
to resolve them — rather than into a merge commit nobody understands.

### Before you push, run the gates

```bash
npm run typecheck        # tsc --noEmit — must be 0
npx prettier --check .   # formatting
npm run test:rotation    # FE2's globe test (it is fast)
```

### If you do hit a conflict

```bash
git status               # which files
git diff                 # both sides
# edit, then:
git add <file>
git rebase --continue
```

If the conflicted file is owned by the other person, **stop and message them**. Do not resolve
their half by guessing what it should say.

### Review rules

- One reviewer: the other person.
- A PR that touches a file you do not own needs the owner's approval — `CODEOWNERS` requests it
  automatically.
- Keep PRs to one concern. "Add date validation" is reviewable; "Add date validation and
  refactor the store" is not.

---

## The five rules that keep this working

1. **Never edit a file owned by the other person.** Open a PR, or ask.
2. **In shared files, append — never rewrite.** Add your block; leave theirs alone.
3. **One shared-file change per PR.** Small and announced beats big and silent.
4. **Never commit `node_modules/`, `.next/`, or `out/`.** They are already in `.gitignore`; do not
   `git add -f` them.
5. **`npm run typecheck` before every push.** CI does not exist yet, so this is the gate. A red
   `main` blocks both of you.

---

## Optional, later: removing the shared files entirely

The split above works because `appStore.ts`, `types/index.ts` and `constants.ts` each have one
owner. If you want to remove the coordination cost completely, the next step is to slice them by
domain:

```
src/store/slices/globe.ts        # FE1
src/store/slices/control.ts      # FE1
src/store/slices/events.ts       # FE2
src/store/slices/analysis.ts     # FE2
src/types/globe.ts               # FE2
src/types/analysis.ts            # FE2
src/lib/constants/globe.ts       # FE2
src/lib/constants/hazards.ts     # FE2
```

After that, neither of you ever opens a file the other one edits. It is a mechanical refactor of
about 950 lines across three files, and it should be done in one sitting by one person — not
half by each.
