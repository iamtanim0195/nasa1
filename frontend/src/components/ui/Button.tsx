'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-space-700 text-ink border border-hairline/12 hover:bg-space-600 hover:border-accent/40',
  accent:
    'bg-accent-sweep text-on-accent font-semibold border border-transparent hover:brightness-110 shadow-glow-accent',
  outline:
    'bg-transparent text-ink border border-accent/35 hover:bg-accent/10 hover:border-accent/60',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:bg-elevate/6 hover:text-ink',
  danger:
    'bg-signal-critical/15 text-signal-critical border border-signal-critical/40 hover:bg-signal-critical/25',
  subtle:
    'bg-elevate/5 text-ink border border-hairline/10 hover:bg-elevate/10 hover:border-hairline/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Replaces the label while `loading` is true. */
  loadingLabel?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'subtle',
    size = 'md',
    loading = false,
    loadingLabel,
    icon,
    iconRight,
    fullWidth,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden font-medium',
        'transition-all duration-200 ease-mission',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100',
        'active:scale-[0.985]',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : icon}
      {size !== 'icon' && (
        <span className="truncate">{loading && loadingLabel ? loadingLabel : children}</span>
      )}
      {!loading && iconRight}
    </button>
  );
});
