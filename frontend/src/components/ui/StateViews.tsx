'use client';

import { AlertTriangle, Loader2, RefreshCw, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError } from '@/services';
import { Button } from './Button';

/* -------------------------------------------------------------------------- */
/* Spinner                                                                    */
/* -------------------------------------------------------------------------- */

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center">
      <Loader2 className={cn('h-4 w-4 animate-spin text-accent', className)} aria-hidden />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-lg bg-elevate/6',
        'after:absolute after:inset-0 after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-elevate/8 after:to-transparent',
        className,
      )}
    />
  );
}

/** Skeleton block sized for list rows (events, search results). */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-xl border border-hairline/6 bg-elevate/3 p-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-14 rounded-md" />
          </div>
          <Skeleton className="mt-2 h-3 w-3/5" />
          <Skeleton className="mt-2 h-1.5 w-full" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid-faint flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline/10 text-center',
        compact ? 'gap-1.5 px-3 py-6' : 'gap-2.5 px-6 py-10',
        className,
      )}
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-hairline/10 bg-elevate/5 text-ink-faint">
        {icon ?? <SearchX className="h-4 w-4" strokeWidth={1.8} />}
      </span>
      <p className="text-xs font-semibold text-ink">{title}</p>
      {description && (
        <p className="max-w-[26ch] text-[11px] leading-relaxed text-ink-faint">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Error state                                                                */
/* -------------------------------------------------------------------------- */

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
  title?: string;
}

/**
 * Normalises anything thrown into a readable, actionable panel.
 * Uses the same `ApiError` the service layer produces, so the copy always
 * matches the real failure (offline vs 5xx vs validation).
 */
export function ErrorState({ error, onRetry, className, compact = false, title }: ErrorStateProps) {
  const apiError = ApiError.from(error);

  const heading =
    title ??
    (apiError.isOffline
      ? 'Analysis service unreachable'
      : apiError.isTimeout
        ? 'Request timed out'
        : apiError.isValidation
          ? 'Invalid request'
          : 'Something went wrong');

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-signal-critical/30 bg-signal-critical/8',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-critical" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">{heading}</p>
          <p className="mt-1 break-words text-[11px] leading-relaxed text-ink-muted">
            {apiError.message}
          </p>
          <p className="mt-1.5 telemetry text-[10px] text-ink-faint">code: {apiError.code}</p>

          {onRetry && apiError.isRetryable !== false && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2.5"
              onClick={onRetry}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline loading / success rows                                              */
/* -------------------------------------------------------------------------- */

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-hairline/8 bg-elevate/4 px-3 py-2">
      <Spinner />
      <span className="text-[11px] text-ink-muted">{label}</span>
    </div>
  );
}
