// FE1 Update: 2026-10-06 16:12:45 by Fardin
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  applyBaseLayer,
  createAutoRotate,
  createDoubleClickZoom,
  createPickHandler,
  createViewer,
  DEFAULT_ROTATION_SPEED,
  destroyViewer,
  disableSplitComparison,
  enableSplitComparison,
  flyToBoundingBox,
  flyToLocation,
  flyToPoint,
  loadCesium,
  renderEventEntities,
  upsertSelectionMarker,
  type CesiumNamespace,
} from '@/lib/cesium';
import { registerGlobeController, type GlobeController } from '@/hooks/useMap';
import { clamp, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { DetectedEvent, GeoLocation, LayerType } from '@/types';
import { GlobeTelemetry } from './GlobeTelemetry';

export interface GlobeViewerProps {
  events: DetectedEvent[];
  selectedEventId: string | null;
  hoveredEventId: string | null;
  selectedLocation: GeoLocation | null;
  activeLayer: LayerType;
  autoRotate: boolean;
  comparisonActive: boolean;
  /** Flood-overlay toggle state, driven by the Workspace toolbar. */
  floodMaskActive?: boolean;
  onSelectEvent?: (eventId: string | null) => void;
  onHoverEvent?: (eventId: string | null) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  className?: string;
  /** Overlay chrome rendered above the canvas (top-right menu, etc.). */
  children?: React.ReactNode;
}

type Status = 'loading' | 'ready' | 'error';

/**
 * The 3D globe.
 *
 * React owns the *container*; Cesium owns everything inside it. Props are
 * projected onto the scene through narrow effects so the viewer is created
 * exactly once and never rebuilt on a state change ÃƒÆ’Ã†'Ãƒ"šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡Ãƒ"šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒ"šÃ‚Â rebuilding a WebGL context
 * on every keystroke is the classic way to make a GIS dashboard stutter.
 */
export function GlobeViewer({
  events,
  selectedEventId,
  hoveredEventId,
  selectedLocation,
  activeLayer,
  autoRotate,
  comparisonActive,
  onSelectEvent,
  onHoverEvent,
  onReady,
  onError,
  className,
  children,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  const cesiumRef = useRef<CesiumNamespace | null>(null);
  const disposePickRef = useRef<(() => void) | null>(null);
  const disposeZoomRef = useRef<(() => void) | null>(null);
  const autoRotateRef = useRef<ReturnType<typeof createAutoRotate> | null>(null);

  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Passed to the telemetry HUD once the viewer exists.
  const [viewerHandle, setViewerHandle] = useState<unknown>(null);

  // Callbacks are read through a ref so prop identity changes never remount the
  // viewer.
  const callbacks = useRef({ onSelectEvent, onHoverEvent, onReady, onError });
  callbacks.current = { onSelectEvent, onHoverEvent, onReady, onError };

  /* ------------------------------------------------------------------ */
  /* 1. Create / destroy the viewer                                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');
    setFailure(null);

    const boot = async () => {
      try {
        const cesium = await loadCesium();
        if (cancelled || !containerRef.current) return;

        const viewer = createViewer(cesium, containerRef.current, {
          shouldAnimate: true,
          lighting: false,
        });

        cesiumRef.current = cesium;
        viewerRef.current = viewer;

        // Pick handling is created once and routes through the callback ref.
        try {
          disposePickRef.current = createPickHandler(cesium, viewer, {
            onSelect: (id) => callbacks.current.onSelectEvent?.(id),
            onHover: (id) => callbacks.current.onHoverEvent?.(id),
          });
        } catch (error) {
          console.warn('[globe] entity picking unavailable', error);
        }

        // Double-click / double-tap zooms in. Pinch and wheel zoom are Cesium's
        // own screen-space controller; a second handler would double the step.
        //
        // Guarded on purpose: naming a Cesium member that does not exist must not
        // take the whole globe down with it, which is exactly what happened when
        // this file used a renamed enum.
        try {
          disposeZoomRef.current = createDoubleClickZoom(cesium, viewer);
        } catch (error) {
          console.warn('[globe] double-click zoom unavailable', error);
          disposeZoomRef.current = null;
        }

        // Auto-rotation. Hovering the globe suspends it; whether it runs at all
        // is the store flag, owned by the header play/pause button.
        autoRotateRef.current = createAutoRotate(cesium, viewer, {
          hoverTarget: viewer.scene.canvas,
        });

        registerGlobeController(buildController());
        setViewerHandle(viewer);
        setStatus('ready');
        callbacks.current.onReady?.();

        // One diagnostic line, no UI cost. If something stops working, this says
        // which input bindings the live controller actually ended up with, so a
        // report can be diagnosed instead of guessed at.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const liveController = (viewer as any).scene.screenSpaceCameraController;
        console.info('[earth-metamorphosis] globe ready', {
          splitDirection: Boolean(cesium.SplitDirection),
          doubleClickZoom: Boolean(disposeZoomRef.current),
          rotationRadPerSecond: DEFAULT_ROTATION_SPEED,
          zoom: {
            enabled: liveController.enableZoom,
            minimumZoomDistance: liveController.minimumZoomDistance,
            maximumZoomDistance: liveController.maximumZoomDistance,
            // 0 LEFT_DRAG ÃƒÆ’Ã†'ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"šÃ‚· 1 RIGHT_DRAG ÃƒÆ’Ã†'ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"šÃ‚· 2 MIDDLE_DRAG ÃƒÆ’Ã†'ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"šÃ‚· 3 WHEEL ÃƒÆ’Ã†'ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"šÃ‚· 4 PINCH
            eventTypes: liveController.zoomEventTypes,
            cameraHeightMetres: Math.round(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (viewer as any).camera.positionCartographic.height,
            ),
          },
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : 'The Cesium runtime failed to initialise.';
        setFailure(message);
        setStatus('error');
        callbacks.current.onError?.(message);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      registerGlobeController(null);
      disposePickRef.current?.();
      disposePickRef.current = null;
      disposeZoomRef.current?.();
      disposeZoomRef.current = null;
      autoRotateRef.current?.dispose();
      autoRotateRef.current = null;

      if (viewerRef.current) destroyViewer(viewerRef.current);
      viewerRef.current = null;
      cesiumRef.current = null;
      setViewerHandle(null);
    };
    // `buildController` closes over refs only, so it is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  /* ------------------------------------------------------------------ */
  /* 2. Project props onto the live scene                                */
  /* ------------------------------------------------------------------ */

  // Basemap
  useEffect(() => {
    if (status !== 'ready' || !cesiumRef.current || !viewerRef.current) return;
    applyBaseLayer(cesiumRef.current, viewerRef.current, activeLayer);
  }, [activeLayer, status]);

  // Before/after split
  useEffect(() => {
    if (status !== 'ready' || !cesiumRef.current || !viewerRef.current) return;

    if (comparisonActive) {
      enableSplitComparison(cesiumRef.current, viewerRef.current);
    } else {
      disableSplitComparison(cesiumRef.current, viewerRef.current);
    }
  }, [comparisonActive, status]);

  // Selected AOI marker
  useEffect(() => {
    if (status !== 'ready' || !cesiumRef.current || !viewerRef.current) return;
    upsertSelectionMarker(cesiumRef.current, viewerRef.current, selectedLocation);
  }, [selectedLocation, status]);

  // Event footprints
  useEffect(() => {
    if (status !== 'ready' || !cesiumRef.current || !viewerRef.current) return;
    renderEventEntities(cesiumRef.current, viewerRef.current, events, {
      selectedId: selectedEventId,
      hoveredId: hoveredEventId,
    });
  }, [events, selectedEventId, hoveredEventId, status]);

  // Auto-rotation
  useEffect(() => {
    if (status !== 'ready' || !autoRotateRef.current) return;
    if (autoRotate) autoRotateRef.current.start();
    else autoRotateRef.current.stop();
  }, [autoRotate, status]);

  /* ------------------------------------------------------------------ */
  /* 3. Imperative controller exposed to the rest of the app             */
  /* ------------------------------------------------------------------ */

  const buildController = useCallback((): GlobeController => {
    const withViewer = (fn: (cesium: CesiumNamespace, viewer: unknown) => void) => {
      const cesium = cesiumRef.current;
      const viewer = viewerRef.current;
      if (!cesium || !viewer) return;
      fn(cesium, viewer);
    };

    /**
     * Suspend the idle spin for the duration of a cinematic flight.
     *
     * This is a *temporary* suspension, never an intent change: the store flag is
     * the operator's alone, and hovering already pauses the spin on its own.
     * Without it a `flyTo` and the rotation fight each other and the camera drifts
     * off the AOI it was just sent to.
     */
    const moveCamera = (
      fn: (cesium: CesiumNamespace, viewer: unknown) => void,
      flightMs = 2_600,
    ) => {
      autoRotateRef.current?.pauseFor(flightMs);
      withViewer(fn);
    };

    return {
      flyToLocation: (location, duration) =>
        moveCamera((cesium, viewer) => flyToLocation(cesium, viewer, location, duration)),

      flyToPoint: (lat, lng, altitude, duration) =>
        moveCamera((cesium, viewer) => flyToPoint(cesium, viewer, lat, lng, altitude, duration)),

      flyToBoundingBox: (bbox, duration) =>
        moveCamera((cesium, viewer) => flyToBoundingBox(cesium, viewer, bbox, duration)),

      focusEvent: (event) => {
        // Frame the footprint: small events need a close look, large ones a
        // regional view. sqrt keeps the mapping perceptually linear.
        const altitude = clamp(12_000 + Math.sqrt(event.areaKm2) * 9_000, 12_000, 900_000);
        moveCamera((cesium, viewer) =>
          flyToPoint(cesium, viewer, event.location.lat, event.location.lng, altitude, 1.8),
        );
      },

      setSplitPosition: (ratio) =>
        withViewer((_cesium, viewer) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (viewer as any).scene.splitPosition = clamp(ratio, 0, 1);
        }),

      supportsSplit: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scene = (viewerRef.current as any)?.scene;
        return Boolean(scene) && 'splitPosition' in scene;
      },

      captureCanvas: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const canvas = (viewerRef.current as any)?.scene?.canvas as HTMLCanvasElement | undefined;
          return canvas ? canvas.toDataURL('image/png') : null;
        } catch {
          return null;
        }
      },

      getScene: () => viewerRef.current?.scene ?? null,
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* 4. Render                                                           */
  /* ------------------------------------------------------------------ */

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-space-950', className)}>
      {/* Cesium mounts here. */}
      <div ref={containerRef} className="cesium-host absolute inset-0" aria-hidden />

      {/* Vignette + top gradient keep the chrome readable over bright imagery.
          Themed in CSS, because in light mode a heavy dark vignette looks wrong. */}
      <div className="globe-vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-space-950/85 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-space-950/80 to-transparent" />

      {/* Loading */}
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-space-950/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative grid h-20 w-20 place-items-center">
              <span className="absolute h-20 w-20 animate-pulse-ring rounded-full border border-accent/40" />
              <span className="absolute h-14 w-14 rounded-full border border-accent/25" />
              <span className="h-9 w-9 animate-spin-slow rounded-full border-2 border-accent/70 border-t-transparent" />
              <span className="absolute h-2.5 w-2.5 rounded-full bg-accent shadow-glow-accent" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Initialising globe
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                Loading the Cesium runtime and imagery pipelineÃƒÆ’Ã†'Ãƒ"šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡Ãƒ"šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒ"šÃ‚Â¦
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Failure */}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-space-950/92 p-6">
          <div className="max-w-md rounded-2xl border border-signal-critical/35 bg-space-900/90 p-5 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-signal-critical/40 bg-signal-critical/10 text-signal-critical">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-ink">Globe unavailable</h3>
            <p className="mt-1.5 break-words text-[11px] leading-relaxed text-ink-muted">
              {failure}
            </p>
            <p className="mt-2 text-[10px] text-ink-faint">
              The rest of the console stays usable ÃƒÆ’Ã†'Ãƒ"šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢"šÂ¬Ã…Â¡Ãƒ"šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒ"šÃ‚Â panels, filters and analysis all work without
              the 3D view.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry globe
            </Button>
          </div>
        </div>
      )}

      {/* HUD */}
      {status === 'ready' && (
        <>
          <div className="pointer-events-none absolute bottom-4 left-4 z-chrome">
            <GlobeTelemetry viewer={viewerHandle} />
          </div>

          {children}
        </>
      )}
    </div>
  );
}
