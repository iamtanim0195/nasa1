'use client';

import { create } from 'zustand';
import { applyThemeToDocument } from '@/lib/theme';
import type {
  AnalysisJob,
  AnalysisStage,
  AnalysisWidget,
  ChartType,
  DateRange,
  DetectedEvent,
  DetectionType,
  EventFilter,
  ExtractionCategory,
  GeoLocation,
  LayerType,
  Theme,
  ResultDataset,
  SarDataset,
  BoundingBox,
} from '@/types';

/* ---- persistence helpers (localStorage-backed, SSR-safe) ---- */
function readStoredLocation(): unknown | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('em.selectedLocation');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStoredBbox(): [number, number, number, number] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('em.drawnBbox');
    return raw ? (JSON.parse(raw) as [number, number, number, number]) : null;
  } catch {
    return null;
  }
}

/**
 * Synchronously adopt persisted state on the client, BEFORE React mounts.
 * Without this, ControlPanel's detection-change effect runs on child mount
 * (child effects fire before parent effects in React 18), sees
 * `selectedLocation` as null, and seeds the default preset - overwriting
 * the user's persisted custom AOI.
 */
function adoptPersistedState(): void {
  if (typeof window === 'undefined') return;
  try {
    const loc = readStoredLocation() as GeoLocation | null;
    const bbox = readStoredBbox();
    if (!loc && !bbox) return;
    const patch: Record<string, unknown> = {};
    if (loc) patch.selectedLocation = loc;
    if (bbox) patch.drawnBbox = bbox;
    // The store is declared later in this module; the call site below runs
    // after that declaration, so this is safe.
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    useAppStore.setState(patch);
  } catch {
    /* ignore */
  }
}


export type PanelId = 'layers' | 'control' | 'events';

export interface OverlayState {
  visible: boolean;
  message: string;
  detail?: string;
  /** 0..100 when known; omit for an indeterminate spinner. */
  progress?: number;
}

export interface AppState {
  /* ---- globe ---- */
  activeLayer: LayerType;
  /** Visual theme. Mirrored onto `<html class>` by the actions below. */
  theme: Theme;
  autoRotate: boolean;
  showEvents: boolean;
  globeReady: boolean;
  globeError: string | null;

  /* ---- search & selection ---- */
  searchQuery: string;
  searchResults: GeoLocation[];
  selectedLocation: GeoLocation | null;

  /* ---- control panel ---- */
  detectionType: DetectionType;
  dateRange: DateRange;
  dataset: SarDataset | null;
  isUploading: boolean;
  uploadProgress: number;

  /* ---- events ---- */
  events: DetectedEvent[];
  eventFilter: EventFilter;
  selectedEventId: string | null;
  hoveredEventId: string | null;

  /* ---- analysis ---- */
  activeStage: AnalysisStage;
  jobId: string | null;
  job: AnalysisJob | null;
  extractions: ExtractionCategory[];
  widgets: AnalysisWidget[];
  resultDataset: ResultDataset | null;
  chartType: ChartType;

  /* ---- ui ---- */
  isSidebarOpen: boolean;
  openPanels: Record<PanelId, boolean>;
  isComparisonActive: boolean;
  overlay: OverlayState;

  /* ---- actions: globe ---- */
  setActiveLayer: (layer: LayerType) => void;
  toggleAutoRotate: () => void;
  setAutoRotate: (enabled: boolean) => void;
  setShowEvents: (show: boolean) => void;

  /* ---- actions: appearance ---- */
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setGlobeReady: (ready: boolean) => void;
  setGlobeError: (message: string | null) => void;

  /* ---- actions: search & selection ---- */
  setSearchQuery: (query: string) => void;
  drawnBbox: BoundingBox | null;
  setDrawnBbox: (bbox: BoundingBox | null) => void;
  hydrateFromStorage: () => void;
  setSearchResults: (results: GeoLocation[]) => void;
  selectLocation: (location: GeoLocation | null) => void;

  /* ---- actions: control ---- */
  setDetectionType: (type: DetectionType) => void;
  setDateRange: (patch: Partial<DateRange>) => void;
  setDataset: (dataset: SarDataset | null) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;

  /* ---- actions: events ---- */
  setEvents: (events: DetectedEvent[]) => void;
  setEventFilter: (patch: Partial<EventFilter>) => void;
  toggleDetectionFilter: (type: DetectionType) => void;
  toggleSeverityFilter: (severity: EventFilter['severities'][number]) => void;
  resetEventFilter: () => void;
  selectEvent: (id: string | null) => void;
  hoverEvent: (id: string | null) => void;

  /* ---- actions: analysis ---- */
  setActiveStage: (stage: AnalysisStage) => void;
  startAnalysis: (job: AnalysisJob) => void;
  setJob: (job: AnalysisJob | null) => void;
  setExtractions: (categories: ExtractionCategory[]) => void;
  setWidgets: (widgets: AnalysisWidget[]) => void;
  setResultDataset: (dataset: ResultDataset | null) => void;
  setChartType: (chart: ChartType) => void;
  resetAnalysis: () => void;

