# EARTH-METAMORPHOSIS — Backend API Contract

> The contract the backend must implement to replace the mock transport without any
> frontend change. Every path, parameter and type below is taken from
> `src/services/endpoints.ts`, `src/services/apiService.ts`, `src/services/apiClient.ts`
> and `src/types/index.ts`. Where the frontend defines an endpoint it does not yet call,
> that is stated explicitly.
>
> **Two ways to run against this contract**
>
> ```bash
> # 1. Mock transport (default): no network, deterministic fixtures
> NEXT_PUBLIC_USE_MOCK_API=true
>
> # 2. Real backend
> NEXT_PUBLIC_USE_MOCK_API=false
> NEXT_PUBLIC_API_BASE_URL=https://api.example.org
> ```
>
> `USE_MOCK_API` is resolved as `process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false'`
> (`src/services/apiClient.ts`), so **any value other than the literal string `false` —
> including unset — selects the mock.** Only the exact string `false` enables HTTP.

---

## 1. Endpoint summary

| # | Function (`src/services/apiService.ts`) | Method | Path | Request | Success `data` type | Polled |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `searchLocations` | `GET` | `/api/search-location` | query: `q`, `bbox?`, `limit?` | `GeoLocation[]` | — |
| 2 | `fetchEvents` | `GET` | `/api/events` | query: `detectionTypes?`, `severities?`, `minConfidence?`, `query?`, `bbox?`, `page?`, `pageSize?` | `Paginated<DetectedEvent>` | — |
| 3 | `fetchEvent` | `GET` | `/api/events/:id` | path: `id` | `DetectedEvent` | — |
| 4 | `uploadSarDataset` | `POST` | `/api/load-sar-data` | `multipart/form-data`: `file`, `fileName`, `sizeBytes` | `SarDataset` | — |
| 5 | `fetchSarDatasetStatus` | `GET` | `/api/load-sar-data/:id` | path: `id` | `SarDataset` | **1 200 ms** until `status ∈ {ready, error}` |
| 6 | `createAnalysisJob` | `POST` | `/api/analyze` | JSON: `CreateAnalysisPayload` | `AnalysisJob` | — |
| 7 | `fetchAnalysisJob` | `GET` | `/api/analyze/:jobId` | path: `jobId` | `AnalysisJob` | **1 200 ms** until `progress >= 100` |
| 8 | `fetchExtractions` | `GET` | `/api/analyze/:jobId/extractions` | path: `jobId` | `ExtractionCategory[]` | — (fetched once per stage unlock) |
| 9 | `fetchAnalysisWidgets` | `GET` | `/api/analyze/:jobId/widgets` | path: `jobId` | `AnalysisWidget[]` | — (fetched once per stage unlock) |
| 10 | `fetchResults` | `GET` | `/api/results/:jobId` | path: `jobId` | `ResultDataset` | — (fetched once per stage unlock) |
| 11 | `fetchMissionSummary` | `GET` | `/api/mission/summary` | — | `MissionSummary` | **60 000 ms** (fixed interval) |

`ENDPOINTS` is the single source of truth for paths
(`src/services/endpoints.ts`). Route ids are encoded, never interpolated raw:

```ts
event:  (id: string) => `/api/events/${encodeURIComponent(id)}`,
sarDatasetStatus: (id: string) => `/api/load-sar-data/${encodeURIComponent(id)}`,
analyzeJob: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}`,
extractions: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}/extractions`,
widgets: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}/widgets`,
results: (jobId: string) => `/api/results/${encodeURIComponent(jobId)}`,
```

**Currently-calling hooks:**

| Endpoint | Consumed by | Notes |
| --- | --- | --- |
| `searchLocations` | `useLocationSearch` | always sends `{ q, limit: 8 }`; `bbox` is defined but never sent today |
| `fetchEvents` | `useEvents` | sends `detectionTypes`, `severities`, `minConfidence` (omitted when falsy) and `pageSize: 100`. It does **not** currently send `page`, `bbox` or `query` |
| `fetchEvent` | — | **defined and exported but never called.** Implement it (it is cheap) and expect the frontend to adopt it for event detail; do not rely on it being exercised today |
| `uploadSarDataset` | `useSarData.upload` | after `validateSarFile` passes |
| `fetchSarDatasetStatus` | `useSarData` | enabled while `dataset.status ∉ {ready, error}` |
| `createAnalysisJob` | `useAnalysis.start` | from `Workspace` and `/analyze` |
| `fetchAnalysisJob` | `useAnalysis` | enabled whenever `appStore.jobId` is set |
| `fetchExtractions` | `useAnalysis` | enabled at `stageRank(stage) >= 1` |
| `fetchAnalysisWidgets` | `useAnalysis` | enabled at `stageRank(stage) >= 2` |
| `fetchResults` | `useAnalysis` | enabled at `stageRank(stage) >= 3` |
| `fetchMissionSummary` | `useMissionSummary` | top-bar KPI strip |

---

## 2. The response envelope

Every successful response is `ApiEnvelope<T>`:

```ts
export interface ApiMeta {
  requestId: string;
  generatedAt: string;
  /** `mock` while the backend contract is not implemented yet. */
  source: 'backend' | 'mock';
  /** Backend-reported processing time, ms. */
  elapsedMs?: number;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}
