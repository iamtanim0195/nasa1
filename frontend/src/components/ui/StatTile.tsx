import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  /** Signed percentage change; renders as a coloured ▲/▼. */
  delta?: number;
  icon?: React.ReactNode;
  className?: string;
  /** Renders the value in tabular monospace. */
  telemetry?: boolean;
  hint?: string;
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  icon,
  className,
  telemetry = true,
  hint,
}: StatTileProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;
  const positive = (delta ?? 0) > 0;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-hairline/8 bg-elevate/4 p-3 transition-colors hover:border-accent/25 hover:bg-elevate/6',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {label}
        </span>
        {icon && (
          <span className="text-ink-faint transition-colors group-hover:text-accent">{icon}</span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className={cn('text-lg font-semibold leading-none text-ink', telemetry && 'telemetry')}
        >
          {typeof value === 'number' ? formatNumber(value) : value}
        </span>
        {unit && <span className="text-[11px] text-ink-faint">{unit}</span>}
      </div>

      {(hasDelta || hint) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 telemetry text-[10px] font-semibold',
                positive ? 'text-signal-low' : 'text-signal-high',
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(delta ?? 0).toFixed(1)}%
            </span>
          )}
          {hint && <span className="truncate text-[10px] text-ink-faint">{hint}</span>}
        </div>
      )}
    </div>
  );
}

/** Compact horizontal metric row used inside analysis widgets. */
export function MetricRow({
  label,
  value,
  unit,
  delta,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  className?: string;
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta) && delta !== 0;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-dashed border-hairline/8 py-1.5 last:border-0',
        className,
      )}
    >
      <span className="truncate text-[11px] text-ink-muted">{label}</span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span className="telemetry text-xs font-semibold text-ink">
          {typeof value === 'number' ? formatNumber(value) : value}
        </span>
        {unit && <span className="text-[10px] text-ink-faint">{unit}</span>}
        {hasDelta && (
          <span
            className={cn(
              'telemetry text-[10px] font-semibold',
              (delta ?? 0) > 0 ? 'text-signal-low' : 'text-signal-high',
            )}
          >
            {(delta ?? 0) > 0 ? '+' : ''}
            {(delta ?? 0).toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  );
}
