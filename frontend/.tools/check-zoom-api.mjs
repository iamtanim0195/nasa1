// Probes the exact zoom-related API in the shipped Cesium 1.126.0 definitions.
// Written after two bugs came from recalling member names instead of checking
// them: `Clock.deltaTime` and `ImagerySplitDirection` both do not exist.
const dts = await fetch('https://cdn.jsdelivr.net/npm/cesium@1.126.0/Source/Cesium.d.ts').then(
  (r) => r.text(),
);

function occurrences(token) {
  return dts.split(token).length - 1;
}

console.log('--- token counts ---');
for (const token of [
  'CameraEventType',
  'zoomEventTypes',
  'rotateEventTypes',
  'tiltEventTypes',
  'translateEventTypes',
  'enableZoom',
  'enableRotate',
  'minimumZoomDistance',
  'maximumZoomDistance',
  'zoomIn',
  'zoomOut',
  'WHEEL',
  'PINCH',
  'RIGHT_DRAG',
  'LEFT_DRAG',
  'MIDDLE_DRAG',
]) {
  console.log(`  ${token.padEnd(24)} ${occurrences(token)}`);
}

function block(label, pattern, limit = 900) {
  const match = pattern.exec(dts);
  console.log(`\n--- ${label} ---`);
  console.log(match ? match[0].slice(0, limit) : '  NOT FOUND');
}

block(
  'CameraEventType declaration',
  /(?:declare )?(?:namespace |enum |const )CameraEventType[\s\S]{0,600}?(?=\n(?:declare |export |\/\*\*|\n))/,
);

block('zoomEventTypes property', /zoomEventTypes\s*:\s*[^;]+;/);

block('Camera.zoomIn signature', /zoomIn\s*\([^)]*\)\s*:\s*void;/);

block('enableZoom property', /enableZoom\s*:\s*boolean;/);
