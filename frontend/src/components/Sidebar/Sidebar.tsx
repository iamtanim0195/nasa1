'use client';

import { Layers, Radar, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { useMap } from '@/hooks/useMap';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import { Badge } from '@/components/ui/Badge';
import { BrandingCard } from '@/components/BrandingCard';
import { SearchBar } from '@/components/SearchBar';
import { LayersPanel } from '@/components/LayersPanel';
import { ControlPanel } from '@/components/ControlPanel';
import { EventsPanel } from '@/components/EventsPanel';
import type { DateRange, DetectionType, DetectedEvent, GeoLocation, LayerType } from '@/types';

export interface SidebarProps {
  className?: string;
  /** Mobile sheet visibility. Ignored from `lg` upward. */
  open?: boolean;
  onClose?: () => void;
  onLayerChange?: (layer: LayerType) => void;
  onLocationChange?: (location: GeoLocation) => void;
  onDetectionTypeSelect?: (type: DetectionType) => void;
  onDateRangeChange?: (range: DateRange) => void;
  onRunAnalysis?: () => void;
  onEventSelect?: (event: DetectedEvent) => void;
}

/**
 * Left mission rail.
 *
 * Three collapsible panels in a fixed order that mirrors the operator's
 * workflow: what am I looking at (LAYERS) â†’ what am I computing (CONTROL) â†’
 * what did it find (EVENTS).
 */
export function Sidebar({
  className,
  open = true,
  onClose,
  onLayerChange,
  onLocationChange,
  onDetectionTypeSelect,
  onDateRangeChange,
  onRunAnalysis,
  onEventSelect,
}: SidebarProps) {
  const activeLayer = useAppStore((state) => state.activeLayer);
  const setActiveLayer = useAppStore((state) => state.setActiveLayer);
  const openPanels = useAppStore((state) => state.openPanels);
  const togglePanel = useAppStore((state) => state.togglePanel);
  const events = useAppStore((state) => state.events);
  const hoverEvent = useAppStore((state) => state.hoverEvent);
  const { focusEvent } = useMap();

  const handleLayer = (layer: LayerType) => {
    setActiveLayer(layer);
    onLayerChange?.(layer);
  };

  const handleEventSelect = (event: DetectedEvent) => {
    focusEvent(event);
    onEventSelect?.(event);
  };

  return (
    <aside
      aria-label="Mission controls"
      className={cn(
        'flex h-full w-[var(--sidebar-width)] max-w-[88vw] flex-col overflow-hidden border-r border-hairline/8 bg-space-950/72 backdrop-blur-xl',
        className,
      )}
    >
      {/* Mobile-only close affordance */}
      <div className="flex items-center justify-between px-3 pt-3 lg:hidden">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-faint">
          Mission Controls
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close controls"
          className="rounded-lg border border-hairline/10 p-1.5 text-ink-muted transition-colors hover:border-accent/35 hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-mission">
        {/* Search */}
        <SearchBar />

        {/* Branding */}
        <BrandingCard />

        {/* PANEL 1 â€” LAYERS */}
        <CollapsiblePanel
          panelId="layers"
          title="Layers"
          subtitle="Basemap and imagery"
          icon={<Layers className="h-3.5 w-3.5" />}
          open={openPanels.layers}
          onOpenChange={(value) => togglePanel('layers', value)}
        >
          <LayersPanel activeLayer={activeLayer} onLayerChange={handleLayer} />
        </CollapsiblePanel>

        {/* PANEL 2 â€” CONTROL PANEL */}
        <CollapsiblePanel
          panelId="control"
          title="Control Panel"
          subtitle="Job definition"
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          open={openPanels.control}
          onOpenChange={(value) => togglePanel('control', value)}
        >
          <ControlPanel
            onLocationChange={onLocationChange}
            onDetectionTypeSelect={onDetectionTypeSelect}
            onDateRangeChange={onDateRangeChange}
            onRunAnalysis={onRunAnalysis}
          />
        </CollapsiblePanel>

        {/* PANEL 3 â€” EVENTS */}
        <CollapsiblePanel
          panelId="events"
          title="Events"
          subtitle="Detected changes"
          icon={<Radar className="h-3.5 w-3.5" />}
          open={openPanels.events}
          onOpenChange={(value) => togglePanel('events', value)}
          meta={<Badge tone="accent">{events.length}</Badge>}
        >
          <EventsPanel onEventSelect={handleEventSelect} onEventHover={hoverEvent} />
        </CollapsiblePanel>
      </div>
    </aside>
  );
}
