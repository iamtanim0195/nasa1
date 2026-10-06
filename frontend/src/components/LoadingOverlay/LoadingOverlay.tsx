'use client';

import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { ProgressBar } from '@/components/ui/ProgressBar';

export interface LoadingOverlayProps {
  className?: string;
}

/**
 * Blocking operation overlay.
 *
 * Driven by `appStore.overlay` rather than local state so that long operations
 * started in one panel (ingest, analysis) keep the whole console coherent —
 * including when the user navigates to the Analyze route mid-job.
 */
export function LoadingOverlay({ className }: LoadingOverlayProps) {
  const overlay = useAppStore((state) => state.overlay);
  const hideOverlay = useAppStore((state) => state.hideOverlay);

  /* Escape always escapes a blocking overlay. */
  useEffect(() => {
    if (!overlay.visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideOverlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlay.visible, hideOverlay]);

  if (!overlay.visible) return null;

  const determinate = typeof overlay.progress === 'number';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={overlay.message}
      className={cn(
        'fixed inset-0 z-overlay grid place-items-center bg-space-950/82 backdrop-blur-md',
        className,
      )}
    >
      <div className="relative w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-accent/30 bg-space-900/95 p-6 shadow-glass">
        {/* Sweeping scanline */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="scanline" />
        </div>

        <div className="relative flex flex-col items-center gap-4 text-center">
          {/* Orbital spinner */}
          <div className="relative grid h-16 w-16 place-items-center">
            <span className="absolute h-16 w-16 animate-pulse-ring rounded-full border border-accent/35" />
            <span className="absolute h-11 w-11 rounded-full border border-accent/25" />
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">{overlay.message}</p>
            {overlay.detail && (
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{overlay.detail}</p>
            )}
          </div>

          {determinate ? (
            <ProgressBar value={overlay.progress ?? 0} label="Progress" active />
          ) : (
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-elevate/8">
              <div className="absolute inset-y-0 w-1/3 animate-shimmer rounded-full bg-accent-sweep" />
            </div>
          )}

          <button
            type="button"
            onClick={hideOverlay}
            className="inline-flex items-center gap-1 text-[10px] text-ink-faint transition-colors hover:text-ink"
          >
            <X className="h-3 w-3" /> Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
