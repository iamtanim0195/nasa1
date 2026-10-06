import { cn } from '@/lib/utils';

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'strong' | 'subtle';
  /** Adds the diagonal sheen used on premium cards. */
  sheen?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
} as const;

export function GlassPanel({
  className,
  variant = 'default',
  sheen = false,
  padding = 'md',
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl',
        variant === 'default' && 'glass',
        variant === 'strong' && 'glass-strong',
        variant === 'subtle' && 'glass-subtle',
        sheen && 'sheen',
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PanelHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Right-aligned slot (counts, toggles, actions). */
  actions?: React.ReactNode;
  className?: string;
}

export function PanelHeader({ icon, title, subtitle, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
            {title}
          </h3>
          {subtitle && <p className="truncate text-[10px] text-ink-faint">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Section divider with an optional centred label. */
export function PanelDivider({ label, className }: { label?: string; className?: string }) {
  if (!label) {
    return <div className={cn('h-px w-full bg-elevate/8', className)} />;
  }
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="h-px flex-1 bg-elevate/8" />
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      <div className="h-px flex-1 bg-elevate/8" />
    </div>
  );
}
