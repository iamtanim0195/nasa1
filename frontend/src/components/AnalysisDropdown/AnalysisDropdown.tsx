'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useAnalysis, STAGE_META } from '@/hooks/useAnalysis';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { AnalysisStage } from '@/types';

const ITEMS: Array<{ stage: AnalysisStage; icon: string }> = [
  { stage: 'dsard', icon: 'Radar' },
  { stage: 'extracting', icon: 'Layers' },
  { stage: 'analyzing', icon: 'Activity' },
  { stage: 'result', icon: 'ChartColumnBig' },
];

export interface AnalysisDropdownProps {
  className?: string;
  /** Where selecting a stage navigates. */
  href?: string;
  onSelect?: (stage: AnalysisStage) => void;
}

const STATUS_LABEL: Record<'pending' | 'running' | 'done', string> = {
  pending: 'Idle',
  running: 'Running',
  done: 'Ready',
};

/**
 * ANALYZE menu (top-right).
 *
 * Doubles as the pipeline's status readout: each item shows its own state, so
 * the operator can tell at a glance how far the job has progressed without
 * leaving the globe.
 */
export function AnalysisDropdown({
  className,
  href = '/analyze',
  onSelect,
}: AnalysisDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { stageStates, progress, isRunning, jobId } = useAnalysis();
  const setActiveStage = useAppStore((state) => state.setActiveStage);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = (stage: AnalysisStage) => {
    setActiveStage(stage);
    onSelect?.(stage);
    setOpen(false);
    router.push(`${href}?stage=${stage}`);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors',
          open
            ? 'border-accent/55 bg-accent/10'
            : 'border-hairline/12 bg-sunken hover:border-accent/35',
        )}
      >
        <Icon
          name="Radar"
          className={cn('h-3.5 w-3.5', isRunning ? 'text-accent' : 'text-ink-muted')}
        />

        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">Analyze</span>

        {isRunning ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            <span className="telemetry text-[10px] text-accent">{progress.toFixed(0)}%</span>
          </span>
        ) : jobId ? (
          <Badge tone="success">Ready</Badge>
        ) : (
          <Badge tone="neutral">No job</Badge>
        )}

        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-ink-faint transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Analysis stages"
          className="absolute right-0 top-[calc(100%+6px)] z-chrome w-[19rem] overflow-hidden rounded-xl border border-accent/25 bg-space-900/97 p-1.5 shadow-glass backdrop-blur-xl"
        >
          {jobId && (
            <div className="mb-1.5 rounded-lg border border-hairline/8 bg-elevate/4 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="telemetry text-[10px] text-ink-faint">{jobId}</span>
                <span className="telemetry text-[10px] text-accent">{progress.toFixed(0)}%</span>
              </div>
              <ProgressBar className="mt-1.5" size="xs" value={progress} active={isRunning} />
            </div>
          )}

          {ITEMS.map((item) => {
            const state = stageStates.find((entry) => entry.id === item.stage);
            const status = state?.status ?? 'pending';

            return (
              <button
                key={item.stage}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(item.stage)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/10"
              >
                <span
                  className={cn(
                    'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border',
                    status === 'done'
                      ? 'border-signal-low/40 bg-signal-low/10 text-signal-low'
                      : status === 'running'
                        ? 'border-accent/45 bg-accent/12 text-accent'
                        : 'border-hairline/10 bg-elevate/5 text-ink-faint',
                  )}
                >
                  {status === 'running' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Icon name={item.icon} className="h-3 w-3" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wider text-ink">
                      {STAGE_META[item.stage].label}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-[9px] font-semibold uppercase tracking-wider',
                        status === 'done'
                          ? 'text-signal-low'
                          : status === 'running'
                            ? 'text-accent'
                            : 'text-ink-faint',
                      )}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-ink-faint">
                    {STAGE_META[item.stage].description}
                  </span>
                </span>
              </button>
            );
          })}

          <div className="mt-1 border-t border-hairline/8 px-2.5 pt-2 text-[9.5px] leading-relaxed text-ink-faint">
            Stage data is served by{' '}
            <span className="telemetry text-ink-muted">/api/analyze/:jobId</span>. Without a running
            job these views render their empty states.
          </div>
        </div>
      )}
    </div>
  );
}
