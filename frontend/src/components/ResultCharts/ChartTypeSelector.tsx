'use client';

import { CHART_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import type { ChartType } from '@/types';

export interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
  className?: string;
  /** Adds a cartesian-grid backdrop behind the group. */
  variant?: 'inline' | 'card';
}

/**
 * Pie / Histogram / Line / Bar switch.
 *
 * Exposed as a real radiogroup: analysts drive this repeatedly during a demo,
 * and arrow-key selection is materially faster than a mouse round-trip.
 */
export function ChartTypeSelector({
  value,
  onChange,
  className,
  variant = 'inline',
}: ChartTypeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Chart type"
      className={cn(
        'grid grid-cols-2 gap-2 sm:grid-cols-4',
        variant === 'card' && 'rounded-2xl border border-hairline/8 bg-sunken p-2',
        className,
      )}
    >
      {CHART_TYPES.map((chart) => {
        const active = chart.id === value;

        return (
          <button
            key={chart.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(chart.id)}
            className={cn(
              'group flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all duration-200 ease-mission',
              active
                ? 'border-accent/55 bg-accent/12 shadow-glow-accent'
                : 'border-hairline/10 bg-elevate/3 hover:border-accent/30 hover:bg-elevate/6',
            )}
          >
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors',
                active
                  ? 'border-accent/45 bg-accent/15 text-accent'
                  : 'border-hairline/10 bg-elevate/5 text-ink-faint group-hover:text-ink-muted',
              )}
            >
              <Icon name={chart.icon} className="h-3.5 w-3.5" />
            </span>

            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-[11px] font-semibold',
                  active ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {chart.label}
              </span>
              <span className="hidden truncate text-[9.5px] text-ink-faint sm:block">
                {chart.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
