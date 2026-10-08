import type { ChartType, DetectionType, LayerType, Severity } from '@/types';

/* ==========================================================================
   DETECTION TYPES
   ========================================================================== */
export const DETECTION_TYPES: Array<{
  id: DetectionType;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  extracts: string[];
  hex: string;
}> = [
  { id: 'flood', label: 'Flood', shortLabel: 'Flood', icon: 'Waves', description: 'Detect flood extent using SAR backscatter change.', extracts: ['Water extent', 'Flood depth', 'Affected area'], hex: '#27c9ff' },
  { id: 'landslide', label: 'Landslide', shortLabel: 'Landslide', icon: 'Mountain', description: 'Detect slope failures using SAR texture + DEM.', extracts: ['Slope change', 'Debris flow', 'Risk zones'], hex: '#ff8c42' },
  { id: 'earthquake', label: 'Earthquake', shortLabel: 'Earthquake', icon: 'Activity', description: 'Detect ground deformation using InSAR.', extracts: ['Phase change', 'Displacement', 'Fault line'], hex: '#ff4757' },
  { id: 'infrastructure', label: 'Infrastructure', shortLabel: 'Infra', icon: 'Building2', description: 'Detect building and road changes.', extracts: ['Building change', 'Road status', 'Urban growth'], hex: '#a55eea' },
  { id: 'sea-level', label: 'Sea Level', shortLabel: 'Sea Level', icon: 'Waves', description: 'Monitor coastal inundation.', extracts: ['Waterline', 'Coastal erosion', 'Inundation'], hex: '#4db8ff' },
  { id: 'river-erosion', label: 'River Erosion', shortLabel: 'Erosion', icon: 'Droplets', description: 'Detect riverbank changes.', extracts: ['Bank line', 'Erosion rate', 'Sediment'], hex: '#ffa502' },
  { id: 'farming', label: 'Farming', shortLabel: 'Farming', icon: 'Sprout', description: 'Analyze crop health using HV backscatter.', extracts: ['Crop health', 'Yield estimate', 'Irrigation'], hex: '#2ed573' },
];

export const DETECTION_TYPE_MAP: Record<DetectionType, (typeof DETECTION_TYPES)[0]> =
  DETECTION_TYPES.reduce((acc, dt) => ({ ...acc, [dt.id]: dt }), {} as Record<DetectionType, (typeof DETECTION_TYPES)[0]>);

/* ==========================================================================
   SEVERITIES
   ========================================================================== */
export const SEVERITIES: Array<{ id: Severity; label: string; hex: string; icon: string; badge: string; }> = [
  { id: 'critical', label: 'Critical', hex: '#ff4757', icon: 'AlertOctagon', badge: 'border-critical/40 bg-critical/12 text-critical' },
  { id: 'high', label: 'High', hex: '#ff8c42', icon: 'AlertTriangle', badge: 'border-high/40 bg-high/12 text-high' },
  { id: 'medium', label: 'Medium', hex: '#ffa502', icon: 'AlertCircle', badge: 'border-medium/40 bg-medium/12 text-medium' },
  { id: 'low', label: 'Low', hex: '#2ed573', icon: 'Info', badge: 'border-low/40 bg-low/12 text-low' },
];

export const SEVERITY_MAP: Record<Severity, (typeof SEVERITIES)[0]> =
  SEVERITIES.reduce((acc, s) => ({ ...acc, [s.id]: s }), {} as Record<Severity, (typeof SEVERITIES)[0]>);

/* ==========================================================================
   CHART TYPES + CHART PALETTE
   ========================================================================== */
export const CHART_TYPES: Array<{ id: ChartType; label: string; icon: string; description: string; }> = [
  { id: 'bar', label: 'Bar', icon: 'BarChart3', description: 'Compare categories' },
  { id: 'line', label: 'Line', icon: 'LineChart', description: 'Trend over time' },
  { id: 'pie', label: 'Pie', icon: 'PieChart', description: 'Share of total' },
  { id: 'histogram', label: 'Histogram', icon: 'BarChart2', description: 'Pixel distribution' },
];

