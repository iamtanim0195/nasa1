# Deploying Earth Metamorphosis

Two services. The frontend is a static/SSR Next.js app; the backend is FastAPI.

---

## 1. Backend → Railway

**Set the Railway "Root Directory" to `backend`.** The config files
(`Procfile`, `railway.json`, `.python-version`, `requirements.txt`) all live
there, so the root directory must be `backend` or none of them are found.

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` (from `Procfile` / `railway.json`) |
| Health check | `/api/health` |
| Python | `3.13` (from `.python-version`) |

### Environment variables

| Variable | Why |
|---|---|
| `NISAR_DATA_FOLDER` | Optional. Where granules are looked up. Defaults to `<repo>/nisar_data`, which does not exist in a container. |
| `NISAR_OUTPUT_FOLDER` | Optional. Where results are read from. **Set this only if you move the artifacts**; the committed `output/` tree is found automatically. |
| `NISAR_DEM_FOLDER` | Optional. SRTM tiles for the landslide module. |

`earthaccess` live search needs Earthdata credentials. Either mount a `.netrc`
with your Earthdata login, or accept that search returns an error on the
deployed instance (it degrades to a 500 with a clear message; nothing else
breaks).

### What the deployed backend CAN and CANNOT do

**Can** serve everything derived from committed artifacts:
`/api/results/{job}?detectionType=…` for all 7 modules, `/artifacts/…` previews
and GeoTIFFs, `/api/events`, `/api/mission/summary`, `/api/search-location`
(Nominatim).

**Cannot** run a live analysis. That needs the NISAR granules, which are
**3.5 GB and are not in git** (`nisar_data/` is gitignored, correctly — they
cannot be pushed). A job will fail with a clear message rather than hang.

> If judges should see live analysis, run the backend on the demo laptop and
> point the deployed frontend at it, or pre-compute and commit more artifacts.

---

## 2. Frontend → Vercel

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build command | `npm run build` |
| Framework | Next.js (auto-detected) |

### Environment variables — REQUIRED

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | The Railway backend URL, e.g. `https://xxx.up.railway.app` |
| `NEXT_PUBLIC_USE_MOCK_API` | **`false`** — exactly this lowercase string |

> ⚠️ **The mock-mode trap.** The check is
> `USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false'`, so *any*
> value other than the exact string `false` — including unset, empty, `0`,
> `FALSE`, or `true` — makes the app render deterministic **fixtures** while the
> header still reports **"Feed live"**. The failure is completely silent. A
> clean checkout has no `.env.local` (it is gitignored), so if you forget these
> variables the deployed site will look convincing and be fake.

`NEXT_PUBLIC_*` values are inlined at **build** time, so they must be set before
the build, and changing them requires a redeploy.

### Optional

- `NEXT_PUBLIC_CESIUM_ION_TOKEN` — only needed for Cesium World Terrain /
  Bing imagery. Without it the globe falls back to token-free providers.
- `NEXT_PUBLIC_BASE_PATH` — only for sub-path hosting (e.g. GitHub Pages).

### Verifying a deploy

```bash
curl https://<backend>/api/health
curl "https://<backend>/api/results/latest?detectionType=landslide"
curl -I "https://<backend>/artifacts/landslide/landslide_preview.png"
```

Then load the frontend and confirm the overlay toggle shows a real image. If it
says "No preview artifact for this module yet", the backend is missing its
`output/` artifacts.

---

## Pre-deploy checklist

- [x] `npm ci && npm run build` passes from a **clean clone** (not just the
      working directory) — verified, exit 0
- [x] `frontend/src/lib/**` is tracked (an unanchored `.gitignore` `lib/` rule
      had silently excluded the whole Cesium globe)
- [x] Backend paths are OS-portable and env-overridable
- [x] `requirements.txt` is UTF-8 and includes fastapi/uvicorn/pydantic
- [x] Result artifacts are committed so the deployed API serves real output
- [ ] Vercel env vars set (see the mock-mode trap above)
- [ ] Railway root directory set to `backend`
