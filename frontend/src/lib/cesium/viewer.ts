/* eslint-disable @typescript-eslint/no-explicit-any */
import { COMPARISON_BASEMAPS, LAYER_MAP } from '@/lib/constants';
import { assetPath } from '@/lib/utils';
import type { BoundingBox, GeoLocation, LayerType } from '@/types';
import type { CesiumNamespace } from './loader';

/**
 * Scene construction helpers.
 *
 * Every function takes the Cesium namespace explicitly (it is loaded at runtime,
 * not imported) so this module stays free of `window` access and is trivially
 * testable with a stub namespace.
 */

export interface CreateViewerOptions {
  /** Start with the animating clock (used for auto-rotation). */
  shouldAnimate?: boolean;
  /** Disable the sun/moon terminator lighting. */
  lighting?: boolean;
  /** Camera altitude floor, metres. */
  minimumZoomDistance?: number;
}

/**
 * Builds a chrome-free viewer: no widgets, no attribution box, no info panel.
 * The dashboard draws its own controls around it.
 */
export function createViewer(
  cesium: CesiumNamespace,
  container: HTMLElement,
  options: CreateViewerOptions = {},
): any {
  const viewer = new cesium.Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    creditContainer: document.createElement('div'), // rendered by our own footer
    shouldAnimate: options.shouldAnimate ?? true,
    // Layer 0 is added by `applyBaseLayer` so the constructor stays version-safe.
    baseLayer: false,
    requestRenderMode: false,
    // Required for `captureCanvas()` (globe snapshot export); a modest cost.
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });

  const { scene } = viewer;
  scene.globe.baseColor = cesium.Color.fromCssColorString('#040711');
  scene.globe.enableLighting = options.lighting ?? false;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.depthTestAgainstTerrain = false;

  scene.skyAtmosphere.show = true;
  scene.skyAtmosphere.hueShift = -0.02;
  scene.skyAtmosphere.saturationShift = 0.18;
  scene.skyAtmosphere.brightnessShift = -0.12;

  if (scene.fog) {
    scene.fog.enabled = true;
    scene.fog.density = 0.00018;
  }

  scene.highDynamicRange = true;
  scene.backgroundColor = cesium.Color.fromCssColorString('#02040A');

  const controller = scene.screenSpaceCameraController;

  // Free 3D navigation, stated explicitly instead of trusting the defaults: the
  // globe must spin a full 360° on any axis, tilt to any angle, and zoom from
  // street level out past the whole planet.
  controller.enableInputs = true;
  controller.enableTranslate = true;
  controller.enableZoom = true;
  controller.enableRotate = true;
  controller.enableTilt = true;
  controller.enableLook = true;

  controller.minimumZoomDistance = options.minimumZoomDistance ?? 20;
  controller.maximumZoomDistance = 60_000_000;
  controller.enableCollisionDetection = true;

  // Which physical input drives which camera motion, spelled out rather than
  // inherited from the constructor. A short or empty list here is invisible in
  // the UI — it presents as "the globe will not zoom" with nothing to debug — so
  // it is worth being explicit. Members are taken from the shipped definitions
  // and audited by `npm run check:cesium`:
  //   CameraEventType  LEFT_DRAG 0 · RIGHT_DRAG 1 · MIDDLE_DRAG 2 · WHEEL 3 · PINCH 4
  const { CameraEventType, KeyboardEventModifier } = cesium;

  if (CameraEventType) {
    controller.rotateEventTypes = CameraEventType.LEFT_DRAG;

    // Wheel, trackpad pinch and right-drag all zoom. PINCH is what a touchscreen
    // (and a precision touchpad, which browsers report as ctrl+wheel) produces.
    controller.zoomEventTypes = [
      CameraEventType.WHEEL,
      CameraEventType.PINCH,
      CameraEventType.RIGHT_DRAG,
    ];

    controller.tiltEventTypes = [
      CameraEventType.MIDDLE_DRAG,
      CameraEventType.PINCH,
      ...(KeyboardEventModifier
        ? [
            { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL },
            { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.SHIFT },
          ]
        : []),
    ];

    controller.translateEventTypes = [CameraEventType.LEFT_DRAG, CameraEventType.PINCH];
  }

  // Tight enough that a released drag does not coast, loose enough to still feel
  // like a globe rather than a spreadsheet. Cesium's defaults are 0.9 / 0.9 / 0.8.
  controller.inertiaSpin = 0.72;
  controller.inertiaTranslate = 0.72;
  controller.inertiaZoom = 0.6;

  // Mission consoles do not want the default double-click-to-track behaviour.
  viewer.trackedEntity = undefined;

  // The space around the globe is fixed, not themed — see applySpaceBackdrop.
  applySpaceBackdrop(cesium, viewer);
  scene.skyBox = createStarfieldSkyBox(cesium);

  return viewer;
}

