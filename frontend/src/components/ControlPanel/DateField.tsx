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
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string;
  max?: string;
  className?: string;
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
  const [inputText, setInputText] = useState(value ?? '');
  const [viewMonth, setViewMonth] = useState<Date>(() => toDate(value) ?? new Date(2026, 5, 1));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => toDate(value), [value]);
  const minDate = useMemo(() => toDate(min), [min]);
  const maxDate = useMemo(() => toDate(max), [max]);

  // Sync input text when value changes externally
  useEffect(() => {
    setInputText(value ?? '');
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

  // Handle manual typing: "2026-06-25" or "20260625" or "25/06/2026"
  const handleInputBlur = () => {
    const raw = inputText.trim();
    if (!raw) {
      onChange(null);
      return;
    }

    // Try to parse various formats
    let parsed: Date | null = null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      parsed = parseISO(raw);
    }
    // YYYYMMDD
    else if (/^\d{8}$/.test(raw)) {
      const y = raw.slice(0, 4);
      const m = raw.slice(4, 6);
      const d = raw.slice(6, 8);
      parsed = parseISO(`${y}-${m}-${d}`);
    }
    // DD/MM/YYYY
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [d, m, y] = raw.split('/');
      parsed = parseISO(`${y}-${m}-${d}`);
    }
    // MM/DD/YYYY
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
      const [m, d, y] = raw.split('/');
      parsed = parseISO(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    }

    if (parsed && !Number.isNaN(parsed.getTime())) {
      const iso = toIsoDate(parsed);
      onChange(iso);
      setViewMonth(parsed);
    } else {
      // Invalid — reset to current value
      setInputText(value ?? '');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputBlur();
    }
    if (e.key === 'Escape') {
      setInputText(value ?? '');
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
        {label}
      </span>

      {/* Trigger with editable input */}
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
        {/* Calendar icon button (opens calendar) */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((state) => !state)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Open calendar for ${label}`}
          className="shrink-0 text-ink-faint hover:text-accent"
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden />
        </button>

        {/* Editable text input */}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="YYYY-MM-DD"
          className="telemetry h-full min-w-0 flex-1 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-faint/50"
        />

        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setInputText('');
            }}
            aria-label={`Clear ${label}`}
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-elevate/8 hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Popup calendar */}
      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute left-0 top-[calc(100%+6px)] z-chrome w-[17.5rem] rounded-xl border border-accent/25 bg-space-900/97 p-3 shadow-glass backdrop-blur-xl"
        >
          {/* Quick year/month jumps */}
          <div className="mb-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                const d = new Date(2026, 5, 25); // June 25, 2026
                onChange(toIsoDate(d));
                setOpen(false);
              }}
              className="rounded border border-hairline/10 px-1.5 py-0.5 text-[9px] text-ink-muted hover:border-accent/40 hover:text-accent"
            >
              Jun 2026
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(2026, 8, 30); // Sept 30, 2026
                onChange(toIsoDate(d));
                setOpen(false);
              }}
              className="rounded border border-hairline/10 px-1.5 py-0.5 text-[9px] text-ink-muted hover:border-accent/40 hover:text-accent"
            >
              Sep 2026
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(2026, 11, 31); // Dec 31, 2026
                onChange(toIsoDate(d));
                setOpen(false);
              }}
              className="rounded border border-hairline/10 px-1.5 py-0.5 text-[9px] text-ink-muted hover:border-accent/40 hover:text-accent"
            >
              Dec 2026
            </button>
          </div>

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