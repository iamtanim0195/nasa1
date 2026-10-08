# E2E Verification Report — Earth Metamorphosis

**Date:** 2026-10-07
**Scope:** Full end-to-end verification: raw HDF5 → processing pipeline → FastAPI (:8000) → Next.js (:3000)
**Method:** Read-only verification. No application behavior was changed.
**Verdict:** The **science pipeline is correct and reproducible**, but the **project cannot be built** and the **API layer is disconnected from the real results**.

---

## 1. What was verified

| Layer | Result |
|---|---|
| HDF5 structure vs hardcoded paths | ✅ `BASE_PATH` correct |
| Pipeline re-run (raw HDF5 → artifacts) | ✅ exit 0, **bit-reproducible** |
| Flood result correctness | ✅ matches baseline exactly |
| NASA Earthdata live search | ✅ 28 granules |
| API endpoints (23 probes) | ⚠️ 18 pass / 5 non-200 + 1 unstable |
| Frontend routes | ✅ `/`, `/analyze`, `/results` all HTTP 200 |
| Frontend ↔ backend contract | ⚠️ envelope correct, but filters/types mismatched |
| **Production build** | ❌ **FAILS (exit 1)** |
| TypeScript type gate | ❌ **29 errors** |

---

## 2. Pipeline: PASSES and is reproducible

`python backend/src/be2_processing/feni_extract.py` → **exit 0**.

Comparison against a pre-run baseline (SHA-256):

```
IDENTICAL: 16   DIFFERENT: 1 (metadata timestamp only)   NEW: 0
```

Only `feni_metadata.json` changed, and only its `processed_at` field.

**Result values are correct and self-consistent:**

| Metric | Value |
|---|---|
| Flood pixels (HH∩HV) | 152,146 |
| Flood pixels (HH only) | 846,083 |
| Flood pixels (HV only) | 660,274 |
| Total valid | 8,999,998 |
| Coverage | 1.69 % |
| Center | 23.071173 N, 91.423414 E |
| Projection | EPSG:32646 |

EPSG:32646 (UTM 46N) is **correct** for Feni at 91.42 °E. Note `geotiff_exporter.py:37` has a stale default of `32645`, but the caller always passes the real `projection` value, so it does not bite.

Crop geometry verified against the real HDF5 (full array `17028 × 17316`, crop `Y[5417:8417] X[10673:13673]` = 3000 × 3000).

---

## 3. P0 — The project CANNOT BUILD

`npm run build` → **exit code 1**:

```
✓ Compiled successfully
  Skipping linting
  Checking validity of types ...
Failed to compile.
./earth-metamorphosis/earth-metamorphosis/src/components/Analyze/DsardPanel.tsx:55:20
Type error: Property 'id' does not exist on type '"Ingest" | ... | "Vectorize"'.
Static worker exited with code: 1
```

`npm run typecheck` → **29 error lines**.

**Root cause — `frontend/tsconfig.json:23-24`:**

```json
"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
"exclude": ["node_modules"]
```

Because only `node_modules` is excluded, the type-checker compiles **two things it should never see**:

**(a) A stray 600 MB nested copy** — `frontend/earth-metamorphosis/earth-metamorphosis/`
(23,401 files, its own `node_modules`, **untracked** and **not gitignored**). It contributes 12 error lines and is what the build dies on *first*.

**(b) 28 backup files** — `*.backup_20261007_*` and `*.bak` inside `frontend/src/`. They contribute 2 further error lines.

**17 error lines come from the real `src/`**, so excluding the junk is necessary but **not sufficient**:

| File | Errors |
|---|---|
| `src/components/Analyze/DsardPanel.tsx` | 3 |
| `src/lib/mock/fixtures.ts` | 3 |
| `src/components/ComparisonSlider/ComparisonSlider.tsx` | 2 |
| `src/components/ControlPanel/ControlPanel.tsx` | 2 |
| `src/components/Workspace/Workspace.backup_20261007_160046.tsx` | 2 |
| `src/components/EventsPanel/EventsPanel.tsx` | 1 |
| `src/components/ResultCharts/ChartTypeSelector.tsx` | 1 |
| `src/components/Sidebar/Sidebar.tsx` | 1 |
| `src/components/ui/Badge.tsx` | 1 |
| `src/components/Workspace/Workspace.tsx` | 1 |

**Underlying defect:** `DSARD_PIPELINE` (`src/lib/constants.ts:187`) is a **string array**
`['Ingest','Calibrate',…]`, but `DsardPanel.tsx:54-58` and `fixtures.ts:902-909` map it as if
each entry were an object with `.id`, `.label`, `.detail` → renders `undefined` ids/labels and duplicate React keys.

`next.config.mjs` sets `eslint.ignoreDuringBuilds` but **not** `typescript.ignoreBuildErrors`, so there is no bypass.

---

## 4. P1 — The API layer is disconnected from the real results

**Every data-bearing endpoint returns hardcoded mock values.**