/** Chart colour palette (used by Pie, Bar, Line, Histogram). */
export const CHART_PALETTE: string[] = [
  '#27c9ff',  // cyan
  '#ffd43b',  // gold
  '#b477ff',  // purple
  '#2ed573',  // green
  '#ff8c42',  // orange
  '#ff4757',  // red
  '#4db8ff',  // light blue
  '#ffa502',  // amber
  '#a55eea',  // violet
  '#5eead4',  // teal
];

/* ==========================================================================
   LAYERS - For LayersPanel
   ========================================================================== */
export const LAYERS: Array<{
  id: LayerType;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: 'default', label: 'Default Map', icon: 'Map', description: 'Standard vector basemap' },
  { id: 'satellite', label: 'Satellite', icon: 'Satellite', description: 'High-resolution imagery' },
  { id: 'terrain', label: 'Terrain', icon: 'Mountain', description: 'Topographic view' },
  { id: 'dark', label: 'Dark Map', icon: 'Moon', description: 'Dark basemap for analysis' },
];

/* LAYER_MAP - Required by viewer.ts. Dark map changed to free provider. */
export const LAYER_MAP: Record<LayerType, {
  id: LayerType;
  label: string;
  icon: string;
  description: string;
  templateUrl: string;
  subdomains?: string[];
  maximumLevel: number;
  credit: string;
  useWorldTerrain?: boolean;
}> = {
  default: {
    id: 'default',
    label: 'Default Map',
    icon: 'Map',
    description: 'Standard vector basemap',
    templateUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maximumLevel: 19,
    credit: 'OpenStreetMap contributors',
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    icon: 'Satellite',
    description: 'High-resolution imagery',
    templateUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: 'Esri, Maxar, Earthstar Geographics',
  },
  terrain: {
    id: 'terrain',
    label: 'Terrain',
    icon: 'Mountain',
    description: 'Topographic view',
    templateUrl: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maximumLevel: 17,
    credit: 'OpenTopoMap',
    useWorldTerrain: true,
  },
  dark: {
    id: 'dark',
    // Changed to ESRI Dark Gray Canvas (free, no API key needed)
    label: 'Dark Map',
    icon: 'Moon',
    description: 'Dark basemap for analysis',
    templateUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 16,
    credit: 'Esri, HERE, Garmin',
  },
};

/* ==========================================================================
   COMPARISON BASEMAPS - Required by viewer.ts
   ========================================================================== */
export const COMPARISON_BASEMAPS = {
  before: {
    templateUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: 'Esri (Before)',
    label: 'Esri World Imagery',
  },
  after: {
    templateUrl: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    maximumLevel: 19,
    credit: 'Google (After)',
    label: 'Google Satellite',
  },
};

/* ==========================================================================
   AOI PRESETS
   ========================================================================== */
