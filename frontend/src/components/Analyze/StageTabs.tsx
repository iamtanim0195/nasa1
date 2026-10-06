'use client';

import { Activity, BarChart3, Layers, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnalysis, STAGE_META } from '@/hooks/useAnalysis';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { AnalysisStage } from '@/types';

const TABS: Array<{ id: AnalysisStage; icon: typeof Radar }> = [
  { id: 'dsard', icon: Radar },
  { id: 'extracting', icon: Layers },
  { id: 'analyzing', icon: Activity },
  { id: 'result', icon: BarChart3 },
];

export interface StageTabsProps {
  active: AnalysisStage;
  onChange: (stage: AnalysisStage) => void;
  className?: string;
}

/**
 * Stage navigation for the Analyze route.
 *
 * Renders as a proper tablist so the four stages are announced as one widget
 * rather than four unrelated links.
 */
export function StageTabs({ active, onChange, className }: StageTabsProps) {
  const { stageStates, progress, isComplete } = useAnalysis();

  return (
    <div className={cn('space-y-2.5', className)}>
      <div
        role="tablist"
        aria-label="Analysis stages"
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-hairline/8 bg-sunken p-1.5 sm:grid-cols-4"
      >
        {TABS.map((tab) => {
          const state = stageStates.find((entry) => entry.id === tab.id);
          const selected = tab.id === active;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ease-mission',
                selected
                  ? 'border-accent/50 bg-accent/12 shadow-glow-accent'
                  : 'border-transparent hover:bg-elevate/6',
              )}
            >
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-lg border',
                  state?.status === 'done'
                    ? 'border-signal-low/40 bg-signal-low/12 text-signal-low'
                    : state?.status === 'running'
                      ? 'border-accent/45 bg-accent/15 text-accent'
                      : selected
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-hairline/10 bg-elevate/5 text-ink-faint',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-[11.5px] font-bold uppercase tracking-wider',
                    selected ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {STAGE_META[tab.id].label}
                </span>
                <span className="telemetry block truncate text-[9.5px] text-ink-faint">
                  {state?.status === 'running'
                    ? `${(state.progress ?? 0).toFixed(0)}% · running`
                    : state?.status === 'done'
                      ? 'complete'
                      : 'pending'}
                </span>
                {state?.status === 'running' && (
                  <ProgressBar className="mt-1" size="xs" value={state.progress} active />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Overall pipeline progress */}
      <div className="flex items-center gap-3">
        <ProgressBar
          value={progress}
          size="xs"
          className="flex-1"
          active={!isComplete && progress > 0}
        />
        <span className="telemetry shrink-0 text-[10px] text-ink-faint">
          {isComplete ? 'pipeline complete' : `${progress.toFixed(0)}% overall`}
        </span>
      </div>
    </div>
  );
}
