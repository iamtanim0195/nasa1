'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { useAppStore } from '@/store/appStore';
import type { BoundingBox, DetectedEvent, GeoLocation } from '@/types';

/**
 * Imperative command surface of the globe.
 *
 * The Cesium viewer is a long-lived imperative object; React never re-renders
 * it. Instead `GlobeViewer` registers a controller here and every other
 * component commands the camera through this stable interface. That keeps the
 * 3D scene out of the React tree entirely — no refs threaded through props.
 */
export interface GlobeController {
  flyToLocation: (location: GeoLocation, duration?: number) => void;
  flyToPoint: (lat: number, lng: number, altitude?: number, duration?: number) => void;
  flyToBoundingBox: (bbox: BoundingBox, duration?: number) => void;
  focusEvent: (event: DetectedEvent) => void;
  /** 0..1 split position; only meaningful while the comparison is active. */
  setSplitPosition: (ratio: number) => void;
  /** True once the runtime supports `scene.splitPosition`. */
  supportsSplit: () => boolean;
  /** Current canvas as a data URL, or null when the scene cannot be read back. */
  captureCanvas: () => string | null;
  /** Cesium `Scene` handle for advanced consumers (chart overlays, tours). */
  getScene: () => unknown;
}

interface GlobeRegistry {
  controller: GlobeController | null;
  register: (controller: GlobeController | null) => void;
}

const useGlobeRegistry = create<GlobeRegistry>()((set) => ({
  controller: null,
  register: (controller) => set({ controller }),
}));

/** Called by `GlobeViewer` once the viewer is constructed. */
export function registerGlobeController(controller: GlobeController | null): void {
  useGlobeRegistry.getState().register(controller);
}

export interface UseMapResult {
  controller: GlobeController | null;
  isReady: boolean;
  selectedLocation: GeoLocation | null;
  flyTo: (location: GeoLocation) => void;
  focusEvent: (event: DetectedEvent) => void;
  flyToBoundingBox: (bbox: BoundingBox) => void;
  setSplitPosition: (ratio: number) => void;
}

/**
 * Map façade used by panels.
 *
 * `flyTo` routes through the camera controller *and* updates the store, so the
 * control panel, search bar and event list all stay in sync no matter which one
 * moved the camera.
 */
export function useMap(): UseMapResult {
  const controller = useGlobeRegistry((state) => state.controller);
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const selectLocation = useAppStore((state) => state.selectLocation);

  const flyTo = useCallback(
    (location: GeoLocation) => {
      selectLocation(location);
      controller?.flyToLocation(location);
    },
    [controller, selectLocation],
  );

  const focusEvent = useCallback(
    (event: DetectedEvent) => {
      controller?.focusEvent(event);
    },
    [controller],
  );

  const flyToBoundingBox = useCallback(
    (bbox: BoundingBox) => {
      controller?.flyToBoundingBox(bbox);
    },
    [controller],
  );

  const setSplitPosition = useCallback(
    (ratio: number) => {
      controller?.setSplitPosition(ratio);
    },
    [controller],
  );

  return useMemo(
    () => ({
      controller,
      isReady: Boolean(controller),
      selectedLocation,
      flyTo,
      focusEvent,
      flyToBoundingBox,
      setSplitPosition,
    }),
    [controller, selectedLocation, flyTo, focusEvent, flyToBoundingBox, setSplitPosition],
  );
}

/**
 * Follows `selectedLocation` in the store and moves the camera.
 * Mounted once by the dashboard workspace.
 */
export function useAutoFlyToSelection(initialLocation?: GeoLocation | null): void {
  const controller = useGlobeRegistry((state) => state.controller);
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const selectLocation = useAppStore((state) => state.selectLocation);
  const flownToId = useRef<string | null>(null);

  // Seed the store with the default AOI exactly once.
  useEffect(() => {
    if (!selectedLocation && initialLocation) selectLocation(initialLocation);
  }, [initialLocation, selectedLocation, selectLocation]);

  useEffect(() => {
    if (!controller || !selectedLocation) return;

    // Keyed on the location *id*, never on object identity. A store write that
    // happens to rebuild the location object must not yank the camera back while
    // the operator is exploring the globe by hand.
    if (flownToId.current === selectedLocation.id) return;
    flownToId.current = selectedLocation.id;
    controller.flyToLocation(selectedLocation);
  }, [controller, selectedLocation]);
}

/** Keeps the globe in sync with the event selection. */
export function useAutoFocusEvent(): void {
  const controller = useGlobeRegistry((state) => state.controller);
  const selectedEventId = useAppStore((state) => state.selectedEventId);
  const events = useAppStore((state) => state.events);
  const focusedId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedEventId) {
      focusedId.current = null;
      return;
    }
    if (!controller) return;

    // Same reasoning as above, and it matters more here: `events` changes on
    // every refetch (staleTime is 30 s) and on every filter change. Depending on
    // the array would re-fly the camera roughly every 30 seconds and undo
    // whatever the operator had panned to.
    if (focusedId.current === selectedEventId) return;

    const event = events.find((item) => item.id === selectedEventId);
    if (!event) return;

    focusedId.current = selectedEventId;
    controller.focusEvent(event);
  }, [controller, selectedEventId, events]);
}