```

```json
{
  "data": { },
  "meta": {
    "requestId": "req-x8f2k1qa",
    "generatedAt": "2025-06-20T14:02:11.482Z",
    "source": "backend",
    "elapsedMs": 42
  }
}
```

Rules enforced by `httpRequest()` (`src/services/apiClient.ts`):

1. **Envelope detection is structural:** the body is accepted as an envelope only when it
   is an object that has **both** a `data` and a `meta` key. That means a payload whose
   own top-level fields happen to include `data` and `meta` would be misread as an
   envelope — do not shape a resource that way.
2. **A bare body is tolerated.** If the body is not an envelope, the client wraps it
   locally as `{ data: body, meta: { requestId: <response x-request-id header ?? uid>,
   generatedAt: <now>, source: 'backend' } }`. So a backend that returns a plain
   `DetectedEvent` will not break the UI — but it also gets no `elapsedMs` and its
   `requestId` is the fallback. **Preferred: always send the envelope.**
3. `meta.source` is set by the producer: `'mock'` from `lib/mock/transport.ts`,
   `'backend'` from `httpRequest`.
4. `meta.elapsedMs` is optional and only ever populated by the mock transport today;
   sending real server-side processing time is encouraged.

`ApiMeta` is surfaced to the UI by `useMissionSummary` (`meta`), and is otherwise
available on every envelope returned by `apiService`.

---

## 3. Request headers the client sends

Set on the axios instance (`apiClient`):

| Header | Value |
| --- | --- |
| `Accept` | `application/json` |
| `Content-Type` | `application/json` (overridden to `multipart/form-data` on the upload only) |

Added by the request interceptor:

| Header | Value | Purpose |
| --- | --- | --- |
| `x-request-id` | `uid('req')` → e.g. `req-9d1c4b7e` | Correlate a client request with server logs; the response may echo it |
| `x-client` | `earth-metamorphosis/1.0.0` | Static client identifier |

`x-request-id` on the **response** is used as the fallback `meta.requestId` when a backend
returns a bare (non-enveloped) body, so echoing it is worthwhile.

There is **no** authentication header, no cookie handling and no CORS pre-configuration in
the frontend. If the API requires auth, it must be either cookie-based (same-site) or the
frontend must be changed to add a token — the contract currently assumes an open or
gateway-protected origin. CORS must allow the dashboard origin, the `GET`/`POST` methods
and the `x-request-id` / `x-client` request headers.

**Base URL.** `API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''`. When empty, the
axios instance is created with `baseURL: undefined` and the paths above resolve relative to
the page origin — i.e. the frontend would call its own `/api/...`. In practice, set
`NEXT_PUBLIC_API_BASE_URL` unless the same origin proxies `/api`.

**Timeout.** `API_TIMEOUT = Number(process.env.NEXT_PUBLIC_API_TIMEOUT ?? 20_000)` ms,
applied to every request including the upload and every poll. A timeout during polling is
retried (see §4).

---

## 4. Error taxonomy

Every transport failure — HTTP status, timeout, offline and simulated — is folded into a
single `ApiError` class so components only branch on `code` / `status` / `isRetryable`.

```ts
export interface ApiErrorShape {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}
```

### 4.1 What the backend should return on failure

```json
{
  "error": {
    "code": "DATASET_NOT_FOUND",
    "message": "Dataset sar-4c1f9a2b is unknown or has been reaped.",
    "status": 404,
    "details": { "datasetId": "sar-4c1f9a2b" }
  }
}
```

The client accepts, in priority order (`ApiError.from`):

| Field read | Fallback |
| --- | --- |
| `error.code` | `HTTP_<status>` (e.g. `HTTP_404`) |
| `error.message` | top-level `message`, then `Request failed with status <status>.` |
| `error.details` | the whole response body |

So `{ "error": { … } }` is the preferred shape, a top-level `{ "message": "…" }` is
also honoured, and anything else degrades to the generic status message. `status` is taken
from the HTTP status line, not the body.

### 4.2 The implemented codes

| `code` | Produced when | `status` | `isRetryable` | UI heading (`ErrorState`) |
| --- | --- | --- | --- | --- |
| `TIMEOUT` | axios `ECONNABORTED` or `ETIMEDOUT` | *(undefined)* | **true** | "Request timed out" |
| `NETWORK_OFFLINE` | axios error with **no** `response` (DNS, CORS, connection refused, offline) | *(undefined)* | **true** | "Analysis service unreachable" |
| `HTTP_<status>` | Any HTTP error whose body carries no `error.code` | the HTTP status | **true** for `408`, `429`, `>= 500`; otherwise **false** | "Something went wrong" (or "Invalid request" for `400`/`422`) |
| `<backend code>` | Any HTTP error whose body carries `error.code` — passed through verbatim | the HTTP status | same status rule as above | "Something went wrong" |
| `UNEXPECTED` | A thrown non-axios `Error`, or a non-Error throw | *(undefined)* | **false** (status undefined) | "Something went wrong" |
| `MOCK_SIMULATED_FAILURE` | The mock transport saw the `__fail` token (see §9) | `503` | **true** (503 ≥ 500) | "Something went wrong" |

`isRetryable` verbatim:

```ts
get isRetryable(): boolean {
  if (this.code === 'NETWORK_OFFLINE' || this.code === 'TIMEOUT') return true;
  if (this.status === undefined) return false;
  return this.status === 408 || this.status === 429 || this.status >= 500;
}
```

Additional predicates used by views: `isOffline` (code === `NETWORK_OFFLINE`),
`isTimeout` (code === `TIMEOUT`), `isValidation` (`status === 400 || status === 422`).
`toShape()` returns the `ApiErrorShape` projection.

### 4.3 Retry policy driven by those codes

| Layer | Policy |
| --- | --- |
| React Query, all queries (global default) | retry only when `ApiError.isRetryable`; at most 2 retries (`failureCount < 2`); delay `min(1_000 * 2 ** attempt, 8_000)` ms |
| `useLocationSearch` | overrides `retry: 1` |
| `useMissionSummary` | overrides `retry: 2` |
| Mutations (upload, start analysis) | `retry: 0` — never retried automatically; the user retries via the UI |

**Implications for the backend:**

* `400`/`404`/`409`/`422` are treated as permanent — return them only when the request
  really is unfixable by retrying.
* `408`, `429` and every `5xx` will be retried up to twice with exponential backoff. Make
  `POST /api/analyze` idempotent, or accept that a retried create may be issued twice.
* A CORS misconfiguration is indistinguishable from being offline on the client: it
  surfaces as `NETWORK_OFFLINE` (retryable) rather than an HTTP error.
* Do not return `200` with an error body — it would be unwrapped as data.

---

## 5. Endpoint reference

Types are reproduced verbatim from `src/types/index.ts`.

### 5.0 Shared types

```ts
export interface GeoPoint { lat: number; lng: number; }

/** [west, south, east, north] */
export type BoundingBox = [number, number, number, number];

export type LocationSource = 'preset' | 'search' | 'manual' | 'event';

export interface GeoLocation extends GeoPoint {
  id: string;
  name: string;
  country?: string;
  region?: string;
  bbox?: BoundingBox;
  /** Camera altitude in metres used when flying the globe here. */
  altitude?: number;
  source: LocationSource;
}

export type DetectionType =
  | 'flood' | 'landslide' | 'earthquake' | 'infrastructure'
  | 'sea-level' | 'river-erosion' | 'farming';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type AnalysisStage = 'dsard' | 'extracting' | 'analyzing' | 'result';

export type ChartType = 'pie' | 'histogram' | 'line' | 'bar';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DateRange {
  /** ISO date (yyyy-MM-dd) or null while the operator has not picked one. */
  before: string | null;
  after: string | null;
}
```

### 5.1 `GET /api/search-location` — `searchLocations`

```ts
export interface LocationQuery {
  q: string;
  /** Optional viewport bias — the backend can rank results inside it first. */
  bbox?: BoundingBox;
  limit?: number;
}