| Endpoint | Reality |
|---|---|
| `POST /api/analyze` | `analyze.py:39-68` `simulate_analysis` is pure `time.sleep` theatre — fakes progress, does no processing |
| `GET /api/analyze/{id}/extractions` | hardcoded 4 rows, `analyze.py:130-167` |
| `GET /api/analyze/{id}/widgets` | hardcoded 1 widget, `analyze.py:185-206` |
| `GET /api/results/{id}` | fully hardcoded, `results.py:28-82`; **ignores `job_id` entirely** — a bogus id returns 200 with the same payload |
| `GET /api/mission/summary` | hardcoded, `mission.py:30-55` |
| `GET /api/events` | `random` per request, `events.py:17-53` |

The real computed result (**152,146 px, 1.69 %**) is served by **no endpoint**. A repo-wide grep for
`feni_metadata`, `output/feni`, `152146` in `backend/api/` finds only the dead `geotiffUrl` string.

**Consequence:** `?result=feni` in the UI is true only by coincidence — `Workspace.tsx:220-249`
hardcodes `1.69 %`, `41.7 km²`, `92 %`, `Track 091 · Frame 077` and the image path. Those same values
are what `results.py` returns, but the frontend **discards** the backend's `previewUrl`, `geotiffUrl`
and `metadata` fields and never renders them.

### 4.1 `POST /api/analyze-nisar` hangs forever

Job `job-615da2dce45b` stayed at `status=running, stage=extracting, progress=55` indefinitely
(no error, no timeout).

**Cause — `nisar_processor.py:173-198` `extract_backscatter` reads the FULL arrays:**

```python
hhhh = f[BASE_PATH + "HHHH"][:]   # 17028 x 17316 float32 = 1.10 GB
hvhv = f[BASE_PATH + "HVH"][:]    # + 1.10 GB, then 2 more dB copies
```

Peak ≈ **4.4 GB**:

| | GB |
|---|---|
| Machine total RAM | 7.82 |
| Free RAM during test | 0.43 – 1.02 |
| Array footprint per polarization | 1.10 |
| Estimated `extract_backscatter` peak | 4.39 |

There is **no crop, no memory guard, and no timeout**. `feni_extract.py` does this correctly
(crops to 3000 × 3000 first) — the API service does not.

---

## 5. P1 — Non-deterministic events

`GET /api/events` regenerates rows with `random` on **every** request (`events.py:68`, `105`).

Verified: two identical calls returned **different bodies**. Event id `event-001` returned a different
location, severity, confidence and date each time. The list and the detail endpoint are therefore
mutually inconsistent — an event you click is not the event you saw.

Incidental: the live search returned the granule `..._029_163_D_077_4005_DHDH_A_20260905T122635_2`
**twice**.

---

## 6. P1 — Event filters silently no-op

The frontend sends arrays; the backend expects comma-separated **strings**.

`apiService.ts:242-246` passes arrays → axios (`toFormData.js:98,163`) serialises them as
`detectionTypes[]=…`. The backend declares `detectionTypes: Optional[str]` and does
`detectionTypes.split(",")` (`events.py:61-62,71-78`), so the literal key `detectionTypes[]`
never binds.

**Runtime proof:**

| Request | Result |
|---|---|
| `?detectionTypes[]=flood&detectionTypes[]=landslide&severities[]=high` | **26 events**, all 6 types, all 4 severities → *filters dropped* |
| `?detectionTypes=flood,landslide&severities=high` | **2 events**, `landslide`/`high` only → *correct* |

The UI still highlights the filter chips as active. Also `query` is not a backend parameter at all
(benign — re-filtered client-side at `useEvents.ts:96`).

---

## 7. P2 — Broken URLs

### 7.1 `backend/static/` is empty
`main.py:31` mounts it, and `results.py:72-73` advertises:
```
geotiffUrl: "/static/feni_flood_mask.tif"
previewUrl: "/static/feni_flood_detection.png"
```
Both → **404 on :8000**. The real artifacts exist only in `output/feni/`.

**Mitigating accident:** copies live in `frontend/public/static/`, so the frontend's *hardcoded*
`/static/feni_flood_detection.png` returns **200 from :3000**. The demo works, but via a duplicated
path — not via the API.

### 7.2 Two endpoints the frontend calls do not exist
`endpoints.ts:8-9` declares `/api/load-sar-data` (POST) and `/api/load-sar-data/{id}` (GET).
Neither is in the backend's 15 OpenAPI paths → **404**. Currently dead code: `useSarData` is never
called by any mounted component. `Sidebar.tsx:122` still passes an undeclared `onSarDataUpload` prop (tsc error).

---

## 8. P2 — Frontend rendering gaps

- **`Workspace.tsx:154` passes `events={[]}`** to `GlobeViewer` while `:47` fetches the real array.
  The backups used `events={events}`. Result: **the globe renders no event entities at all.**
