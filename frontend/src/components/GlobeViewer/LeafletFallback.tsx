'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LeafletFallbackProps {
  center?: [number, number];
  zoom?: number;
  activeLayer?: 'default' | 'satellite' | 'terrain' | 'dark';
  className?: string;
}

/**
 * Leaflet Fallback Map
 * =====================
 * Replaces Cesium Globe while lib/cesium.ts is unavailable.
 * Supports OSM, Satellite, Terrain, and Dark basemaps.
 */
export function LeafletFallback({
  center = [23.07, 91.42], // Feni by default
  zoom = 10,
  activeLayer = 'satellite',
  className,
}: LeafletFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize map
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch tile layer when activeLayer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const urlMap: Record<string, string> = {
      default: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      satellite:
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      terrain: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    };

    const attributionMap: Record<string, string> = {
      default: '© OpenStreetMap contributors',
      satellite: '© Esri',
      terrain: '© OpenTopoMap',
      dark: '© CARTO',
    };

    layerRef.current = L.tileLayer(urlMap[activeLayer] || urlMap.satellite, {
      attribution: attributionMap[activeLayer] || '© Esri',
      maxZoom: 19,
    }).addTo(map);
  }, [activeLayer]);

  // Recenter when center changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, zoom);
  }, [center, zoom]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      />
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1000,
          background: 'rgba(10, 22, 40, 0.85)',
          color: '#4db8ff',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 600,
          border: '1px solid rgba(77, 184, 255, 0.3)',
          backdropFilter: 'blur(8px)',
        }}
      >
        🗺️ Leaflet Fallback Map
      </div>
    </div>
  );
}