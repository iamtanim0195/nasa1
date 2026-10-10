'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Crosshair, Play, Target } from 'lucide-react';
import { AOI_PRESETS, DETECTION_TYPES, DETECTION_TYPE_MAP } from '@/lib/constants';
import { cn, formatCoordinate } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useNisarSearch } from '@/hooks/useNisarSearch';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/ui/Icon';
import { PanelDivider } from '@/components/ui/GlassPanel';
import { SearchBar } from '@/components/SearchBar';
import type { DateRange, DetectionType, GeoLocation } from '@/types';
import { DateField } from './DateField';
import { NisarFileBrowser } from './NisarFileBrowser';

export interface ControlPanelProps {
  className?: string;
  onLocationChange?: (location: GeoLocation) => void;
  onDetectionTypeSelect?: (type: DetectionType) => void;
  onDateRangeChange?: (range: DateRange) => void;
  onRunAnalysis?: () => void;
}

export function ControlPanel({
  className,
  onLocationChange,
  onDetectionTypeSelect,
  onDateRangeChange,
  onRunAnalysis,
}: ControlPanelProps) {
  /* ---- store ---- */
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const detectionType = useAppStore((state) => state.detectionType);
  const dateRange = useAppStore((state) => state.dateRange);
  const setDetectionType = useAppStore((state) => state.setDetectionType);
  const setDateRange = useAppStore((state) => state.setDateRange);
  const selectLocation = useAppStore((state) => state.selectLocation);
  const drawnBbox = useAppStore((state) => state.drawnBbox);
  const setDrawnBbox = useAppStore((state) => state.setDrawnBbox);

  /* ---- nisar search ---- */
  const {
    files,
    isSearching,
    search,
    clearSearch,
    analyze,
    isAnalyzing,
  } = useNisarSearch();

  /* ---- drawn AOI ---- */
  const handleUseDrawnArea = useCallback(() => {
    if (!drawnBbox) return;
    const [w, s, e, n] = drawnBbox;
    const widthKm = ((e - w) * 111).toFixed(1);
    const heightKm = ((n - s) * 111).toFixed(1);
    const center: GeoLocation = {
      id: `custom-${Date.now()}`,
      name: `Custom AOI (${widthKm}×${heightKm} km)`,
      lat: (s + n) / 2,
      lng: (w + e) / 2,
      bbox: drawnBbox,
      source: 'manual',
      detectionType,
    };
    selectLocation(center);
    onLocationChange?.(center);
  }, [drawnBbox, detectionType, selectLocation, onLocationChange]);

  /* ---- validation ---- */
  const dateError = useMemo(() => {
    const { before, after } = dateRange;
    if (!before || !after) return null;
    if (new Date(before) >= new Date(after)) {
      return 'The "After" date must be later than the "Before" date.';
    }
    return null;
  }, [dateRange]);

  const canSearch =
    Boolean(selectedLocation) &&
    Boolean(dateRange.before) &&
    Boolean(dateRange.after) &&
    !dateError;

  const detection = DETECTION_TYPE_MAP[detectionType];

  /* ---- handlers ---- */
  const handleDetectionChange = (value: DetectionType) => {
    setDetectionType(value);
    onDetectionTypeSelect?.(value);
  };

  const handleDateChange = (patch: Partial<DateRange>) => {
    setDateRange(patch);
    onDateRangeChange?.({ ...dateRange, ...patch });
  };

  const handleSearch = () => {
    if (!selectedLocation || !dateRange.before || !dateRange.after) return;

    const bbox = selectedLocation.bbox ?? [
      selectedLocation.lng - 0.1,
      selectedLocation.lat - 0.1,
      selectedLocation.lng + 0.1,
      selectedLocation.lat + 0.1,
    ];
    const [w, s, e, n] = bbox;
    const wkt = `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;

    search({
      wkt,
      beforeDate: dateRange.before,
      afterDate: dateRange.after,
      detectionType,
    });
  };

  const handleAnalyze = (beforeFileId: string, afterFileId: string) => {
    if (!selectedLocation) return;

    const bbox = selectedLocation.bbox ?? [
      selectedLocation.lng - 0.1,
      selectedLocation.lat - 0.1,
      selectedLocation.lng + 0.1,
      selectedLocation.lat + 0.1,
    ];
    const [w, s, e, n] = bbox;
    const wkt = `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;

    analyze({ wkt, beforeFileId, afterFileId });

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.location.href = '/analyze?stage=dsard';
      }, 800);
    }

    onRunAnalysis?.();
  };

  /* ---- auto-select preset on detection change ---- */
  useEffect(() => {
    if (!detectionType) return;

    // Only auto-seed a preset when the user has not made a choice yet.
    // A user-selected location (preset, search or custom draw) must never be
    // silently overwritten by a mode switch.
    if (selectedLocation) return;
    // Skip when a custom drawn rectangle is persisted: drawing is an
    // explicit user choice even before the location object hydrates.
    if (drawnBbox) return;

    // Also consult localStorage directly: on first paint React can run this
    // effect before the store hydrate, and seeding a preset here would
    // overwrite a persisted custom AOI that is about to be restored.
    if (typeof window !== 'undefined') {
      if (
        window.localStorage.getItem('em.selectedLocation') ||
        window.localStorage.getItem('em.drawnBbox')
      ) {
        return;
      }
    }

    const firstPreset = AOI_PRESETS.find((p) => p.detectionType === detectionType);
    if (firstPreset) {
      selectLocation(firstPreset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionType, drawnBbox, selectedLocation]);

  return (
    <div className={cn('space-y-3.5', className)}>
      {/* Drawn custom area — shows when user has completed a rectangle draw */}
      {drawnBbox && (
        <div className="rounded-xl border border-accent/40 bg-accent/8 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              📐 Custom Area
            </span>
            <button
              type="button"
              onClick={() => setDrawnBbox(null)}
              className="text-[10px] text-ink-faint transition-colors hover:text-signal-critical"
            >
              clear
            </button>
          </div>
          <div className="telemetry grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <span className="text-ink-muted">W: <span className="text-ink">{drawnBbox[0].toFixed(4)}°</span></span>
            <span className="text-ink-muted">E: <span className="text-ink">{drawnBbox[2].toFixed(4)}°</span></span>
            <span className="text-ink-muted">S: <span className="text-ink">{drawnBbox[1].toFixed(4)}°</span></span>
            <span className="text-ink-muted">N: <span className="text-ink">{drawnBbox[3].toFixed(4)}°</span></span>
          </div>
          <Button
            variant="outline"
            size="sm"
            fullWidth
            icon={<Target className="h-3 w-3" />}
            onClick={handleUseDrawnArea}
          >
            Use this area
          </Button>
        </div>
      )}
      {/* ---- Preset Location Dropdown ---- */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
          Preset Location
        </label>
        <select
          value={selectedLocation?.id ?? ''}
          onChange={(e) => {
            const loc = AOI_PRESETS.find((p) => p.id === e.target.value);
            if (loc) {
              selectLocation(loc);
              onLocationChange?.(loc);
            }
          }}
          className="w-full rounded-xl border border-hairline/12 bg-sunken px-3 py-2 text-sm text-ink outline-none transition-colors hover:border-accent/30 focus:border-accent/55"
        >
          <option value="">Select a location...</option>
          {AOI_PRESETS
            .filter((p) => p.detectionType === detectionType)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.region})
              </option>
            ))}
        </select>
      </div>

      <PanelDivider />

      {/* ---- Free-text Location Search ---- */}
      <div>
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
          Location Input
        </span>

        <SearchBar
          placeholder="Any country, city, region or lat, lng..."
          showHelper={false}
          showSelectedSummary={false}
          onLocationSelect={onLocationChange}
        />

        {selectedLocation ? (
          <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-accent/25 bg-accent/6 p-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/35 bg-accent/12 text-accent">
              <Target className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-semibold text-ink">
                {selectedLocation.name}
              </p>
              <p className="telemetry truncate text-[10px] text-ink-faint">
                {formatCoordinate(selectedLocation)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => selectLocation(null)}
              className="shrink-0 text-[10px] text-ink-faint transition-colors hover:text-signal-critical"
            >
              clear
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-hairline/14 bg-elevate/3 p-2.5">
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <p className="text-[10.5px] text-ink-muted">
              Type any country, region, city - or paste coordinates.
            </p>
          </div>
        )}
      </div>

      <PanelDivider />

      {/* ---- Detection Mode ---- */}
      <div>
        <Select<DetectionType>
          label="Detection Mode"
          value={detectionType}
          onChange={handleDetectionChange}
          options={DETECTION_TYPES.map((type) => ({ value: type.id, label: type.label }))}
        />

        <div className="mt-2 flex items-start gap-2 rounded-lg border border-hairline/8 bg-elevate/3 px-2.5 py-2">
          <Icon name={detection.icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] leading-relaxed text-ink-muted">{detection.description}</p>
            <p className="mt-1 flex flex-wrap gap-1">
              {detection.extracts.map((item) => (
                <span
                  key={item}
                  className="rounded border border-hairline/10 bg-elevate/5 px-1.5 py-0.5 text-[9px] text-ink-faint"
                >
                  {item}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      <PanelDivider />

      {/* ---- Observation Window ---- */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            Observation Window
          </span>
          {dateRange.before && dateRange.after && !dateError && (
            <span className="telemetry text-[9px] text-ink-faint">
              {Math.max(
                0,
                Math.round(
                  (Date.parse(dateRange.after) - Date.parse(dateRange.before)) / 86_400_000,
                ),
              )}{' '}
              days
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          <DateField
            label="Before Detection Date"
            value={dateRange.before}
            max={dateRange.after ?? undefined}
            onChange={(value) => handleDateChange({ before: value })}
          />

          <DateField
            label="After Detection Date"
            value={dateRange.after}
            min={dateRange.before ?? undefined}
            error={dateError}
            onChange={(value) => handleDateChange({ after: value })}
          />
        </div>
      </div>

      <PanelDivider label="NISAR Data" />

      {/* ---- Search Button ---- */}
      {files.length === 0 && !isSearching && (
        <Button
          variant="outline"
          size="md"
          fullWidth
          icon={<Play className="h-4 w-4" />}
          onClick={handleSearch}
          disabled={!canSearch}
        >
          Search NISAR Files
        </Button>
      )}

      {/* ---- NISAR File Browser ---- */}
      <NisarFileBrowser
        files={files}
        isSearching={isSearching}
        onAnalyze={handleAnalyze}
        onClear={clearSearch}
      />

      {/* ---- Status Hint ---- */}
      {!canSearch && files.length === 0 && (
        <p className="text-center text-[10px] text-ink-faint">
          {!selectedLocation
            ? 'Select a location to continue.'
            : dateError
              ? 'Fix the observation window.'
              : 'Set both dates to continue.'}
        </p>
      )}

      {isAnalyzing && (
        <p className="flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/8 px-2 py-1.5 text-[10px] text-accent">
          <Icon name="ScanLine" className="h-3 w-3" />
          Analysis is running on the backend...
        </p>
      )}
    </div>
  );
}
