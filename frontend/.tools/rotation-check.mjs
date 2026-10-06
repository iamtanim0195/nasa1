// Behavioural test for the globe's auto-rotation.
//
// Compiles src/lib/cesium/rotation.ts to CommonJS (it has no runtime imports, so
// the output is standalone) and drives it with a fake Cesium viewer. This is the
// check that was missing when the rotation silently stopped working: the tick
// read `clock.deltaTime`, Cesium 1.126 has no such member, and every tick hit its
// own `deltaSeconds <= 0` guard.
//
//   node .tools/rotation-check.mjs
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/..." which
// require() cannot resolve.
const COMPILED = fileURLToPath(new URL('./.tmp/rotation.js', import.meta.url));

if (!existsSync(COMPILED)) {
  console.error('compiled module missing — run:');
  console.error(
    '  npx tsc src/lib/cesium/rotation.ts --outDir .tools/.tmp --target es2022 --module commonjs --lib es2022,dom --skipLibCheck',
  );
  process.exit(2);
}

const { createAutoRotate, DEFAULT_ROTATION_SPEED } = require(COMPILED);

/* -------------------------------------------------------------------------- */
/* Time control                                                               */
/* -------------------------------------------------------------------------- */

let now = 1_000;
Object.defineProperty(globalThis, 'performance', {
  value: { now: () => now },
  configurable: true,
  writable: true,
});

/* -------------------------------------------------------------------------- */
/* Fake Cesium                                                                */
/* -------------------------------------------------------------------------- */

const cesium = { Cartesian3: { UNIT_Z: 'UNIT_Z' } };

function harness() {
  const listeners = new Map();
  const rotateCalls = [];
  let onTick = null;

  const hoverTarget = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };

  const viewer = {
    camera: {
      rotate: (axis, angle) => rotateCalls.push({ axis, angle }),
    },
    clock: {
      onTick: {
        addEventListener: (fn) => {
          onTick = fn;
        },
        removeEventListener: () => {
          onTick = null;
        },
      },
    },
  };

  return {
    hoverTarget,
    viewer,
    rotateCalls,
    fire: (type) => listeners.get(type)?.(),
    tick: (times = 1) => {
      for (let i = 0; i < times; i += 1) onTick?.();
    },
    tickInstalled: () => onTick !== null,
  };
}

/* -------------------------------------------------------------------------- */
/* Assertions                                                                 */
/* -------------------------------------------------------------------------- */

let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  ${status}  ${label}${detail ? `  (${detail})` : ''}`);
}

function approx(a, b, epsilon = 1e-9) {
  return Math.abs(a - b) < epsilon;
}

console.log('auto-rotation behaviour\n');

/* 1. It turns, at the configured rate, with the correct axis and direction. */
{
  now = 1_000;
  const h = harness();
  const handle = createAutoRotate(cesium, h.viewer, { hoverTarget: h.hoverTarget });
  handle.start();

  check('start() installs the tick listener', h.tickInstalled());

  h.tick(); // first tick establishes the time base
  check('first tick only establishes the time base', h.rotateCalls.length === 0);

  now += 100; // exactly 100 ms
  h.tick();

  check('second tick rotates', h.rotateCalls.length === 1);
  const call = h.rotateCalls[0];
  check('axis is the globe polar axis', call?.axis === 'UNIT_Z', String(call?.axis));
  check(
    'angle is speed x elapsed, negative (eastward spin)',
    approx(call?.angle, -DEFAULT_ROTATION_SPEED * 0.1),
    `${call?.angle} vs ${-DEFAULT_ROTATION_SPEED * 0.1}`,
  );

  /* 2. Hovering suspends the spin without stopping the feature. */
  h.fire('pointerenter');
  now += 100;
  h.tick();
  check('pointerenter suspends the spin', h.rotateCalls.length === 1);

  h.fire('pointerleave');
  now += 100;
  h.tick();
  check('pointerleave resumes the spin', h.rotateCalls.length === 2);

  /* 3. A cancelled touch pointer is treated as leaving. */
  h.fire('pointerenter');
  now += 100;
  h.tick();
  const beforeCancel = h.rotateCalls.length;
  h.fire('pointercancel');
  now += 100;
  h.tick();
  check('pointercancel resumes the spin', h.rotateCalls.length === beforeCancel + 1);

  /* 4. stop() really stops. */
  handle.stop();
  now += 100;
  h.tick();
  const afterStop = h.rotateCalls.length;
  now += 100;
  h.tick();
  check('stop() halts rotation', h.rotateCalls.length === afterStop);
  check('stop() removes the tick listener', !h.tickInstalled());
}

/* 5. pauseFor() holds the spin for a flight, then lets it go. */
{
  now = 5_000;
  const h = harness();
  const handle = createAutoRotate(cesium, h.viewer, { hoverTarget: h.hoverTarget });
  handle.start();
  h.tick();
  now += 100;
  h.tick();
  const base = h.rotateCalls.length;

  handle.pauseFor(1_000);
  now += 100;
  h.tick();
  check('pauseFor() suppresses rotation', h.rotateCalls.length === base);

  now += 1_000;
  h.tick();
  check('rotation returns after the pause expires', h.rotateCalls.length === base + 1);
}

/* 6. A long gap is clamped, so a backgrounded tab cannot jump the camera. */
{
  now = 20_000;
  const h = harness();
  const handle = createAutoRotate(cesium, h.viewer, { hoverTarget: h.hoverTarget });
  handle.start();
  h.tick();
  now += 5_000; // five seconds away
  h.tick();
  const angle = h.rotateCalls[0]?.angle;
  check(
    'a 5 s gap is clamped to a 0.1 s step',
    approx(angle, -DEFAULT_ROTATION_SPEED * 0.1),
    String(angle),
  );
}

/* 7. dispose() detaches the hover listeners. */
{
  const h = harness();
  const handle = createAutoRotate(cesium, h.viewer, { hoverTarget: h.hoverTarget });
  handle.dispose();
  check('dispose() detaches pointerenter', h.fire('pointerenter') === undefined);
  handle.start();
  check('start() after dispose() is a no-op', !h.tickInstalled());
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
