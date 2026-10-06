import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  /** 0..100 */
  value: number;
  className?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  size?: 'xs' | 'sm' | 'md';
  /** Renders moving stripes while a job is running. */
  active?: boolean;
  label?: string;
}

const TONES = {
  accent: 'bg-accent-sweep',
  success: 'bg-signal-low',
  warning: 'bg-signal-medium',
  danger: 'bg-signal-critical',
} as const;

const SIZES = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' } as const;

export function ProgressBar({
  value,
  className,
  tone = 'accent',
  size = 'sm',
  active = false,
  label,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-faint">
          <span>{label}</span>
          <span className="telemetry text-ink-muted">{clamped.toFixed(0)}%</span>
        </div>
      )}
      <div
        className={cn('relative w-full overflow-hidden rounded-full bg-elevate/8', SIZES[size])}
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'progress'}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 ease-mission',
            TONES[tone],
            active && 'animate-pulse',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** Indeterminate variant for requests with no known total. */
export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div className={cn('relative h-1 w-full overflow-hidden rounded-full bg-elevate/8', className)}>
      <div className="absolute inset-y-0 w-1/3 animate-[shimmer_1.4s_infinite] rounded-full bg-accent-sweep" />
    </div>
  );
}
