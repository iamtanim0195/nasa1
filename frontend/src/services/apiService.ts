import { ApiError, httpRequest, USE_MOCK_API } from './apiClient';
import { ENDPOINTS } from './endpoints';
import {
  mockAnalysisWidgets,
  mockDsardSteps,
  mockEvents,
  mockExtractionCategories,
  mockMissionSummary,
  mockResultDataset,
  mockSarDataset,
  mockSearchLocations,
} from '@/lib/mock/fixtures';
import { mockRequest, shouldSimulateFailure } from '@/lib/mock/transport';
import { DSARD_PIPELINE, severityFromIndex } from '@/lib/constants';
import { clamp, uid } from '@/lib/utils';
import type {
  AnalysisJob,
  AnalysisStage,
  AnalysisWidget,
  ApiEnvelope,
  BoundingBox,
  DateRange,
  DetectedEvent,
  DetectionType,
  ExtractionCategory,
  GeoLocation,
  MissionSummary,
  Paginated,
  ResultDataset,
  SarDataset,
  Severity,
} from '@/types';

/* ========================================================================== */
/*  Request payloads                                                          */
/* ========================================================================== */

export interface LocationQuery {
  q: string;
  /** Optional viewport bias — the backend can rank results inside it first. */
  bbox?: BoundingBox;
  limit?: number;
}

export interface EventQuery {
  detectionTypes?: DetectionType[];
  severities?: Severity[];
  minConfidence?: number;
  query?: string;
  bbox?: BoundingBox;
  page?: number;
  pageSize?: number;
}

export interface CreateAnalysisPayload {
  detectionType: DetectionType;
  location: { name: string; lat: number; lng: number };
  dateRange: DateRange;
  /** Dataset produced by `uploadSarDataset`, when the operator supplied a file. */
  datasetId?: string;
  /** Analysis depth: fast preview vs full-resolution run. */
  mode?: 'preview' | 'full';
}

/* ========================================================================== */
/*  Internal mock state                                                       */
/* ========================================================================== */

const MOCK_EVENTS = mockEvents(26, 'earth-metamorphosis');

/**
 * Mock ingest + analysis jobs advance purely from wall-clock elapsed time, so
 * polling behaves exactly like a real long-running backend would.
 */
interface MockJob {
  job: AnalysisJob;
  startedAtMs: number;
}

const MOCK_JOBS = new Map<string, MockJob>();
const MOCK_DATASETS = new Map<string, { dataset: SarDataset; startedAtMs: number }>();

const ANALYSIS_STAGES: AnalysisStage[] = ['dsard', 'extracting', 'analyzing', 'result'];
const STAGE_DURATION_MS = 3_400;
const PIPELINE_MS = STAGE_DURATION_MS * ANALYSIS_STAGES.length;
const SAR_INGEST_MS = 5_000;

