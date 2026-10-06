'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, ScanLine, Trash2, Upload, X } from 'lucide-react';
import { SAR_ACCEPTED_FORMATS, SAR_MAX_FILE_BYTES } from '@/lib/constants';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatDateTime } from '@/lib/utils';
import type { SarDataset } from '@/types';

export interface SarDropzoneProps {
  /** Fires with the accepted file — the API-ready integration point. */
  onFileAccepted: (file: File) => void;
  onClear?: () => void;
  dataset: SarDataset | null;
  isUploading: boolean;
  /** 0..100 */
  uploadProgress: number;
  className?: string;
}

const STATUS_COPY: Record<
  SarDataset['status'],
  { label: string; tone: 'accent' | 'success' | 'warning' | 'danger' }
> = {
  queued: { label: 'Queued', tone: 'warning' },
  uploading: { label: 'Uploading', tone: 'accent' },
  processing: { label: 'Ingesting', tone: 'accent' },
  ready: { label: 'Ready', tone: 'success' },
  error: { label: 'Failed', tone: 'danger' },
};

/**
 * Drag & drop ingest target.
 *
 * Accepts `.tif .tiff .h5 .nc .zip`. Validation happens in `validateSarFile`
 * (mirrored server-side) and the drag counter pattern is used so that dragging
 * over child elements does not flicker the highlight.
 */
export function SarDropzone({
  onFileAccepted,
  onClear,
  dataset,
  isUploading,
  uploadProgress,
  className,
}: SarDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted],
  );

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const statusMeta = dataset ? STATUS_COPY[dataset.status] : null;

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={SAR_ACCEPTED_FORMATS.join(',')}
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Allow re-selecting the same file after a failure.
          event.target.value = '';
        }}
      />

      {/* Dataset present -> status card instead of the drop target */}
      {dataset ? (
        <div className="sheen relative overflow-hidden rounded-xl border border-accent/25 bg-elevate/4 p-3">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
                dataset.status === 'ready'
                  ? 'border-signal-low/40 bg-signal-low/10 text-signal-low'
                  : dataset.status === 'error'
                    ? 'border-signal-critical/40 bg-signal-critical/10 text-signal-critical'
                    : 'border-accent/35 bg-accent/10 text-accent',
              )}
            >
              {isUploading || dataset.status === 'processing' || dataset.status === 'queued' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : dataset.status === 'ready' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-semibold text-ink" title={dataset.fileName}>
                {dataset.fileName}
              </p>
              <p className="telemetry mt-0.5 text-[10px] text-ink-faint">
                {dataset.format.toUpperCase()} · {formatBytes(dataset.sizeBytes)}
                {dataset.sceneCount ? ` · ${dataset.sceneCount} scenes` : ''}
              </p>
              <p className="mt-0.5 text-[10px] text-ink-muted">
                {dataset.message ?? statusMeta?.label}
              </p>
            </div>

            {onClear && !isUploading && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Remove dataset"
                className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-elevate/8 hover:text-signal-critical"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ProgressBar
            className="mt-2.5"
            size="xs"
            value={isUploading ? uploadProgress : dataset.progress}
            tone={
              dataset.status === 'error'
                ? 'danger'
                : dataset.status === 'ready'
                  ? 'success'
                  : 'accent'
            }
            active={dataset.status === 'processing' || isUploading}
          />

          <p className="mt-1.5 telemetry text-[9px] text-ink-faint">
            Uploaded {formatDateTime(dataset.uploadedAt)} UTC
          </p>
        </div>
      ) : (
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setDragging(false);
            }
          }}
          onDrop={onDrop}
          className={cn(
            'grid-faint rounded-xl border border-dashed p-4 text-center transition-colors',
            dragging
              ? 'border-accent/70 bg-accent/10'
              : 'border-hairline/14 hover:border-accent/35 hover:bg-elevate/4',
          )}
        >
          <div className="flex flex-col items-center gap-2">
            <span
              className={cn(
                'grid h-10 w-10 place-items-center rounded-xl border transition-colors',
                dragging
                  ? 'border-accent/60 bg-accent/16 text-accent'
                  : 'border-hairline/12 bg-elevate/5 text-ink-faint',
              )}
            >
              <FileUp className="h-4 w-4" />
            </span>

            <div>
              <p className="text-[11.5px] font-semibold text-ink">
                {dragging ? 'Drop to ingest' : 'Drag & drop SAR granules'}
              </p>
              <p className="mt-0.5 text-[10px] text-ink-faint">
                {SAR_ACCEPTED_FORMATS.join(' · ')} — up to {formatBytes(SAR_MAX_FILE_BYTES)}
              </p>
            </div>

            <Button
              size="sm"
              variant="subtle"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={openPicker}
              loading={isUploading}
              loadingLabel="Uploading…"
            >
              Browse files
            </Button>
          </div>
        </div>
      )}

      {/* Live upload progress replaces the bar inside the status card. */}
      {isUploading && !dataset && (
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={uploadProgress} size="xs" active />
          <span className="telemetry shrink-0 text-[10px] text-accent">{uploadProgress}%</span>
        </div>
      )}

      {isUploading && (
        <button
          type="button"
          onClick={() => {
            /* Cancel is a frontend no-op until the backend exposes an abort route. */
          }}
          className="mt-1.5 hidden items-center gap-1 text-[10px] text-ink-faint"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      )}
    </div>
  );
}
