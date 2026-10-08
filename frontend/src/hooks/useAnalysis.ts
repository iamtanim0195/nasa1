'use client';

import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  createAnalysisJob,
  fetchAnalysisJob,
  fetchAnalysisWidgets,
  fetchExtractions,
  fetchResults,
  type CreateAnalysisPayload,
} from '@/services';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import type { AnalysisJob, AnalysisStage } from '@/types';

const STAGE_ORDER: AnalysisStage[] = ['dsard', 'extracting', 'analyzing', 'result'];

export function stageRank(stage: AnalysisStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export interface StageState {
  id: AnalysisStage;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'done';
  progress: number;
}

export const STAGE_META: Record<AnalysisStage, { label: string; description: string }> = {
  dsard: {
    label: 'D-SAR-D',
    description: 'Deterministic SAR Difference — ingest, calibrate, coregister, threshold.',
  },
  extracting: {
    label: 'Extracting',
    description: 'Vectorise the change mask into physical feature classes.',
  },
  analyzing: {
    label: 'Analyzing',
    description: 'Score each hazard domain against exposure and confidence.',
  },
  result: {
    label: 'Result',
    description: 'Aggregate statistics, charts and export.',
  },
};

export interface UseAnalysisResult {
  jobId: string | null;
  /** The full job record, including per-step status. */
  job: AnalysisJob | null;
  progress: number;
  stage: AnalysisStage;
  stageStates: StageState[];
  isRunning: boolean;
  isComplete: boolean;
  /** True while POST /api/analyze is in flight (drives the blocking overlay). */
  isDispatching: boolean;
  /** Kicks off POST /api/analyze and starts polling. */
  start: (payload: CreateAnalysisPayload) => void;
  cancel: () => void;
  error: ApiError | null;
  isLoadingJob: boolean;
}

/**
 * Analysis orchestration.
 *
 * The polling cadence lives in one place so the D-SAR-D / Extracting /
 * Analyzing / Result views stay purely presentational.
 */
export function useAnalysis(): UseAnalysisResult {
  const jobId = useAppStore((state) => state.jobId);
// Restore jobId from localStorage on mount
useEffect(() => {
  if (typeof window !== 'undefined' && !jobId) {
    const storedJobId = localStorage.getItem('activeJobId');
    const storedJobData = localStorage.getItem('activeJobData');
    if (storedJobId && storedJobData) {
      try {
        const jobData = JSON.parse(storedJobData);
        startAnalysis(jobData);
      } catch (e) {
        console.warn('Could not restore job:', e);
      }
    }
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
  const job = useAppStore((state) => state.job);
  const setJob = useAppStore((state) => state.setJob);
  const startAnalysis = useAppStore((state) => state.startAnalysis);
  const resetAnalysis = useAppStore((state) => state.resetAnalysis);
  const setExtractions = useAppStore((state) => state.setExtractions);
  const setWidgets = useAppStore((state) => state.setWidgets);
  const setResultDataset = useAppStore((state) => state.setResultDataset);

  const queryClient = useQueryClient();

  const progress = job?.progress ?? 0;
  const stage = job?.stage ?? 'dsard';
  const isComplete = progress >= 100 && job !== null;

  /* ---- 1. start ---- */
const startMutation = useMutation({
  mutationFn: (payload: CreateAnalysisPayload) => createAnalysisJob(payload),
  onSuccess: (envelope) => {
    startAnalysis(envelope.data);
    // Persist jobId in localStorage so it survives navigation
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeJobId', envelope.data.id);
      localStorage.setItem('activeJobData', JSON.stringify(envelope.data));
    }
    toast.info('Analysis queued', `${envelope.data.id} is running through D-SAR-D.`);
  },
    onError: (error) => {
      const apiError = ApiError.from(error);
      toast.error('Could not start the analysis', apiError.message);
    },
  });

  /* ---- 2. poll ---- */
  const jobQuery = useQuery({
    queryKey: ['analysis', 'job', jobId],
    queryFn: () => fetchAnalysisJob(jobId ?? ''),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const snapshot = query.state.data?.data;
      if (!snapshot) return 1_200;
      return snapshot.progress >= 100 ? false : 1_200;
    },
  });

  useEffect(() => {
    if (jobQuery.data) setJob(jobQuery.data.data);
  }, [jobQuery.data, setJob]);

  /* ---- 3. derived data, unlocked by stage ---- */
  const extractionsQuery = useQuery({
    queryKey: ['analysis', 'extractions', jobId],
    queryFn: () => fetchExtractions(jobId ?? ''),
    enabled: Boolean(jobId) && stageRank(stage) >= stageRank('extracting'),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const widgetsQuery = useQuery({
    queryKey: ['analysis', 'widgets', jobId],
    queryFn: () => fetchAnalysisWidgets(jobId ?? ''),
    enabled: Boolean(jobId) && stageRank(stage) >= stageRank('analyzing'),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const resultsQuery = useQuery({
    queryKey: ['analysis', 'results', jobId],
    queryFn: () => fetchResults(jobId ?? ''),
    enabled: Boolean(jobId) && stageRank(stage) >= stageRank('result'),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (extractionsQuery.data) setExtractions(extractionsQuery.data.data);
  }, [extractionsQuery.data, setExtractions]);

  useEffect(() => {
    if (widgetsQuery.data) setWidgets(widgetsQuery.data.data);
  }, [widgetsQuery.data, setWidgets]);

  useEffect(() => {
    if (resultsQuery.data) setResultDataset(resultsQuery.data.data);
  }, [resultsQuery.data, setResultDataset]);

  useEffect(() => {
    if (isComplete) {
      toast.success('Analysis complete', `Results for ${job?.id ?? ''} are ready.`);
    }
    // Only fire when completion flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  /* ---- derived stage ladder ---- */
  const stageStates = useMemo<StageState[]>(() => {
    const currentRank = stageRank(stage);

    return STAGE_ORDER.map((id, index) => {
      const status: StageState['status'] =
        isComplete || index < currentRank ? 'done' : index === currentRank ? 'running' : 'pending';

      // Distribute the overall progress across the four stages.
      const span = 100 / STAGE_ORDER.length;
      const stageProgress =
        status === 'done'
          ? 100
          : status === 'pending'
            ? 0
            : Math.min(100, Math.max(0, ((progress - index * span) / span) * 100));

      return {
        id,
        label: STAGE_META[id].label,
        description: STAGE_META[id].description,
        status,
        progress: Number(stageProgress.toFixed(1)),
      };
    });
  }, [stage, progress, isComplete]);

  const cancel = () => {
    resetAnalysis();
    queryClient.removeQueries({ queryKey: ['analysis'] });
    toast.info('Analysis cancelled', 'The job was detached from this session.');
  };

  const primaryError =
    startMutation.error ??
    jobQuery.error ??
    extractionsQuery.error ??
    widgetsQuery.error ??
    resultsQuery.error;

  return {
    jobId,
    job,
    progress,
    stage,
    stageStates,
    isRunning: Boolean(jobId) && !isComplete,
    isComplete,
    isDispatching: startMutation.isPending,
    start: (payload) => startMutation.mutate(payload),
    cancel,
    error: primaryError ? ApiError.from(primaryError) : null,
    isLoadingJob: jobQuery.isLoading && Boolean(jobId),
  };
}