function filterEvents(query: EventQuery): Paginated<DetectedEvent> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;

  let items = MOCK_EVENTS.slice();

  if (query.detectionTypes?.length) {
    items = items.filter((event) => query.detectionTypes?.includes(event.detectionType));
  }
  if (query.severities?.length) {
    items = items.filter((event) => query.severities?.includes(event.severity));
  }
  if (typeof query.minConfidence === 'number') {
    items = items.filter((event) => event.confidence >= (query.minConfidence as number));
  }
  if (query.query?.trim()) {
    const needle = query.query.trim().toLowerCase();
    items = items.filter(
      (event) =>
        event.location.name.toLowerCase().includes(needle) ||
        event.id.toLowerCase().includes(needle),
    );
  }
  if (query.bbox) {
    const [west, south, east, north] = query.bbox;
    items = items.filter(
      (event) =>
        event.location.lng >= west &&
        event.location.lng <= east &&
        event.location.lat >= south &&
        event.location.lat <= north,
    );
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

function advanceJob(jobId: string): AnalysisJob {
  const entry = MOCK_JOBS.get(jobId);
  if (!entry) {
    // Unknown job id — behave like a real 404 would.
    return {
      id: jobId,
      detectionType: 'flood',
      locationName: 'Unknown AOI',
      stage: 'result',
      progress: 100,
      startedAt: new Date().toISOString(),
      steps: mockDsardSteps().map((step) => ({ ...step, status: 'done' as const })),
      message: 'Job not found on the analysis service (mock).',
    };
  }

  const elapsed = Date.now() - entry.startedAtMs;
  const progress = clamp((elapsed / PIPELINE_MS) * 100, 0, 100);
  const stageIndex = clamp(Math.floor(elapsed / STAGE_DURATION_MS), 0, ANALYSIS_STAGES.length - 1);
  const stage = ANALYSIS_STAGES[stageIndex] as AnalysisStage;

  const withinStage = clamp((elapsed - stageIndex * STAGE_DURATION_MS) / STAGE_DURATION_MS, 0, 1);
  const completedSteps = Math.floor(withinStage * DSARD_PIPELINE.length);

  const steps = mockDsardSteps().map((step, index) => {
    if (stageIndex > 0 || index < completedSteps) {
      return {
        ...step,
        status: 'done' as const,
        startedAt: new Date(entry.startedAtMs + index * 300).toISOString(),
        finishedAt: new Date(entry.startedAtMs + (index + 1) * 300).toISOString(),
      };
    }
    if (index === completedSteps && progress < 100) {
      return { ...step, status: 'running' as const, startedAt: new Date().toISOString() };
    }
    return step;
  });

  const updated: AnalysisJob = {
    ...entry.job,
    stage,
    progress: Number(progress.toFixed(1)),
    steps,
    etaSeconds: Math.max(0, Math.round((PIPELINE_MS - elapsed) / 1000)),
    message:
      progress >= 100
        ? 'All processing stages complete.'
        : `${stage.replace('-', ' ').toUpperCase()} stage · ${Math.round(progress)}%`,
  };

  entry.job = updated;
  return updated;
}

function advanceDataset(datasetId: string): SarDataset {
  const entry = MOCK_DATASETS.get(datasetId);
  if (!entry) {
    return {
      ...mockSarDataset('unknown.tif', 0),
      id: datasetId,
      status: 'error',
      message: 'Dataset not found on the ingest service (mock).',
    };
  }

  const elapsed = Date.now() - entry.startedAtMs;
  const progress = clamp((elapsed / SAR_INGEST_MS) * 100, 0, 100);
  const status: SarDataset['status'] = progress >= 100 ? 'ready' : 'processing';

  const updated: SarDataset = {
    ...entry.dataset,
    status,
    progress: Number(progress.toFixed(1)),
    message: status === 'ready' ? 'Ingest complete — ready for analysis' : 'Unpacking granules…',
  };

  entry.dataset = updated;
  return updated;
}

/** Test/demo helper — clears simulated ingest and analysis state. */
export function resetMockServiceState(): void {
  MOCK_JOBS.clear();
  MOCK_DATASETS.clear();
}

/* ========================================================================== */
/*  Public API                                                                */
/* ========================================================================== */

/** GET /api/search-location */
export async function searchLocations(query: LocationQuery): Promise<ApiEnvelope<GeoLocation[]>> {
  if (USE_MOCK_API) {
    return mockRequest(
      { endpoint: ENDPOINTS.searchLocation, params: { ...query }, latencyMs: 320 },
      () => mockSearchLocations(query.q, query.limit ?? 8),
    );
  }
  return httpRequest<GeoLocation[]>({
    url: ENDPOINTS.searchLocation,
    method: 'GET',
    params: query,
  });
}

/** GET /api/events */
export async function fetchEvents(
  query: EventQuery = {},
): Promise<ApiEnvelope<Paginated<DetectedEvent>>> {
  if (USE_MOCK_API) {
    return mockRequest({ endpoint: ENDPOINTS.events, params: { ...query }, latencyMs: 480 }, () =>
      filterEvents(query),
    );
  }
  return httpRequest<Paginated<DetectedEvent>>({
    url: ENDPOINTS.events,
    method: 'GET',
    params: query,
  });
}

/** GET /api/events/:id */
export async function fetchEvent(id: string): Promise<ApiEnvelope<DetectedEvent>> {
  if (USE_MOCK_API) {
    return mockRequest({ endpoint: ENDPOINTS.event(id), params: { id }, latencyMs: 260 }, () => {
      const found = MOCK_EVENTS.find((event) => event.id === id);
      if (!found) throw new Error(`Event ${id} was not found.`);
      return found;
    });
  }
  return httpRequest<DetectedEvent>({ url: ENDPOINTS.event(id), method: 'GET' });
}

/**
 * POST /api/load-sar-data (multipart)
 *
 * The caller owns the drag-and-drop UI; this function owns the transport and
 * reports byte-level progress through `onProgress` (0..1).
 */
export async function uploadSarDataset(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<ApiEnvelope<SarDataset>> {
  if (USE_MOCK_API) {
    // Multipart uploads do not go through `mockRequest`, so the failure hook is
    // applied explicitly — name a file `__fail.tif` to exercise the error path.
    if (shouldSimulateFailure({ fileName: file.name })) {
      throw new ApiError({
        code: 'MOCK_SIMULATED_FAILURE',
        message: 'The ingest service rejected this upload (simulated upstream failure).',
        status: 503,
        details: { fileName: file.name, sizeBytes: file.size },
      });
    }

    const dataset = mockSarDataset(file.name, file.size);
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 55));
      onProgress?.(i / steps);
    }
    MOCK_DATASETS.set(dataset.id, { dataset, startedAtMs: Date.now() });
    return {
      data: dataset,
      meta: { requestId: uid('req'), generatedAt: new Date().toISOString(), source: 'mock' },
    };
  }

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('fileName', file.name);
  form.append('sizeBytes', String(file.size));

  return httpRequest<SarDataset>({
    url: ENDPOINTS.loadSarData,
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!event.total) return;
      onProgress?.(clamp(event.loaded / event.total, 0, 1));
    },
  });
}

