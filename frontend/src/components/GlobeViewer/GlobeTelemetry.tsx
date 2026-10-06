'use client';

import { useEffect, useRef } from 'react';

/**
 * Live camera readout.
 *
 * Deliberately writes straight to the DOM on an interval instead of using
 * React state: the camera changes 60×/second and re-rendering the tree for a
 * text readout would be the single most expensive thing in the dashboard.
 */
export function GlobeTelemetry({ viewer }: { viewer: unknown }) {
  const latRef = useRef<HTMLSpanElement>(null);
  const lngRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const headingRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!viewer) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = viewer as any;
    const Cesium = typeof window !== 'undefined' ? window.Cesium : undefined;

    const update = () => {
      try {
        if (instance.isDestroyed?.()) return;

        const carto = instance.camera.positionCartographic;
        const toDegrees =
          Cesium?.Math?.toDegrees ?? ((radians: number) => (radians * 180) / Math.PI);

        const lat = toDegrees(carto.latitude);
        const lng = toDegrees(carto.longitude);
        const altKm = carto.height / 1000;
        const heading = toDegrees(instance.camera.heading);

        if (latRef.current) {
          latRef.current.textContent = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`;
        }
        if (lngRef.current) {
          lngRef.current.textContent = `${Math.abs(lng).toFixed(3)}°${lng >= 0 ? 'E' : 'W'}`;
        }
        if (altRef.current) {
          altRef.current.textContent =
            altKm >= 1000 ? `${(altKm / 1000).toFixed(2)}k km` : `${altKm.toFixed(1)} km`;
        }
        if (headingRef.current) {
          headingRef.current.textContent = `${Math.round((heading + 360) % 360)
            .toString()
            .padStart(3, '0')}°`;
        }
      } catch {
        /* viewer torn down mid-tick */
      }
    };

    update();
    const timer = window.setInterval(update, 220);
    return () => window.clearInterval(timer);
  }, [viewer]);

  return (
    <dl className="pointer-events-none flex items-center gap-3 rounded-lg border border-hairline/8 bg-space-950/70 px-2.5 py-1.5 backdrop-blur-md">
      <div className="flex items-center gap-1">
        <dt className="text-[9px] uppercase tracking-wider text-ink-faint">LAT</dt>
        <dd ref={latRef} className="telemetry text-[10px] text-ink-muted">
          —
        </dd>
      </div>
      <div className="flex items-center gap-1">
        <dt className="text-[9px] uppercase tracking-wider text-ink-faint">LON</dt>
        <dd ref={lngRef} className="telemetry text-[10px] text-ink-muted">
          —
        </dd>
      </div>
      <div className="flex items-center gap-1">
        <dt className="text-[9px] uppercase tracking-wider text-ink-faint">ALT</dt>
        <dd ref={altRef} className="telemetry text-[10px] text-ink-muted">
          —
        </dd>
      </div>
      <div className="hidden items-center gap-1 sm:flex">
        <dt className="text-[9px] uppercase tracking-wider text-ink-faint">HDG</dt>
        <dd ref={headingRef} className="telemetry text-[10px] text-ink-muted">
          —
        </dd>
      </div>
    </dl>
  );
}
