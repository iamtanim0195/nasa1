'use client';

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Renders a small count on the right of the label. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Accessible name for the group. */
  ariaLabel: string;
  fullWidth?: boolean;
}

/**
 * Radio-group styled as a segmented control (used for chart type, layers).
 * Uses real radio semantics so keyboard/screen-reader users get the right
 * interaction model for free.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  ariaLabel,
  fullWidth = true,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex gap-1 rounded-xl border border-hairline/8 bg-sunken p-1',
        fullWidth && 'w-full',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg font-medium',
              'transition-all duration-200 ease-mission',
              size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-9 px-2.5 text-xs',
              active
                ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgba(39,201,255,0.35)]'
                : 'text-ink-muted hover:bg-elevate/6 hover:text-ink',
              option.disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
            {typeof option.count === 'number' && (
              <span
                className={cn(
                  'telemetry ml-0.5 rounded px-1 text-[10px]',
                  active ? 'bg-accent/20 text-accent' : 'bg-elevate/8 text-ink-faint',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