/** GET /api/load-sar-data/:id */
export async function fetchSarDatasetStatus(id: string): Promise<ApiEnvelope<SarDataset>> {
  if (USE_MOCK_API) {
    return mockRequest(
      { endpoint: ENDPOINTS.sarDatasetStatus(id), params: { id }, latencyMs: 200 },
      () => advanceDataset(id),
    );
  }
  return httpRequest<SarDataset>({ url: ENDPOINTS.sarDatasetStatus(id), method: 'GET' });
}

/** POST /api/analyze */
export async function createAnalysisJob(
  payload: CreateAnalysisPayload,
): Promise<ApiEnvelope<AnalysisJob>> {
  if (USE_MOCK_API) {
    return mockRequest(
      {
        endpoint: ENDPOINTS.analyze,
        params: {
          detectionType: payload.detectionType,
          datasetId: payload.datasetId,
          location: payload.location.name,
        },
        latencyMs: 500,
      },
      () => {
        const job: AnalysisJob = {
          id: uid('job'),
          detectionType: payload.detectionType,
          locationName: payload.location.name,
          stage: 'dsard',
          progress: 0,
          startedAt: new Date().toISOString(),
          etaSeconds: Math.round(PIPELINE_MS / 1000),
          message: 'Dispatching to the D-SAR-D pipeline…',
          steps: mockDsardSteps(),
        };
        MOCK_JOBS.set(job.id, { job, startedAtMs: Date.now() });
        return job;
      },
    );
  }
  return httpRequest<AnalysisJob>({ url: ENDPOINTS.analyze, method: 'POST', data: payload });
}

/** GET /api/analyze/:jobId */
export async function fetchAnalysisJob(jobId: string): Promise<ApiEnvelope<AnalysisJob>> {
  if (USE_MOCK_API) {
    return mockRequest(
      { endpoint: ENDPOINTS.analyzeJob(jobId), params: { jobId }, latencyMs: 180 },
      () => advanceJob(jobId),
    );
  }
  return httpRequest<AnalysisJob>({ url: ENDPOINTS.analyzeJob(jobId), method: 'GET' });
}

/** GET /api/analyze/:jobId/extractions */
export async function fetchExtractions(jobId: string): Promise<ApiEnvelope<ExtractionCategory[]>> {
  if (USE_MOCK_API) {
    return mockRequest(
      { endpoint: ENDPOINTS.extractions(jobId), params: { jobId }, latencyMs: 380 },
      () => mockExtractionCategories(jobId),
    );
  }
  return httpRequest<ExtractionCategory[]>({ url: ENDPOINTS.extractions(jobId), method: 'GET' });
}

/** GET /api/analyze/:jobId/widgets */
export async function fetchAnalysisWidgets(jobId: string): Promise<ApiEnvelope<AnalysisWidget[]>> {
  if (USE_MOCK_API) {
    return mockRequest(
      { endpoint: ENDPOINTS.widgets(jobId), params: { jobId }, latencyMs: 420 },
      () => mockAnalysisWidgets(jobId),
    );
  }
  return httpRequest<AnalysisWidget[]>({ url: ENDPOINTS.widgets(jobId), method: 'GET' });
}

/** GET /api/results/:jobId?detectionType= */
export async function fetchResults(
  jobId: string,
  detectionType?: string,
): Promise<ApiEnvelope<ResultDataset>> {
  if (USE_MOCK_API) {
    return mockRequest(
      { endpoint: ENDPOINTS.results(jobId, detectionType), params: { jobId, detectionType }, latencyMs: 520 },
      () => mockResultDataset(jobId),
    );
  }
  return httpRequest<ResultDataset>({
    url: ENDPOINTS.results(jobId, detectionType),
    method: 'GET',
  });
}

