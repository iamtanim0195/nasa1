'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  ApiError,
  searchNisarFiles,
  analyzeNisar,
  fetchNisarJobStatus,
  type NisarFile,
  type SearchNisarRequest,
  type AnalyzeNisarRequest,
  type NisarJobStatus,
} from '@/services';
import { useAppStore } from '@/store/appStore';
import type { AnalysisJob, AnalysisStep, DetectionType } from '@/types';

/**
 * Build a job record the /analyze page can render.
 *
 * `POST /api/analyze-nisar` returns only `{ jobId, status, detectionType }`, but
 * the store and the localStorage restore both expect a full AnalysisJob — and
 * `isRestorableJob` rejects anything without a `steps` array. This seeds the
 * four D-SAR-D steps so the redirect target renders immediately; live progress
 * then comes from the polled job status.
 */
function buildNisarJob(jobId: string, detectionType?: string): AnalysisJob {
  const steps: AnalysisStep[] = [
    { id: 'ingest', label: 'Ingest', status: 'running' },
    { id: 'calibrate', label: 'Calibrate', status: 'pending' },
    { id: 'coregister', label: 'Coregister', status: 'pending' },
    { id: 'threshold', label: 'Threshold', status: 'pending' },
  ];

  return {
    id: jobId,
    detectionType: (detectionType ?? 'flood') as DetectionType,
    locationName: 'NISAR granule AOI',
    stage: 'dsard',
    progress: 0,
    startedAt: new Date().toISOString(),
    etaSeconds: 30,
    message: 'Dispatching to the NISAR pipeline',
    steps,
  };
}
import { toast } from '@/store/toastStore';

export interface UseNisarSearchResult {
  files: NisarFile[];
  isSearching: boolean;
  searchError: ApiError | null;
  search: (params: SearchNisarRequest) => void;
  clearSearch: () => void;

  jobId: string | null;
  jobStatus: NisarJobStatus | null;
  isAnalyzing: boolean;
  analyze: (params: Omit<AnalyzeNisarRequest, 'detectionType'>) => void;
  resetAnalysis: () => void;

  getBestPair: () => { before: NisarFile; after: NisarFile } | null;
  getSmallFiles: () => NisarFile[];
}

export function useNisarSearch(): UseNisarSearchResult {
  const [files, setFiles] = useState<NisarFile[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const startAnalysis = useAppStore((state) => state.startAnalysis);

  const searchMutation = useMutation({
    mutationFn: (params: SearchNisarRequest) => searchNisarFiles(params),
    onSuccess: (envelope) => {
      setFiles(envelope.data.files);
      toast.success(
        'NISAR search complete',
        `Found ${envelope.data.total} file(s) in the observation window.`,
      );
    },
    onError: (error) => {
      const apiError = ApiError.from(error);
      toast.error('NISAR search failed', apiError.message);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (params: AnalyzeNisarRequest) => analyzeNisar(params),
    onSuccess: (envelope) => {
      const jobId = envelope.data.jobId;
      setJobId(jobId);

      // Publish the job to the app store and localStorage BEFORE the Control
      // Panel navigates to /analyze. That page reads its job from the store, and
      // this hook's local state does not survive the route change - so without
      // this the redirect lands on "No D-SAR-D run in this session" even though
      // the analysis is running. The backend serves this id from the pipeline
      // store via the fall-through in GET /api/analyze/{jobId}.
      const job = buildNisarJob(jobId, envelope.data.detectionType);
      startAnalysis(job);
      if (typeof window !== 'undefined') {
        localStorage.setItem('activeJobId', jobId);
        localStorage.setItem('activeJobData', JSON.stringify(job));
        // Persist the AOI this job belongs to so a page reload restores
        // both the job AND the correct location (never a fallback preset).
        try {
          const state = useAppStore.getState();
          if (state.selectedLocation) {
            localStorage.setItem('em.selectedLocation', JSON.stringify(state.selectedLocation));
          }
          if (state.drawnBbox) {
            localStorage.setItem('em.drawnBbox', JSON.stringify(state.drawnBbox));
          }
        } catch {
          /* ignore */
        }
      }

      toast.info('Analysis started', `Job ${jobId} is running.`);
    },
    onError: (error) => {
      const apiError = ApiError.from(error);
      toast.error('Could not start analysis', apiError.message);
    },
  });

  const jobQuery = useQuery({
    queryKey: ['nisar-job', jobId],
    queryFn: () => fetchNisarJobStatus(jobId ?? ''),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const snapshot = query.state.data?.data;
      if (!snapshot) return 1500;
      return snapshot.status === 'complete' || snapshot.status === 'error' ? false : 1500;
    },
  });

  const search = useCallback(
    (params: SearchNisarRequest) => {
      setFiles([]);
      searchMutation.mutate(params);
    },
    [searchMutation],
  );

  const clearSearch = useCallback(() => {
    setFiles([]);
    setJobId(null);
    searchMutation.reset();
    analyzeMutation.reset();
  }, [searchMutation, analyzeMutation]);

  const analyze = useCallback(
    (params: Omit<AnalyzeNisarRequest, 'detectionType'>) => {
      analyzeMutation.mutate({ ...params, detectionType: 'flood' });
    },
    [analyzeMutation],
  );

  const resetAnalysis = useCallback(() => {
    setJobId(null);
    analyzeMutation.reset();
  }, [analyzeMutation]);

  const getSmallFiles = useCallback((): NisarFile[] => {
    return files.filter((f) => f.sizeGB < 3).sort((a, b) => a.sizeGB - b.sizeGB);
  }, [files]);

  const getBestPair = useCallback((): { before: NisarFile; after: NisarFile } | null => {
    const groups: Record<string, NisarFile[]> = {};
    for (const file of files) {
      const key = `${file.track}-${file.frame}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
    }

    let best: { before: NisarFile; after: NisarFile; size: number } | null = null;

    for (const key in groups) {
      const group = groups[key].filter((f) => f.sizeGB < 3);
      if (group.length < 2) continue;

      const sorted = group.sort((a, b) => a.date.localeCompare(b.date));
      const before = sorted[0];
      const after = sorted[sorted.length - 1];
      const totalSize = before.sizeGB + after.sizeGB;

      if (!best || totalSize < best.size) {
        best = { before, after, size: totalSize };
      }
    }

    return best ? { before: best.before, after: best.after } : null;
  }, [files]);

  return {
    files,
    isSearching: searchMutation.isPending,
    searchError: searchMutation.error ? ApiError.from(searchMutation.error) : null,
    search,
    clearSearch,
    jobId,
    jobStatus: jobQuery.data?.data ?? null,
    isAnalyzing: analyzeMutation.isPending || (Boolean(jobId) && jobQuery.isFetching),
    analyze,
    resetAnalysis,
    getBestPair,
    getSmallFiles,
  };
}