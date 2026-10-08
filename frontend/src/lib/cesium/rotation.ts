import type { CesiumNamespace } from './loader';

/**
 * Slow, self-centred globe rotation that yields to the pointer.
 *
 * This lives in its own module — with no runtime imports at all — so the tick
 * logic can be exercised in Node without a DOM or a WebGL context. That is not
 * architectural purity for its own sake: the rotation has twice been broken by
 * an untested change, once by reading a Cesium property that does not exist
 * (`Clock.deltaTime` — see below). `.tools/rotation-check.mjs` now compiles this
 * file and asserts the behaviour.
 */

/**
 * Default spin speed, radians per second. 2π / 0.012 ≈ 8.7 minutes for a full
 * revolution — slow enough to read the basemap while it turns.
 */
export const DEFAULT_ROTATION_SPEED = 0.05;

/** Upper bound on a single step, so a backgrounded tab does not jump on return. */
const MAX_STEP_SECONDS = 0.1;

export interface AutoRotateOptions {
  /** Rotation speed in radians per second. */
  radiansPerSecond?: number;
  /**
   * Element whose hover state suspends rotation. Defaults to the Cesium canvas.
   *
   * Hovering is the only thing that suspends the spin automatically, and it never
   * touches the caller's on/off intent — so the header play/pause button stays
   * authoritative and cannot end up disagreeing with the globe.
   */
  hoverTarget: HTMLElement;
}

export interface AutoRotateHandle {
  start: () => void;
  stop: () => void;
  /**
   * Suspend rotation for `ms`, or pass `Infinity` to latch it off until the next
   * `start()`. Used so a cinematic `flyTo` is not fought by the spin.
   */
  pauseFor: (ms: number) => void;
  isRunning: () => boolean;
  dispose: () => void;
}

/**
 * Behaviour, in the order the operator meets it:
 *
 *  1. **It turns while the pointer is away from the globe.** `pointerenter` on
 *     the hover target suspends the spin; `pointerleave` resumes it. One listener
 *     pair covers both input families: a mouse enters by hovering without
 *     pressing, a touch enters on contact and leaves when the finger lifts.
 *  2. **Hovering suspends, it never disables.** The on/off intent lives in the
 *     store and belongs to the header button. An earlier revision cleared that
 *     flag on any gesture, which made the play button look broken — it switched
 *     itself off the instant the globe was touched.
 *  3. **The speed is frame-rate independent, measured locally.** The step is the
 *     real elapsed time between ticks. It is NOT read from the clock: Cesium's
 *     `Clock` has no `deltaTime` member in 1.126.0, so an earlier revision took
 *     `undefined`, substituted `0`, hit its own `<= 0` guard and returned on every
 *     single tick. The globe never turned and the play button looked dead. Any
 *     time source used here must be verified against the runtime, not recalled.
 *  4. **It stops when nobody is looking.** A hidden document ticks zero cost.
 *
 * The rotation axis is `Cartesian3.UNIT_Z`, the globe's own polar axis, so the
 * planet turns about its centre while the camera stays put — it does not orbit
 * the camera around the globe.
 */
export function createAutoRotate(
  cesium: CesiumNamespace,
  viewer: any,
  options: AutoRotateOptions,
): AutoRotateHandle {
  const radiansPerSecond = options.radiansPerSecond ?? DEFAULT_ROTATION_SPEED;
  const hoverTarget = options.hoverTarget;

  let tick: (() => void) | null = null;
  let pausedUntil = 0;
  let pointerOverGlobe = false;
  let lastTickMs = 0;
  let disposed = false;

  const onPointerEnter = () => {
    pointerOverGlobe = true;
  };
  const onPointerLeave = () => {
    pointerOverGlobe = false;
  };
  // Touch pointers can be cancelled by the browser (scroll takeover, gesture
  // arbitration). Treat that as leaving, or the globe would stay frozen.
  const onPointerCancel = () => {
    pointerOverGlobe = false;
  };

  hoverTarget.addEventListener('pointerenter', onPointerEnter, { passive: true });
  hoverTarget.addEventListener('pointerleave', onPointerLeave, { passive: true });
  hoverTarget.addEventListener('pointercancel', onPointerCancel, { passive: true });

  return {
    start() {
      if (disposed || tick) return;

      // An explicit start clears any latched pause and restarts the timing base.
      pausedUntil = 0;
      lastTickMs = 0;

      tick = () => {
        if (typeof document !== 'undefined' && document.hidden) return;

        const now = performance.now();

        // Advance the timing base on every tick, even a suppressed one, so that
        // leaving a hover does not produce one oversized step.
        const deltaSeconds =
          lastTickMs === 0 ? 0 : Math.min((now - lastTickMs) / 1000, MAX_STEP_SECONDS);
        lastTickMs = now;

        // The pointer is on the globe: the operator is inspecting something, so
        // hold still until they move away.
        if (pointerOverGlobe) return;
        if (now < pausedUntil) return;
        if (deltaSeconds <= 0) return;

        viewer.camera.rotate(cesium.Cartesian3.UNIT_Z, -radiansPerSecond * deltaSeconds);
      };

      viewer.clock.onTick.addEventListener(tick);
    },

    stop() {
      if (!tick) return;
      viewer.clock.onTick.removeEventListener(tick);
      tick = null;
    },

    pauseFor(ms) {
      pausedUntil = Number.isFinite(ms)
        ? Math.max(pausedUntil, performance.now() + ms)
        : Number.POSITIVE_INFINITY;
    },

    isRunning: () => tick !== null,

    dispose() {
      disposed = true;
      if (tick) {
        viewer.clock.onTick.removeEventListener(tick);
        tick = null;
      }
      hoverTarget.removeEventListener('pointerenter', onPointerEnter);
      hoverTarget.removeEventListener('pointerleave', onPointerLeave);
      hoverTarget.removeEventListener('pointercancel', onPointerCancel);
    },
  };
}
