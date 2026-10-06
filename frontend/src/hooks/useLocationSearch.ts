'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchLocations } from '@/services';
import { useAppStore } from '@/store/appStore';
import { formatCoordinate, parseCoordinates } from '@/lib/utils';
import type { GeoLocation } from '@/types';
import { useDebouncedValue } from './useDebouncedValue';

export interface UseLocationSearchResult {
  /** Ranked results including a synthesised entry for raw coordinates. */
  results: GeoLocation[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  /** True when the current query was interpreted as `lat, lng`. */
  isCoordinateQuery: boolean;
  refetch: () => void;
}

/**
 * Location search.
 *
 * Two input grammars are supported in one box:
 *   - free text  -> GET /api/search-location?q=...
 *   - "23.81, 90.41" / "23.81N 90.41E" -> resolved locally, no round trip
 *
 * The local coordinate shortcut matters operationally: analysts paste
 * coordinates far more often than they type place names.
 */
export function useLocationSearch(rawQuery: string): UseLocationSearchResult {
  const debounced = useDebouncedValue(rawQuery, 300);
  const setSearchResults = useAppStore((state) => state.setSearchResults);

  const coordinates = useMemo(() => parseCoordinates(debounced), [debounced]);
  const trimmed = debounced.trim();

  const query = useQuery({
    queryKey: ['location-search', trimmed.toLowerCase()],
    queryFn: () => searchLocations({ q: trimmed, limit: 8 }),
    enabled: trimmed.length >= 2 || Boolean(coordinates),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const results = useMemo<GeoLocation[]>(() => {
    const remote = query.data?.data ?? [];

    if (!coordinates) return remote;

    const coordinatesEntry: GeoLocation = {
      id: `coord-${coordinates.lat.toFixed(5)}-${coordinates.lng.toFixed(5)}`,
      name: formatCoordinate(coordinates),
      lat: coordinates.lat,
      lng: coordinates.lng,
      altitude: 140_000,
      source: 'manual',
    };

    // Never duplicate an equivalent remote hit.
    const deduped = remote.filter(
      (item) =>
        Math.abs(item.lat - coordinates.lat) > 0.001 ||
        Math.abs(item.lng - coordinates.lng) > 0.001,
    );

    return [coordinatesEntry, ...deduped];
  }, [query.data, coordinates]);

  // Mirror into the store so the control panel can render the result list
  // without prop-drilling through the sidebar.
  useEffect(() => {
    setSearchResults(results);
  }, [results, setSearchResults]);

  return {
    results,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    isCoordinateQuery: Boolean(coordinates),
    refetch: () => {
      void query.refetch();
    },
  };
}
