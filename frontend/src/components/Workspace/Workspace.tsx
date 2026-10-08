'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { AOI_PRESETS, DETECTION_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useAutoFlyToSelection, useAutoFocusEvent, useMap } from '@/hooks/useMap';
import { useEvents } from '@/hooks/useEvents';
import { fetchModuleResults, resolveApiUrl } from '@/services';
import { GlobeViewer } from '@/components/GlobeViewer';
import { GlobeLegend } from '@/components/GlobeViewer/GlobeLegend';
import { Sidebar } from '@/components/Sidebar';
import { HeaderBar } from '@/components/HeaderBar';
import { ComparisonSlider } from '@/components/ComparisonSlider';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { Button } from '@/components/ui/Button';
import type { CreateAnalysisPayload } from '@/services';
import type { DetectedEvent, GeoLocation } from '@/types';

/** Compact number formatting for the overlay tiles. */
function formatNum(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

export interface WorkspaceProps {
  className?: string;
}

export function Workspace({ className }: WorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [globeFailed, setGlobeFailed] = useState(false);
  const [showFloodOverlay, setShowFloodOverlay] = useState(false);

  // `?result=<anything>` opens the overlay on load; previously only 'feni' did.
  useEffect(() => {
    if (searchParams.get('result')) {
      setShowFloodOverlay(true);
    }
  }, [searchParams]);

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
  const { refetch } = useEvents();
  const { start, isRunning, isDispatching } = useAnalysis();
  const { focusEvent } = useMap();

  /**
   * The results endpoint serves the latest real artifacts for a module, keyed
   * on detectionType, so the overlay can show genuine pipeline output without
   * requiring a job to be dispatched first.
   */
  const moduleResultsQuery = useQuery({
    queryKey: ['module-results', detectionType],
    queryFn: () => fetchModuleResults(detectionType),
    staleTime: 30_000,
    retry: 1,
  });

  const moduleResult = moduleResultsQuery.data?.data ?? null;
  const resultsLoading = moduleResultsQuery.isLoading;
  const overlayImage = resolveApiUrl(moduleResult?.previewUrl);
  const detectionLabel =
    DETECTION_TYPES.find((type) => type.id === detectionType)?.label ?? detectionType;

  useAutoFlyToSelection(AOI_PRESETS[0] ?? null);
  useAutoFocusEvent();

  useEffect(() => {
    if (isDispatching) {
      showOverlay({
        message: 'Dispatching analysis job',
        detail: 'Submitting the job definition to POST /api/analyze...',
      });
      return;
    }
    hideOverlay();
  }, [isDispatching, showOverlay, hideOverlay]);

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
        <Sidebar
          className={cn('hidden shrink-0 lg:flex', railCollapsed && 'lg:hidden')}
          onRunAnalysis={handleRunAnalysis}
          onEventSelect={handleEventSelect}
          onLocationChange={handleLocationChange}
        />

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
            floodMaskActive={showFloodOverlay}
          >
            <div className="absolute bottom-16 left-4 z-chrome flex flex-wrap items-center gap-2">
              <Button
                variant={comparisonActive ? 'accent' : 'subtle'}
                size="sm"
                icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                onClick={() => setComparisonActive(!comparisonActive)}
              >
                {comparisonActive ? 'Exit slider' : 'Activate slider'}
              </Button>

              <Button
                variant={showFloodOverlay ? 'accent' : 'subtle'}
                size="sm"
                onClick={() => setShowFloodOverlay((open) => !open)}
              >
                {showFloodOverlay ? 'Hide result' : `Show ${detectionLabel} result`}
              </Button>
            </div>

            <GlobeLegend
              className="absolute bottom-16 right-4 z-chrome hidden max-w-[13rem] lg:block"
              showDetectionTypes
              detectionTypes={DETECTION_TYPES.map((type) => ({
                label: type.label,
                hex: type.hex,
              }))}
            />

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

          {/* ============ MODULE RESULT OVERLAY ============ */}
          {showFloodOverlay && (
            <>
              <div className="pointer-events-auto absolute right-4 top-4 z-[1000] w-72 overflow-hidden rounded-xl border-2 border-accent/60 bg-space-950/95 shadow-2xl backdrop-blur-lg">
                <div className="flex items-center justify-between border-b border-accent/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-signal-critical" />
                    <p className="text-[11px] font-bold text-accent">
                      NISAR {detectionLabel.toUpperCase()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFloodOverlay(false)}
                    className="rounded p-0.5 text-ink-faint hover:text-signal-critical"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {overlayImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={overlayImage}
                    alt={`${detectionLabel} detection preview`}
                    className="h-auto w-full"
                    style={{ display: 'block' }}
                  />
                ) : (
                  <div className="px-3 py-6 text-center text-[10px] text-ink-faint">
                    {resultsLoading
                      ? 'Loading pipeline preview...'
                      : 'No preview artifact for this module yet.'}
                  </div>
                )}

                <div className="border-t border-accent/20 px-3 py-2">
                  {moduleResult?.available === false ? (
                    <p className="text-[10px] text-signal-medium">
                      {moduleResult.message ?? 'No processed artifacts for this module.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <p className="text-ink-faint">Coverage</p>
                        <p className="text-base font-bold text-accent">
                          {formatNum(moduleResult?.metadata?.coveragePct)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-faint">Affected Area</p>
                        <p className="text-base font-bold text-accent">
                          {formatNum(moduleResult?.totalAreaKm2)} km2
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-faint">Confidence</p>
                        <p className="text-base font-bold text-accent">
                          {moduleResult?.meanConfidence != null
                            ? `${Math.round(moduleResult.meanConfidence * 100)}%`
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-faint">Classes</p>
                        <p className="text-base font-bold text-accent">
                          {moduleResult?.categories?.length ?? 0}
                        </p>
                      </div>
                    </div>
                  )}

                  {moduleResult?.prediction && (
                    <div className="mt-2 rounded-md border border-accent/25 bg-accent/8 px-2 py-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-accent">
                        Risk projection
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink">
                        risk {moduleResult.prediction.risk} &middot; confidence{' '}
                        {moduleResult.prediction.confidence} &middot; trend{' '}
                        <span className="font-semibold">{moduleResult.prediction.trend}</span>
                      </p>
                      {moduleResult.prediction.basis && (
                        <p className="mt-0.5 text-[9px] leading-snug text-ink-faint">
                          {moduleResult.prediction.basis}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 border-t border-hairline/10 pt-2 text-[9px] text-ink-faint">
                    <p>{selectedLocation?.name ?? 'Unspecified AOI'}</p>
                    <p>
                      {moduleResult?.metadata?.beforeDate ?? '?'} to{' '}
                      {moduleResult?.metadata?.afterDate ?? '?'}
                    </p>
                    <p>
                      Track {moduleResult?.metadata?.track ?? '???'} &middot; Frame{' '}
                      {moduleResult?.metadata?.frame ?? '???'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1000] -translate-x-1/2">
                <div className="rounded-full border border-accent/40 bg-space-950/90 px-4 py-1.5 text-[11px] font-semibold text-accent backdrop-blur-md">
                  {detectionLabel} mask from {moduleResult?.detectionType ?? detectionType} artifacts
                </div>
              </div>
            </>
          )}

          {isRunning && (
            <button
              type="button"
              onClick={() => router.push('/analyze')}
              className="absolute bottom-4 right-4 z-chrome flex items-center gap-2 rounded-xl border border-accent/35 bg-space-950/85 px-3 py-2 text-[10.5px] text-accent backdrop-blur-md transition-colors hover:bg-accent/12"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Analysis running Ã¢â‚¬" view pipeline
            </button>
          )}

          {globeFailed && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-chrome -translate-x-1/2">
              <button
                type="button"
                onClick={() => void refetch()}
                className="pointer-events-auto rounded-lg border border-signal-medium/35 bg-space-950/85 px-3 py-1.5 text-[10px] text-signal-medium backdrop-blur-md"
              >
                Globe offline Ã¢â‚¬" panels and analysis remain available
              </button>
            </div>
          )}
        </main>
      </div>

      <ComparisonSlider active={comparisonActive} onClose={() => setComparisonActive(false)} />
      <LoadingOverlay />
    </div>
  );
}