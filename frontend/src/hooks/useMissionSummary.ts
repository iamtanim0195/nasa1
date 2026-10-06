'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMissionSummary } from '@/services';
import type { MissionSummary } from '@/types';

/**
 * Mission telemetry for the top status bar.
 * Refreshes every 60 s — this is a KPI strip, not a live socket.
 */
export function useMissionSummary() {
  const query = useQuery({
    queryKey: ['mission', 'summary'],
    queryFn: () => fetchMissionSummary(),
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: 2,
  });

  return {
    summary: (query.data?.data ?? null) as MissionSummary | null,
    meta: query.data?.meta ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