/**
 * The space around the globe, in both themes.
 *
 * The theme governs the *chrome* — sidebar, header, panels. The map is a sensor
 * view: a pale backdrop washes out imagery, terrain and the change markers, and
 * "space" is not a surface the interface owns. An earlier revision lightened this
 * for the light theme and on screen it read as a grey halo around the planet, so
 * the backdrop is deliberately fixed.
 */
export function applySpaceBackdrop(cesium: CesiumNamespace, viewer: any): void {
  const { scene } = viewer;
  if (!scene) return;

  scene.backgroundColor = cesium.Color.fromCssColorString('#02040A');

  if (scene.globe) {
    // What shows through where imagery has not loaded yet.
    scene.globe.baseColor = cesium.Color.fromCssColorString('#040711');
  }

  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.hueShift = -0.02;
    scene.skyAtmosphere.saturationShift = 0.18;
    scene.skyAtmosphere.brightnessShift = -0.12;
  }

  if (scene.fog) {
    scene.fog.enabled = true;
    scene.fog.density = 0.00018;
  }
}

/**
 * Starfield skybox — the stars around the globe.
 *
 * Cesium's built-in skybox is a very sparse star map, and at working altitudes
 * the surrounding space reads as flat black. These six faces are denser; they are
 * generated by `.tools/make-skybox.py` so density and tint can be retuned without
 * hunting for a licence-free panorama, and they total ~171 KB.
 *
 * The motion comes for free: the skybox is fixed in the inertial frame, so when
 * `createAutoRotate` turns the camera about the polar axis the whole field sweeps
 * past. No per-frame star animation is needed, and none is faked.
 */
export function createStarfieldSkyBox(cesium: CesiumNamespace): any {
  const face = (name: string) => assetPath(`/skybox/${name}`);

  return new cesium.SkyBox({
    sources: {
      positiveX: face('px.png'),
      negativeX: face('nx.png'),
      positiveY: face('py.png'),
      negativeY: face('ny.png'),
      positiveZ: face('pz.png'),
      negativeZ: face('nz.png'),
    },
  });
}

/** Creates a token-free imagery layer for one of the four basemaps. */
export function createBaseImageryLayer(cesium: CesiumNamespace, layer: LayerType): any {
  const meta = LAYER_MAP[layer];
  const provider = new cesium.UrlTemplateImageryProvider({
    url: meta.templateUrl,
    ...(meta.subdomains ? { subdomains: meta.subdomains } : {}),
    maximumLevel: meta.maximumLevel,
    credit: meta.credit,
  });

  return new cesium.ImageryLayer(provider);
}

/**
 * Swaps layer 0 without rebuilding the viewer (keeps camera + entities intact).
 */
export function applyBaseLayer(cesium: CesiumNamespace, viewer: any, layer: LayerType): void {
  const layers = viewer.imageryLayers;
  const replacement = createBaseImageryLayer(cesium, layer);

  if (layers.length > 0) {
    layers.remove(layers.get(0), true);
  }
  layers.add(replacement, 0);

  // World Terrain needs an Ion token; fall back silently to the ellipsoid.
  const meta = LAYER_MAP[layer];
  const hasToken = Boolean(
    process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN && process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN.length,
  );

  if (meta.useWorldTerrain && hasToken && cesium.createWorldTerrainAsync) {
    cesium
      .createWorldTerrainAsync()
      .then((terrain: unknown) => {
        viewer.terrainProvider = terrain;
      })
      .catch(() => {
        /* keep the ellipsoid */
      });
  } else {
    viewer.terrainProvider = new cesium.EllipsoidTerrainProvider();
  }
}

/* -------------------------------------------------------------------------- */
/* Before / after split view                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Installs the two comparison layers and enables Cesium's native split.
 *
 * The globe is rendered once; `scene.splitPosition` decides how much of each
 * half is visible, which makes the swipe handle a single uniform write instead
 * of two synchronised maps.
 */