export async function searchLocations(query: LocationQuery): Promise<ApiEnvelope<GeoLocation[]>>
```

| Param | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| `q` | query | `string` | yes | Free text: place name, country, region, or a `lat, lng` pair |
| `bbox` | query | `BoundingBox` | no | Repeat as four numbers (`bbox=west&bbox=south&…`) or comma-separated; the client never sends it today |
| `limit` | query | `number` | no | The client sends `8` |

**Client-side short-circuit:** `parseCoordinates()` accepts `"23.81, 90.41"`, `"23.81N 90.41E"`
and `"23.81° N, 90.41° E"`; a coordinate query is resolved locally into a synthetic
`GeoLocation` with `source: 'manual'` and `altitude: 140_000`, prepended to the results and
deduplicated against remote hits within 0.001°. Requests are issued only when the debounced
(300 ms) query is at least 2 characters **or** parses as coordinates.

**Request**

```
GET /api/search-location?q=Sundarbans&limit=8
```

**Response** — `ApiEnvelope<GeoLocation[]>`

```json
{
  "data": [
    {
      "id": "sundarbans",
      "name": "Sundarbans",
      "country": "Bangladesh",
      "region": "Khulna Division",
      "lat": 21.9497,
      "lng": 89.1833,
      "altitude": 240000,
      "bbox": [88.9, 21.6, 89.5, 22.3],
      "source": "preset"
    },
    {
      "id": "khulna",
      "name": "Khulna",
      "country": "Bangladesh",
      "region": "Khulna Division",
      "lat": 22.8456,
      "lng": 89.5403,
      "source": "search"
    }
  ],
  "meta": {
    "requestId": "req-3ab71f0c",
    "generatedAt": "2025-06-20T14:02:11.482Z",
    "source": "backend",
    "elapsedMs": 42
  }
}
```

Unknown/garbage queries should return `200` with `data: []` rather than `404`; the UI shows
"No match for …" plus a helper line, and keeps the coordinate shortcut available even when
the request fails (the result list stays mounted and prints "Location search failed").

---

### 5.2 `GET /api/events` — `fetchEvents`

```ts
export interface EventQuery {
  detectionTypes?: DetectionType[];
  severities?: Severity[];
  minConfidence?: number;
  query?: string;
  bbox?: BoundingBox;
  page?: number;
  pageSize?: number;
}