  /* ---- actions: ui ---- */
  toggleSidebar: (open?: boolean) => void;
  togglePanel: (panel: PanelId, open?: boolean) => void;
  setComparisonActive: (active: boolean) => void;
  showOverlay: (overlay: Omit<OverlayState, 'visible'>) => void;
  hideOverlay: () => void;
  resetAll: () => void;
}

const DEFAULT_DATE_RANGE: DateRange = {
  before: '2026-06-25',
  after: '2026-09-30',
};

export const DEFAULT_EVENT_FILTER: EventFilter = {
  detectionTypes: [],
  severities: [],
  minConfidence: 0,
  query: '',
};

const INITIAL = {
  activeLayer: 'dark' as LayerType,
  // The pre-paint script in <head> decides the real value; the store adopts it on
  // mount (see `useTheme`). 'dark' here matches the server render, so there is no
  // hydration mismatch.
  theme: 'dark' as Theme,
  // On by default: the globe turns slowly about its own axis until the pointer
  // reaches it. Hovering suspends the spin without touching this flag, so the
  // header play/pause button is the only thing that owns this value.
  autoRotate: false,
  showEvents: false,
  globeReady: false,
  globeError: null,

  searchQuery: '',
  searchResults: [] as GeoLocation[],
  selectedLocation: null as GeoLocation | null,
  drawnBbox: null,

  detectionType: 'flood' as DetectionType,
  dateRange: DEFAULT_DATE_RANGE,
  dataset: null as SarDataset | null,
  isUploading: false,
  uploadProgress: 0,

  events: [] as DetectedEvent[],
  eventFilter: DEFAULT_EVENT_FILTER,
  selectedEventId: null as string | null,
  hoveredEventId: null as string | null,

  activeStage: 'dsard' as AnalysisStage,
  jobId: null as string | null,
  job: null as AnalysisJob | null,
  extractions: [] as ExtractionCategory[],
  widgets: [] as AnalysisWidget[],
  resultDataset: null as ResultDataset | null,
  chartType: 'pie' as ChartType,

  isSidebarOpen: true,
  openPanels: { layers: true, control: true, events: true } as Record<PanelId, boolean>,
  isComparisonActive: false,
  overlay: { visible: false, message: '' } as OverlayState,
};

/**
 * Single source of truth for mission state.
 *
 * Deliberately NOT React-Query for these fields: they are client/UI state that
 * survives navigation and does not belong to the server cache. Anything that
 * comes *from* the backend lives in React Query (`hooks/use*.ts`).
 */