/**
 * GET /api/results/:jobId?detectionType= without needing a job id.
 *
 * The results endpoint serves the latest pipeline artifacts for a module, so
 * the dashboard can display real output before (or without) dispatching a job.
 */
export async function fetchModuleResults(
  detectionType: string,
): Promise<ApiEnvelope<ResultDataset>> {
  return fetchResults('latest', detectionType);
}

/** GET /api/mission/summary */
export async function fetchMissionSummary(): Promise<ApiEnvelope<MissionSummary>> {
  if (USE_MOCK_API) {
    return mockRequest({ endpoint: ENDPOINTS.missionSummary, latencyMs: 240 }, () =>
      mockMissionSummary(),
    );
  }
  return httpRequest<MissionSummary>({ url: ENDPOINTS.missionSummary, method: 'GET' });
}

/* ========================================================================== */
/*  Aggregated facade                                                         */
/* ========================================================================== */

/**
 * Namespaced facade — import either the individual functions above (tree
 * shakeable) or this object when a single injection point is more convenient.
 */

/* ========================================================================== */
/*  NISAR Integration (Real Backend)                                          */
/* ========================================================================== */

export interface NisarFile {
  id: string;
  granuleId: string;
  date: string;
  time: string;
  track: string;
  frame: string;
  orbit: string;
  sizeBytes: number;
  sizeGB: number;
  isDownloaded?: boolean;
}

export interface SearchNisarRequest {
  wkt: string;
  beforeDate: string;
  afterDate: string;
  detectionType: DetectionType;
}

export interface SearchNisarResponse {
  files: NisarFile[];
  total: number;
  bbox: [number, number, number, number];
  beforeDate: string;
  afterDate: string;
}

export interface AnalyzeNisarRequest {
  wkt: string;
  beforeFileId: string;
  afterFileId: string;
  detectionType: DetectionType;
}

export interface AnalyzeNisarResponse {
  jobId: string;
  status: string;
  /** Echoed back by the backend so the UI can label the running job. */
  detectionType?: string;
}

export interface NisarJobStatus {
  jobId: string;
  status: 'running' | 'complete' | 'error';
  stage: 'dsard' | 'extracting' | 'analyzing' | 'result';
  progress: number;
  startedAt: string;
  detectionType: string;
  result?: {
    jobId: string;
    detectionType: string;
    stats: {
      coveragePct: number;
      floodPixels?: number;
      totalPixels?: number;
      affectedAreaKm2?: number;
    };
  };
  errorMessage?: string;
}

/** POST /api/search-nisar-files */
export async function searchNisarFiles(
  payload: SearchNisarRequest,
): Promise<ApiEnvelope<SearchNisarResponse>> {
  return httpRequest<SearchNisarResponse>({
    url: ENDPOINTS.searchNisarFiles,
    method: 'POST',
    data: payload,
  });
}

/** POST /api/analyze-nisar */
export async function analyzeNisar(
  payload: AnalyzeNisarRequest,
): Promise<ApiEnvelope<AnalyzeNisarResponse>> {
  return httpRequest<AnalyzeNisarResponse>({
    url: ENDPOINTS.analyzeNisar,
    method: 'POST',
    data: payload,
  });
}

/** GET /api/analyze-nisar/:jobId */
export async function fetchNisarJobStatus(
  jobId: string,
): Promise<ApiEnvelope<NisarJobStatus>> {
  return httpRequest<NisarJobStatus>({
    url: ENDPOINTS.analyzeNisarJob(jobId),
    method: 'GET',
  });
}

/** GET /api/analyze-nisar/:jobId/result */
export async function fetchNisarResult(
  jobId: string,
): Promise<ApiEnvelope<NisarJobStatus['result']>> {
  return httpRequest<NisarJobStatus['result']>({
    url: ENDPOINTS.analyzeNisarResult(jobId),
    method: 'GET',
  });
}

export const apiService = {
  searchLocations,
  fetchEvents,
  fetchEvent,
  uploadSarDataset,
  fetchSarDatasetStatus,
  createAnalysisJob,
  fetchAnalysisJob,
  fetchExtractions,
  fetchAnalysisWidgets,
  fetchResults,
  fetchMissionSummary,
  resetMockServiceState,
  // NISAR Integration
  searchNisarFiles,
  analyzeNisar,
  fetchNisarJobStatus,
  fetchNisarResult,
} as const;

/** Severity helper re-exported so views never import from lib/constants twice. */
export { severityFromIndex };
