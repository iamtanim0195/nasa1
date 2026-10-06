'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { HeaderBar } from '@/components/HeaderBar';
import { StageTabs } from '@/components/Analyze/StageTabs';
import { DsardPanel } from '@/components/Analyze/DsardPanel';
import { ExtractingPanel } from '@/components/Analyze/ExtractingPanel';
import { AnalyzingPanel } from '@/components/Analyze/AnalyzingPanel';
import { ResultPanel } from '@/components/Analyze/ResultPanel';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/StateViews';
import { Badge } from '@/components/ui/Badge';
import type { AnalysisStage } from '@/types';

const STAGES: AnalysisStage[] = ['dsard', 'extracting', 'analyzing', 'result'];

function isStage(value: string | null): value is AnalysisStage {
  return value !== null && (STAGES as string[]).includes(value);
}

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const stageParam = searchParams.get('stage');

  const activeStage = useAppStore((state) => state.activeStage);
  const setActiveStage = useAppStore((state) => state.setActiveStage);
  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const detectionType = useAppStore((state) => state.detectionType);
  const dateRange = useAppStore((state) => state.dateRange);

  const { jobId, progress, isRunning, error, start } = useAnalysis();

  // Local tab state is seeded from the URL so deep links work.
  const [stage, setStage] = useState<AnalysisStage>(isStage(stageParam) ? stageParam : activeStage);

  useEffect(() => {
    if (isStage(stageParam) && stageParam !== stage) setStage(stageParam);
    // Only react to the URL, not to local tab clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageParam]);

  useEffect(() => {
    setActiveStage(stage);
  }, [stage, setActiveStage]);

  const handleStart = () => {
    if (!selectedLocation) return;
    start({
      detectionType,
      location: {
        name: selectedLocation.name,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
      },
      dateRange,
      mode: 'full',
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-space-950">
      <HeaderBar />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-mission">
        <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 lg:p-6">
          {/* Page header */}
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold uppercase tracking-[0.13em] text-gradient">
                Analysis Workspace
              </h1>
              <p className="mt-1 text-[11px] text-ink-muted">
                {selectedLocation ? (
                  <>
                    {selectedLocation.name} ·{' '}
                    <span className="telemetry">
                      {dateRange.before ?? '—'} → {dateRange.after ?? '—'}
                    </span>
                  </>
                ) : (
                  'No AOI selected — define a job on the dashboard.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {jobId && (
                <Badge tone="accent" mono>
                  {jobId}
                </Badge>
              )}
              {isRunning && (
                <Badge tone="accent">
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" /> {progress.toFixed(0)}%
                </Badge>
              )}
              {!jobId && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={handleStart}
                  disabled={!selectedLocation}
                >
                  Start analysis
                </Button>
              )}
            </div>
          </header>

          {/* Error surface for the whole pipeline */}
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-signal-critical/35 bg-signal-critical/8 px-3.5 py-2.5"
            >
              <p className="text-[11px] text-ink-muted">
                <span className="font-semibold text-signal-critical">{error.code}</span> ·{' '}
                {error.message}
              </p>
              <Button size="sm" variant="outline" onClick={handleStart}>
                Retry
              </Button>
            </div>
          )}

          {/* Stage tabs */}
          <StageTabs active={stage} onChange={setStage} />

          {/* Stage body */}
          <div
            role="tabpanel"
            id={`panel-${stage}`}
            aria-labelledby={`tab-${stage}`}
            className="animate-fade-up"
          >
            {stage === 'dsard' && <DsardPanel onStart={handleStart} />}
            {stage === 'extracting' && <ExtractingPanel />}
            {stage === 'analyzing' && <AnalyzingPanel />}
            {stage === 'result' && <ResultPanel />}
          </div>

          {/* Footer note about the backend boundary */}
          <footer className="rounded-xl border border-hairline/8 bg-elevate/3 px-3.5 py-2.5">
            <EmptyState
              compact
              title="Data source"
              description="Every panel on this page renders whatever the analysis API returns. With NEXT_PUBLIC_USE_MOCK_API=true the responses are deterministic fixtures; set it to false and provide NEXT_PUBLIC_API_BASE_URL to switch to the live backend."
            />
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-full place-items-center bg-space-950">
          <RefreshCw className="h-5 w-5 animate-spin text-accent" />
        </div>
      }
    >
      <AnalyzeContent />
    </Suspense>
  );
}
