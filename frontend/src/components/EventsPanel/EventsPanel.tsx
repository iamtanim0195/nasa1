'use client';

import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { DETECTION_TYPES, SEVERITIES } from '@/lib/constants';
import { cn, formatArea, formatPercent, truncate } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useEvents } from '@/hooks/useEvents';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/StateViews';
import type { DetectedEvent, Severity } from '@/types';
import { EventCard } from './EventCard';

export interface EventsPanelProps {
  className?: string;
  /** Fires when an event is picked — used to focus the globe. */
  onEventSelect?: (event: DetectedEvent) => void;
  onEventHover?: (eventId: string | null) => void;
}

/**
 * EVENTS.
 *
 * The list, the globe markers and the analysis share one array from the store,
 * so hovering a card lights the corresponding footprint on the globe and vice
 * versa.
 */
export function EventsPanel({ className, onEventSelect, onEventHover }: EventsPanelProps) {
  const { filtered, stats, selected, isLoading, isFetching, isError, error, refetch, selectEvent } =
    useEvents();

  const filter = useAppStore((state) => state.eventFilter);
  const setEventFilter = useAppStore((state) => state.setEventFilter);
  const toggleDetectionFilter = useAppStore((state) => state.toggleDetectionFilter);
  const toggleSeverityFilter = useAppStore((state) => state.toggleSeverityFilter);
  const resetEventFilter = useAppStore((state) => state.resetEventFilter);
  const hoverEvent = useAppStore((state) => state.hoverEvent);
  const hoveredEventId = useAppStore((state) => state.hoveredEventId);

  const hasFilters =
    filter.detectionTypes.length > 0 ||
    filter.severities.length > 0 ||
    filter.minConfidence > 0 ||
    filter.query.trim().length > 0;

  const handleSelect = (event: DetectedEvent) => {
    selectEvent(event.id);
    onEventSelect?.(event);
  };

  const handleHover = (eventId: string | null) => {
    hoverEvent(eventId);
    onEventHover?.(eventId);
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* ---- Summary ---- */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-hairline/8 bg-elevate/4 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-ink-faint">Detections</p>
          <p className="telemetry text-sm font-semibold text-ink">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-hairline/8 bg-elevate/4 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-ink-faint">Critical</p>
          <p className="telemetry text-sm font-semibold text-signal-critical">
            {stats.bySeverity.critical}
          </p>
        </div>
        <div className="rounded-lg border border-hairline/8 bg-elevate/4 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-ink-faint">Area</p>
          <p className="telemetry text-sm font-semibold text-signal-medium">
            {formatArea(stats.totalAreaKm2)}
          </p>
        </div>
      </div>

      {/* ---- Filters ---- */}
      <div className="mt-2.5 space-y-2">
        {/* Free-text */}
        <div className="flex h-9 items-center gap-2 rounded-lg border border-hairline/12 bg-sunken px-2.5 transition-colors focus-within:border-accent/50">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={filter.query}
            onChange={(event) => setEventFilter({ query: event.target.value })}
            placeholder="Filter by ID or location…"
            aria-label="Filter events"
            className="h-full min-w-0 flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {filter.query && (
            <button
              type="button"
              onClick={() => setEventFilter({ query: '' })}
              aria-label="Clear filter"
              className="rounded p-0.5 text-ink-faint hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Detection type chips */}
        <div className="flex flex-wrap gap-1">
          {DETECTION_TYPES.map((type) => {
            const active = filter.detectionTypes.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => toggleDetectionFilter(type.id)}
                aria-pressed={active}
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium transition-colors',
                  active
                    ? 'border-accent/50 bg-accent/12 text-accent'
                    : 'border-hairline/10 bg-elevate/4 text-ink-faint hover:border-accent/25 hover:text-ink-muted',
                )}
              >
                {type.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Severity chips + confidence */}
        <div className="flex items-center gap-1.5">
          {SEVERITIES.map((severity) => {
            const active = filter.severities.includes(severity.id as Severity);
            return (
              <button
                key={severity.id}
                type="button"
                onClick={() => toggleSeverityFilter(severity.id)}
                aria-pressed={active}
                title={`${severity.label} severity`}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-md border px-1 py-1 text-[9.5px] transition-colors',
                  active
                    ? severity.badge
                    : 'border-hairline/10 bg-elevate/4 text-ink-faint hover:text-ink-muted',
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: severity.hex }}
                  aria-hidden
                />
                {severity.label}
              </button>
            );
          })}
        </div>

        {/* Confidence threshold */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-ink-faint">
              Min confidence
            </span>
            <span className="telemetry text-[9.5px] text-accent">
              {formatPercent(filter.minConfidence)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={filter.minConfidence}
            onChange={(event) => setEventFilter({ minConfidence: Number(event.target.value) })}
            aria-label="Minimum confidence"
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-elevate/10 accent-accent"
          />
        </div>

        {/* Filter toolbar */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[9.5px] text-ink-faint">
            <SlidersHorizontal className="h-2.5 w-2.5" />
            {isFetching ? 'Querying…' : `${filtered.length} shown`}
          </span>

          <div className="flex items-center gap-1">
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={resetEventFilter} className="h-6 px-1.5">
                Reset
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={refetch}
              aria-label="Refresh events"
              className="h-6 w-6 p-0"
              icon={<RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />}
            />
          </div>
        </div>
      </div>

      {/* ---- List ---- */}
      <div className="mt-2.5 min-h-0 flex-1">
        {isError ? (
          <ErrorState compact error={error} title="Could not load detections" onRetry={refetch} />
        ) : isLoading ? (
          <SkeletonRows rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            title={hasFilters ? 'No events match the filters' : 'No detections yet'}
            description={
              hasFilters
                ? 'Loosen a filter or clear the search to see more detections.'
                : 'Run an analysis to populate this feed from the backend.'
            }
            action={
              hasFilters ? (
                <Button size="sm" variant="outline" onClick={resetEventFilter}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1 scrollbar-mission lg:max-h-[30rem]">
            {filtered.map((event) => (
              <li key={event.id}>
                <EventCard
                  event={event}
                  selected={selected?.id === event.id}
                  hovered={hoveredEventId === event.id}
                  onSelect={handleSelect}
                  onHover={handleHover}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Footer stats ---- */}
      {stats.byDetectionType.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-hairline/8 pt-2">
          {stats.byDetectionType.slice(0, 4).map((entry) => (
            <Badge key={entry.type} tone="neutral">
              {truncate(entry.type, 14)} · {entry.count}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
