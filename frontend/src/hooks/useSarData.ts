'use client';

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchSarDatasetStatus, uploadSarDataset } from '@/services';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import { SAR_ACCEPTED_FORMATS, SAR_MAX_FILE_BYTES } from '@/lib/constants';
import { formatBytes } from '@/lib/utils';
import type { SarDataset } from '@/types';

export interface UseSarDataResult {
  dataset: SarDataset | null;
  isUploading: boolean;
  uploadProgress: number;
  /** Validates the file, then streams it to POST /api/load-sar-data. */
  upload: (file: File) => void;
  reset: () => void;
  error: ApiError | null;
}

/** Client-side gate that mirrors the server's accepted formats/size limits. */
export function validateSarFile(file: File): string | null {
  const extension = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`;
  const accepted = SAR_ACCEPTED_FORMATS as readonly string[];

  if (!accepted.includes(extension)) {
    return `Unsupported format "${extension}". Accepted: ${accepted.join(', ')}.`;
  }
  if (file.size > SAR_MAX_FILE_BYTES) {
    return `File is ${formatBytes(file.size)} — the limit is ${formatBytes(SAR_MAX_FILE_BYTES)}.`;
  }
  if (file.size === 0) {
    return 'The selected file is empty.';
  }
  return null;
}

/**
 * SAR ingest.
 *
 * Two-phase by design, matching how the backend will actually behave:
 *   1. upload  — byte-level progress from the XHR
 *   2. ingest  — server-side unpacking, polled until `status === 'ready'`
 */
export function useSarData(): UseSarDataResult {
  const dataset = useAppStore((state) => state.dataset);
  const isUploading = useAppStore((state) => state.isUploading);
  const uploadProgress = useAppStore((state) => state.uploadProgress);
  const setDataset = useAppStore((state) => state.setDataset);
  const setUploading = useAppStore((state) => state.setUploading);
  const setUploadProgress = useAppStore((state) => state.setUploadProgress);
  const showOverlay = useAppStore((state) => state.showOverlay);
  const hideOverlay = useAppStore((state) => state.hideOverlay);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (file: File) =>
      uploadSarDataset(file, (ratio) => {
        const percent = Math.round(ratio * 100);
        setUploadProgress(percent);
        // A 2 GB granule is long enough that the operator deserves a blocking,
        // determinate progress surface — the inline bar alone is easy to miss.
        showOverlay({
          message: 'Uploading SAR dataset',
          detail: file.name,
          progress: percent,
        });
      }),
    onMutate: (file: File) => {
      setUploading(true);
      setUploadProgress(0);
      showOverlay({ message: 'Uploading SAR dataset', detail: file.name, progress: 0 });
    },
    onSuccess: (envelope) => {
      setDataset(envelope.data);
      toast.success('SAR dataset accepted', `${envelope.data.fileName} is queued for ingest.`);
    },
    onError: (error) => {
      setUploadProgress(0);
      const apiError = ApiError.from(error);
      toast.error('Upload failed', apiError.message);
    },
    onSettled: () => {
      setUploading(false);
      hideOverlay();
    },
  });

  const statusQuery = useQuery({
    queryKey: ['sar-dataset', dataset?.id],
    queryFn: () => fetchSarDatasetStatus(dataset?.id ?? ''),
    enabled: Boolean(dataset?.id) && dataset?.status !== 'ready' && dataset?.status !== 'error',
    refetchInterval: (query) => {
      const snapshot = query.state.data?.data;
      if (!snapshot) return 1_200;
      return snapshot.status === 'ready' || snapshot.status === 'error' ? false : 1_200;
    },
  });

  useEffect(() => {
    const snapshot = statusQuery.data?.data;
    if (!snapshot) return;
    setDataset(snapshot);

    if (snapshot.status === 'ready') {
      toast.success(
        'SAR ingest complete',
        `${snapshot.sceneCount ?? 0} scene(s) ready for analysis.`,
      );
    }
    if (snapshot.status === 'error') {
      toast.error('Ingest failed', snapshot.message ?? 'The ingest service rejected the dataset.');
    }
  }, [statusQuery.data, setDataset]);

  const upload = useCallback(
    (file: File) => {
      const problem = validateSarFile(file);
      if (problem) {
        toast.error('Cannot use this file', problem);
        return;
      }
      mutation.mutate(file);
    },
    [mutation],
  );

  const reset = useCallback(() => {
    setDataset(null);
    setUploadProgress(0);
    mutation.reset();
    void queryClient.invalidateQueries({ queryKey: ['sar-dataset'] });
  }, [mutation, queryClient, setDataset, setUploadProgress]);

  return {
    dataset,
    isUploading,
    uploadProgress,
    upload,
    reset,
    error: mutation.error ? ApiError.from(mutation.error) : null,
  };
}
