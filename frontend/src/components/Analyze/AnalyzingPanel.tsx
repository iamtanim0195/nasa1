'use client';

import { Activity, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { DETECTION_TYPE_MAP } from '@/lib/constants';
import { cn, formatCompact, formatNumber } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { MetricRow } from '@/components/ui/StatTile';
import { EmptyState, Skeleton } from '@/components/ui/StateViews';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { AnalysisWidget } from '@/types';

export interface AnalyzingPanelProps {
  className?: string;
}

function riskTone(score: number): { tone: 'danger' | 'warning' | 'success'; label: string } {
  if (score >= 75) return { tone: 'danger', label: 'Severe' };
  if (score >= 50) return { tone: 'warning', label: 'Elevated' };
  return { tone: 'success', label: 'Nominal' };
}

/** Miniature sparkline — no axes, no grid, no interaction. Pure shape. */
function Sparkline({ widget }: { widget: AnalysisWidget }) {
  const detection = DETECTION_TYPE_MAP[widget.detectionType];

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={widget.series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={detection.hex} stopOpacity={0.45} />
              <stop offset="100%" stopColor={detection.hex} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Tooltip
            // Chrome comes from CSS (see "Recharts theming" in globals.css) so
            // this sparkline follows the theme like every other chart.
            wrapperClassName="em-chart-tooltip"
            formatter={(value: number) => [value.toFixed(1), 'area km2']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={detection.hex}
            strokeWidth={1.6}
            fill={`url(#spark-${widget.id})`}
            dot={false}
            activeDot={{ r: 2.5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * ANALYZING — per-hazard domain widgets.
 *
 * One card per detection domain. Each card is a pure function of its
 * `AnalysisWidget`, so the backend can add domains without a frontend change:
 * unknown ids simply render with the neutral accent.
 */
export function AnalyzingPanel({ className }: AnalyzingPanelProps) {
  const { jobId, progress, stage } = useAnalysis();
  const widgets = useAppStore((state) => state.widgets);

  if (!jobId) {
    return (
      <div className={className}>
        <EmptyState
          icon={<Activity className="h-4 w-4" />}
          title="No analysis scores yet"
          description="Hazard-domain widgets appear once the Extraction stage has completed and the scoring service responds."
        />
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="rounded-xl border border-accent/25 bg-accent/8 p-4">
          <p className="text-[11.5px] font-semibold text-ink">
            Scoring has not started ({stage}, {progress.toFixed(0)}%)
          </p>
          <ProgressBar className="mt-2" value={progress} size="xs" active />
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="rounded-2xl border border-hairline/8 bg-elevate/3 p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-12 w-full" />
              <Skeleton className="mt-3 h-2.5 w-3/4" />
              <Skeleton className="mt-2 h-2.5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-3 lg:grid-cols-2 xl:grid-cols-3', className)}>
      {widgets.map((widget) => {
        const detection = DETECTION_TYPE_MAP[widget.detectionType];
        const risk = riskTone(widget.riskScore);

        return (
          <article
            key={widget.id}
            className="group relative overflow-hidden rounded-2xl border border-hairline/8 bg-elevate/3 p-4 transition-colors hover:border-accent/30 hover:bg-elevate/6"
          >
            {/* Header */}
            <header className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border"
                  style={{
                    borderColor: `${detection.hex}55`,
                    background: `${detection.hex}18`,
                    color: detection.hex,
                  }}
                >
                  <Icon name={detection.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-[12px] font-semibold text-ink">
                    {detection.shortLabel}
                  </h3>
                  <p className="truncate text-[10px] text-ink-faint">{widget.headline}</p>
                </div>
              </div>

              <Badge tone={risk.tone}>{risk.label}</Badge>
            </header>

            {/* Risk index */}
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-ink-faint">Risk index</p>
                <p className="telemetry text-2xl font-semibold leading-none text-ink">
                  {widget.riskScore}
                  <span className="text-[11px] text-ink-faint">/100</span>
                </p>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-signal-low">
                <TrendingUp className="h-3 w-3" />
                model-scored
              </span>
            </div>

            <ProgressBar
              className="mt-2"
              value={widget.riskScore}
              tone={
                risk.tone === 'danger' ? 'danger' : risk.tone === 'warning' ? 'warning' : 'success'
              }
              size="xs"
            />

            {/* Sparkline */}
            <div className="mt-3 rounded-xl border border-hairline/6 bg-sunken p-1.5">
              <Sparkline widget={widget} />
            </div>

            {/* Metrics */}
            <div className="mt-3">
              {widget.metrics.map((metric) => (
                <MetricRow
                  key={metric.label}
                  label={metric.label}
                  value={
                    typeof metric.value === 'number' && metric.value > 9_999
                      ? formatCompact(metric.value)
                      : typeof metric.value === 'number'
                        ? formatNumber(metric.value, metric.value % 1 === 0 ? 0 : 2)
                        : metric.value
                  }
                  unit={metric.unit}
                  delta={metric.delta}
                />
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
