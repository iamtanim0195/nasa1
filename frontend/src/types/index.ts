/**
 * EARTH-METAMORPHOSIS â€” domain model
 *
 * These types are the contract between the UI and the (future) backend.
 * Every shape here is deliberately transport-agnostic: swap the mock
 * transport for HTTP and nothing in `components/` has to change.
 */

/* -------------------------------------------------------------------------- */
/* Geography                                                                   */
/* -------------------------------------------------------------------------- */

export interface GeoPoint {
  lat: number;
  lng: number;
}

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
  detectionType?: DetectionType;
}

/* -------------------------------------------------------------------------- */
/* Detection & layers                                                          */
/* -------------------------------------------------------------------------- */

export type DetectionType =
  | 'flood'
  | 'landslide'
  | 'earthquake'
  | 'infrastructure'
  | 'sea-level'
  | 'river-erosion'
  | 'farming';

export type LayerType = 'default' | 'satellite' | 'terrain' | 'dark';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type AnalysisStage = 'dsard' | 'extracting' | 'analyzing' | 'result';

export type ChartType = 'pie' | 'histogram' | 'line' | 'bar';

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The two shipped themes. Everything visual resolves through CSS variables, so
 * this value only ever reaches the DOM (one class on `<html>`) and the two places
 * that cannot use CSS: the Cesium scene and the chart renderers.
 */
export type Theme = 'dark' | 'light';

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export interface DetectedEvent {
  id: string;
  detectionType: DetectionType;
  /** ISO-8601 date the change was observed. */
  eventDate: string;
  location: {
    name: string;
    lat: number;
    lng: number;
  };
  severity: Severity;
  /** Model confidence, 0..1. */
  confidence: number;
  /** Affected surface, km2 */
  areaKm2: number;
  /** Optional closed ring of [lng, lat] pairs for the highlight polygon. */
  footprint?: Array<[number, number]>;
  status: 'new' | 'reviewed' | 'archived';
  summary?: string;
}

export interface EventFilter {
  detectionTypes: DetectionType[];
  severities: Severity[];
  minConfidence: number;
  query: string;
}

/* -------------------------------------------------------------------------- */
/* SAR ingest                                                                  */
/* -------------------------------------------------------------------------- */

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

export interface DateRange {
  /** ISO date (yyyy-MM-dd) or null while the operator has not picked one. */
  before: string | null;
  after: string | null;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                    */
/* -------------------------------------------------------------------------- */

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

export interface Metric {
  label: string;
  value: number | string;
  unit?: string;
  /** Signed delta versus the reference window; renders as â–²/â–¼. */
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

  /* ---------------------------------------------------------------------
   * Real-artifact fields. Added when the backend was wired to the actual
   * processing pipeline; all optional so mock fixtures stay valid.
   * ------------------------------------------------------------------- */
  jobId?: string;
  detectionType?: string;
  /** Backend-relative path, e.g. `/artifacts/feni/feni_flood_mask.tif`. */
  geotiffUrl?: string | null;
  /** Backend-relative path; must be prefixed with the API base to load. */
  previewUrl?: string | null;
  /** False when no pipeline artifacts exist yet for this module. */
  available?: boolean;
  message?: string;
  metadata?: ResultMetadata;
  prediction?: RiskPrediction;
}

/** Acquisition and provenance details for a result. */
export interface ResultMetadata {
  beforeDate?: string | null;
  afterDate?: string | null;
  track?: string;
  frame?: string;
  satellite?: string;
  instrument?: string;
  orbit?: string | null;
  projectionEpsg?: number | null;
  coveragePct?: number | null;
  severity?: string | null;
  method?: string | null;
  pixelAreaKm2?: number;
  geocoords?: {
    center?: { lat: number; lon: number };
    bbox?: { north: number; south: number; east: number; west: number };
  };

  /** Nested stats blob written by the API module handlers. */
  stats?: {
    coveragePct?: number | null;
    affectedAreaKm2?: number | null;
    floodPixels?: number;
    totalPixels?: number;
    features?: number;
    meanConfidence?: number | null;
    pixelAreaKm2?: number;
    [key: string]: unknown;
  };
}

/** Output of the risk predictor (backend/api/services/ai_predictor.py). */
export interface RiskPrediction {
  /** Projected next-period severity, 0..1. */
  risk: number;
  /** R^2 of the fit, 0..1. */
  confidence: number;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  observations?: number;
  /** Human-readable explanation of how the figure was derived. */
  basis?: string;
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

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

export interface ApiErrorShape {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Free-form progress envelope used by the polling endpoints. */
export interface ProgressSnapshot {
  id: string;
  stage: AnalysisStage;
  progress: number;
  message?: string;
  done: boolean;
}

/** Top-bar mission telemetry. */
export interface MissionSummary {
  activeEvents: number;
  monitoredAreaKm2: number;
  scenesIngested: number;
  meanLatencySeconds: number;
  uptimeRatio: number;
  lastIngestAt: string;
}
