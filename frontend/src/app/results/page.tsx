'use client';

import { BarChart3, Camera, Grid2x2, Share2 } from 'lucide-react';
import { CHART_TYPES } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useMap } from '@/hooks/useMap';
import { downloadDataUrl, exportElementAsPng } from '@/lib/chartExport';
import { HeaderBar } from '@/components/HeaderBar';
import { ResultPanel } from '@/components/Analyze/ResultPanel';
import { ResultCharts } from '@/components/ResultCharts';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/store/toastStore';

/**
 * `/results` — the presentation route.
 *
 * The dashboard and `/analyze` are operator surfaces; this one is for
 * communicating findings: every chart type side by side, plus PNG export of
 * both the charts and the globe.
 */
export default function ResultsPage() {
  const dataset = useAppStore((state) => state.resultDataset);
  const chartType = useAppStore((state) => state.chartType);
  const setChartType = useAppStore((state) => state.setChartType);
  const { jobId } = useAnalysis();
  const { controller } = useMap();

  const handleGlobeSnapshot = () => {
    const dataUrl = controller?.captureCanvas();
    if (!dataUrl) {
      toast.warning(
        'Snapshot unavailable',
        'Open the dashboard so the globe is mounted, then try again.',
      );
      return;
    }
    downloadDataUrl(dataUrl, `earth-metamorphosis-globe-${Date.now()}.png`);
    toast.success('Globe snapshot saved');
  };

  const handlePrintPack = async () => {
    const ok = await exportElementAsPng(
      document.getElementById('results-pack'),
      `earth-metamorphosis-result-pack-${Date.now()}.png`,
    );
    if (ok) toast.success('Result pack exported');
    else toast.error('Export failed', 'The chart surface could not be rasterised.');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-space-950">
      <HeaderBar />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-mission">
        <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 lg:p-6">
          {/* Header */}
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold uppercase tracking-[0.13em] text-gradient">
                Result Visualisation
              </h1>
              <p className="mt-1 text-[11px] text-ink-muted">
                Aggregated change statistics, chart pack and export.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {jobId && (
                <Badge tone="accent" mono>
                  {jobId}
                </Badge>
              )}

              <Button
                size="sm"
                variant="outline"
                icon={<Camera className="h-3.5 w-3.5" />}
                onClick={handleGlobeSnapshot}
              >
                Globe snapshot
              </Button>

              <Button
                size="sm"
                variant="outline"
                icon={<Share2 className="h-3.5 w-3.5" />}
                onClick={() => void handlePrintPack()}
                disabled={!dataset}
              >
                Export pack
              </Button>
            </div>
          </header>

          {/* Hero: KPI tiles + selected chart + detection table */}
          <div id="results-pack">
            <ResultPanel />
          </div>

          {/* Comparative grid: every other chart type, same dataset */}
          {dataset && (
            <section className="space-y-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
                  <Grid2x2 className="h-3.5 w-3.5 text-accent" />
                  Comparative chart pack
                </h2>
                <p className="text-[10px] text-ink-faint">
                  Each chart is a view over the same dataset — switch the hero chart above to
                  promote one.
                </p>
              </header>

              <div className="grid gap-4 xl:grid-cols-2">
                {CHART_TYPES.filter((chart) => chart.id !== chartType).map((chart) => (
                  <div key={chart.id} className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setChartType(chart.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:text-accent"
                    >
                      <BarChart3 className="h-3 w-3" />
                      Promote {chart.label}
                    </button>
                    <ResultCharts dataset={dataset} chartType={chart.id} height={240} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
