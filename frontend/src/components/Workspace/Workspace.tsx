'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AOI_PRESETS, DETECTION_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useAutoFlyToSelection, useAutoFocusEvent, useMap } from '@/hooks/useMap';
import { useEvents } from '@/hooks/useEvents';
import { GlobeViewer } from '@/components/GlobeViewer';
import { GlobeLegend } from '@/components/GlobeViewer/GlobeLegend';
import { Sidebar } from '@/components/Sidebar';
import { HeaderBar } from '@/components/HeaderBar';
import { ComparisonSlider } from '@/components/ComparisonSlider';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { Button } from '@/components/ui/Button';
import type { CreateAnalysisPayload } from '@/services';
import type { DetectedEvent, GeoLocation } from '@/types';

export interface WorkspaceProps {
  className?: string;
}

/**
 * Dashboard shell.
 *
 * This is the composition root: it owns the wiring between the store, the data
 * hooks and the chrome, so every panel below it stays presentational. It is the
 * only place in the app where "start an analysis" is assembled into a payload.
 */
export function Workspace({ className }: WorkspaceProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [globeFailed, setGlobeFailed] = useState(false);

  /* ---- store ---- */
  const activeLayer = useAppStore((state) => state.activeLayer);
  const autoRotate = useAppStore((state) => state.autoRotate);
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const events = useAppStore((state) => state.events);
  const selectedEventId = useAppStore((state) => state.selectedEventId);
  const hoveredEventId = useAppStore((state) => state.hoveredEventId);
  const comparisonActive = useAppStore((state) => state.isComparisonActive);
  const setComparisonActive = useAppStore((state) => state.setComparisonActive);
  const selectEvent = useAppStore((state) => state.selectEvent);
  const hoverEvent = useAppStore((state) => state.hoverEvent);
  const detectionType = useAppStore((state) => state.detectionType);
  const dateRange = useAppStore((state) => state.dateRange);
  const dataset = useAppStore((state) => state.dataset);
  const showOverlay = useAppStore((state) => state.showOverlay);
  const hideOverlay = useAppStore((state) => state.hideOverlay);

  /* ---- data ---- */
  // Fetching here (as well as inside EventsPanel) keeps the globe populated even
  // if the events panel is collapsed; React Query dedupes to a single request.
  const { refetch } = useEvents();
  const { start, isRunning, isDispatching } = useAnalysis();

  const { focusEvent } = useMap();

  /* ---- camera follows selection ---- */
  useAutoFlyToSelection(AOI_PRESETS[0] ?? null);
  useAutoFocusEvent();

  /* ---- blocking overlay while a job definition is being accepted ---- */
  useEffect(() => {
    if (isDispatching) {
      showOverlay({
        message: 'Dispatching analysis job',
        detail: 'Submitting the job definition to POST /api/analyze…',
      });
      return;
    }
    hideOverlay();
  }, [isDispatching, showOverlay, hideOverlay]);

  /* ---- actions ---- */

  const handleRunAnalysis = useCallback(() => {
    if (!selectedLocation) {
      toast.warning('No location selected', 'Pick an AOI from search or the preset list.');
      return;
    }
    if (!dateRange.before || !dateRange.after) {
      toast.warning('Observation window incomplete', 'Set both the before and after dates.');
      return;
    }

    const payload: CreateAnalysisPayload = {
      detectionType,
      location: {
        name: selectedLocation.name,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
      },
      dateRange,
      datasetId: dataset?.id,
      mode: 'full',
    };

    start(payload);
    router.push('/analyze?stage=dsard');
  }, [dateRange, dataset?.id, detectionType, router, selectedLocation, start]);

  const handleEventSelect = useCallback(
    (event: DetectedEvent) => {
      selectEvent(event.id);
      focusEvent(event);
    },
    [focusEvent, selectEvent],
  );

  const handleLocationChange = useCallback((location: GeoLocation) => {
    void location;
  }, []);

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-space-950', className)}>
      <HeaderBar
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        sidebarOpen={sidebarOpen}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* ---- Left rail (desktop) ---- */}
        <Sidebar
          className={cn('hidden shrink-0 lg:flex', railCollapsed && 'lg:hidden')}
          onRunAnalysis={handleRunAnalysis}
          onEventSelect={handleEventSelect}
          onLocationChange={handleLocationChange}
        />

        {/* ---- Left rail (mobile sheet) ---- */}
        {sidebarOpen && (
          <>
            <button
              type="button"
              aria-label="Close controls"
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-chrome bg-space-950/70 backdrop-blur-sm lg:hidden"
            />
            <div className="fixed bottom-0 left-0 top-14 z-chrome lg:hidden">
              <Sidebar
                className="animate-fade-up"
                onClose={() => setSidebarOpen(false)}
                onRunAnalysis={handleRunAnalysis}
                onEventSelect={handleEventSelect}
                onLocationChange={handleLocationChange}
              />
            </div>
          </>
        )}

        {/* ---- Globe ---- */}
        <main className="relative min-h-0 flex-1">
          <GlobeViewer
            events={events}
            selectedEventId={selectedEventId}
            hoveredEventId={hoveredEventId}
            selectedLocation={selectedLocation}
            activeLayer={activeLayer}
            autoRotate={autoRotate}
            comparisonActive={comparisonActive}
            onSelectEvent={selectEvent}
            onHoverEvent={hoverEvent}
            onError={() => setGlobeFailed(true)}
          >
            {/* Comparison trigger — bottom-left, above the HUD */}
            <div className="absolute bottom-16 left-4 z-chrome flex flex-wrap items-center gap-2">
              <Button
                variant={comparisonActive ? 'accent' : 'subtle'}
                size="sm"
                icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                onClick={() => setComparisonActive(!comparisonActive)}
              >
                {comparisonActive ? 'Exit slider' : 'Activate slider'}
              </Button>
            </div>

            {/* Legend — bottom-right */}
            <GlobeLegend
              className="absolute bottom-16 right-4 z-chrome hidden max-w-[13rem] lg:block"
              showDetectionTypes
              detectionTypes={DETECTION_TYPES.map((type) => ({
                label: type.shortLabel,
                hex: type.hex,
              }))}
            />

            {/* Desktop rail collapse */}
            <button
              type="button"
              aria-label={railCollapsed ? 'Expand control rail' : 'Collapse control rail'}
              aria-pressed={railCollapsed}
              onClick={() => setRailCollapsed((value) => !value)}
              className="absolute left-4 top-4 z-chrome hidden rounded-lg border border-hairline/10 bg-space-950/70 p-2 text-ink-muted backdrop-blur-md transition-colors hover:border-accent/35 hover:text-accent lg:block"
            >
              {railCollapsed ? (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </button>
          </GlobeViewer>

          {/* Analysis-in-progress affordance while the operator stays on the globe */}
          {isRunning && (
            <button
              type="button"
              onClick={() => router.push('/analyze')}
              className="absolute bottom-4 right-4 z-chrome flex items-center gap-2 rounded-xl border border-accent/35 bg-space-950/85 px-3 py-2 text-[10.5px] text-accent backdrop-blur-md transition-colors hover:bg-accent/12"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Analysis running — view pipeline
            </button>
          )}

          {globeFailed && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-chrome -translate-x-1/2">
              <button
                type="button"
                onClick={() => void refetch()}
                className="pointer-events-auto rounded-lg border border-signal-medium/35 bg-space-950/85 px-3 py-1.5 text-[10px] text-signal-medium backdrop-blur-md"
              >
                Globe offline — panels and analysis remain available
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ---- Global overlays ---- */}
      <ComparisonSlider active={comparisonActive} onClose={() => setComparisonActive(false)} />
      <LoadingOverlay />
    </div>
  );
}