export async function fetchEvents(query?: EventQuery): Promise<ApiEnvelope<Paginated<DetectedEvent>>>
```

`DetectedEvent`:

```ts
export interface DetectedEvent {
  id: string;
  detectionType: DetectionType;
  /** ISO-8601 date the change was observed. */
  eventDate: string;
  location: { name: string; lat: number; lng: number };
  severity: Severity;
  /** Model confidence, 0..1. */
  confidence: number;
  /** Affected surface, km². */
  areaKm2: number;
  /** Optional closed ring of [lng, lat] pairs for the highlight polygon. */
  footprint?: Array<[number, number]>;
  status: 'new' | 'reviewed' | 'archived';
  summary?: string;
}
```

| Param | In | Type | Client behaviour |
| --- | --- | --- | --- |
| `detectionTypes` | query | `DetectionType[]` | sent only when the filter array is non-empty; comma-joined in the query key, so accept repeated or comma-separated values |
| `severities` | query | `Severity[]` | same |
| `minConfidence` | query | `number` (0..0.95) | sent only when non-zero |
| `query` | query | `string` | **defined but not currently sent** (Architecture §12, gap 2) |
| `bbox` | query | `BoundingBox` | defined, not sent |
| `page` | query | `number` | defined, not sent; the mock defaults to `1` |
| `pageSize` | query | `number` | the client sends `100`; the mock defaults to `50` |

**Request**

```
GET /api/events?detectionTypes=flood,landslide&severities=critical&minConfidence=0.6&pageSize=100
```

**Response** — `ApiEnvelope<Paginated<DetectedEvent>>`

```json
{
  "data": {
    "items": [
      {
        "id": "EM-2400",
        "detectionType": "flood",
        "eventDate": "2025-06-12T00:00:00.000Z",
        "location": { "name": "Sundarbans, Bangladesh", "lat": 21.9642, "lng": 89.3104 },
        "severity": "critical",
        "confidence": 0.924,
        "areaKm2": 142.38,
        "footprint": [
          [89.2851, 21.9764], [89.3107, 21.9702], [89.3237, 21.9511],
          [89.2851, 21.9764]
        ],
        "status": "new",
        "summary": "SAR backscatter drop-out consistent with standing surface water."
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 100
  },
  "meta": {
    "requestId": "req-77c0be41",
    "generatedAt": "2025-06-20T14:02:12.031Z",
    "source": "backend",
    "elapsedMs": 118
  }
}
```

**Notes**

* `footprint` must be a closed ring (first point repeated last) with **at least 3 points**
  for the globe to draw a polygon; a shorter or absent ring makes the frontend fall back to
  a size-derived ellipse. Rings are `[lng, lat]` pairs, not `{lat, lng}`.
* The client mirrors `items` into the store and renders the globe markers from it. `total`
  may exceed `items.length` (the client requests `pageSize: 100` and never pages), so keep
  the page contract honest rather than returning everything.
* The UI also computes `EventStats` (totals, per-severity counts, per-detection-type
  counts, summed area, mean confidence) client-side from `items`.
* The mock filters by `bbox` inclusively on `lng`/`lat` and matches `query` against
  `location.name` and `id`, case-insensitively — a reasonable default semantics to mirror.

---

### 5.3 `GET /api/events/{id}` — `fetchEvent`

```ts
export async function fetchEvent(id: string): Promise<ApiEnvelope<DetectedEvent>>
```

**Request** `GET /api/events/EM-2400`

**Response** — `ApiEnvelope<DetectedEvent>` with the same object shape shown in §5.2.

**Status: defined and exported, but no hook or component calls it yet.** Implement it as a
single-event lookup; a missing id should be `404` with an `ApiErrorShape`
(`code: "EVENT_NOT_FOUND"`). The mock throws a plain `Error`, which the client would fold
into `UNEXPECTED` — the real backend should not copy that behaviour.

---

### 5.4 `POST /api/load-sar-data` — `uploadSarDataset`

```ts
export type SarFormat = 'tif' | 'tiff' | 'h5' | 'nc' | 'zip';
export type SarJobStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'error';

export interface SarDataset {
  id: string;
  fileName: string;
  sizeBytes: number;
  format: SarFormat;
  uploadedAt: string;
  status: SarJobStatus;
  /** 0..100 */
  progress: number;
  sceneCount?: number;
  message?: string;
}

export async function uploadSarDataset(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<ApiEnvelope<SarDataset>>
```

Content type: `multipart/form-data` (set explicitly on the request config; the browser/axios
appends the part boundary — parse a standard multipart body).

| Part | Type | Value |
| --- | --- | --- |
| `file` | file | the binary, with `file.name` as the filename |
| `fileName` | text | `file.name` |
| `sizeBytes` | text | `String(file.size)` |

Client-side pre-validation, mirrored on the server (`validateSarFile`,
`SAR_ACCEPTED_FORMATS`, `SAR_MAX_FILE_BYTES`):

| Rule | Value |
| --- | --- |
| Accepted extensions | `.tif`, `.tiff`, `.h5`, `.nc`, `.zip` |
| Maximum size | `2 * 1024 * 1024 * 1024` bytes (2 GB) |
| Zero-byte files | rejected client-side with "The selected file is empty." |

**Progress.** In HTTP mode the ratio comes from axios `onUploadProgress`
(`clamp(event.loaded / event.total, 0, 1)`), so a `Content-Length`-bearing request gives a
smooth bar. In mock mode the progress is synthesised in 12 steps.

**Request**

```
POST /api/load-sar-data
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary…

------WebKitFormBoundary…
Content-Disposition: form-data; name="file"; filename="NISAR_L2_GUNW_20250612.h5"
Content-Type: application/octet-stream

<binary>
------WebKitFormBoundary…
Content-Disposition: form-data; name="fileName"

NISAR_L2_GUNW_20250612.h5
------WebKitFormBoundary…
Content-Disposition: form-data; name="sizeBytes"

184320000
------WebKitFormBoundary…--
```

**Response** — `ApiEnvelope<SarDataset>`, `201` or `200`

```json
{
  "data": {
    "id": "sar-4c1f9a2b",
    "fileName": "NISAR_L2_GUNW_20250612.h5",
    "sizeBytes": 184320000,
    "format": "h5",
    "uploadedAt": "2025-06-20T14:02:31.107Z",
    "status": "queued",
    "progress": 0,
    "sceneCount": 3,
    "message": "Queued for ingest"
  },
  "meta": {
    "requestId": "req-1e5d90aa",
    "generatedAt": "2025-06-20T14:02:31.224Z",
    "source": "backend"
  }
}
```

Return `status: "queued"` (or `"processing"`) and let the status endpoint advance it.
The frontend treats the returned `id` as the polling handle and immediately begins §5.5.
`format` must be one of the `SarFormat` literals — the mock derives it from the extension
and would otherwise emit an unmapped string.

---

### 5.5 `GET /api/load-sar-data/{id}` — `fetchSarDatasetStatus`

```ts
export async function fetchSarDatasetStatus(id: string): Promise<ApiEnvelope<SarDataset>>
```

**Request** `GET /api/load-sar-data/sar-4c1f9a2b`

**Polling contract:** the client calls this every **1 200 ms** while
`dataset.status ∉ { ready, error }` and stops as soon as either terminal status is
returned (see §6.1). Unknown ids must be reported as `error` **or** as an HTTP `404`;
the mock returns a synthetic dataset with `status: "error"` and
`message: "Dataset not found on the ingest service (mock)."`, which the UI surfaces as an
"Ingest failed" toast.

**Response** — `ApiEnvelope<SarDataset>`

```json
{
  "data": {
    "id": "sar-4c1f9a2b",
    "fileName": "NISAR_L2_GUNW_20250612.h5",
    "sizeBytes": 184320000,
    "format": "h5",
    "uploadedAt": "2025-06-20T14:02:31.107Z",
    "status": "processing",
    "progress": 63.5,
    "sceneCount": 3,
    "message": "Unpacking granules…"
  },
  "meta": {
    "requestId": "req-2b8ac410",
    "generatedAt": "2025-06-20T14:02:36.512Z",
    "source": "backend",
    "elapsedMs": 61
  }
}
```

Then, on completion:

```json
{
  "data": {
    "id": "sar-4c1f9a2b",
    "fileName": "NISAR_L2_GUNW_20250612.h5",
    "sizeBytes": 184320000,
    "format": "h5",
    "uploadedAt": "2025-06-20T14:02:31.107Z",
    "status": "ready",
    "progress": 100,
    "sceneCount": 3,
    "message": "Ingest complete — ready for analysis"
  },
  "meta": {
    "requestId": "req-51ff0e3d",
    "generatedAt": "2025-06-20T14:02:41.008Z",
    "source": "backend"
  }
}
```

The UI shows the dataset name, `FORMAT · size · N scenes`, the `message`, a progress bar
and "Uploaded {uploadedAt} UTC". Reaching `ready` fires a success toast naming
`sceneCount ?? 0`; reaching `error` fires an error toast with `message`.

---

### 5.6 `POST /api/analyze` — `createAnalysisJob`

```ts
export interface CreateAnalysisPayload {
  detectionType: DetectionType;
  location: { name: string; lat: number; lng: number };
  dateRange: DateRange;
  /** Dataset produced by `uploadSarDataset`, when the operator supplied a file. */
  datasetId?: string;
  /** Analysis depth: fast preview vs full-resolution run. */
  mode?: 'preview' | 'full';
}

export async function createAnalysisJob(
  payload: CreateAnalysisPayload,
): Promise<ApiEnvelope<AnalysisJob>>
```

`AnalysisJob`:

```ts
export type StepStatus = 'pending' | 'running' | 'done' | 'error';

export interface AnalysisStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AnalysisJob {
  id: string;
  detectionType: DetectionType;
  locationName: string;
  stage: AnalysisStage;
  /** 0..100 */
  progress: number;
  startedAt: string;
  etaSeconds?: number;
  message?: string;
  steps: AnalysisStep[];
}
```

**Request**

```
POST /api/analyze
Content-Type: application/json

{
  "detectionType": "flood",
  "location": { "name": "Dhaka", "lat": 23.8103, "lng": 90.4125 },
  "dateRange": { "before": "2025-01-15", "after": "2025-06-20" },
  "datasetId": "sar-4c1f9a2b",
  "mode": "full"
}
```

Semantics of the payload fields:

| Field | Notes |
| --- | --- |
| `detectionType` | one of the seven `DetectionType` literals; drives the pipeline's `extracts` classes |
| `location` | free-form label + coordinates; **not** a `GeoLocation` — do not expect `id`, `bbox`, `altitude` or `source` |
| `dateRange.before` / `.after` | ISO `yyyy-MM-dd` (the UI stores exactly that string) and non-null by the time a job can be started; `after` must be later than `before` (validated in `ControlPanel` and re-checked in `Workspace`) |
| `datasetId` | present only when a SAR file has been uploaded in this session |
| `mode` | `'full'` from both call sites today; `'preview'` is defined and unused |

**Response** — `ApiEnvelope<AnalysisJob>`, `201` or `200`

```json
{
  "data": {
    "id": "job-8f3a2c11",
    "detectionType": "flood",
    "locationName": "Dhaka",
    "stage": "dsard",
    "progress": 0,
    "startedAt": "2025-06-20T14:03:02.884Z",
    "etaSeconds": 14,
    "message": "Dispatching to the D-SAR-D pipeline…",
    "steps": [
      { "id": "ingest", "label": "SAR Ingest & Orbit Correction", "status": "pending", "detail": "Apply precise orbit ephemeris, remove Doppler centroid ramp." },
      { "id": "calibration", "label": "Radiometric Calibration", "status": "pending", "detail": "Convert DN to sigma-nought / gamma-nought backscatter." },
      { "id": "speckle", "label": "Speckle Filtering", "status": "pending", "detail": "Refined Lee / NL-SAR despeckling to stabilise the difference signal." },
      { "id": "coregistration", "label": "Coregistration", "status": "pending", "detail": "Sub-pixel alignment of the before/after stack." },
      { "id": "interferometry", "label": "Interferometric Coherence", "status": "pending", "detail": "Coherence and phase-difference products (GUNW where available)." },
      { "id": "thresholding", "label": "Adaptive Thresholding", "status": "pending", "detail": "Bimodal histogram split with an Otsu-derived global prior." },
      { "id": "classification", "label": "Change Classification", "status": "pending", "detail": "Segmentation of the change mask into the target classes." },
      { "id": "vectorisation", "label": "Vectorisation & Statistics", "status": "pending", "detail": "Polygonise the raster mask and compute area/confidence statistics." }
    ]
  },
  "meta": {
    "requestId": "req-90ce4471",
    "generatedAt": "2025-06-20T14:03:02.901Z",
    "source": "backend",
    "elapsedMs": 388
  }
}
```

**Step ids and details.** The frontend ships its own 8-step catalogue
(`DSARD_PIPELINE` in `src/lib/constants.ts`, reproduced above). `DsardPanel` uses
`job.steps` when it is non-empty and only falls back to the local catalogue when the array
is empty, so **the server's steps win**. Returning the same 8 ids keeps the timeline stable
across the mock and the real backend; returning fewer steps is supported and simply renders
a shorter list. A step's `status` must be one of `pending | running | done | error`, and the
panel renders each distinctly (number / spinner / check / warning triangle).

**Idempotency.** `POST /api/analyze` may be retried by the client only if the user presses
the button again — mutations are never auto-retried — but an analyst can double-click, so an
`Idempotency-Key`-style guard is recommended. The frontend always routes to
`/analyze?stage=dsard` immediately after a successful create and stores the returned job.

---

### 5.7 `GET /api/analyze/{jobId}` — `fetchAnalysisJob`

```ts
export async function fetchAnalysisJob(jobId: string): Promise<ApiEnvelope<AnalysisJob>>
```

**Polling contract:** every **1 200 ms** while `progress < 100`; polling stops when
`progress >= 100` (see §6.2). The response is the same `AnalysisJob` shape as §5.6, advanced:

```json
{
  "data": {
    "id": "job-8f3a2c11",
    "detectionType": "flood",
    "locationName": "Dhaka",
    "stage": "extracting",
    "progress": 48.2,
    "startedAt": "2025-06-20T14:03:02.884Z",
    "etaSeconds": 7,
    "message": "EXTRACTING stage · 48%",
    "steps": [
      { "id": "ingest", "label": "SAR Ingest & Orbit Correction", "status": "done", "startedAt": "2025-06-20T14:03:02.884Z", "finishedAt": "2025-06-20T14:03:03.184Z" },
      { "id": "calibration", "label": "Radiometric Calibration", "status": "done", "startedAt": "2025-06-20T14:03:03.184Z", "finishedAt": "2025-06-20T14:03:03.484Z" },
      { "id": "speckle", "label": "Speckle Filtering", "status": "running", "startedAt": "2025-06-20T14:03:03.484Z" },
      { "id": "coregistration", "label": "Coregistration", "status": "pending" },
      { "id": "interferometry", "label": "Interferometric Coherence", "status": "pending" },
      { "id": "thresholding", "label": "Adaptive Thresholding", "status": "pending" },
      { "id": "classification", "label": "Change Classification", "status": "pending" },
      { "id": "vectorisation", "label": "Vectorisation & Statistics", "status": "pending" }
    ]
  },
  "meta": {
    "requestId": "req-c41d0b92",
    "generatedAt": "2025-06-20T14:03:09.556Z",
    "source": "backend",
    "elapsedMs": 37
  }
}
```

**Fields the UI depends on**

| Field | Consequence if wrong |
| --- | --- |
| `stage` | Gates the three derived queries. The rank must advance monotonically `dsard → extracting → analyzing → result`; a regression would re-close the gates and leave already-shown data in the store |
| `progress` | The single source of the overall bar **and** the per-stage ladder (`stageStates` distributes it across four fixed 25 % bands), and the terminal condition |
| `steps[].status` | Step cards and the timeline |
| `steps[].finishedAt` | Timeline timestamps, else "awaiting" |
| `message` | Rendered verbatim in the job-header note |
| `etaSeconds` | "· ETA {n}s" in the D-SAR-D header |
| `startedAt` | "Started {formatted} UTC" |

`progress >= 100` is **the** completion signal (`isComplete`); `stage` alone never completes
a job. Send `100` exactly at the end. If a job fails, send `steps[].status: "error"` on the
failing step and an explanatory `message` — there is no `failed` stage value.

---

### 5.8 `GET /api/analyze/{jobId}/extractions` — `fetchExtractions`

```ts
export interface ExtractionCategory {
  id: string;
  /** Human label, e.g. "Water Bodies". */
  label: string;
  /** lucide-react icon name, resolved by the UI. */
  icon: string;
  featureCount: number;
  areaKm2: number;
  /** Mean model confidence for this class, 0..1. */
  confidence: number;
  /** % change versus the previous observation window. */
  trend: number;
}

export async function fetchExtractions(jobId: string): Promise<ApiEnvelope<ExtractionCategory[]>>
```

Fetched once when the job first reaches `extracting` (rank ≥ 1) with
`staleTime: Infinity`.

**Icon names.** `icon` is resolved against the curated registry in
`src/components/ui/Icon.tsx` (59 names) and falls back to `Info` when unknown, so an
unrecognised name degrades gracefully. The names used by the shipped catalogue
(`EXTRACTION_CATEGORIES`) are: `Droplets`, `Trees`, `Building2`, `Route`, `Waves`, `Anchor`,
`Wheat`.

```json
{
  "data": [
    { "id": "water",       "label": "Water Bodies", "icon": "Droplets",  "featureCount": 8231, "areaKm2": 1846.2, "confidence": 0.884, "trend": 12.4 },
    { "id": "vegetation",  "label": "Vegetation",   "icon": "Trees",     "featureCount": 5104, "areaKm2": 1203.7, "confidence": 0.741, "trend": -4.1 },
    { "id": "buildings",   "label": "Buildings",    "icon": "Building2", "featureCount": 4417, "areaKm2": 980.5,  "confidence": 0.912, "trend": 31.2 },
    { "id": "roads",       "label": "Roads",        "icon": "Route",     "featureCount": 3021, "areaKm2": 640.9,  "confidence": 0.790, "trend": -2.3 },
    { "id": "rivers",      "label": "Rivers",       "icon": "Waves",     "featureCount": 1180, "areaKm2": 388.4,  "confidence": 0.845, "trend": 6.8  },
    { "id": "shorelines",  "label": "Shorelines",   "icon": "Anchor",    "featureCount": 902,  "areaKm2": 214.0,  "confidence": 0.812, "trend": -1.5 },
    { "id": "agriculture", "label": "Agriculture",  "icon": "Wheat",     "featureCount": 3316, "areaKm2": 1128.6, "confidence": 0.702, "trend": 9.4  }
  ],
  "meta": {
    "requestId": "req-6f2e8810",
    "generatedAt": "2025-06-20T14:03:22.140Z",
    "source": "backend",
    "elapsedMs": 264
  }
}
```

**Notes**

* A **subset** is expected and supported: a flood job will not emit `Agriculture`. The grid
  adapts to whatever array is returned, and a category is not required to be in
  `EXTRACTION_CATEGORIES` at all — the panel renders `label` and `icon` straight from the
  payload.
* `trend` is signed; `>= 0` renders a success badge with an explicit `+`.
* The panel derives its own totals (classes, summed features, summed area, mean confidence)
  and the "dominant class" table from the largest `areaKm2` — do not pre-aggregate.
* An empty array is a valid response and renders the grid with zero cards; the summary
  tiles then read 0.

---

### 5.9 `GET /api/analyze/{jobId}/widgets` — `fetchAnalysisWidgets`

```ts
export interface Metric {
  label: string;
  value: number | string;
  unit?: string;
  /** Signed delta versus the reference window; renders as ▲/▼. */
  delta?: number;
}

export interface SeriesPoint {
  label: string;
  value: number;
  secondary?: number;
}

export interface AnalysisWidget {
  id: string;
  detectionType: DetectionType;
  headline: string;
  /** Composite risk index, 0..100. */
  riskScore: number;
  metrics: Metric[];
  series: SeriesPoint[];
}

export async function fetchAnalysisWidgets(jobId: string): Promise<ApiEnvelope<AnalysisWidget[]>>
```

Fetched once at rank ≥ 2 with `staleTime: Infinity`.

```json
{
  "data": [
    {
      "id": "widget-flood",
      "detectionType": "flood",
      "headline": "Flood exposure index",
      "riskScore": 82,
      "metrics": [
        { "label": "Affected area",      "value": 1284.2,  "unit": "km²", "delta": 12.4 },
        { "label": "Scenes processed",   "value": 38,                    "delta": 4.2  },
        { "label": "Mean coherence",     "value": 0.78,                  "delta": -0.02 },
        { "label": "Population exposed", "value": 214882,                "delta": -7.1 }
      ],
      "series": [
        { "label": "W01", "value": 34.2, "secondary": 21.8 },
        { "label": "W02", "value": 41.7, "secondary": 26.4 },
        { "label": "W03", "value": 38.1, "secondary": 24.9 },
        { "label": "W04", "value": 52.6, "secondary": 31.2 }
      ]
    },
    {
      "id": "widget-landslide",
      "detectionType": "landslide",
      "headline": "Landslide exposure index",
      "riskScore": 61,
      "metrics": [
        { "label": "Affected area",    "value": 842.0, "unit": "km²", "delta": -3.0 },
        { "label": "Scenes processed", "value": 22,                   "delta": 8.0  }
      ],
      "series": [{ "label": "W01", "value": 22.4, "secondary": 14.1 }]
    }
  ],
  "meta": {
    "requestId": "req-a10b7c33",
    "generatedAt": "2025-06-20T14:03:29.771Z",
    "source": "backend",
    "elapsedMs": 301
  }
}
```

**Notes**

* One widget per hazard domain is the shipped shape (the mock returns one per
  `DetectionType`), but the grid is a plain `map` — return as many or as few as are
  meaningful.
* `detectionType` is looked up in `DETECTION_TYPE_MAP` for the icon, colour and short label.
  An unknown literal will render with a `undefined` lookup and should be avoided; adding a
  new domain requires a matching `DetectionType`.
* `riskScore` is 0..100 and drives `riskTone()`: `>= 75` Severe (danger), `>= 50` Elevated
  (warning), else Nominal (success).
* `metrics[].value` may be a number **or** a string; numbers above 9 999 are rendered
  compactly, non-integers with 2 decimals.
* `metrics[].delta` is signed and optional — absent or `0` renders no arrow.
* `series` feeds a 48 px sparkline (no axes) and expects ≥ 2 points to look like a line;
  `secondary` is optional.

---

### 5.10 `GET /api/results/{jobId}` — `fetchResults`

```ts
export interface ResultDataset {
  generatedAt: string;
  totalAreaKm2: number;
  eventCount: number;
  meanConfidence: number;
  /** Share of total area by detection class. */
  categories: SeriesPoint[];
  /** Area histogram bucketed by severity band. */
  distribution: SeriesPoint[];
  /** Detection count per ISO week / month. */
  timeline: SeriesPoint[];
  /** Confidence histogram for the results table. */
  confidenceBands: SeriesPoint[];
}

export async function fetchResults(jobId: string): Promise<ApiEnvelope<ResultDataset>>
```

Fetched once at rank ≥ 3 (`result`) with `staleTime: Infinity`.

```json
{
  "data": {
    "generatedAt": "2025-06-20T14:03:41.902Z",
    "totalAreaKm2": 6402.3,
    "eventCount": 1284,
    "meanConfidence": 0.862,
    "categories": [
      { "label": "Flood",          "value": 1632.4 },
      { "label": "Landslide",      "value": 1204.8 },
      { "label": "Earthquake",     "value": 886.1  },
      { "label": "Infrastructure", "value": 742.6  },
      { "label": "Sea Level",      "value": 611.3  },
      { "label": "River Erosion",  "value": 704.9  },
      { "label": "Farming",        "value": 620.2  }
    ],
    "distribution": [
      { "label": "Critical", "value": 41  },
      { "label": "High",     "value": 86  },
      { "label": "Medium",   "value": 132 },
      { "label": "Low",      "value": 168 }
    ],
    "timeline": [
      { "label": "T-16", "value": 12.4, "secondary": 6.1  },
      { "label": "T-15", "value": 15.8, "secondary": 8.4  },
      { "label": "T-14", "value": 14.1, "secondary": 7.2  }
    ],
    "confidenceBands": [
      { "label": "0.55–0.65", "value": 24 },
      { "label": "0.65–0.75", "value": 51 },
      { "label": "0.75–0.85", "value": 68 },
      { "label": "0.85–0.95", "value": 42 },
      { "label": "0.95–1.00", "value": 15 }
    ]
  },
  "meta": {
    "requestId": "req-dc5541e0",
    "generatedAt": "2025-06-20T14:03:42.010Z",
    "source": "backend",
    "elapsedMs": 412
  }
}
```

**How each array is rendered** (`ResultCharts`, and `ResultPanel` for the KPI tiles):

| Field | Chart | Notes |
| --- | --- | --- |
| `categories` | Pie (donut) and Bar | `label` should match a `DetectionTypeMeta.shortLabel` (e.g. `Flood`, `Sea Level`) for the bar chart's per-class colours and the legend swatches; unmatched labels fall back to `CHART_PALETTE`. Pie tooltips are suffixed ` km²` |
| `distribution` | *not currently charted* | Declared and shipped but no chart reads it; the bar chart uses `categories`, not `distribution` (which the type comment describes as an area histogram by severity band) |
| `timeline` | Line/Area | Renders `value` as "Affected area" and `secondary` as "Reference"; a `Brush` appears when `length > 8` |
| `confidenceBands` | Histogram | Plain counts; the histogram tooltip has no unit suffix |
| `eventCount`, `totalAreaKm2`, `meanConfidence` | KPI tiles + chart subtitle | `meanConfidence` is a 0..1 ratio rendered as a percentage with one decimal |
| `generatedAt` | Detection-table header | "generated {dd MMM yyyy}" in UTC |

**Notes**

* `categories.length` is shown as the "Classes" KPI, so keep it equal to the number of
  distinct change classes.
* The Bar chart switches on `data.length > 6` for axis rotation and a `Brush`; the Line
  chart on `> 8`. Both are cosmetic.
* The result dataset is deliberately a **single** request: switching between pie /
  histogram / line / bar never refetches, so the whole aggregate must arrive in one payload.
* The `/results` route renders all four chart types from this one response — there is no
  per-chart endpoint.

---

### 5.11 `GET /api/mission/summary` — `fetchMissionSummary`

```ts
export interface MissionSummary {
  activeEvents: number;
  monitoredAreaKm2: number;
  scenesIngested: number;
  meanLatencySeconds: number;
  uptimeRatio: number;
  lastIngestAt: string;
}

export async function fetchMissionSummary(): Promise<ApiEnvelope<MissionSummary>>
```

Polled every **60 000 ms** with `staleTime: 45_000` and `retry: 2`. This is a KPI strip, not
a socket; a slow response is fine and `isLoading` renders pulsing placeholder dashes.

```json
{
  "data": {
    "activeEvents": 128,
    "monitoredAreaKm2": 486320,
    "scenesIngested": 1842,
    "meanLatencySeconds": 41,
    "uptimeRatio": 0.9987,
    "lastIngestAt": "2025-06-20T13:58:04.220Z"
  },
  "meta": {
    "requestId": "req-4b71aa09",
    "generatedAt": "2025-06-20T14:04:01.334Z",
    "source": "backend",
    "elapsedMs": 88
  }
}
```

**Rendering:** `activeEvents` and `scenesIngested` via `formatCompact`, `monitoredAreaKm2`
with a `km²` suffix, `uptimeRatio` via `formatPercent(ratio, 2)` (i.e. `99.87%`). The strip
is `hidden xl:flex`, so it is invisible below 1280 px. `meanLatencySeconds` and
`lastIngestAt` are part of the contract but not currently displayed. A failure here only
flips the header status badge to "Offline" — it never blocks the dashboard.

---

## 6. Polling semantics (normative)

### 6.1 `GET /api/load-sar-data/:id`

| Property | Value |
| --- | --- |
| Enabled while | `dataset?.id` is set **and** `dataset.status !== 'ready'` **and** `dataset.status !== 'error'` |
| Interval | `1_200` ms, recomputed from each response; `1_200` ms also before the first response arrives |
| Terminal condition | The response body's `data.status` is `'ready'` or `'error'` → the interval function returns `false` |
| Side effects of every response | Mirrored into `appStore.dataset` |
| Side effects on `ready` | Success toast: "SAR ingest complete — {sceneCount ?? 0} scene(s) ready for analysis." |
| Side effects on `error` | Error toast: "Ingest failed — {message ?? 'The ingest service rejected the dataset.'}" |
| Failure handling | A transport error is retried per §4.3 (offline/timeout/5xx up to 2×); the previous snapshot is retained |

The `status` ladder the client tolerates is `queued | uploading | processing | ready |
error`; any value outside it would fall through the status copy map and should not be sent.

**Recommended backend behaviour:** answer within a few hundred ms from a cached job record;
advance `progress` monotonically 0→100; reach `ready` only when the dataset is genuinely
usable for `POST /api/analyze`; use `error` plus a human-readable `message` for terminal
failures (the toast shows the message verbatim).

### 6.2 `GET /api/analyze/:jobId`

| Property | Value |
| --- | --- |
| Enabled while | `appStore.jobId` is set (i.e. after a successful `POST /api/analyze`, or a previous job in the same session) |
| Interval | `1_200` ms; `1_200` ms before the first response |
| Terminal condition | `data.progress >= 100` → the interval function returns `false` |
| Side effects of every response | `setJob(data)` → mirrors `job`, keeps `jobId`, and sets `activeStage = job.stage` |
| Stage transitions | When `stage` crosses `extracting` / `analyzing` / `result`, the corresponding derived query flips from disabled to enabled and fetches exactly once |
| Completion | When `isComplete` flips true, a success toast names the job |
| Cancellation | `cancel()` clears the store analysis slice and removes the whole `['analysis']` query family; the client does **not** notify the server, so the job keeps running server-side |

**Recommended backend behaviour**

* Make `data.progress` monotonic and non-decreasing; the store keeps whatever the last poll
  returned, so a regressing value would visibly rewind the UI.
* Advance `data.stage` monotonically through the four ranks, one stage at a time.
* Send `progress: 100` in the same response that first makes the artifacts available, so the
  rank-3 `results` fetch and completion land together.
* Keep the payload a constant shape across the whole run (`steps` always present, same ids),
  so the D-SAR-D timeline does not jump.
* Answer a poll for an unknown `jobId` with `404` and an `ApiErrorShape`. The **mock does
  not do this** — it returns a synthetic `progress: 100` job with
  `message: "Job not found on the analysis service (mock)"`, which the UI reads as success
  (Architecture §12, gap 12). Do not copy that.
* The client polls indefinitely while `progress < 100`; there is no client-side timeout
  budget. If a job can stall, either keep advancing `progress`, or fail it explicitly
  (`steps[].status = "error"` + `message`) — otherwise the console polls forever.

### 6.3 `GET /api/mission/summary`

Fixed `60_000` ms `refetchInterval`, independent of the response (it never returns `false`).
`refetchOnWindowFocus` is disabled globally, so a background tab does not trigger a burst of
catch-up requests.

---

## 7. Switching from mock to real backend

```bash
# .env.local
NEXT_PUBLIC_USE_MOCK_API=false
NEXT_PUBLIC_API_BASE_URL=https://api.example.org
NEXT_PUBLIC_API_TIMEOUT=20000
```

Nothing else changes: `apiService.ts` branches on `USE_MOCK_API` inside each function, and
both branches return the same `ApiEnvelope<T>`. Component code is transport-agnostic by
construction — it only ever sees the envelope.

Checklist and gotchas:

1. **Set the literal string `false`.** `USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API
   !== 'false'`, so `0`, `no`, `FALSE` or an empty value all keep the mock enabled. All
   `NEXT_PUBLIC_*` values are inlined at build time, so a redeploy/restart is required.
2. **Set the base URL.** With an empty `NEXT_PUBLIC_API_BASE_URL`, axios is created with
   `baseURL: undefined` and calls resolve against the frontend origin (`/api/...`). That is
   only correct behind a same-origin proxy.
3. **CORS.** Allow the dashboard origin, `GET` and `POST`, the `Content-Type` and
   `x-request-id` / `x-client` request headers, and expose `x-request-id` on responses if
   you want it to be honoured as `meta.requestId` for bare bodies.
4. **Always send the `{ data, meta }` envelope** with `meta.source: "backend"`.
5. **Errors:** return the real HTTP status plus `{ "error": { code, message, status, details } }`.
   Reserve `4xx` for permanent failures and `5xx`/`429`/`408` for retryable ones.
6. **Timeouts:** every request shares `NEXT_PUBLIC_API_TIMEOUT` (default 20 000 ms),
   including the upload and every poll. Raise it if the multipart upload of a 2 GB granule
   cannot complete in time, or return a fast `202` and let the status endpoint carry progress.
7. **Polling:** answer the two polling endpoints quickly and cheaply; the client hits them
   every 1.2 s per active job. Support `ETag`/`If-None-Match` or `304` if you want to reduce
   payload size — the client tolerates an unchanged body and re-renders idempotently.
8. **Ingest status is a two-phase flow:** the `POST` response must already carry the `id`
   used for polling, and `status`/`progress` must be present in it.
9. **The mock-specific failure hooks disappear:** the `__fail` token and
   `MOCK_SIMULATED_FAILURE` are mock-only. To demo error states against a real backend, use
   a stubbed staging environment or a proxy that can inject a `503`.
10. **Determinism for demos:** the mock is seeded (`seededRandom(hashString(seedKey))`) so
    the same job id yields the same numbers. A real backend will not be deterministic —
    charts and tables will change between runs, which is expected.

---

## 8. Backend migration checklist

### Contract mechanics

- [ ] Every response body is `{ "data": …, "meta": { requestId, generatedAt, source: "backend", elapsedMs? } }`.
- [ ] No resource payload has top-level `data` **and** `meta` keys of its own.
- [ ] Errors use the real HTTP status and `{ "error": { code, message, status, details } }`.
- [ ] `4xx` is permanent; `408`/`429`/`5xx` are treated as retryable (max 2 retries).
- [ ] Ids (`:id`, `:jobId`) are treated as opaque and URL-decoded/encoded safely.
- [ ] `Content-Type: application/json` responses; UTF-8 (chart labels contain `km²`, `–`, `°`).

### Endpoints

- [ ] `GET /api/search-location` — ranked `GeoLocation[]`; `200` with `[]` for no match; honours `q`, `limit`.
- [ ] `GET /api/events` — `Paginated<DetectedEvent>`; honours `detectionTypes`, `severities`, `minConfidence`, `pageSize`; accepts `query`, `bbox`, `page`.
- [ ] `GET /api/events/:id` — single `DetectedEvent`; `404` + `ApiErrorShape` when absent.
- [ ] `POST /api/load-sar-data` — multipart parts `file`, `fileName`, `sizeBytes`; returns a `SarDataset` with an `id` and `status: "queued"`; enforces the `.tif/.tiff/.h5/.nc/.zip` and 2 GB limits server-side.
- [ ] `GET /api/load-sar-data/:id` — advances `status`/`progress` monotonically; terminal `ready` or `error` (+ `message`); cheap enough for 1.2 s polling.
- [ ] `POST /api/analyze` — accepts `CreateAnalysisPayload`; returns a full `AnalysisJob` including all 8 `steps` with the `DSARD_PIPELINE` ids; `stage: "dsard"`, `progress: 0`.
- [ ] `GET /api/analyze/:jobId` — monotonic `progress`, monotonic `stage`, `100` only at the end, `steps[].status ∈ {pending, running, done, error}`; `404` for unknown ids.
- [ ] `GET /api/analyze/:jobId/extractions` — `ExtractionCategory[]`, subset allowed, `icon` from the registry list, signed `trend`.
- [ ] `GET /api/analyze/:jobId/widgets` — `AnalysisWidget[]`, `riskScore` 0..100, numeric-or-string metrics, `series` with ≥ 2 points.
- [ ] `GET /api/results/:jobId` — one aggregate containing `categories`, `distribution`, `timeline`, `confidenceBands`.
- [ ] `GET /api/mission/summary` — all six `MissionSummary` fields; `uptimeRatio` a 0..1 ratio.

### Semantics

- [ ] `event.footprint` is a **closed** `[lng, lat]` ring with ≥ 3 points.
- [ ] `dateRange` values are ISO `yyyy-MM-dd`; `after > before` is enforced server-side too.
- [ ] `confidence`, `meanConfidence`, `uptimeRatio` are 0..1 ratios, **not** percentages.
- [ ] `areaKm2` is km²; `progress`/`riskScore` are 0..100.
- [ ] `detectionType` values come only from the seven literals (plus a matching catalogue entry for any new domain).
- [ ] `stage` values come only from `dsard | extracting | analyzing | result`.
- [ ] `status` values come only from the declared unions (`SarJobStatus`, `'new'|'reviewed'|'archived'`).

### Operational

- [ ] Timeouts: every endpoint answers within `NEXT_PUBLIC_API_TIMEOUT` (default 20 s).
- [ ] Polling endpoints are cache-friendly (short TTL, `ETag`, or `304`).
- [ ] Job/dataset records are retained long enough to be polled to completion and to serve the artifact fetches that follow.
- [ ] CORS and auth decided; if token auth is added, the frontend needs a change (no auth header exists today).
- [ ] Staging environment with the mock disabled for an end-to-end pass: start a job, watch all four stages unlock, export a chart PNG, and confirm each `ErrorState` branch (offline, timeout, `4xx`, `5xx`).
- [ ] Confirm the two mock-only quirks do **not** ship: `advanceJob`'s synthetic success for unknown jobs, and `advanceDataset`'s synthetic `error` dataset — both should be genuine `404`s server-side.

---

## 9. Mock transport reference (for parity testing)

`src/lib/mock/transport.ts` wraps every fixture producer:

```ts
export async function mockRequest<T>(
  config: { endpoint: string; params?: Record<string, unknown>; latencyMs?: number },
  produce: (params: Record<string, unknown>) => T | Promise<T>,
): Promise<ApiEnvelope<T>>
```

| Behaviour | Detail |
| --- | --- |
| Latency | `latencyMs` (default `420`) **+ `Math.random() * 160`** ms; per-endpoint overrides are 180–520 ms |
| Envelope | `{ data, meta: { requestId: uid('req'), generatedAt, source: 'mock', elapsedMs } }` |
| `elapsedMs` | Measured with `performance.now()` around the artificial sleep |
| Failure hook | If any **string** value in `params` contains the token `__fail`, the request rejects with `ApiError { code: 'MOCK_SIMULATED_FAILURE', status: 503, details: { endpoint, params } }` |

**The `__fail` token currently reaches only `GET /api/search-location`**, because that is
the only call site that forwards `params` to `mockRequest` (it spreads the `LocationQuery`).
`fetchEvents`, `fetchSarDatasetStatus`, `fetchAnalysisJob`, `fetchExtractions`,
`fetchAnalysisWidgets`, `fetchResults` and `fetchMissionSummary` pass no `params`, and
`uploadSarDataset`'s mock branch bypasses `mockRequest` entirely. To demo an error state
today, type a query containing `__fail` into the location search box (or navigate to
`/analyze?stage=dsard` and paste it into the search field), which produces the realistic
503 `ApiError` and exercises `ErrorState`/the failure copy. The header-based alternative
documented in the transport's comment (`x-simulate-error`) is **not implemented anywhere**.

`resetMockServiceState()` clears the in-memory mock job and dataset maps; it is a test seam
and is not called by the application.
