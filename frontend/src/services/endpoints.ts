/**
 * Every backend path the frontend depends on.
 */
export const ENDPOINTS = {
  searchLocation: '/api/search-location',
  events: '/api/events',
  event: (id: string) => `/api/events/${encodeURIComponent(id)}`,
  loadSarData: '/api/load-sar-data',
  sarDatasetStatus: (id: string) => `/api/load-sar-data/${encodeURIComponent(id)}`,
  analyze: '/api/analyze',
  analyzeJob: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}`,
  extractions: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}/extractions`,
  widgets: (jobId: string) => `/api/analyze/${encodeURIComponent(jobId)}/widgets`,
  results: (jobId: string) => `/api/results/${encodeURIComponent(jobId)}`,
  missionSummary: '/api/mission/summary',

  // ============================================================
  // NISAR Real Backend Endpoints
  // ============================================================
  searchNisarFiles: '/api/search-nisar-files',
  analyzeNisar: '/api/analyze-nisar',
  analyzeNisarJob: (jobId: string) => `/api/analyze-nisar/${encodeURIComponent(jobId)}`,
  analyzeNisarResult: (jobId: string) =>
    `/api/analyze-nisar/${encodeURIComponent(jobId)}/result`,
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;