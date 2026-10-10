'use client';

import { useState } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import { cn, formatArea, formatCompact, formatPercent } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/StateViews';
import { MetricRow, StatTile } from '@/components/ui/StatTile';
import { ProgressBar } from '@/components/ui/ProgressBar';

export interface ExtractingPanelProps {
  className?: string;
}

/**
 * EXTRACTING — the feature classes pulled out of the change mask.
 *
 * Cards are driven entirely by `GET /api/analyze/:jobId/extractions`; the
 * backend may return a subset (a flood job will not emit "Agriculture") and the
 * grid adapts.
 */
export function ExtractingPanel({ className }: ExtractingPanelProps) {
  const { jobId, progress, stage } = useAnalysis();
  const categories = useAppStore((state) => state.extractions);
  const [sortBy, setSortBy] = useState<'area' | 'count' | 'confidence'>('area');

  if (!jobId) {
    return (
      <div className={className}>
        <EmptyState
          icon={<Layers className="h-4 w-4" />}
          title="Nothing extracted yet"
          description="Extraction classes appear here once the D-SAR-D stage has produced a change mask."
        />
      </div>
    );
  }

  if (stage === 'dsard' && categories.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="rounded-xl border border-accent/25 bg-accent/8 p-4">
          <p className="flex items-center gap-2 text-[11.5px] font-semibold text-ink">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" />
            Vectorisation has not started
          </p>
          <p className="mt-1 text-[10.5px] text-ink-muted">
            This view unlocks automatically when the pipeline reaches the Extracting stage.
          </p>
          <ProgressBar className="mt-2.5" value={progress} size="xs" active />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <div key={index} className="rounded-xl border border-hairline/8 bg-elevate/3 p-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="mt-2 h-2.5 w-20" />
              <Skeleton className="mt-2 h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...categories].sort((a, b) => {
    if (sortBy === 'count') return b.featureCount - a.featureCount;
    if (sortBy === 'confidence') return b.confidence - a.confidence;
    return b.areaKm2 - a.areaKm2;
  });

  const totals = categories.reduce(
    (acc, item) => ({
      features: acc.features + item.featureCount,
      area: acc.area + item.areaKm2,
      confidence: acc.confidence + item.confidence,
    }),
    { features: 0, area: 0, confidence: 0 },
  );

  const meanConfidence = categories.length ? totals.confidence / categories.length : 0;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Classes"
          value={categories.length}
          icon={<Layers className="h-3.5 w-3.5" />}
          hint="feature types returned"
        />
        <StatTile
          label="Features"
          value={formatCompact(totals.features)}
          icon={<Icon name="Columns2" className="h-3.5 w-3.5" />}
          hint="vectorised polygons"
        />
        <StatTile
          label="Total area"
          value={formatArea(totals.area)}
          icon={<Icon name="Map" className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Mean confidence"
          value={formatPercent(meanConfidence, 1)}
          icon={<Icon name="ShieldCheck" className="h-3.5 w-3.5" />}
        />
      </div>

      {/* Sort control */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
          Extraction classes
        </h3>
        <div className="flex items-center gap-1 rounded-lg border border-hairline/8 bg-sunken p-0.5">
          {(['area', 'count', 'confidence'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              aria-pressed={sortBy === key}
              className={cn(
                'rounded-md px-2 py-1 text-[10px] capitalize transition-colors',
                sortBy === key ? 'bg-accent/15 text-accent' : 'text-ink-faint hover:text-ink',
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((category) => {
          const rising = category.trend >= 0;

          return (
            <article
              key={category.id}
              className="group relative overflow-hidden rounded-2xl border border-hairline/8 bg-elevate/3 p-3.5 transition-colors hover:border-accent/30 hover:bg-elevate/6"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                  <Icon name={category.icon} className="h-4 w-4" />
                </span>
                <Badge tone={rising ? 'success' : 'danger'}>
                  {rising ? '+' : ''}
                  {category.trend.toFixed(1)}%
                </Badge>
              </div>

              <h4 className="mt-2.5 text-[12px] font-semibold text-ink">{category.label}</h4>

              <p className="telemetry mt-1 flex items-baseline gap-1.5">
                <span className="text-base font-semibold text-ink">
                  {formatCompact(category.featureCount)}
                </span>
                <span className="text-[10px] text-ink-faint">features</span>
                <span className="ml-auto text-[11px] font-semibold text-signal-medium">
                  {formatArea(category.areaKm2)}
                </span>
              </p>

              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-ink-faint">
                    Confidence
                  </span>
                  <span className="telemetry text-[9.5px] text-ink-muted">
                    {formatPercent(category.confidence, 1)}
                  </span>
                </div>
                <ProgressBar
                  value={category.confidence * 100}
                  size="xs"
                  tone={category.confidence > 0.85 ? 'success' : 'accent'}
                />
              </div>
            </article>
          );
        })}
      </div>

      {/* Detail table for the largest class */}
      {sorted[0] && (
        <div className="rounded-2xl border border-hairline/8 bg-elevate/3 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
            Dominant class · {sorted[0].label}
          </h3>
          <div className="mt-2.5">
            <MetricRow label="Feature count" value={sorted[0].featureCount} />
            <MetricRow label="Area" value={sorted[0].areaKm2} unit="km2" />
            <MetricRow
              label="Confidence"
              value={(sorted[0].confidence * 100).toFixed(1)}
              unit="%"
            />
            <MetricRow label="Change vs reference" value={sorted[0].trend} unit="%" />
          </div>
        </div>
      )}
    </div>
  );
}
