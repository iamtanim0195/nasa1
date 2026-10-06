/**
 * Every backend path the frontend depends on, in one place.
 *
 * Keep this file in sync with docs/API-CONTRACT.md — it is the single source of
 * truth for the routes the backend team has to implement.
 */
export const ENDPOINTS = {
  /** GET  ?q=<free text | "lat,lng">  -> GeoLocation[] */
  searchLocation: '/api/search-location',

  /** GET  ?bbox=&types=&severity=&from=&to= -> Paginated<DetectedEvent> */
  events: '/api/events',

  /** GET  /api/events/:id -> DetectedEvent */
  event: (id: string) => `/api/events/${encodeURIComponent(id)}`,

  /** POST multipart/form-data (file) -> SarDataset */
  loadSarData: '/api/load-sar-data',

  /** GET  /api/load-sar-data/:id -> SarDataset (poll ingest progress) */
  sarDatasetStatus: (id: string) => `/api/load-sar-data/${encodeURIComponent(id)}`,

  /** POST { detectionType, location, dateRange, datasetId } -> AnalysisJob */
  analyze: '/api/analyze',

  /** GET  /api/analyze/:jobId -> AnalysisJob (poll while !done) */
  analyzeJob: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}`,

  /** GET  /api/analyze/:jobId/extractions -> ExtractionCategory[] */
  extractions: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}/extractions`,

  /** GET  /api/analyze/:jobId/widgets -> AnalysisWidget[] */
  widgets: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}/widgets`,

  /** GET  /api/results/:jobId -> ResultDataset */
  results: (jobId: string) => `/api/results/${encodeURIComponent(jobId)}`,

  /** GET  /api/mission/summary -> MissionSummary */
  missionSummary: '/api/mission/summary',
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;