export const AOI_PRESETS: Array<{
  id: string; name: string; country: string; region: string;
  lat: number; lng: number; bbox: [number, number, number, number];
  detectionType: DetectionType; altitude: number; source: 'preset';
}> = [
  { id: 'preset-feni', name: 'Feni', country: 'Bangladesh', region: 'Chittagong', lat: 23.07, lng: 91.42, bbox: [91.35, 22.95, 91.55, 23.15], detectionType: 'flood', altitude: 50000, source: 'preset' },
  { id: 'preset-sunamganj', name: 'Sunamganj', country: 'Bangladesh', region: 'Sylhet', lat: 25.0, lng: 91.25, bbox: [91.0, 24.8, 91.5, 25.2], detectionType: 'flood', altitude: 50000, source: 'preset' },
  { id: 'preset-sylhet-fault', name: 'Sylhet Fault Zone', country: 'Bangladesh', region: 'Sylhet', lat: 24.85, lng: 92.0, bbox: [91.5, 24.5, 92.5, 25.2], detectionType: 'earthquake', altitude: 80000, source: 'preset' },
  { id: 'preset-rangamati', name: 'Rangamati', country: 'Bangladesh', region: 'Chittagong Hill Tracts', lat: 22.75, lng: 92.25, bbox: [92.0, 22.5, 92.5, 23.0], detectionType: 'landslide', altitude: 60000, source: 'preset' },
  { id: 'preset-panchhari', name: 'Panchhari', country: 'Bangladesh', region: 'Khagrachari', lat: 23.28, lng: 91.90, bbox: [91.7, 23.1, 92.1, 23.5], detectionType: 'landslide', altitude: 60000, source: 'preset' },
  { id: 'preset-dhaka', name: 'Dhaka', country: 'Bangladesh', region: 'Dhaka', lat: 23.8, lng: 90.4, bbox: [90.2, 23.6, 90.6, 24.0], detectionType: 'infrastructure', altitude: 50000, source: 'preset' },
  { id: 'preset-rajshahi', name: 'Rajshahi', country: 'Bangladesh', region: 'Rajshahi', lat: 24.4, lng: 88.6, bbox: [88.4, 24.2, 88.8, 24.6], detectionType: 'farming', altitude: 50000, source: 'preset' },
  { id: 'preset-padma', name: 'Padma River', country: 'Bangladesh', region: 'Rajbari', lat: 23.75, lng: 89.65, bbox: [89.4, 23.6, 89.9, 23.9], detectionType: 'river-erosion', altitude: 40000, source: 'preset' },
  { id: 'preset-sundarbans', name: 'Sundarbans', country: 'Bangladesh', region: 'Khulna', lat: 21.85, lng: 89.4, bbox: [89.0, 21.5, 89.8, 22.2], detectionType: 'sea-level', altitude: 40000, source: 'preset' },
];

/* ==========================================================================
   EXTRACTION CATEGORIES
   ========================================================================== */
export const EXTRACTION_CATEGORIES: Array<{
  id: string; label: string; icon: string;
  featureCount: number; areaKm2: number; confidence: number; trend: number;
}> = [
  { id: 'water', label: 'Water Bodies', icon: 'Waves', featureCount: 1247, areaKm2: 12.34, confidence: 0.94, trend: 2.5 },
  { id: 'rivers', label: 'Rivers', icon: 'Droplets', featureCount: 523, areaKm2: 5.21, confidence: 0.87, trend: -1.2 },
  { id: 'shorelines', label: 'Shorelines', icon: 'Waves', featureCount: 842, areaKm2: 8.45, confidence: 0.91, trend: 3.7 },
  { id: 'inundation', label: 'Inundation Zones', icon: 'Map', featureCount: 1567, areaKm2: 15.67, confidence: 0.82, trend: 0.8 },
];

/* ==========================================================================
   SAR INGEST
   ========================================================================== */
export const SAR_ACCEPTED_FORMATS = ['.tif', '.tiff', '.h5', '.nc', '.zip'] as const;
export const SAR_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

/* ==========================================================================
   D-SAR-D PIPELINE
   ========================================================================== */
/**
 * D-SAR-D pipeline steps.
 *
 * Historically a `string[]`, but `DsardPanel` and `fixtures.mockDsardSteps`
 * both consume it as `AnalysisStep`-shaped objects (`.id`, `.label`, `.detail`).
 * Providing the objects here keeps `DSARD_PIPELINE.length` working for
 * `apiService` while making both mappers type-correct.
 */
export const DSARD_PIPELINE: ReadonlyArray<{ id: string; label: string; detail: string }> = [
  { id: 'ingest', label: 'Ingest', detail: 'Read GCOV granules and validate metadata' },
  { id: 'calibrate', label: 'Calibrate', detail: 'Radiometric calibration to sigma-0' },
  { id: 'coregister', label: 'Coregister', detail: 'Align before/after grids to a common geometry' },
  { id: 'threshold', label: 'Threshold', detail: 'Threshold backscatter change for water' },
  { id: 'vectorize', label: 'Vectorize', detail: 'Vectorize the change mask into polygons' },
];

/* ==========================================================================
   HELPERS
   ========================================================================== */
export function severityFromIndex(index: number): Severity {
  const severities: Severity[] = ['low', 'medium', 'high', 'critical'];
  return severities[Math.min(Math.max(index, 0), severities.length - 1)];
}