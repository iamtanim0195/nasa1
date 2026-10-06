'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEvents } from '@/services';
import { applyEventFilter, selectSelectedEvent, useAppStore } from '@/store/appStore';
import { SEVERITY_MAP } from '@/lib/constants';
import type { DetectedEvent, DetectionType, Severity } from '@/types';

export interface EventStats {
  total: number;
  bySeverity: Record<Severity, number>;
  byDetectionType: Array<{ type: DetectionType; count: number }>;
  totalAreaKm2: number;
  meanConfidence: number;
}

export interface UseEventsResult {
  events: DetectedEvent[];
  filtered: DetectedEvent[];
  stats: EventStats;
  selected: DetectedEvent | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  selectEvent: (id: string | null) => void;
  hoverEvent: (id: string | null) => void;
}

function computeStats(events: DetectedEvent[]): EventStats {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  const typeCounts = new Map<DetectionType, number>();

  let area = 0;
  let confidence = 0;

  events.forEach((event) => {
    bySeverity[event.severity] += 1;
    typeCounts.set(event.detectionType, (typeCounts.get(event.detectionType) ?? 0) + 1);
    area += event.areaKm2;
    confidence += event.confidence;
  });

  const byDetectionType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: events.length,
    bySeverity,
    byDetectionType,
    totalAreaKm2: Number(area.toFixed(1)),
    meanConfidence: events.length ? Number((confidence / events.length).toFixed(3)) : 0,
  };
}

/**
 * Event feed.
 *
 * The server response is mirrored into `appStore.events` so that the globe
 * (imperative, outside React) and the event list render from one array.
 */
export function useEvents(): UseEventsResult {
  const filter = useAppStore((state) => state.eventFilter);
  const setEvents = useAppStore((state) => state.setEvents);
  const storeEvents = useAppStore((state) => state.events);
  const selected = useAppStore(selectSelectedEvent);
  const selectEvent = useAppStore((state) => state.selectEvent);
  const hoverEvent = useAppStore((state) => state.hoverEvent);

  const query = useQuery({
    queryKey: [
      'events',
      filter.detectionTypes.join(','),
      filter.severities.join(','),
      filter.minConfidence,
      filter.query.trim().toLowerCase(),
    ],
    queryFn: () =>
      fetchEvents({
        detectionTypes: filter.detectionTypes.length ? filter.detectionTypes : undefined,
        severities: filter.severities.length ? filter.severities : undefined,
        minConfidence: filter.minConfidence || undefined,
        // The free-text filter is a real server parameter, not just a query key.
        query: filter.query.trim() || undefined,
        pageSize: 100,
      }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data) setEvents(query.data.data.items);
  }, [query.data, setEvents]);

  const filtered = useMemo(() => applyEventFilter(storeEvents, filter), [storeEvents, filter]);
  const stats = useMemo(() => computeStats(filtered), [filtered]);

  return {
    events: storeEvents,
    filtered,
    stats,
    selected,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    selectEvent,
    hoverEvent,
  };
}

/** Severity ordering helper used by the list and the legend. */
export function severityRank(severity: Severity): number {
  return ['critical', 'high', 'medium', 'low'].indexOf(severity);
}

export function severityHex(severity: Severity): string {
  return SEVERITY_MAP[severity].hex;
}
