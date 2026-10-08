# EARTH METAMORPHOSIS — PROJECT SNAPSHOT
# Team: Nova Matrics - VI | NASA Space Apps Challenge 2026
# Last updated: 2026-10-08 (after the 7-module build-out)

## PROJECT LOCATION
C:\Users\JM\NISAR_Project\

## RUN COMMANDS

### Backend  → http://localhost:8000/docs
cd C:\Users\JM\NISAR_Project\backend
..\venv\Scripts\python.exe main.py

### Frontend → http://localhost:3000
cd C:\Users\JM\NISAR_Project\frontend
npm run dev

> Do NOT run `npm run build` while `npm run dev` is running. They share `.next/`,
> and the build clobbers the dev server's chunks (`Cannot find module './253.js'`).
> Stop the dev server first, or the dev server must be restarted with a cleared `.next`.

> `uvicorn --reload` has proven unreliable in this environment: backend edits
> sometimes do not take effect until the process is restarted. If a change appears
> to do nothing, restart rather than re-testing.

## STACK

| Layer | Detail |
|---|---|
| Backend | FastAPI on :8000, entry `backend/main.py` |
| Frontend | Next.js 15.1.6 on :3000, Cesium globe + Leaflet fallback |
| State | Zustand + TanStack Query |
| Charts | Recharts |
| Python | 3.14 locally; deploy pins 3.13 (see DEPLOY.md) |
| Data | NISAR GCOV (amplitude), NISAR GUNW (interferometric phase), SRTM DEM |

## THE 7 DETECTION MODULES

All seven run through one dispatcher and return the same result shape.

| Module | Method | Test AOI | Valid coverage |
|---|---|---|---|
| flood | HH+HV drop < -3 dB | Feni | 100% |
| landslide | slope > 15° (SRTM) AND HH+HV drop | Panchhari | 87% |
| river-erosion | water = HH < -15 dB; bank advance distance | Padma River | 59% |
| sea-level | new inundation in the coastal band (lat < 22.5) | Sundarbans | 18% |
| infrastructure | amplitude-stability proxy; sign = construction vs demolition | Dhaka | 83% |
| farming | HV normalised difference index on linear power | Comilla | 99% |
| earthquake | GUNW unwrappedPhase → LOS, masked by coherence ≥ 0.2 | Sylhet (GUNW footprint) | — |

### AOI coverage caveat (important)

The crop window is a bounding box, but the GCOV swath is a rotated
parallelogram inside it, so edge AOIs are mostly no-data. Measured valid
coverage: **Feni 100%**, Dhaka 83%, Padma 57%, Panchhari 87%,
**Rangamati 19.5%**, **Sundarbans 18%**.

Presets **outside** the local granule entirely: Sunamganj, Sylhet Fault (GCOV),
Rajshahi. Panchhari was added specifically because Rangamati is at the swath
edge (742 detections vs 198). Re-run `scripts/check_swath_coverage.py` before
choosing a new AOI.

### Date-pair caveat (the biggest scientific weakness)

The only local GCOV pair is **2026-07-02 → 2026-09-12, i.e. peak monsoon**.
Flooding dominates the change signal, so river-erosion, sea-level,
infrastructure and farming are all partly measuring the *same* flood. Those
modules need event-appropriate date pairs to be independently meaningful. The
NASA search returns 28 granules for this frame, so better pairs are available to
download (`scripts/fetch_gunw.py` shows the download pattern).

## FOLDER STRUCTURE

```
backend/
  main.py                  FastAPI app; mounts /static and /artifacts
  Procfile, railway.json, .python-version    deploy config
  api/routers/             search_location, nisar, analyze, results, mission, events
  api/services/
    nisar_processor.py     config, AOI crop, dispatcher, all 7 handlers
    dem.py                 SRTM mosaic + slope, reprojected onto the SAR grid
    ai_predictor.py        least-squares risk projection (pure numpy, no sklearn)
    envelope.py            {data, meta} response wrapper
  core/geotiff_exporter.py GeoTIFF + lat/lon export
  src/be1_data_pipeline/   search / download / density scripts
  src/be2_processing/      feni_extract.py (offline pipeline), pipeline, etc.
frontend/
  src/app/                 page, analyze, results
  src/components/          Workspace, GlobeViewer, ControlPanel, Analyze, ...
  src/lib/cesium/          loader (CDN), viewer, entities, rotation
  src/services/            endpoints, apiClient, apiService
scripts/                   verification + analysis harness (see below)
output/                    per-module artifacts (small set is committed)
nisar_data/                granules + DEM (3.5 GB, gitignored)
```

## KEY FILES

