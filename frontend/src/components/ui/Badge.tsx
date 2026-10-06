import { cn } from '@/lib/utils';
import { SEVERITY_MAP } from '@/lib/constants';
import type { Severity } from '@/types';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'violet';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-elevate/6 text-ink-muted border-hairline/12',
  accent: 'bg-accent/12 text-accent border-accent/35',
  success: 'bg-signal-low/12 text-signal-low border-signal-low/35',
  warning: 'bg-signal-medium/12 text-signal-medium border-signal-medium/35',
  danger: 'bg-signal-critical/12 text-signal-critical border-signal-critical/35',
  violet: 'bg-signal-violet/12 text-signal-violet border-signal-violet/35',
};

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
  mono?: boolean;
  /** Adds a leading status dot. */
  dot?: boolean;
}

export function Badge({ children, tone = 'neutral', className, mono, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        TONES[tone],
        mono && 'telemetry tracking-normal',
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Severity chip driven by the single severity catalogue. */
export function SeverityBadge({
  severity,
  className,
  showDot = true,
}: {
  severity: Severity;
  className?: string;
  showDot?: boolean;
}) {
  const meta = SEVERITY_MAP[severity];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        meta.badge,
        className,
      )}
    >
      {showDot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {meta.label}
    </span>
  );
}
