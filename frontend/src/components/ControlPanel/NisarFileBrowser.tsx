'use client';

import { useMemo, useState } from 'react';
import { Calendar, Database, Download, Filter, Layers, Play, Sparkles, X } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { NisarFile } from '@/services';

export interface NisarFileBrowserProps {
  files: NisarFile[];
  isSearching: boolean;
  onAnalyze: (beforeFileId: string, afterFileId: string) => void;
  onClear: () => void;
  className?: string;
}

interface GroupedFiles {
  key: string;
  track: string;
  frame: string;
  files: NisarFile[];
}

/**
 * NISAR File Browser.
 *
 * Replaces the SAR dropzone. Shows the search results from the backend
 * (real NASA Earthdata), grouped by track+frame, sorted by date, with
 * visual indicators for file size (SMALL = good for analysis).
 */
export function NisarFileBrowser({
  files,
  isSearching,
  onAnalyze,
  onClear,
  className,
}: NisarFileBrowserProps) {
  const [selectedBefore, setSelectedBefore] = useState<string | null>(null);
  const [selectedAfter, setSelectedAfter] = useState<string | null>(null);

  /* ---- Group files by track+frame ---- */
  const groups = useMemo<GroupedFiles[]>(() => {
    const map: Record<string, GroupedFiles> = {};
    for (const file of files) {
      const key = `${file.track}-${file.frame}`;
      if (!map[key]) {
        map[key] = { key, track: file.track, frame: file.frame, files: [] };
      }
      map[key].files.push(file);
    }
    return Object.values(map).map((g) => ({
      ...g,
      files: g.files.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [files]);

  /* ---- Auto-select best pair ---- */
  const autoSelect = () => {
    let best: {
      before: NisarFile;
      after: NisarFile;
      size: number;
      downloaded: boolean;
    } | null = null;

    for (const group of groups) {
      // Prefer groups whose granules are already on disk; that keeps the
      // demo fast and avoids Earthdata download mid-analysis.
      const downloaded = group.files.filter((f) => f.isDownloaded);
      const pool = downloaded.length >= 2 ? downloaded : group.files;

      const small = pool.filter((f) => f.sizeGB < 3);
      if (small.length < 2) continue;

      const sorted = [...small].sort((a, b) => a.date.localeCompare(b.date));
      const before = sorted[0];
      const after = sorted[sorted.length - 1];
      const size = before.sizeGB + after.sizeGB;
      const isDownloadedPair = Boolean(before.isDownloaded && after.isDownloaded);

      if (
        !best ||
        (isDownloadedPair && !best.downloaded) ||
        (isDownloadedPair === best.downloaded && size < best.size)
      ) {
        best = { before, after, size, downloaded: isDownloadedPair };
      }
    }

    if (best) {
      setSelectedBefore(best.before.id);
      setSelectedAfter(best.after.id);
      // eslint-disable-next-line no-console
      console.info(
        '[auto-pick] chose pair',
        best.before.granuleId,
        best.after.granuleId,
        { downloaded: best.downloaded, sizeGB: best.size.toFixed(2) },
      );
    }
  };

  const canAnalyze = Boolean(selectedBefore && selectedAfter);
  const selectedBeforeFile = files.find((f) => f.id === selectedBefore);
  const selectedAfterFile = files.find((f) => f.id === selectedAfter);

  /* ---- Loading state ---- */
  if (isSearching) {
    return (
      <div className={cn('rounded-xl border border-accent/25 bg-elevate/4 p-4', className)}>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-accent/35 bg-accent/10">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/70 border-t-transparent" />
          </span>
          <div>
            <p className="text-[11.5px] font-semibold text-ink">Searching NASA Earthdata...</p>
            <p className="text-[10px] text-ink-faint">
              Querying NISAR granules for the selected area and dates
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Empty state ---- */
  if (files.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-hairline/14 bg-elevate/3 p-4 text-center', className)}>
        <div className="flex flex-col items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-hairline/12 bg-elevate/5 text-ink-faint">
            <Database className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11.5px] font-semibold text-ink">No NISAR data yet</p>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              Pick a location + dates, then search NASA Earthdata
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Files available ---- */
  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary + Actions */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/6 px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon name="Layers" className="h-3.5 w-3.5 text-accent" />
          <p className="text-[11px] font-semibold text-ink">
            {files.length} file{files.length !== 1 ? 's' : ''} found
          </p>
          <span className="text-[10px] text-ink-faint">
            {groups.length} track{groups.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={autoSelect}
            className="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <Sparkles className="h-3 w-3" />
            Auto-pick
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md p-1 text-ink-faint transition-colors hover:text-signal-critical"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Selection summary */}
      {canAnalyze && (
        <div className="rounded-xl border border-accent/30 bg-accent/8 p-2.5">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="h-3 w-3 text-accent" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              Selected Pair
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-hairline/10 bg-elevate/5 p-2">
              <p className="text-[9px] uppercase tracking-wider text-ink-faint">Before</p>
              <p className="mt-0.5 text-[11px] font-semibold text-ink">
                {selectedBeforeFile?.date}
              </p>
              <p className="text-[9px] text-ink-faint">
                Track {selectedBeforeFile?.track}  Frame {selectedBeforeFile?.frame}
              </p>
            </div>
            <div className="rounded-lg border border-hairline/10 bg-elevate/5 p-2">
              <p className="text-[9px] uppercase tracking-wider text-ink-faint">After</p>
              <p className="mt-0.5 text-[11px] font-semibold text-ink">
                {selectedAfterFile?.date}
              </p>
              <p className="text-[9px] text-ink-faint">
                Track {selectedAfterFile?.track}  Frame {selectedAfterFile?.frame}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* File groups */}
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div
            key={group.key}
            className="rounded-xl border border-hairline/10 bg-elevate/3 p-2"
          >
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <Icon name="Layers" className="h-3 w-3 text-ink-faint" />
              <p className="text-[10px] font-semibold text-ink-muted">
                Track {group.track}  Frame {group.frame}
              </p>
              <span className="rounded border border-hairline/10 bg-elevate/5 px-1.5 py-0.5 text-[9px] text-ink-faint">
                {group.files.length} date{group.files.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-1">
              {group.files.map((file) => {
                const isBefore = file.id === selectedBefore;
                const isAfter = file.id === selectedAfter;
                const isSmall = file.sizeGB < 3;

                return (
                  <div
                    key={file.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                      isBefore || isAfter
                        ? 'border-accent/50 bg-accent/10'
                        : isSmall
                          ? 'border-hairline/10 bg-elevate/4 hover:border-accent/30 hover:bg-elevate/6'
                          : 'border-hairline/8 bg-elevate/2 opacity-70',
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Calendar className="h-3 w-3 shrink-0 text-ink-faint" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-ink">
                          {file.date}
                        </p>
                        <p className="text-[9px] text-ink-faint">
                          {file.time}  {file.orbit}
                          <span className={isSmall ? 'text-signal-low' : 'text-signal-medium'}>
                            {file.sizeGB.toFixed(2)} GB
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedBefore(file.id)}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors',
                          isBefore
                            ? 'bg-accent text-space-950'
                            : 'border border-hairline/15 text-ink-faint hover:border-accent/40 hover:text-accent',
                        )}
                      >
                        Before
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAfter(file.id)}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors',
                          isAfter
                            ? 'bg-accent text-space-950'
                            : 'border border-hairline/15 text-ink-faint hover:border-accent/40 hover:text-accent',
                        )}
                      >
                        After
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Analyze button */}
      <Button
        variant="accent"
        size="md"
        fullWidth
        icon={<Play className="h-3.5 w-3.5" />}
        onClick={() => { if (selectedBefore && selectedAfter) { onAnalyze(selectedBefore, selectedAfter); } }}
        disabled={!canAnalyze}
      >
        Analyze {selectedBeforeFile && selectedAfterFile ? 'Pair' : ''}
      </Button>

      {!canAnalyze && (
        <p className="text-center text-[10px] text-ink-faint">
          Select a Before and After file from the same track
        </p>
      )}
    </div>
  );
}