export function enableSplitComparison(cesium: CesiumNamespace, viewer: any): void {
  const layers = viewer.imageryLayers;
  disableSplitComparison(cesium, viewer);

  const before = new cesium.ImageryLayer(
    new cesium.UrlTemplateImageryProvider({
      url: COMPARISON_BASEMAPS.before.templateUrl,
      maximumLevel: COMPARISON_BASEMAPS.before.maximumLevel,
      credit: COMPARISON_BASEMAPS.before.credit,
    }),
  );
  const after = new cesium.ImageryLayer(
    new cesium.UrlTemplateImageryProvider({
      url: COMPARISON_BASEMAPS.after.templateUrl,
      maximumLevel: COMPARISON_BASEMAPS.after.maximumLevel,
      credit: COMPARISON_BASEMAPS.after.credit,
    }),
  );

  // NOTE: the enum is `SplitDirection` in Cesium 1.126 — `ImagerySplitDirection`
  // was removed. Verified against the shipped .d.ts by
  // .tools/check-cesium-members.mjs, which audits every `cesium.<Member>` in src/.
  before.splitDirection = cesium.SplitDirection.LEFT;
  after.splitDirection = cesium.SplitDirection.RIGHT;

  before.name = 'comparison:before';
  after.name = 'comparison:after';

  layers.add(before);
  layers.add(after);

  viewer.scene.splitPosition = 0.5;
}

export function disableSplitComparison(cesium: CesiumNamespace, viewer: any): void {
  const layers = viewer.imageryLayers;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers.get(i);
    if (typeof layer?.name === 'string' && layer.name.startsWith('comparison:')) {
      layers.remove(layer, true);
    }
  }
  viewer.scene.splitPosition = 0;
  void cesium;
}

/* -------------------------------------------------------------------------- */
/* MODIS live imagery (NASA GIBS)                                              */
/* -------------------------------------------------------------------------- */

/** Layer name used to find and remove the MODIS layer again. */
export const MODIS_LAYER_NAME = 'modis-live';

/**
 * The acquisition date the dashboard opens on — the project's "after" scene, so
 * the MODIS true-colour backdrop lines up with the change detection.
 */
export const DEFAULT_MODIS_DATE = '2026-09-12';

/** GIBS 250 m EPSG:4326 tile matrix levels are labelled '0'..'8'. */
const MODIS_TILE_MATRIX_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * Adds NASA GIBS MODIS Terra corrected-reflectance true colour.
 *
 * Why this is a genuinely "live" layer: the tiles are fetched straight from
 * NASA's Global Imagery Browse Services at request time, so the imagery is the
 * real orbital product rather than anything packaged with the app. Verified
 * against the live endpoint for the project's own dates — the 2026-09-12 tile
 * returns HTTP 200 image/jpeg.
 *
 * The layer is added above the basemap and left semi-transparent so terrain and
 * the change markers stay readable underneath.
 *
 * NOTE: Cesium is loaded from a CDN at runtime (see ./loader), so the namespace
 * arrives as a parameter. `import * as cesium from 'cesium'` would fail —
 * cesium is deliberately not an npm dependency.
 */
export function addModisLayer(
  cesium: CesiumNamespace,
  viewer: any,
  date: string = DEFAULT_MODIS_DATE,
  alpha = 0.6,
): any {
  // Idempotent: toggling on twice must not stack duplicate layers.
  removeModisLayer(viewer);

  const provider = new cesium.WebMapTileServiceImageryProvider({
    url:
      'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/' +
      'MODIS_Terra_CorrectedReflectance_TrueColor/default/' +
      `${date}/250m/{TileMatrix}/{TileRow}/{TileCol}.jpg`,
    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    style: 'default',
    format: 'image/jpeg',
    tileMatrixSetID: '250m',
    tileMatrixLabels: MODIS_TILE_MATRIX_LABELS,
    maximumLevel: 8,
    credit: 'NASA EOSDIS GIBS',
  });

  const layer = new cesium.ImageryLayer(provider);
  layer.alpha = alpha;
  layer.name = MODIS_LAYER_NAME;

  viewer.imageryLayers.add(layer);
  return layer;
}

/** True when the MODIS layer is currently on the globe. */
export function hasModisLayer(viewer: any): boolean {
  const layers = viewer?.imageryLayers;
  if (!layers) return false;
  for (let i = 0; i < layers.length; i += 1) {
    if (layers.get(i)?.name === MODIS_LAYER_NAME) return true;
  }
  return false;
}

