'use client';

import { BarChart3, Download, Gauge, PieChart, ShieldCheck, Target } from 'lucide-react';
import { CHART_TYPES, DETECTION_TYPE_MAP } from '@/lib/constants';
import { cn, formatArea, formatCompact, formatDate, formatPercent } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useMap } from '@/hooks/useMap';
import { downloadDataUrl } from '@/lib/chartExport';
import { ChartTypeSelector, ResultCharts } from '@/components/ResultCharts';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/StateViews';
import { StatTile } from '@/components/ui/StatTile';
import { ProgressBar } from '@/components/ui/ProgressBar';

export interface ResultPanelProps {
  className?: string;
  /** Hides the chart switch (used by the standalone /results route chrome). */
  hideChartSelector?: boolean;
}

/**
 * RESULT — the visualisation dashboard.
 *
 * Aggregation comes from `GET /api/results/:jobId`; the chart type is pure
 * client state, so flipping between pie / histogram / line / bar is instant and
 * never touches the network.
 */
export function ResultPanel({ className, hideChartSelector = false }: ResultPanelProps) {
  const { jobId, progress, isComplete } = useAnalysis();
  const dataset = useAppStore((state) => state.resultDataset);
  const chartType = useAppStore((state) => state.chartType);
  const setChartType = useAppStore((state) => state.setChartType);
  const events = useAppStore((state) => state.events);
  const selectEvent = useAppStore((state) => state.selectEvent);
  const { focusEvent, controller } = useMap();

  /* ---- Not started ---- */
  if (!jobId) {
    return (
      <div className={className}>
        <EmptyState
          icon={<BarChart3 className="h-4 w-4" />}
          title="No results to visualise"
          description="Dispatch an analysis from the dashboard. Charts, KPI tiles and the detection table populate from the results endpoint."
        />
      </div>
    );
  }

  /* ---- Still running ---- */
  if (!isComplete || !dataset) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="rounded-2xl border border-accent/25 bg-accent/8 p-5">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
            <Gauge className="h-4 w-4 text-accent" />
            Aggregating results
          </p>
          <p className="mt-1 text-[10.5px] text-ink-muted">
            The result dataset is published when the pipeline reaches the final stage.
          </p>
          <ProgressBar className="mt-3" value={progress} label="Overall progress" active />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-xl border border-hairline/8 bg-elevate/3 p-3">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-5 w-24" />
            </div>
          ))}
        </div>

        <Skeleton className="h-[320px] w-full rounded-2xl" />
      </div>
    );
  }

  /* ---- Ready ---- */
  const topEvents = [...events].sort((a, b) => b.areaKm2 - a.areaKm2).slice(0, 6);

  const activeChart = CHART_TYPES.find((chart) => chart.id === chartType);

  return (
    <div className={cn('space-y-4', className)}>
      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Detections"
          value={formatCompact(dataset.eventCount)}
          icon={<Target className="h-3.5 w-3.5" />}
          hint={`job ${jobId}`}
        />
        <StatTile
          label="Affected area"
          value={formatArea(dataset.totalAreaKm2)}
          icon={<PieChart className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Mean confidence"
          value={formatPercent(dataset.meanConfidence, 1)}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Classes"
          value={dataset.categories.length}
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          hint="change types present"
        />
      </div>

      {/* Chart switcher */}
      {!hideChartSelector && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
              Visualisation
            </h3>
            <div className="flex items-center gap-2">
              {activeChart && <Badge tone="neutral">{activeChart.label}</Badge>}
              <Button
                size="sm"
                variant="ghost"
                icon={<Download className="h-3.5 w-3.5" />}
                onClick={() => {
                  const dataUrl = controller?.captureCanvas();
                  if (dataUrl) {
                    downloadDataUrl(dataUrl, `earth-metamorphosis-globe-${Date.now()}.png`);
                  }
                }}
              >
                Globe snapshot
              </Button>
            </div>
          </div>

          <ChartTypeSelector value={chartType} onChange={setChartType} />
        </div>
      )}

      {/* Chart */}
      <ResultCharts dataset={dataset} chartType={chartType} height={340} />

      {/* Detection table */}
      <div className="overflow-hidden rounded-2xl border border-hairline/8 bg-elevate/3">
        <header className="flex items-center justify-between gap-2 border-b border-hairline/8 px-4 py-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
            Largest detections
          </h3>
          <span className="telemetry text-[10px] text-ink-faint">
            generated {formatDate(dataset.generatedAt)}
          </span>
        </header>

        {topEvents.length === 0 ? (
          <div className="p-4">
            <EmptyState compact title="No detection records in this session" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left">
              <thead>
                <tr className="border-b border-hairline/8 text-[9px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-2 font-semibold">Event</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Location</th>
                  <th className="px-3 py-2 font-semibold">Severity</th>
                  <th className="px-3 py-2 text-right font-semibold">Confidence</th>
                  <th className="px-4 py-2 text-right font-semibold">Area</th>
                </tr>
              </thead>
              <tbody>
                {topEvents.map((event) => {
                  const detection = DETECTION_TYPE_MAP[event.detectionType];
                  return (
                    <tr
                      key={event.id}
                      onClick={() => {
                        selectEvent(event.id);
                        focusEvent(event);
                      }}
                      className="cursor-pointer border-b border-hairline/5 transition-colors last:border-0 hover:bg-accent/6"
                    >
                      <td className="telemetry px-4 py-2 text-[11px] text-ink">{event.id}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                          <span
                            className="h-1.5 w-1.5 rounded-sm"
                            style={{ background: detection.hex }}
                          />
                          {detection.shortLabel}
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-[11px] text-ink-muted">
                        {event.location.name}
                      </td>
                      <td className="px-3 py-2">
                        <SeverityBadge severity={event.severity} />
                      </td>
                      <td className="telemetry px-3 py-2 text-right text-[11px] text-ink-muted">
                        {formatPercent(event.confidence, 1)}
                      </td>
                      <td className="telemetry px-4 py-2 text-right text-[11px] font-semibold text-signal-medium">
                        {formatArea(event.areaKm2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
