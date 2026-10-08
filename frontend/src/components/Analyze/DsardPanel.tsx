'use client';

import { AlertTriangle, CheckCircle2, Clock, Loader2, Radar } from 'lucide-react';
import { DSARD_PIPELINE } from '@/lib/constants';
import { cn, formatDateTime } from '@/lib/utils';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useAppStore } from '@/store/appStore';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/StateViews';
import { Button } from '@/components/ui/Button';
import { PanelDivider } from '@/components/ui/GlassPanel';
import type { AnalysisStep } from '@/types';

export interface DsardPanelProps {
  className?: string;
  onStart?: () => void;
}

/**
 * D-SAR-D ÃƒÂ¢Ã¢"šÂ¬Ã¢â‚¬Â the deterministic SAR difference pipeline.
 *
 * A frontend mockup of the processing workflow: it renders whatever
 * `GET /api/analyze/:jobId` reports per step and never simulates work itself.
 * Step statuses come straight from `AnalysisJob.steps`.
 */
export function DsardPanel({ className, onStart }: DsardPanelProps) {
  const { jobId, progress, isRunning, job } = useAnalysis();
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const setActiveStage = useAppStore((state) => state.setActiveStage);

  if (!jobId || !job) {
    return (
      <div className={className}>
        <EmptyState
          icon={<Radar className="h-4 w-4" />}
          title="No D-SAR-D run in this session"
          description="Define a job in the control panel and dispatch it. Steps, timings and the processing timeline populate from the analysis API."
          action={
            onStart ? (
              <Button variant="accent" size="sm" onClick={onStart}>
                Start analysis
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const steps: AnalysisStep[] =
    job.steps.length > 0
      ? job.steps
      : DSARD_PIPELINE.map((step) => ({
          id: step.id,
          label: step.label,
          status: 'pending' as const,
          detail: step.detail,
        }));

  const doneCount = steps.filter((step) => step.status === 'done').length;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Job header */}
      <div className="sheen relative overflow-hidden rounded-2xl border border-accent/25 bg-elevate/4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone="accent" mono>
                {job.id}
              </Badge>
              {isRunning ? (
                <Badge tone="accent">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
                </Badge>
              ) : (
                <Badge tone="success">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Complete
                </Badge>
              )}
            </div>

            <p className="mt-2 text-sm font-semibold text-ink">
              {job.locationName}
              {selectedLocation?.country ? `, ${selectedLocation.country}` : ''}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Started {formatDateTime(job.startedAt)} UTC
              {job.etaSeconds ? ` Ãƒ"šÃ‚· ETA ${job.etaSeconds}s` : ''}
            </p>
          </div>

          <div className="w-full sm:w-56">
            <ProgressBar value={progress} label="Pipeline" active={isRunning} />
            <p className="telemetry mt-1.5 text-right text-[10px] text-ink-faint">
              {doneCount}/{steps.length} steps
            </p>
          </div>
        </div>

        {job.message && (
          <p className="mt-3 rounded-lg border border-hairline/8 bg-sunken px-2.5 py-2 text-[11px] text-ink-muted">
            {job.message}
          </p>
        )}
      </div>

      {/* Workflow cards + timeline */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Step cards */}
        <ol className="space-y-2" aria-label="Processing steps">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                step.status === 'done'
                  ? 'border-signal-low/25 bg-signal-low/6'
                  : step.status === 'running'
                    ? 'border-accent/45 bg-accent/8'
                    : step.status === 'error'
                      ? 'border-signal-critical/35 bg-signal-critical/8'
                      : 'border-hairline/8 bg-elevate/3',
              )}
            >
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-lg border',
                  step.status === 'done'
                    ? 'border-signal-low/45 bg-signal-low/12 text-signal-low'
                    : step.status === 'running'
                      ? 'border-accent/50 bg-accent/15 text-accent'
                      : step.status === 'error'
                        ? 'border-signal-critical/45 bg-signal-critical/12 text-signal-critical'
                        : 'border-hairline/10 bg-elevate/5 text-ink-faint',
                )}
              >
                {step.status === 'done' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : step.status === 'running' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : step.status === 'error' ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <span className="telemetry text-[10px]">{index + 1}</span>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-semibold text-ink">{step.label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-ink-faint">{step.detail}</p>
              </div>

              <span
                className={cn(
                  'shrink-0 text-[9px] font-semibold uppercase tracking-wider',
                  step.status === 'done'
                    ? 'text-signal-low'
                    : step.status === 'running'
                      ? 'text-accent'
                      : step.status === 'error'
                        ? 'text-signal-critical'
                        : 'text-ink-faint',
                )}
              >
                {step.status}
              </span>
            </li>
          ))}
        </ol>

        {/* Timeline */}
        <div className="rounded-2xl border border-hairline/8 bg-elevate/3 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
            Progress timeline
          </h3>
          <p className="mt-0.5 text-[10px] text-ink-faint">
            Vertical markers light up as each step reports completion.
          </p>

          <PanelDivider className="my-3" />

          <ol className="relative space-y-4 pl-5">
            {/* Spine */}
            <span className="absolute bottom-1 left-[7px] top-1 w-px bg-elevate/10" aria-hidden />

            {steps.map((step) => (
              <li key={`timeline-${step.id}`} className="relative">
                <span
                  className={cn(
                    'absolute -left-5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2',
                    step.status === 'done'
                      ? 'border-signal-low bg-signal-low'
                      : step.status === 'running'
                        ? 'animate-pulse border-accent bg-accent'
                        : 'border-hairline/20 bg-space-900',
                  )}
                  aria-hidden
                />
                <p className="text-[10.5px] font-medium text-ink-muted">{step.label}</p>
                <p className="telemetry mt-0.5 flex items-center gap-1 text-[9px] text-ink-faint">
                  <Clock className="h-2.5 w-2.5" />
                  {step.finishedAt ? formatDateTime(step.finishedAt) : 'awaiting'}
                </p>
              </li>
            ))}
          </ol>

          <Button
            variant="outline"
            size="sm"
            fullWidth
            className="mt-4"
            onClick={() => {
                setActiveStage('extracting');
                if (typeof window !== 'undefined') {
                  window.location.href = '/?result=feni';
                }
              }}
          >
            View extraction results
          </Button>
        </div>
      </div>
    </div>
  );
}