export const useAppStore = create<AppState>()((set) => ({
  ...INITIAL,

  /* ---- globe ---- */
  setActiveLayer: (layer) => set({ activeLayer: layer }),
  toggleAutoRotate: () => set((state) => ({ autoRotate: !state.autoRotate })),
  setAutoRotate: (enabled) => set({ autoRotate: enabled }),
  setShowEvents: (show) => set({ showEvents: show }),

  /* ---- appearance ---- */
  // Applying the theme is part of the action, not an effect in a component: the
  // DOM class and the stored value must never disagree, and this is the only
  // place either can change.
  setTheme: (theme) => {
    applyThemeToDocument(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark';
      applyThemeToDocument(next);
      return { theme: next };
    }),
  setGlobeReady: (ready) =>
    set((state) => ({ globeReady: ready, globeError: ready ? null : state.globeError })),
  setGlobeError: (message) => set({ globeError: message }),

  /* ---- search & selection ---- */
  hydrateFromStorage: () => {
    try {
      if (typeof window === 'undefined') return;
      const loc = window.localStorage.getItem('em.selectedLocation');
      const bbox = window.localStorage.getItem('em.drawnBbox');
      const patch: { selectedLocation?: GeoLocation | null; drawnBbox?: BoundingBox | null } = {};
      if (loc) patch.selectedLocation = JSON.parse(loc);
      if (bbox) patch.drawnBbox = JSON.parse(bbox);
      if (Object.keys(patch).length > 0) set(patch);
    } catch {
      /* corrupted — ignore */
    }
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDrawnBbox: (bbox) => {
    try {
      if (typeof window !== 'undefined') {
        if (bbox) window.localStorage.setItem('em.drawnBbox', JSON.stringify(bbox));
        else window.localStorage.removeItem('em.drawnBbox');
      }
    } catch {
      /* quota / SSR - ignore */
    }
    set({ drawnBbox: bbox });
  },
  setSearchResults: (results) => set({ searchResults: results }),
  selectLocation: (location) => {
    // eslint-disable-next-line no-console
    console.trace('[selectLocation] called with', location?.id, location?.bbox);
    try {
      if (typeof window !== 'undefined') {
        if (location) window.localStorage.setItem('em.selectedLocation', JSON.stringify(location));
        else window.localStorage.removeItem('em.selectedLocation');
      }
    } catch {
      /* quota / SSR - ignore */
    }
    set((state) => ({
      selectedLocation: location,
      // Selecting a location also clears the event focus so the camera is unambiguous.
      selectedEventId: null,
      eventFilter: location ? { ...state.eventFilter, query: '' } : state.eventFilter,
    }));
  },

  /* ---- control ---- */
  setDetectionType: (type) => set({ detectionType: type }),
  setDateRange: (patch) => set((state) => ({ dateRange: { ...state.dateRange, ...patch } })),
  setDataset: (dataset) => set({ dataset }),
  setUploading: (uploading) => set({ isUploading: uploading }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),

  /* ---- events ---- */
  setEvents: (events) => set({ events }),
  setEventFilter: (patch) => set((state) => ({ eventFilter: { ...state.eventFilter, ...patch } })),
  toggleDetectionFilter: (type) =>
    set((state) => {
      const current = state.eventFilter.detectionTypes;
      const next = current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type];
      return { eventFilter: { ...state.eventFilter, detectionTypes: next } };
    }),
  toggleSeverityFilter: (severity) =>
    set((state) => {
      const current = state.eventFilter.severities;
      const next = current.includes(severity)
        ? current.filter((item) => item !== severity)
        : [...current, severity];
      return { eventFilter: { ...state.eventFilter, severities: next } };
    }),
  resetEventFilter: () => set({ eventFilter: DEFAULT_EVENT_FILTER }),
  selectEvent: (id) => set({ selectedEventId: id }),
  hoverEvent: (id) => set({ hoveredEventId: id }),

  /* ---- analysis ---- */
  setActiveStage: (stage) => set({ activeStage: stage }),
  startAnalysis: (job) => set({ job, jobId: job.id, activeStage: job.stage }),
  setJob: (job) =>
    set((state) => ({
      job,
      jobId: job?.id ?? state.jobId,
      activeStage: job?.stage ?? state.activeStage,
    })),
  setExtractions: (categories) => set({ extractions: categories }),
  setWidgets: (widgets) => set({ widgets }),
  setResultDataset: (dataset) => set({ resultDataset: dataset }),
  setChartType: (chart) => set({ chartType: chart }),
  resetAnalysis: () =>
    set({
      jobId: null,
      job: null,
      extractions: [],
      widgets: [],
      resultDataset: null,
      activeStage: 'dsard',
    }),

  /* ---- ui ---- */
  toggleSidebar: (open) => set((state) => ({ isSidebarOpen: open ?? !state.isSidebarOpen })),
  togglePanel: (panel, open) =>
    set((state) => ({
      openPanels: {
        ...state.openPanels,
        [panel]: open ?? !state.openPanels[panel],
      },
    })),
  setComparisonActive: (active) => set({ isComparisonActive: active }),
  showOverlay: (overlay) => set({ overlay: { ...overlay, visible: true } }),
  hideOverlay: () => set((state) => ({ overlay: { ...state.overlay, visible: false } })),
  resetAll: () => {
    // Re-apply the theme as well, or the store and `<html class>` would drift.
    applyThemeToDocument(INITIAL.theme);
    set({ ...INITIAL });
  },
}));

// Synchronously adopt localStorage state before React mounts.
adoptPersistedState();


/* -------------------------------------------------------------------------- */
/* Pure selectors                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Client-side mirror of the server filter.
 *
 * The backend remains authoritative, but this is applied on top of the response
 * so the list stays correct even against a backend that ignores a filter param 
 * and it keeps typing in the EVENTS search box instant while a refetch is in
 * flight.
 */
export function applyEventFilter(
  events: DetectedEvent[],
  eventFilter: EventFilter,
): DetectedEvent[] {
  const needle = eventFilter.query.trim().toLowerCase();

  return events.filter((event) => {
    if (
      eventFilter.detectionTypes.length > 0 &&
      !eventFilter.detectionTypes.includes(event.detectionType)
    ) {
      return false;
    }
    if (eventFilter.severities.length > 0 && !eventFilter.severities.includes(event.severity)) {
      return false;
    }
    if (event.confidence < eventFilter.minConfidence) return false;
    if (needle) {
      const haystack = `${event.id} ${event.location.name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function selectVisibleEvents(state: AppState): DetectedEvent[] {
  return applyEventFilter(state.events, state.eventFilter);
}

export function selectSelectedEvent(state: AppState): DetectedEvent | null {
  if (!state.selectedEventId) return null;
  return state.events.find((event) => event.id === state.selectedEventId) ?? null;
}

export function selectIsAnalyzing(state: AppState): boolean {
  if (!state.job) return false;
  return state.job.progress < 100;
}