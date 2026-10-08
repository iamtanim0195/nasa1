import {
  AOI_PRESETS,
  DETECTION_TYPES,
  EXTRACTION_CATEGORIES,
  DSARD_PIPELINE,
} from '@/lib/constants';
import { daysBetween, hashString, ringAround, seededRandom, toIsoDate, uid } from '@/lib/utils';
import type {
  AnalysisStep,
  AnalysisWidget,
  DetectedEvent,
  DetectionType,
  ExtractionCategory,
  GeoLocation,
  MissionSummary,
  ResultDataset,
  SarDataset,
  SarFormat,
  Severity,
  SeriesPoint,
} from '@/types';

/* -------------------------------------------------------------------------- */
/* Deterministic helpers                                                       */
/* -------------------------------------------------------------------------- */

const SEVERITY_LADDER: Severity[] = ['critical', 'high', 'medium', 'low'];

function isoDaysAgo(days: number): string {
  const date = new Date(Date.UTC(2025, 5, 20) - days * 86_400_000);
  return date.toISOString();
}

/* -------------------------------------------------------------------------- */
/* Location search                                                             */
/* -------------------------------------------------------------------------- */

/** Extra gazetteer entries beyond the AOI presets, used by the mock search. */
const GAZETTEER: GeoLocation[] = [
  {
    id: 'khulna',
    name: 'Khulna',
    country: 'Bangladesh',
    region: 'Khulna Division',
    lat: 22.8456,
    lng: 89.5403,
    source: 'search',
  },
  {
    id: 'cox-bazar',
    name: "Cox's Bazar",
    country: 'Bangladesh',
    region: 'Chattogram Division',
    lat: 21.4272,
    lng: 92.0058,
    source: 'search',
  },
  {
    id: 'kathmandu',
    name: 'Kathmandu',
    country: 'Nepal',
    region: 'Bagmati',
    lat: 27.7172,
    lng: 85.324,
    source: 'search',
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    country: 'India',
    region: 'West Bengal',
    lat: 22.5726,
    lng: 88.3639,
    source: 'search',
  },
  {
    id: 'chennai',
    name: 'Chennai',
    country: 'India',
    region: 'Tamil Nadu',
    lat: 13.0827,
    lng: 80.2707,
    source: 'search',
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    country: 'India',
    region: 'Maharashtra',
    lat: 19.076,
    lng: 72.8777,
    source: 'search',
  },
  {
    id: 'jakarta',
    name: 'Jakarta',
    country: 'Indonesia',
    region: 'DKI Jakarta',
    lat: -6.2088,
    lng: 106.8456,
    source: 'search',
  },
  {
    id: 'manila',
    name: 'Manila',
    country: 'Philippines',
    region: 'Metro Manila',
    lat: 14.5995,
    lng: 120.9842,
    source: 'search',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    region: 'Kantō',
    lat: 35.6762,
    lng: 139.6503,
    source: 'search',
  },
  {
    id: 'reykjavik',
    name: 'Reykjavík',
    country: 'Iceland',
    region: 'Capital Region',
    lat: 64.1466,
    lng: -21.9426,
    source: 'search',
  },
  {
    id: 'lisbon',
    name: 'Lisbon',
    country: 'Portugal',
    region: 'Lisboa',
    lat: 38.7223,
    lng: -9.1393,
    source: 'search',
  },
  {
    id: 'new-orleans',
    name: 'New Orleans',
    country: 'United States',
    region: 'Louisiana',
    lat: 29.9511,
    lng: -90.0715,
    source: 'search',
  },
  {
    id: 'nairobi',
    name: 'Nairobi',
    country: 'Kenya',
    region: 'Nairobi County',
    lat: -1.2921,
    lng: 36.8219,
    source: 'search',
  },
  {
    id: 'lima',
    name: 'Lima',
    country: 'Peru',
    region: 'Lima',
    lat: -12.0464,
    lng: -77.0428,
    source: 'search',
  },
  {
    id: 'san-francisco',
    name: 'San Francisco',
    country: 'United States',
    region: 'California',
    lat: 37.7749,
    lng: -122.4194,
    source: 'search',
  },
  {
    id: 'venice',
    name: 'Venice',
    country: 'Italy',
    region: 'Veneto',
    lat: 45.4408,
    lng: 12.3155,
    source: 'search',
  },
];

