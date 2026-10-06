// FE2 Update: 2026-10-06 15:54:29 by Ridwan
'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Camera, Check } from 'lucide-react';
import { exportBackgroundFor } from '@/lib/chartTheme';
import { CHART_PALETTE, DETECTION_TYPE_MAP, SEVERITY_MAP } from '@/lib/constants';
import { useTheme } from '@/hooks/useTheme';
import { exportElementAsPng, slugify } from '@/lib/chartExport';
import { cn, formatArea } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/StateViews';
import type { ChartType, ResultDataset, SeriesPoint } from '@/types';

export interface ResultChartsProps {
  dataset: ResultDataset | null;
  chartType: ChartType;
  height?: number;
  className?: string;
  /** Hides the built-in export button (e.g. when embedded in a report view). */
  hideExport?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Shared styling                                                             */
/* -------------------------------------------------------------------------- */

// Axis and grid *colours* are owned by CSS (see "Recharts theming" in
// globals.css). Recharts emits them as SVG presentation attributes, which cannot
// read the theme's CSS variables, and CSS outranks presentation attributes — so
// only layout belongs here.
const AXIS_PROPS = {
  tick: { fontSize: 10 },
  tickLine: false,
} as const;

const GRID_PROPS = {
  strokeDasharray: '3 5',
  vertical: false,
} as const;

interface TooltipPayloadEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/** Dark, compact tooltip matching the console chrome. */
function ChartTooltip({
  active,
  payload,
  label,
  unit = '',
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-accent/30 bg-space-950/95 px-2.5 py-2 shadow-glass backdrop-blur-md">
      {label !== undefined && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={`${entry.dataKey}-${index}`} className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: entry.color ?? '#27C9FF' }}
              aria-hidden
            />
            <span className="text-[10.5px] text-ink-muted">{entry.name}</span>
            <span className="telemetry ml-auto text-[10.5px] font-semibold text-ink">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chart variants                                                             */
/* -------------------------------------------------------------------------- */

function CategoryPie({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="46%"
          outerRadius="76%"
          paddingAngle={2}
          stroke="rgba(2,4,10,0.85)"
          strokeWidth={2}
          isAnimationActive
          animationDuration={650}
        >
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          content={<ChartTooltip unit=" km²" />}
          cursor={{ fill: 'rgba(39,201,255,0.06)' }}
        />
        <Legend
          verticalAlign="bottom"
          height={34}
          iconType="circle"
          iconSize={7}
          formatter={(value: string) => (
            // Colour comes from CSS (`.recharts-legend-item-text`) so the legend
            // follows the theme instead of being pinned to a dark-mode grey.
            <span style={{ fontSize: 10 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DistributionBar({
  data,
  tone,
  unit,
}: {
  data: SeriesPoint[];
  tone: 'severity' | 'accent';
  unit: string;
}) {
  const colorFor = (label: string, index: number) => {
    if (tone === 'severity') {
      const match = Object.values(SEVERITY_MAP).find(
        (severity) => severity.label.toLowerCase() === label.toLowerCase(),
      );
      if (match) return match.hex;
    }
    return CHART_PALETTE[index % CHART_PALETTE.length] as string;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -14 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="label"
          {...AXIS_PROPS}
          interval={0}
          angle={data.length > 6 ? -18 : 0}
          dy={6}
        />
        <YAxis {...AXIS_PROPS} width={46} />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ fill: 'rgba(39,201,255,0.06)' }}
        />
        <Bar dataKey="value" name="Detections" radius={[5, 5, 0, 0]} maxBarSize={46}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={colorFor(entry.label, index)} fillOpacity={0.82} />
          ))}
        </Bar>
        {data.length > 6 && (
          <Brush
            dataKey="label"
            height={16}
            travellerWidth={7}
            stroke="#27C9FF"
            fill="rgba(39,201,255,0.08)"
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendLine({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: -14 }}>
        <defs>
          <linearGradient id="em-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27C9FF" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#27C9FF" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="em-trend-2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B477FF" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#B477FF" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={46} />
        <Tooltip content={<ChartTooltip unit=" km²" />} />
        <Legend
          verticalAlign="top"
          height={26}
          iconType="plainline"
          formatter={(value: string) => (
            // Colour comes from CSS (`.recharts-legend-item-text`) so the legend
            // follows the theme instead of being pinned to a dark-mode grey.
            <span style={{ fontSize: 10 }}>{value}</span>
          )}
        />
        <Area
          type="monotone"
          dataKey="value"
          name="Affected area"
          stroke="#27C9FF"
          strokeWidth={2}
          fill="url(#em-trend)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="secondary"
          name="Reference"
          stroke="#B477FF"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill="url(#em-trend-2)"
          dot={false}
        />
        {data.length > 8 && (
          <Brush
            dataKey="label"
            height={16}
            travellerWidth={7}
            stroke="#27C9FF"
            fill="rgba(39,201,255,0.08)"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ConfidenceHistogram({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -14 }} barCategoryGap={2}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={46} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(39,201,255,0.06)' }} />
        <Bar
          dataKey="value"
          name="Detections"
          fill="#27C9FF"
          fillOpacity={0.72}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Public component                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Result visualisation dashboard.
 *
 * Four chart types over one dataset. Each is a pure derivation of
 * `ResultDataset`, so switching type never refetches — the backend contract
 * stays a single `GET /api/results/:jobId`.
 */
export function ResultCharts({
  dataset,
  chartType,
  height = 320,
  className,
  hideExport = false,
}: ResultChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exported, setExported] = useState(false);

  // The only theme value this component needs: an exported PNG is painted on a
  // canvas outside the document, so it inherits nothing from CSS.
  const { theme } = useTheme();

  const legendNames = useMemo(
    () => dataset?.categories.map((point) => point.label) ?? [],
    [dataset],
  );

  const handleExport = async () => {
    const ok = await exportElementAsPng(
      containerRef.current,
      `earth-metamorphosis-${slugify(chartType)}-${Date.now()}.png`,
      { background: exportBackgroundFor(theme) },
    );
    if (!ok) return;
    setExported(true);
    window.setTimeout(() => setExported(false), 1_800);
  };

  if (!dataset) {
    return (
      <div className={cn('rounded-2xl border border-hairline/8 bg-elevate/3 p-4', className)}>
        <EmptyState
          title="No result dataset"
          description="Run an analysis to generate the aggregation this dashboard visualises."
        />
      </div>
    );
  }

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-hairline/8 bg-elevate/3 p-4',
        className,
      )}
      aria-label={`${chartType} chart`}
    >
      {/* Header */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
            {chartType === 'pie'
              ? 'Affected area by class'
              : chartType === 'histogram'
                ? 'Confidence distribution'
                : chartType === 'line'
                  ? 'Detection trend'
                  : 'Area by detection class'}
          </h3>
          <p className="mt-0.5 text-[10px] text-ink-faint">
            {dataset.eventCount.toLocaleString()} detections · {formatArea(dataset.totalAreaKm2)} ·
            mean confidence {(dataset.meanConfidence * 100).toFixed(1)}%
          </p>
        </div>

        {!hideExport && (
          <Button
            size="sm"
            variant="outline"
            icon={exported ? <Check className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
            onClick={() => void handleExport()}
          >
            {exported ? 'Saved' : 'Export PNG'}
          </Button>
        )}
      </header>

      {/* Plot */}
      <div ref={containerRef} style={{ height }} className="w-full">
        {chartType === 'pie' && <CategoryPie data={dataset.categories} />}
        {chartType === 'bar' && (
          <DistributionBar data={dataset.categories} tone="accent" unit=" km²" />
        )}
        {chartType === 'histogram' && <ConfidenceHistogram data={dataset.confidenceBands} />}
        {chartType === 'line' && <TrendLine data={dataset.timeline} />}
      </div>

      {/* Legend note for the bar chart (classes are colour-coded by detection type) */}
      {chartType === 'bar' && legendNames.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-hairline/8 pt-2">
          {legendNames.map((name, index) => {
            const match = Object.values(DETECTION_TYPE_MAP).find(
              (type) => type.shortLabel === name,
            );
            return (
              <span key={name} className="flex items-center gap-1 text-[9.5px] text-ink-faint">
                <span
                  className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: match?.hex ?? CHART_PALETTE[index % CHART_PALETTE.length] }}
                />
                {name}
              </span>
            );
          })}
        </p>
      )}
    </section>
  );
}
