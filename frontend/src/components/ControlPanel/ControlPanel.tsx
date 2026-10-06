'use client';

import { useMemo } from 'react';
import { Crosshair, Radar, Target } from 'lucide-react';
import { DETECTION_TYPES, DETECTION_TYPE_MAP } from '@/lib/constants';
import { cn, formatCoordinate } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useSarData } from '@/hooks/useSarData';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/components/ui/Icon';
import { PanelDivider } from '@/components/ui/GlassPanel';
import { SearchBar } from '@/components/SearchBar';
import type { DateRange, DetectionType, GeoLocation } from '@/types';
import { DateField } from './DateField';
import { SarDropzone } from './SarDropzone';

export interface ControlPanelProps {
  className?: string;
  /** Fires when the operator changes the manual location selection. */
  onLocationChange?: (location: GeoLocation) => void;
  /** API-ready: detection type changed. */
  onDetectionTypeSelect?: (type: DetectionType) => void;
  /** API-ready: observation window changed. */
  onDateRangeChange?: (range: DateRange) => void;
  /** API-ready: a SAR file was accepted for ingest. */
  onSarDataUpload?: (file: File) => void;
  /** API-ready: dispatch the analysis job. */
  onRunAnalysis?: () => void;
}

/**
 * CONTROL PANEL.
 *
 * Owns the four inputs that define a job: where, what, when, and with which
 * dataset. It never calls the API directly — every action is emitted through a
 * callback *and* reflected into the store, so the panel can be dropped into a
 * different shell (or driven by a test) without rewriting it.
 */
export function ControlPanel({
  className,
  onLocationChange,
  onDetectionTypeSelect,
  onDateRangeChange,
  onSarDataUpload,
  onRunAnalysis,
}: ControlPanelProps) {
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const detectionType = useAppStore((state) => state.detectionType);
  const dateRange = useAppStore((state) => state.dateRange);
  const setDetectionType = useAppStore((state) => state.setDetectionType);
  const setDateRange = useAppStore((state) => state.setDateRange);
  const selectLocation = useAppStore((state) => state.selectLocation);

  const { dataset, isUploading, uploadProgress, upload, reset } = useSarData();

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */

  const dateError = useMemo(() => {
    const { before, after } = dateRange;
    if (!before || !after) return null;
    if (new Date(before) >= new Date(after)) {
      return 'The “After” date must be later than the “Before” date.';
    }
    return null;
  }, [dateRange]);

  const canRun =
    Boolean(selectedLocation) &&
    Boolean(dateRange.before) &&
    Boolean(dateRange.after) &&
    !dateError;

  const detection = DETECTION_TYPE_MAP[detectionType];

  /* ------------------------------------------------------------------ */
  /* Handlers                                                            */
  /* ------------------------------------------------------------------ */

  const handleDetectionChange = (value: DetectionType) => {
    setDetectionType(value);
    onDetectionTypeSelect?.(value);
  };

  const handleDateChange = (patch: Partial<DateRange>) => {
    setDateRange(patch);
    onDateRangeChange?.({ ...dateRange, ...patch });
  };

  const handleFile = (file: File) => {
    upload(file);
    onSarDataUpload?.(file);
  };

  return (
    <div className={cn('space-y-3.5', className)}>
      {/* ---------------- Location ---------------- */}
      <div>
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
          Location Input
        </span>

        {/*
          Free text only — any country, region, city or coordinate pair. There is
          deliberately no fixed list of areas here: an operator monitoring an
          arbitrary country should not be limited to someone else's shortlist.
          The search box is the same component the rail uses, so the grammars are
          identical in both places.
        */}
        <SearchBar
          placeholder="Any country, city, region or lat, lng…"
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
              Type any country, region, city — or paste coordinates.
            </p>
          </div>
        )}
      </div>

      <PanelDivider />

      {/* ---------------- Detection mode ---------------- */}
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

      {/* ---------------- Dates ---------------- */}
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

      <PanelDivider label="Ingest" />

      {/* ---------------- SAR data ---------------- */}
      <SarDropzone
        dataset={dataset}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onFileAccepted={handleFile}
        onClear={reset}
      />

      {/* ---------------- Actions ---------------- */}
      <div className="space-y-2 pt-0.5">
        <Button
          variant="accent"
          size="md"
          fullWidth
          icon={<Radar className="h-4 w-4" />}
          onClick={onRunAnalysis}
          disabled={!canRun}
        >
          Run Analysis
        </Button>

        {!canRun && (
          <p className="text-center text-[10px] text-ink-faint">
            {!selectedLocation
              ? 'Select a location to continue.'
              : dateError
                ? 'Fix the observation window.'
                : 'Set both dates to continue.'}
          </p>
        )}
      </div>

      {/* Dataset readiness hint for the backend team / demo operator. */}
      {dataset && dataset.status !== 'ready' && (
        <p className="flex items-center gap-1.5 rounded-lg border border-signal-medium/25 bg-signal-medium/8 px-2 py-1.5 text-[10px] text-signal-medium">
          <Icon name="ScanLine" className="h-3 w-3" />
          Dataset is still ingesting — analysis can be queued and will wait server-side.
        </p>
      )}
    </div>
  );
}