- **`floodMaskActive` (`Workspace.tsx:164`)** is not a `GlobeViewerProps` field (`GlobeViewer.tsx:30-31`)
  → tsc error; the flood-mask toggle has no globe effect.
- **`event.footprint`** is never sent by the backend, so every event renders as an ellipse
  (`entities.ts:123-143` guards it, so no crash).
- **Mock mode can silently shadow the backend.** `apiClient.ts:22`:
  `USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false'`

  | Value | Mode |
  |---|---|
  | `false` | LIVE |
  | unset / `''` / `true` / `0` / `FALSE` | **MOCK** |

  `.env.local` is **gitignored**, and `.env.example:17` recommends `true`. A fresh clone or CI build
  therefore serves fixtures — while `HeaderBar` computes `'online'` from the *mock* response and
  displays **"Feed live"**. Nothing in the UI reads `meta.source`. The committed `out/` export is a
  **stale mock-mode artifact** containing no `localhost:8000` at all.
- **`useNisarSearch.ts:93`** hardcodes `detectionType: 'flood'` for `POST /api/analyze-nisar`, ignoring
  the user's Control-Panel selection.
- `useAnalysis.ts:83-88` injects **unvalidated** `localStorage` JSON into the job store; a job without
  `steps` then throws at `DsardPanel.tsx:52` (`job.steps.length`).

---

## 9. P3 — Environment and hygiene

- **Orphaned process starved the machine.** PID **5476**, a `--multiprocessing-fork` **child of the
  backend** (`main.py`, pid 18220), had burned **2,351 s CPU** and peaked at **5.82 GB private**.
  No source file references `multiprocessing` — it is a stale `uvicorn reload=True` worker.
  Under this pressure **the frontend dev server died completely** (0 `node.exe`, port 3000 gone)
  mid-verification. I restarted it; it is healthy again.
- **28 backup files** (`*.backup_*`, `*.bak`) plus the **600 MB stray copy** — both inside the tsconfig include.
- Pydantic v2 deprecation: `.dict()` at `analyze.py:85-86` (use `.model_dump()`).
- **Inconsistent error shape:** 200s are enveloped as `{data, meta}`, but 404/400 return bare
  `{"detail": …}`. The frontend tolerates this.
- **NISAR job race:** `JOBS[job_id]` is created *inside* the background task
  (`nisar_processor.py:103`), so the first poll after `POST /api/analyze-nisar` can 404. Self-heals.
- `fetchEvent`, `fetchNisarResult`, `uploadSarDataset`, `fetchSarDatasetStatus` are dead code.

---

## 10. What works (verified, not assumed)

- ✅ **Pipeline is bit-reproducible** — 16/16 artifacts identical across runs.
- ✅ **`BASE_PATH` is correct** for the real NISAR GCOV layout.
- ✅ **Live NASA Earthdata search works** — 28 granules for the Feni bbox, and `isDownloaded`
  correctly flags the 2 local files as `True`.
- ✅ **CORS is correct** — origin echoed, `x-request-id` exposed, preflight 200.
- ✅ **Envelope contract is correct end-to-end** — every frontend unwrap reads the right nesting level;
  **no required field is missing** from any live payload.
- ✅ **All 3 frontend routes render** clean HTTP 200; overlay asset 200.
- ✅ **Backend `/api/health`** healthy.

---

## 11. Recommended fix order

1. **Make the build pass.** Exclude `earth-metamorphosis/**` and `**/*.backup_*`/`*.bak` in
   `tsconfig.json`, fix the `DSARD_PIPELINE` string-vs-object mismatch, then clear the remaining ~15
   real type errors. Delete the 600 MB stray copy and the 28 backup files.
2. **Wire the API to the real results.** Have `results.py` read `output/feni/feni_metadata.json` +
   the GeoTIFFs (`geotiffUrl` should point at a populated `backend/static/`, or serve `output/feni/`).
   Either delete `simulate_analysis` or label the demo path honestly.
3. **Fix `extract_backscatter`** to crop the AOI window before loading (as `feni_extract.py` does),
   and add a timeout + error path so a job can never sit at `running` forever.
4. **Make events deterministic** (seed or freeze a fixture set) so list and detail agree.
5. **Fix the filter contract** — either send comma-joined strings from the frontend, or change the
   backend to `List[str]`.
6. **Kill the orphan PID 5476** and restart the backend to reclaim ~6 GB.

---

## 12. Side effects of this verification

I changed **no application code or behavior**. The following artifacts were created:

| Artifact | Purpose |
|---|---|
| `scripts/e2e_api_probe.py` | Reusable 23-probe endpoint harness |
| `output/e2e_api_probe_results.json` | Raw probe results |
| `output/_baseline_feni_backup/` | 344 MB pre-run baseline (safe to delete) |

Also: the frontend dev server **died** during the run (memory pressure) and was **restarted** — now
healthy on http://localhost:3000. The backend was never restarted.