/**
 * A broader gazetteer, so typing an arbitrary country during a demo resolves.
 *
 * The control panel's Location Input is free text with no fixed list, so the mock
 * has to be able to answer for more than one country. Capitals, a few major
 * cities, and a handful of physical features where change detection matters most.
 */
const WORLD_GAZETTEER: GeoLocation[] = [
  {
    id: 'washington',
    name: 'Washington, D.C.',
    country: 'United States',
    region: 'District of Columbia',
    lat: 38.9072,
    lng: -77.0369,
    source: 'search',
  },
  {
    id: 'mexico-city',
    name: 'Mexico City',
    country: 'Mexico',
    region: 'CDMX',
    lat: 19.4326,
    lng: -99.1332,
    source: 'search',
  },
  {
    id: 'sao-paulo',
    name: 'Sao Paulo',
    country: 'Brazil',
    region: 'Sao Paulo',
    lat: -23.5558,
    lng: -46.6396,
    source: 'search',
  },
  {
    id: 'buenos-aires',
    name: 'Buenos Aires',
    country: 'Argentina',
    region: 'CABA',
    lat: -34.6037,
    lng: -58.3816,
    source: 'search',
  },
  {
    id: 'santiago',
    name: 'Santiago',
    country: 'Chile',
    region: 'Region Metropolitana',
    lat: -33.4489,
    lng: -70.6693,
    source: 'search',
  },
  {
    id: 'bogota',
    name: 'Bogota',
    country: 'Colombia',
    region: 'Cundinamarca',
    lat: 4.711,
    lng: -74.0721,
    source: 'search',
  },
  {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    region: 'England',
    lat: 51.5072,
    lng: -0.1276,
    source: 'search',
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    region: 'Ile-de-France',
    lat: 48.8566,
    lng: 2.3522,
    source: 'search',
  },
  {
    id: 'berlin',
    name: 'Berlin',
    country: 'Germany',
    region: 'Berlin',
    lat: 52.52,
    lng: 13.405,
    source: 'search',
  },
  {
    id: 'madrid',
    name: 'Madrid',
    country: 'Spain',
    region: 'Comunidad de Madrid',
    lat: 40.4168,
    lng: -3.7038,
    source: 'search',
  },
  {
    id: 'rome',
    name: 'Rome',
    country: 'Italy',
    region: 'Lazio',
    lat: 41.9028,
    lng: 12.4964,
    source: 'search',
  },
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    country: 'Netherlands',
    region: 'North Holland',
    lat: 52.3676,
    lng: 4.9041,
    source: 'search',
  },
  {
    id: 'oslo',
    name: 'Oslo',
    country: 'Norway',
    region: 'Oslo',
    lat: 59.9139,
    lng: 10.7522,
    source: 'search',
  },
  {
    id: 'stockholm',
    name: 'Stockholm',
    country: 'Sweden',
    region: 'Stockholm',
    lat: 59.3293,
    lng: 18.0686,
    source: 'search',
  },
  {
    id: 'helsinki',
    name: 'Helsinki',
    country: 'Finland',
    region: 'Uusimaa',
    lat: 60.1699,
    lng: 24.9384,
    source: 'search',
  },
  {
    id: 'warsaw',
    name: 'Warsaw',
    country: 'Poland',
    region: 'Masovia',
    lat: 52.2297,
    lng: 21.0122,
    source: 'search',
  },
  {
    id: 'athens',
    name: 'Athens',
    country: 'Greece',
    region: 'Attica',
    lat: 37.9838,
    lng: 23.7275,
    source: 'search',
  },
  {
    id: 'istanbul',
    name: 'Istanbul',
    country: 'Turkiye',
    region: 'Marmara',
    lat: 41.0082,
    lng: 28.9784,
    source: 'search',
  },
  {
    id: 'cairo',
    name: 'Cairo',
    country: 'Egypt',
    region: 'Cairo Governorate',
    lat: 30.0444,
    lng: 31.2357,
    source: 'search',
  },
  {
    id: 'lagos',
    name: 'Lagos',
    country: 'Nigeria',
    region: 'Lagos State',
    lat: 6.5244,
    lng: 3.3792,
    source: 'search',
  },
  {
    id: 'accra',
    name: 'Accra',
    country: 'Ghana',
    region: 'Greater Accra',
    lat: 5.6037,
    lng: -0.187,
    source: 'search',
  },
  {
    id: 'addis',
    name: 'Addis Ababa',
    country: 'Ethiopia',
    region: 'Addis Ababa',
    lat: 9.032,
    lng: 38.7469,
    source: 'search',
  },
  {
    id: 'cape-town',
    name: 'Cape Town',
    country: 'South Africa',
    region: 'Western Cape',
    lat: -33.9249,
    lng: 18.4241,
    source: 'search',
  },
  {
    id: 'dubai',
    name: 'Dubai',
    country: 'United Arab Emirates',
    region: 'Dubai',
    lat: 25.2048,
    lng: 55.2708,
    source: 'search',
  },
  {
    id: 'riyadh',
    name: 'Riyadh',
    country: 'Saudi Arabia',
    region: 'Riyadh',
    lat: 24.7136,
    lng: 46.6753,
    source: 'search',
  },
  {
    id: 'tehran',
    name: 'Tehran',
    country: 'Iran',
    region: 'Tehran',
    lat: 35.6892,
    lng: 51.389,
    source: 'search',
  },
  {
    id: 'karachi',
    name: 'Karachi',
    country: 'Pakistan',
    region: 'Sindh',
    lat: 24.8607,
    lng: 67.0011,
    source: 'search',
  },
  {
    id: 'colombo',
    name: 'Colombo',
    country: 'Sri Lanka',
    region: 'Western Province',
    lat: 6.9271,
    lng: 79.8612,
    source: 'search',
  },
  {
    id: 'bangkok',
    name: 'Bangkok',
    country: 'Thailand',
    region: 'Bangkok',
    lat: 13.7563,
    lng: 100.5018,
    source: 'search',
  },
  {
    id: 'hanoi',
    name: 'Hanoi',
    country: 'Vietnam',
    region: 'Red River Delta',
    lat: 21.0278,
    lng: 105.8342,
    source: 'search',
  },
  {
    id: 'kuala-lumpur',
    name: 'Kuala Lumpur',
    country: 'Malaysia',
    region: 'Federal Territory',
    lat: 3.139,
    lng: 101.6869,
    source: 'search',
  },
  {
    id: 'singapore',
    name: 'Singapore',
    country: 'Singapore',
    region: 'Central',
    lat: 1.3521,
    lng: 103.8198,
    source: 'search',
  },
  {
    id: 'seoul',
    name: 'Seoul',
    country: 'South Korea',
    region: 'Sudogwon',
    lat: 37.5665,
    lng: 126.978,
    source: 'search',
  },
  {
    id: 'beijing',
    name: 'Beijing',
    country: 'China',
    region: 'Beijing',
    lat: 39.9042,
    lng: 116.4074,
    source: 'search',
  },
  {
    id: 'shanghai',
    name: 'Shanghai',
    country: 'China',
    region: 'Shanghai',
    lat: 31.2304,
    lng: 121.4737,
    source: 'search',
  },
  {
    id: 'ulaanbaatar',
    name: 'Ulaanbaatar',
    country: 'Mongolia',
    region: 'Ulaanbaatar',
    lat: 47.8864,
    lng: 106.9057,
    source: 'search',
  },
  {
    id: 'sydney',
    name: 'Sydney',
    country: 'Australia',
    region: 'New South Wales',
    lat: -33.8688,
    lng: 151.2093,
    source: 'search',
  },
  {
    id: 'melbourne',
    name: 'Melbourne',
    country: 'Australia',
    region: 'Victoria',
    lat: -37.8136,
    lng: 144.9631,
    source: 'search',
  },
  {
    id: 'auckland',
    name: 'Auckland',
    country: 'New Zealand',
    region: 'Auckland',
    lat: -36.8485,
    lng: 174.7633,
    source: 'search',
  },
  {
    id: 'suva',
    name: 'Suva',
    country: 'Fiji',
    region: 'Central',
    lat: -18.1416,
    lng: 178.4419,
    source: 'search',
  },
  {
    id: 'vancouver',
    name: 'Vancouver',
    country: 'Canada',
    region: 'British Columbia',
    lat: 49.2827,
    lng: -123.1207,
    source: 'search',
  },
  {
    id: 'anchorage',
    name: 'Anchorage',
    country: 'United States',
    region: 'Alaska',
    lat: 61.2181,
    lng: -149.9003,
    source: 'search',
  },
  {
    id: 'moscow',
    name: 'Moscow',
    country: 'Russia',
    region: 'Moscow',
    lat: 55.7558,
    lng: 37.6173,
    source: 'search',
  },
  {
    id: 'kyiv',
    name: 'Kyiv',
    country: 'Ukraine',
    region: 'Kyiv',
    lat: 50.4501,
    lng: 30.5234,
    source: 'search',
  },
  {
    id: 'almaty',
    name: 'Almaty',
    country: 'Kazakhstan',
    region: 'Almaty',
    lat: 43.222,
    lng: 76.8512,
    source: 'search',
  },
  {
    id: 'tashkent',
    name: 'Tashkent',
    country: 'Uzbekistan',
    region: 'Tashkent',
    lat: 41.2995,
    lng: 69.2401,
    source: 'search',
  },
  {
    id: 'everest',
    name: 'Mount Everest',
    country: 'Nepal',
    region: 'Koshi',
    lat: 27.9881,
    lng: 86.925,
    source: 'search',
  },
  {
    id: 'kilimanjaro',
    name: 'Mount Kilimanjaro',
    country: 'Tanzania',
    region: 'Kilimanjaro',
    lat: -3.0674,
    lng: 37.3556,
    source: 'search',
  },
  {
    id: 'fuji',
    name: 'Mount Fuji',
    country: 'Japan',
    region: 'Chubu',
    lat: 35.3606,
    lng: 138.7274,
    source: 'search',
  },
  {
    id: 'great-barrier',
    name: 'Great Barrier Reef',
    country: 'Australia',
    region: 'Queensland',
    lat: -18.2871,
    lng: 147.6992,
    source: 'search',
  },
  {
    id: 'bay-of-bengal',
    name: 'Bay of Bengal',
    country: 'Bangladesh',
    region: 'Offshore',
    lat: 21.0,
    lng: 90.0,
    source: 'search',
  },
  {
    id: 'rhine-delta',
    name: 'Rhine Delta',
    country: 'Netherlands',
    region: 'Zuid-Holland',
    lat: 51.92,
    lng: 4.48,
    source: 'search',
  },
  {
    id: 'mississippi-delta',
    name: 'Mississippi Delta',
    country: 'United States',
    region: 'Louisiana',
    lat: 29.15,
    lng: -89.25,
    source: 'search',
  },
];