- `backend/api/services/nisar_processor.py` — the core; dispatcher + all modules
- `backend/api/routers/results.py` — serves real artifacts at `/api/results/{job}?detectionType=X`
- `backend/api/services/dem.py` — SRTM slope on the SAR grid
- `frontend/src/components/Workspace/Workspace.tsx` — dashboard + result overlay
- `frontend/src/lib/cesium/viewer.ts` — scene construction, basemaps, MODIS layer
- `frontend/src/services/apiClient.ts` — `resolveApiUrl()` for backend-relative artifact paths
- `DEPLOY.md` — Railway + Vercel setup and the env-var trap

## API SURFACE

All responses are wrapped `{ "data": ..., "meta": {requestId, generatedAt, source} }`.

| Endpoint | Notes |
|---|---|
| `GET /api/health` | |
| `GET /api/search-location?q=&limit=` | presets first, then Nominatim worldwide |
| `POST /api/search-nisar-files` | live NASA Earthdata search |
| `POST /api/analyze-nisar` | dispatches on `detectionType`; polls via `GET /api/analyze-nisar/{job}` |
| `GET /api/results/{job}?detectionType=` | real artifacts; **ignores job id** (serves latest) |
| `GET /artifacts/<module>/<file>` | previews and GeoTIFFs |
| `GET /api/events`, `/api/mission/summary` | fixture data |

Module result shape: `stats`, `before`/`after`, `geotiffUrl`, `previewUrl`,
`metadata`, `prediction {risk, confidence, trend, basis}`.

`prediction` currently reports `trend: "unknown"` with
`basis: "insufficient history"` — correct, because a trend needs ≥3 observations
and only one date pair exists locally.

## VERIFICATION HARNESS (`scripts/`)

| Script | Purpose |
|---|---|
| `e2e_api_probe.py` | probes every endpoint, records status + shape |
| `verify_frontend_wiring.py` | asserts all 7 modules reachable from the frontend |
| `test_all_modules.py` | runs all 7 modules end-to-end and flags degenerate output |
| `test_demo_flow.py` | asserts the Control Panel → analyze → /analyze flow actually connects |
| `test_crop_and_dispatch.py` | AOI crop correctness + dispatcher error paths |
| `check_swath_coverage.py` | swath coverage per preset — **run before choosing an AOI** |
| `find_landslide_aoi.py`, `find_farming_aoi.py` | data-driven AOI selection |
| `fetch_srtm_dem.py`, `fetch_gunw.py` | data acquisition |
| `clean_build_check.ps1` | clean-clone `npm ci && npm run build` proof |
| `test_landslide.py`, `test_results_real.py`, `test_search_location.py`, `test_dem_slope.py` | per-feature checks |

## GOTCHAS THAT HAVE ACTUALLY BITTEN

1. **`.gitignore` `lib/`** — an unanchored pattern silently excluded the whole of
   `frontend/src/lib` (Cesium globe, constants, utils) from git. A deploy would
   have failed with no local warning. Build dirs are now anchored (`/lib/`).
2. **`NEXT_PUBLIC_USE_MOCK_API`** — the check is `env !== 'false'`, so unset,
   empty, `0`, `FALSE` or `true` all render **fixtures while the header reads
   "Feed live"**. A clean clone has no `.env.local`. Must be exactly `false`.
3. **`binary_opening_3x3` on sparse masks** — a full 3×3 erosion kills isolated
   pixels and dilation cannot restore them; it erased every landslide detection
   (1290 → 0). Use `despeckle()` instead.
4. **`array[uint8_mask]`** — integer fancy-indexing, not boolean masking. Tried to
   allocate 101 GiB. Cast the mask with `.astype(bool)` first.
5. **Per-row waterline extremes** — a 3000-px row can hold several unrelated water
   bodies, so row extremes reported 14.9 km of "bank erosion". Use
   `_advance_distance()`, which is bounded.
6. **GUNW field names differ from GCOV** — GUNW has
   `referenceZeroDopplerStartTime` / `secondaryZeroDopplerStartTime`; the GCOV
   field `zeroDopplerStartTime` does not exist on GUNW.
7. **`next build` vs `next dev`** — they share `.next/`; running one clobbers the other.
8. **Cesium is a CDN global, not an npm dependency.** Never `import 'cesium'`.
   `npm run check:cesium` audits every `cesium.<Member>` against the pinned
   runtime; two invented members previously failed silently at runtime.

## PRODUCT / HONESTY CAVEATS

- **Earthquake is not a confirmed earthquake.** It reports interferometric LOS
  phase change over a 12-day baseline over the monsoon Bengal delta, which is
  dominated by tropospheric water-vapour delay. Values are an upper bound on real
  ground motion. Stated in the payload.
- **Infrastructure uses an amplitude-stability proxy**, not InSAR coherence —
  GCOV carries amplitude only, no phase.
- **The deployed backend cannot run live analysis**: the 3.5 GB of granules are
  gitignored and cannot be pushed. It serves precomputed results for all 7
  modules. Live analysis is a local-laptop capability. See `DEPLOY.md`.
- `next@15.1.6` is flagged for **CVE-2025-66478**; recharts 2.x is deprecated.
  Both are worth upgrading after the deadline, not before.
