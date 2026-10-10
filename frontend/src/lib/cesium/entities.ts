/* eslint-disable @typescript-eslint/no-explicit-any */
import { DETECTION_TYPE_MAP, SEVERITY_MAP } from '@/lib/constants';
import type { DetectedEvent, GeoLocation } from '@/types';
import type { CesiumNamespace } from './loader';

const EVENT_PREFIX = 'em:event:';
const SELECTION_ID = 'em:selection';

/* -------------------------------------------------------------------------- */
/* Picking                                                                     */
/* -------------------------------------------------------------------------- */

/** Extracts our event id from a Cesium pick result, or null when nothing hit. */
export function readEventId(picked: any): string | null {
  const entity = picked?.id;
  if (!entity) return null;

  try {
    const value = entity.properties?.eventId?.getValue?.();
    if (typeof value === 'string') return value;
  } catch {
    /* fall through to id parsing */
  }

  if (typeof entity.id === 'string' && entity.id.startsWith(EVENT_PREFIX)) {
    return entity.id.slice(EVENT_PREFIX.length);
  }
  return null;
}

export interface PickHandlers {
  onSelect?: (eventId: string | null) => void;
  onHover?: (eventId: string | null) => void;
}

/**
 * Own ScreenSpaceEventHandler  the Viewer's own handler drives its built-in
 * picking, and we must not clobber it.
 */
export function createPickHandler(
  cesium: CesiumNamespace,
  viewer: any,
  handlers: PickHandlers,
): () => void {
  const handler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  let lastHovered: string | null = null;

  handler.setInputAction((movement: any) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const id = readEventId(picked);
    if (id !== lastHovered) {
      lastHovered = id;
      handlers.onHover?.(id);
    }
  }, cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((click: any) => {
    const picked = viewer.scene.pick(click.position);
    handlers.onSelect?.(readEventId(picked));
  }, cesium.ScreenSpaceEventType.LEFT_CLICK);

  return () => {
    if (!handler.isDestroyed()) handler.destroy();
  };
}

/* -------------------------------------------------------------------------- */
/* Event footprints                                                            */
/* -------------------------------------------------------------------------- */

export interface RenderEventsOptions {
  selectedId?: string | null;
  hoveredId?: string | null;
  /** Show the detection-type label next to focused markers. */
  showLabels?: boolean;
}

/**
 * Full re-render of the event layer.
 *
 * The event count in this dashboard is in the tens, so a full rebuild is both
 * cheaper to reason about and faster than a diff; for thousands of features the
 * same data should go through a `CustomDataSource` with `EntityCluster`.
 */
export function renderEventEntities(
  cesium: CesiumNamespace,
  viewer: any,
  events: DetectedEvent[],
  options: RenderEventsOptions = {},
): void {
  const store = viewer.entities;

  const stale = store.values.filter(
    (entity: any) => typeof entity.id === 'string' && entity.id.startsWith(EVENT_PREFIX),
  );
  stale.forEach((entity: any) => store.remove(entity));

  const { selectedId, hoveredId, showLabels = true } = options;

  events.forEach((event) => {
    const severity = SEVERITY_MAP[event.severity];
    const detection = DETECTION_TYPE_MAP[event.detectionType];
    const color = cesium.Color.fromCssColorString(severity.hex);

    const focused = event.id === selectedId || event.id === hoveredId;

    const base: Record<string, unknown> = {
      id: `${EVENT_PREFIX}${event.id}`,
      name: event.id,
      position: cesium.Cartesian3.fromDegrees(event.location.lng, event.location.lat),
      properties: { eventId: event.id, detectionType: event.detectionType },
      point: {
        pixelSize: event.id === selectedId ? 13 : focused ? 11 : 8,
        color,
        outlineColor: cesium.Color.WHITE.withAlpha(focused ? 0.9 : 0.55),
        outlineWidth: focused ? 2.5 : 1.2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new cesium.NearFarScalar(1.5e5, 1.35, 1.6e7, 0.5),
      },
    };

    if (event.footprint && event.footprint.length >= 3) {
      const flat = event.footprint.flatMap(([lng, lat]) => [lng, lat]);
      base.polygon = {
        hierarchy: cesium.Cartesian3.fromDegreesArray(flat),
        material: color.withAlpha(event.id === selectedId ? 0.42 : 0.24),
        outline: true,
        outlineColor: color.withAlpha(focused ? 0.95 : 0.6),
        outlineWidth: focused ? 2.4 : 1.4,
        height: 0,
        arcType: cesium.ArcType?.GEODESIC,
      };
    } else {
      base.ellipse = {
        semiMajorAxis: Math.max(600, Math.sqrt(event.areaKm2) * 1_000),
        semiMinorAxis: Math.max(600, Math.sqrt(event.areaKm2) * 800),
        material: color.withAlpha(0.24),
        outline: true,
        outlineColor: color.withAlpha(0.7),
        height: 0,
      };
    }

    if (focused && showLabels) {
      base.label = {
        text: `${event.id}    ${detection.shortLabel}`,
        font: '600 13px "Segoe UI", sans-serif',
        fillColor: cesium.Color.fromCssColorString('#EEF4FF'),
        outlineColor: cesium.Color.fromCssColorString('#02040A'),
        outlineWidth: 3,
        style: cesium.LabelStyle?.FILL_AND_OUTLINE,
        pixelOffset: new cesium.Cartesian2(0, -26),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: cesium.Color.fromCssColorString('#040711').withAlpha(0.72),
        backgroundPadding: new cesium.Cartesian2(8, 5),
      };
    }

    store.add(base);
  });
}

/* -------------------------------------------------------------------------- */
/* Selected location marker                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pulsing "you are here" marker for the search/AOI selection.
 * Uses a CallbackProperty so the pulse is driven by the Cesium clock rather
 * than a React re-render.
 */
export function upsertSelectionMarker(
  cesium: CesiumNamespace,
  viewer: any,
  location: GeoLocation | null,
): void {
  const store = viewer.entities;
  const existing = store.getById(SELECTION_ID);
  if (existing) store.remove(existing);

  if (!location) return;

  const center = cesium.Cartesian3.fromDegrees(location.lng, location.lat);
  const accent = cesium.Color.fromCssColorString('#27C9FF');

  // Static marker - no pulse animation
  store.add({
    id: SELECTION_ID,
    name: location.name,
    position: center,
    point: {
      pixelSize: 10,
      color: accent,
      outlineColor: cesium.Color.WHITE.withAlpha(0.95),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

export function clearSelectionMarker(viewer: any): void {
  const existing = viewer.entities.getById(SELECTION_ID);
  if (existing) viewer.entities.remove(existing);
}
