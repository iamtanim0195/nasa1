/**
 * Rectangle draw tool for the Cesium globe.
 *
 * Left-click drag creates an axis-aligned rectangle on the ellipsoid.
 * On mouse-up the geographic bounding box is extracted and handed back
 * to the caller. Returns a dispose function that removes the handler and
 * the preview entity.
 */
import type { BoundingBox } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cesium = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Viewer = any;

export interface RectangleDrawerOptions {
  onComplete: (bbox: BoundingBox) => void;
  onCancel?: () => void;
  /** Fired on every mousemove with the current bbox — for live UI feedback. */
  onUpdate?: (bbox: BoundingBox) => void;
}

export function createRectangleDrawer(
  cesium: Cesium,
  viewer: Viewer,
  options: RectangleDrawerOptions,
): () => void {
  const handler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let startCartesian: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let previewEntity: any = null;

  // Disable Cesium's own camera controls so drag doesn't orbit the globe.
  const cameraController = viewer.scene.screenSpaceCameraController;
  const previousEnableRotate = cameraController.enableRotate;
  const previousEnableTranslate = cameraController.enableTranslate;
  cameraController.enableRotate = false;
  cameraController.enableTranslate = false;

  viewer.canvas.style.cursor = 'crosshair';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pickEllipsoid = (screenPos: any): any => {
    const cartesian = viewer.camera.pickEllipsoid(
      screenPos,
      viewer.scene.globe.ellipsoid,
    );
    return cartesian ?? null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildRectangle = (a: any, b: any): any => {
    const cartoA = cesium.Cartographic.fromCartesian(a);
    const cartoB = cesium.Cartographic.fromCartesian(b);
    const west = Math.min(cartoA.longitude, cartoB.longitude);
    const east = Math.max(cartoA.longitude, cartoB.longitude);
    const south = Math.min(cartoA.latitude, cartoB.latitude);
    const north = Math.max(cartoA.latitude, cartoB.latitude);

    return cesium.Rectangle.fromRadians(west, south, east, north);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toDegrees = (rect: any): BoundingBox => {
    const west = cesium.Math.toDegrees(rect.west);
    const south = cesium.Math.toDegrees(rect.south);
    const east = cesium.Math.toDegrees(rect.east);
    const north = cesium.Math.toDegrees(rect.north);
    return [west, south, east, north];
  };

  // ─────────────────────────────────────────────────────────────────
  // Performance: reuse ONE entity and only mutate its coordinates.
  // (add/remove per mousemove made dragging visibly laggy.)
  // ─────────────────────────────────────────────────────────────────
  const ensurePreview = () => {
    if (previewEntity) return previewEntity;
    previewEntity = viewer.entities.add({
      rectangle: {
        coordinates: cesium.Rectangle.fromDegrees(0, 0, 0, 0),
        height: 0,
        material: cesium.Color.CYAN.withAlpha(0.45),
        outline: true,
        outlineColor: cesium.Color.CYAN,
        outlineWidth: 4,
      },
    });
    return previewEntity;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setPreview = (rect: any) => {
    const entity = ensurePreview();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entity as any).rectangle.coordinates = rect;
  };

  const removePreview = () => {
    if (previewEntity) {
      try {
        viewer.entities.remove(previewEntity);
      } catch {
        /* noop */
      }
      previewEntity = null;
    }
  };

  handler.setInputAction((event: { position: unknown }) => {
    startCartesian = pickEllipsoid(event.position);
    if (!startCartesian) return;
    setPreview(buildRectangle(startCartesian, startCartesian));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: { endPosition: unknown }) => {
    if (!startCartesian) return;
    const endCartesian = pickEllipsoid(event.endPosition);
    if (!endCartesian) return;

    const rect = buildRectangle(startCartesian, endCartesian);
    setPreview(rect);

    // Live UI feedback for the control panel.
    if (options.onUpdate) {
      options.onUpdate(toDegrees(rect));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((event: { position: unknown }) => {
    if (!startCartesian) return;
    const endCartesian = pickEllipsoid(event.position);
    if (!endCartesian) return;

    const rect = buildRectangle(startCartesian, endCartesian);
    const bbox = toDegrees(rect);

    // Reject degenerate rectangles (single click without drag).
    const [w, s, e, n] = bbox;
    if (Math.abs(e - w) < 0.001 || Math.abs(n - s) < 0.001) {
      removePreview();
      startCartesian = null;
      return;
    }

    // Keep rectangle visible after mouse-up.
    options.onComplete(bbox);
    startCartesian = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, cesium.ScreenSpaceEventType.LEFT_UP);

  // Dispose function
  return () => {
    try {
      handler.destroy();
    } catch {
      /* noop */
    }
    removePreview();
    cameraController.enableRotate = previousEnableRotate;
    cameraController.enableTranslate = previousEnableTranslate;
    viewer.canvas.style.cursor = '';
  };
}

/**
 * Remove any leftover rectangle-draw entities from the viewer (called on
 * mode toggle off).
 */
export function clearDrawPreview(viewer: Viewer): void {
  const entities = viewer?.entities?.values;
  if (!Array.isArray(entities)) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities.slice().forEach((e: any) => {
    if (e?.rectangle && e?.id?.toString().startsWith?.('drawn-')) {
      try {
        viewer.entities.remove(e);
      } catch {
        /* noop */
      }
    }
  });
}