export const MOCK_GAZETTEER: GeoLocation[] = [...AOI_PRESETS, ...GAZETTEER, ...WORLD_GAZETTEER];

/** Fuzzy, rank-ordered location search over the mock gazetteer. */
export function mockSearchLocations(query: string, limit = 8): GeoLocation[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return MOCK_GAZETTEER.slice(0, limit);

  const scored = MOCK_GAZETTEER.map((place) => {
    const haystack = `${place.name} ${place.country ?? ''} ${place.region ?? ''}`.toLowerCase();
    let score = 0;
    if (place.name.toLowerCase().startsWith(needle)) score += 100;
    if (place.name.toLowerCase().includes(needle)) score += 60;
    if ((place.country ?? '').toLowerCase().includes(needle)) score += 30;
    if ((place.region ?? '').toLowerCase().includes(needle)) score += 20;
    if (haystack.includes(needle)) score += 5;
    return { place, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.place);

  return scored;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

const EVENT_SUMMARIES: Record<DetectionType, string> = {
  flood: 'SAR backscatter drop-out consistent with standing surface water.',
  landslide: 'Slope failure scar with displaced material and blocked drainage.',
  earthquake: 'Coseismic displacement fringes across the rupture corridor.',
  infrastructure: 'Persistent-scatterer decorrelation on built assets.',
  'sea-level': 'Intertidal zone retreated landward versus the reference epoch.',
  'river-erosion': 'Bank-line migration detected along the active channel.',
  farming: 'Cropland inundation stress and phenology break detected.',
};

export function mockEvents(count = 24, seedKey = 'events'): DetectedEvent[] {
  const rand = seededRandom(hashString(seedKey));
  const events: DetectedEvent[] = [];

  for (let i = 0; i < count; i += 1) {
    const place = MOCK_GAZETTEER[Math.floor(rand() * MOCK_GAZETTEER.length)] as GeoLocation;
    const detection = DETECTION_TYPES[Math.floor(rand() * DETECTION_TYPES.length)];
    if (!detection) continue;

    const severityIndex = rand();
    const severity: Severity =
      severityIndex > 0.86
        ? 'critical'
        : severityIndex > 0.6
          ? 'high'
          : severityIndex > 0.3
            ? 'medium'
            : 'low';

    const confidence = Number((0.58 + rand() * 0.41).toFixed(3));
    const areaKm2 = Number((0.4 + rand() * 180).toFixed(2));
    const jitterLat = (rand() - 0.5) * 0.9;
    const jitterLng = (rand() - 0.5) * 0.9;
    const lat = Number((place.lat + jitterLat).toFixed(4));
    const lng = Number((place.lng + jitterLng).toFixed(4));

    events.push({
      id: `EM-${String(2400 + i).padStart(4, '0')}`,
      detectionType: detection.id,
      eventDate: isoDaysAgo(Math.floor(rand() * 120)),
      location: {
        name: `${place.name}${place.country ? `, ${place.country}` : ''}`,
        lat,
        lng,
      },
      severity,
      confidence,
      areaKm2,
      footprint: ringAround({ lat, lng }, Math.max(1.5, Math.sqrt(areaKm2) * 1.2)),
      status: rand() > 0.78 ? 'reviewed' : 'new',
      summary: EVENT_SUMMARIES[detection.id],
    });
  }

  return events.sort((a, b) => Date.parse(b.eventDate) - Date.parse(a.eventDate));
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                  */
/* -------------------------------------------------------------------------- */

export function mockExtractionCategories(seedKey = 'extract'): ExtractionCategory[] {
  const rand = seededRandom(hashString(seedKey));
  return EXTRACTION_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
    featureCount: Math.floor(120 + rand() * 8_400),
    areaKm2: Number((12 + rand() * 1_850).toFixed(1)),
    confidence: Number((0.66 + rand() * 0.32).toFixed(3)),
    trend: Number(((rand() - 0.35) * 46).toFixed(1)),
  }));
}

/* -------------------------------------------------------------------------- */
/* Analysis widgets                                                            */
/* -------------------------------------------------------------------------- */

function buildSeries(rand: () => number, points = 12): SeriesPoint[] {
  const series: SeriesPoint[] = [];
  let base = 20 + rand() * 40;
  for (let i = 0; i < points; i += 1) {
    base = Math.max(4, base + (rand() - 0.45) * 14);
    series.push({
      label: `W${String(i + 1).padStart(2, '0')}`,
      value: Number(base.toFixed(1)),
      secondary: Number((base * (0.6 + rand() * 0.5)).toFixed(1)),
    });
  }
  return series;
}

export function mockAnalysisWidgets(seedKey = 'widgets'): AnalysisWidget[] {
  return DETECTION_TYPES.map((detection) => {
    const rand = seededRandom(hashString(`${seedKey}:${detection.id}`));
    const riskScore = Number((28 + rand() * 68).toFixed(0));
    return {
      id: `widget-${detection.id}`,
      detectionType: detection.id,
      headline: `${detection.shortLabel} exposure index`,
      riskScore,
      metrics: [
        {
          label: 'Affected area',
          value: Number((40 + rand() * 1_400).toFixed(1)),
          unit: 'km²',
          delta: Number(((rand() - 0.4) * 34).toFixed(1)),
        },
        {
          label: 'Scenes processed',
          value: Math.floor(6 + rand() * 48),
          delta: Number(((rand() - 0.5) * 18).toFixed(1)),
        },
        {
          label: 'Mean coherence',
          value: Number((0.42 + rand() * 0.5).toFixed(2)),
          delta: Number(((rand() - 0.5) * 0.3).toFixed(2)),
        },
        {
          label: 'Population exposed',
          value: Math.floor(4_000 + rand() * 380_000),
          delta: Number(((rand() - 0.4) * 22).toFixed(1)),
        },
      ],
      series: buildSeries(rand),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export function mockResultDataset(seedKey = 'results'): ResultDataset {
  const rand = seededRandom(hashString(seedKey));

  const categories: SeriesPoint[] = DETECTION_TYPES.map((detection) => ({
    label: detection.shortLabel,
    value: Number((30 + rand() * 1_600).toFixed(1)),
  }));

  const distribution: SeriesPoint[] = [
    { label: 'Critical', value: Math.floor(8 + rand() * 40) },
    { label: 'High', value: Math.floor(24 + rand() * 70) },
    { label: 'Medium', value: Math.floor(40 + rand() * 120) },
    { label: 'Low', value: Math.floor(30 + rand() * 160) },
  ];

  const timeline: SeriesPoint[] = [];
  let accum = 12 + rand() * 20;
  for (let i = 0; i < 16; i += 1) {
    accum = Math.max(3, accum + (rand() - 0.42) * 11);
    timeline.push({
      label: `T-${16 - i}`,
      value: Number(accum.toFixed(1)),
      secondary: Number((accum * (0.45 + rand() * 0.4)).toFixed(1)),
    });
  }

  const confidenceBands: SeriesPoint[] = [
    { label: '0.55–0.65', value: Math.floor(6 + rand() * 30) },
    { label: '0.65–0.75', value: Math.floor(14 + rand() * 44) },
    { label: '0.75–0.85', value: Math.floor(20 + rand() * 58) },
    { label: '0.85–0.95', value: Math.floor(12 + rand() * 40) },
    { label: '0.95–1.00', value: Math.floor(4 + rand() * 22) },
  ];

  const totalAreaKm2 = Number(categories.reduce((sum, point) => sum + point.value, 0).toFixed(1));

  return {
    generatedAt: new Date().toISOString(),
    totalAreaKm2,
    eventCount: distribution.reduce((sum, point) => sum + point.value, 0),
    meanConfidence: Number((0.72 + rand() * 0.22).toFixed(3)),
    categories,
    distribution,
    timeline,
    confidenceBands,
  };
}

/* -------------------------------------------------------------------------- */
/* SAR ingest + pipeline                                                       */
/* -------------------------------------------------------------------------- */

export function mockSarDataset(fileName: string, sizeBytes: number): SarDataset {
  const extension = (fileName.split('.').pop() ?? 'tif').toLowerCase() as SarFormat;
  return {
    id: uid('sar'),
    fileName,
    sizeBytes,
    format: extension,
    uploadedAt: new Date().toISOString(),
    status: 'queued',
    progress: 0,
    sceneCount: 2 + Math.floor(Math.random() * 4),
    message: 'Queued for ingest',
  };
}

export function mockDsardSteps(): AnalysisStep[] {
  return DSARD_PIPELINE.map((step) => ({
    id: step.id,
    label: step.label,
    status: 'pending' as const,
    detail: step.detail,
  }));
}

/* -------------------------------------------------------------------------- */
/* Aggregate KPI baseline                                                      */
/* -------------------------------------------------------------------------- */

export function mockMissionSummary(): MissionSummary {
  return {
    activeEvents: 128,
    monitoredAreaKm2: 486_320,
    scenesIngested: 1_842,
    meanLatencySeconds: 41,
    uptimeRatio: 0.9987,
    lastIngestAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Window helper used by several generators                                     */
/* -------------------------------------------------------------------------- */

export interface ObservationWindow {
  from: string;
  to: string;
  /** Inclusive length of the window in days. */
  spanDays: number;
}

export function observationWindow(days = 30): ObservationWindow {
  const to = toIsoDate(new Date());
  const from = toIsoDate(new Date(Date.now() - days * 86_400_000));
  return { from, to, spanDays: daysBetween(from, to) };
}
