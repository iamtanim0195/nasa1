'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn, toIsoDate } from '@/lib/utils';

export interface DateFieldProps {
  label: string;
  /** ISO `yyyy-MM-dd`, or null when unset. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Inclusive ISO bounds. */
  min?: string;
  max?: string;
  className?: string;
  /** Shown under the field, e.g. "must be before the After date". */
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Calendar popup.
 *
 * Implemented in-house rather than pulled from a date-picker dependency: the
 * component has to sit inside a glass panel on a dark globe, respect ISO-only
 * wire formats, and support inclusive min/max windows that the backend will
 * enforce anyway. A ~150-line component beats a dependency here.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  className,
  hint,
  error,
  disabled,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => toDate(value) ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => toDate(value), [value]);
  const minDate = useMemo(() => toDate(min), [min]);
  const maxDate = useMemo(() => toDate(max), [max]);

  // Follow external value changes (e.g. range validation correcting a field).
  useEffect(() => {
    const next = toDate(value);
    if (next) setViewMonth(next);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const isDisabledDay = (day: Date) => {
    if (minDate && isBefore(day, minDate) && !isSameDay(day, minDate)) return true;
    if (maxDate && isAfter(day, maxDate) && !isSameDay(day, maxDate)) return true;
    return false;
  };

  const selectDay = (day: Date) => {
    if (isDisabledDay(day)) return;
    onChange(toIsoDate(day));
    setOpen(false);
  };

  const today = new Date();

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
        {label}
      </span>

      {/* Trigger */}
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-xl border bg-sunken px-2.5 transition-colors',
          error
            ? 'border-signal-critical/50'
            : open
              ? 'border-accent/55'
              : 'border-hairline/12 hover:border-accent/30',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((state) => !state)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${value ?? 'not set'}`}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          <span
            className={cn(
              'telemetry truncate text-[11.5px]',
              value ? 'text-ink' : 'text-ink-faint',
            )}
          >
            {value ?? 'Select date'}
          </span>
        </button>

        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label}`}
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-elevate/8 hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Popup */}
      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute left-0 top-[calc(100%+6px)] z-chrome w-[17.5rem] rounded-xl border border-accent/25 bg-space-900/97 p-3 shadow-glass backdrop-blur-xl"
        >
          {/* Month navigation */}
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((month) => subMonths(month, 1))}
              aria-label="Previous month"
              className="rounded-lg border border-hairline/10 p-1.5 text-ink-muted transition-colors hover:border-accent/35 hover:text-accent"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="telemetry text-[11.5px] font-semibold text-ink">
              {format(viewMonth, 'MMMM yyyy')}
            </span>

            <button
              type="button"
              onClick={() => setViewMonth((month) => addMonths(month, 1))}
              aria-label="Next month"
              className="rounded-lg border border-hairline/10 p-1.5 text-ink-muted transition-colors hover:border-accent/35 hover:text-accent"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className="grid h-6 place-items-center text-[9px] font-semibold uppercase tracking-wider text-ink-faint"
              >
                {day}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const outside = !isSameMonth(day, viewMonth);
              const isSelected = selected ? isSameDay(day, selected) : false;
              const isToday = isSameDay(day, today);
              const blocked = isDisabledDay(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={blocked}
                  onClick={() => selectDay(day)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    'grid h-7 place-items-center rounded-lg telemetry text-[11px] transition-colors',
                    outside && 'text-ink-faint/50',
                    !outside && !isSelected && 'text-ink-muted hover:bg-elevate/8 hover:text-ink',
                    isSelected && 'bg-accent/20 font-semibold text-accent ring-1 ring-accent/50',
                    isToday && !isSelected && 'ring-1 ring-hairline/15',
                    blocked && 'cursor-not-allowed text-ink-faint/30 hover:bg-transparent',
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-hairline/8 pt-2.5">
            <button
              type="button"
              onClick={() => {
                onChange(toIsoDate(today));
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-accent/10"
            >
              Today
            </button>

            {value && (
              <span className="telemetry text-[10px] text-ink-faint">
                {format(parseISO(value), 'EEE, dd MMM yyyy')}
              </span>
            )}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-1 text-[10px] text-signal-critical">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[10px] text-ink-faint">{hint}</p>
      )}
    </div>
  );
}