/** Removes the MODIS layer if present. Safe to call when absent. */
export function removeModisLayer(viewer: any): void {
  const layers = viewer?.imageryLayers;
  if (!layers) return;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    if (layers.get(i)?.name === MODIS_LAYER_NAME) {
      layers.remove(layers.get(i), true);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Camera                                                                      */
/* -------------------------------------------------------------------------- */

export function flyToLocation(
  cesium: CesiumNamespace,
  viewer: any,
  location: GeoLocation,
  duration = 2.2,
): void {
  const altitude = location.altitude ?? 180_000;

  viewer.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(location.lng, location.lat, altitude),
    duration,
    easingFunction: cesium.EasingFunction?.QUADRATIC_IN_OUT ?? undefined,
  });

  // Region framing is more informative than a fixed altitude when a bbox exists.
  if (location.bbox) {
    window.setTimeout(() => {
      flyToBoundingBox(cesium, viewer, location.bbox as BoundingBox, duration * 0.7);
    }, 60);
  }
}

export function flyToBoundingBox(
  cesium: CesiumNamespace,
  viewer: any,
  bbox: BoundingBox,
  duration = 1.8,
): void {
  const [west, south, east, north] = bbox;
  viewer.camera.flyTo({
    destination: cesium.Rectangle.fromDegrees(west, south, east, north),
    duration,
  });
}

export function flyToPoint(
  cesium: CesiumNamespace,
  viewer: any,
  lat: number,
  lng: number,
  altitude = 90_000,
  duration = 1.6,
): void {
  viewer.camera.flyTo({
    destination: cesium.Cartesian3.fromDegrees(lng, lat, altitude),
    duration,
  });
}

/* -------------------------------------------------------------------------- */
/* Auto-rotation                                                              */
/* -------------------------------------------------------------------------- */

// Implemented in ./rotation, which has no runtime imports so that the tick logic
// can be exercised without a DOM or a WebGL context (.tools/rotation-check.mjs).
// Re-exported from here so the barrel in ./index.ts stays a single hop.
export { createAutoRotate, DEFAULT_ROTATION_SPEED } from './rotation';
export type { AutoRotateHandle, AutoRotateOptions } from './rotation';

/* -------------------------------------------------------------------------- */
/* Zoom                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Zooms by a fraction of the current camera height, so one step feels the same
 * at 200 km as it does at 20 000 km2 Needs only the camera, hence no namespace.
 */
export function zoomBy(viewer: any, fraction: number): void {
  const height = viewer.camera.positionCartographic.height;
  const amount = Math.max(height * fraction, 50);
  viewer.camera.zoomIn(amount);
}

/**
 * Double-click (mouse) and double-tap (touch) to zoom in.
 *
 * Cesium binds `LEFT_DOUBLE_CLICK` itself — to tracking the picked entity — so
 * that action is removed first and replaced. Touch never produces a
 * double-click event at all, hence the explicit two-tap detector.
 *
 * Pinch and wheel zoom are left to Cesium's own screen-space controller; adding
 * a second handler for them would double every step.
 */
export function createDoubleClickZoom(
  cesium: CesiumNamespace,
  viewer: any,
  fraction = 0.45,
): () => void {
  try {
    viewer.screenSpaceEventHandler?.removeInputAction(
      cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
  } catch {
    /* older runtimes expose no handler at this point */
  }

  let handler: any = null;
  try {
    handler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(
      () => zoomBy(viewer, fraction),
      cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
  } catch {
    // Never let an optional input affordance break the globe.
    return () => {};
  }

  /** Two taps inside this window count as a double-tap. */
  const DOUBLE_TAP_MS = 320;
  let lastTapAt = 0;

  const onTouchEnd = (event: TouchEvent) => {
    // A pinch, or any multi-finger gesture, is not a tap.
    if (event.touches.length > 0 || event.changedTouches.length !== 1) {
      lastTapAt = 0;
      return;
    }

    const now = performance.now();
    if (now - lastTapAt < DOUBLE_TAP_MS) {
      lastTapAt = 0;
      zoomBy(viewer, fraction);
    } else {
      lastTapAt = now;
    }
  };

  viewer.scene.canvas.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    if (!handler.isDestroyed()) handler.destroy();
    viewer.scene.canvas.removeEventListener('touchend', onTouchEnd);
  };
}

/** Full teardown — Cesium leaks WebGL contexts if `destroy()` is skipped. */
export function destroyViewer(viewer: any): void {
  try {
    if (!viewer.isDestroyed()) viewer.destroy();
  } catch {
    /* already gone */
  }
}
