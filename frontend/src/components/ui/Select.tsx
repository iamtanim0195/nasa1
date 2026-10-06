'use client';

import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  label?: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  hint?: string;
  /** Overrides the native arrow with our own, for consistent dark styling. */
  placeholder?: string;
}

/**
 * Native `<select>` under the hood.
 *
 * A custom listbox would look marginally better but breaks mobile pickers,
 * keyboard type-ahead and form autofill — all of which matter in the field.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  hint,
  placeholder,
}: SelectProps<T>) {
  const id = useId();

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className={cn(
            'h-10 w-full appearance-none rounded-xl border border-hairline/12 bg-sunken pl-3 pr-9',
            'text-xs text-ink transition-colors',
            'hover:border-accent/35 focus:border-accent/60 focus:outline-none',
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
      </div>

      {hint && <p className="mt-1 text-[10px] text-ink-faint">{hint}</p>}
    </div>
  );
}
