'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, MoveHorizontal, X } from 'lucide-react';
import { COMPARISON_BASEMAPS } from '@/lib/constants';
import { clamp, cn } from '@/lib/utils';
import { useMap } from '@/hooks/useMap';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export interface ComparisonSliderProps {
  active: boolean;
  onClose: () => void;
  /** Initial divider position, 0..1. */
  initialPosition?: number;
  className?: string;
}

/**
 * Full-screen before/after comparison.
 *
 * This is NOT two synchronised maps. Cesium renders the globe once and we
 * assign each imagery layer a `splitDirection` (LEFT / RIGHT) plus a single
 * `scene.splitPosition`. The consequences are worth stating explicitly:
 *
 *   - one WebGL context instead of two (half the GPU memory, half the tiles)
 *   - the two halves can never drift: same camera, same frame, same projection
 *   - moving the handle is one uniform write per frame, so it stays at 60 fps
 *     even on integrated graphics
 *
 * The component itself is therefore just chrome: a divider, labels and pointer
 * handling. All the pixels come from the globe underneath.
 */
export function ComparisonSlider({
  active,
  onClose,
  initialPosition = 0.5,
  className,
}: ComparisonSliderProps) {
  const [position, setPosition] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { setSplitPosition, controller } = useMap();

  /* Keep the scene in sync with the divider. */
  useEffect(() => {
    if (!active) return;
    setSplitPosition(position);
  }, [active, position, setSplitPosition]);

  /* Reset to the middle each time comparison mode is entered. */
  useEffect(() => {
    if (active) setPosition(initialPosition);
  }, [active, initialPosition]);

  /* Escape closes. */
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setPosition((value) => clamp(value - 0.02, 0, 1));
      if (event.key === 'ArrowRight') setPosition((value) => clamp(value + 0.02, 0, 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onClose]);

  const updateFromClientX = useCallback((clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clamp((clientX - rect.left) / rect.width, 0, 1));
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only react to the primary button / a direct touch.
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromClientX(event.clientX);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  if (!active) return null;

  const splitSupported = controller?.supportsSplit() ?? false;

  return (
    <div
      ref={rootRef}
      role="slider"
      aria-label="Before and after comparison divider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position * 100)}
      aria-orientation="horizontal"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'fixed inset-0 z-slider select-none touch-none',
        dragging ? 'cursor-ew-resize' : 'cursor-crosshair',
        className,
      )}
    >
      {/* ---- Divider ---- */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{ left: `${position * 100}%` }}
      >
        <div
          className={cn(
            'absolute inset-y-0 -left-px w-0.5 bg-accent transition-shadow duration-200',
            dragging ? 'shadow-[0_0_28px_6px_rgba(39,201,255,0.75)]' : 'shadow-glow-accent',
          )}
        />

        {/* Grab handle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className={cn(
              'grid h-14 w-14 place-items-center rounded-full border-2 border-accent/80 bg-space-950/90 backdrop-blur-md transition-transform duration-200',
              dragging ? 'scale-110' : 'hover:scale-105',
            )}
          >
            <MoveHorizontal className="h-5 w-5 text-accent" />
          </div>
          {/* Concentric pulse makes the handle findable on a busy basemap. */}
          <span className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-full border border-accent/50" />
        </div>

        {/* Position readout */}
        <span className="telemetry absolute left-1/2 top-[calc(50%+48px)] -translate-x-1/2 whitespace-nowrap rounded-md border border-accent/30 bg-space-950/85 px-2 py-0.5 text-[10px] text-accent">
          {(position * 100).toFixed(0)}%
        </span>
      </div>

      {/* ---- Corner labels ---- */}
      <div className="pointer-events-none absolute left-4 top-20 flex flex-col gap-1.5">
        <Badge tone="neutral" className="w-fit bg-space-950/80 backdrop-blur-md">
          <ArrowLeftRight className="h-2.5 w-2.5" />
          Before
        </Badge>
        <span className="rounded-md border border-hairline/10 bg-space-950/80 px-2 py-0.5 text-[10px] text-ink-muted backdrop-blur-md">
          {COMPARISON_BASEMAPS.before.label}
        </span>
      </div>

      <div className="pointer-events-none absolute right-4 top-20 flex flex-col items-end gap-1.5">
        <Badge tone="accent" className="w-fit bg-space-950/80 backdrop-blur-md">
          <ArrowLeftRight className="h-2.5 w-2.5" />
          After
        </Badge>
        <span className="rounded-md border border-hairline/10 bg-space-950/80 px-2 py-0.5 text-[10px] text-ink-muted backdrop-blur-md">
          {COMPARISON_BASEMAPS.after.label}
        </span>
      </div>

      {/* ---- Controls ---- */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-hairline/10 bg-space-950/88 px-3 py-2 backdrop-blur-xl">
          <span className="hidden text-[10px] text-ink-faint sm:block">
            Drag or use ← → · Esc to exit
          </span>
          <Button
            size="sm"
            variant="outline"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={onClose}
          >
            Exit comparison
          </Button>
        </div>
      </div>

      {/* ---- Degraded notice ---- */}
      {!splitSupported && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-16">
          <p className="rounded-lg border border-signal-medium/35 bg-space-950/90 px-3 py-1.5 text-[10px] text-signal-medium">
            This browser&apos;s WebGL context does not expose split rendering — both layers are
            shown blended.
          </p>
        </div>
      )}

      {/* Drag affordance hint on first entry. */}
      {!dragging && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 animate-pulse-ring rounded-full border border-accent/40" />
      )}
    </div>
  );
}
