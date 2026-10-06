'use client';

import { Check } from 'lucide-react';
import { LAYERS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import type { LayerType } from '@/types';

export interface LayersPanelProps {
  activeLayer: LayerType;
  /**
   * API-ready integration point.
   * A backend can later serve the available basemaps and per-layer metadata.
   */
  onLayerChange?: (layer: LayerType) => void;
  className?: string;
}

/** Small CSS gradient stand-in for a basemap thumbnail (no extra requests). */
const SWATCH: Record<LayerType, string> = {
  default: 'linear-gradient(135deg, #16223c 0%, #2b4a6f 45%, #4d7ea8 100%)',
  satellite: 'linear-gradient(135deg, #123024 0%, #2f6b45 40%, #7a6a3a 75%, #2a4a63 100%)',
  terrain: 'linear-gradient(135deg, #2b2318 0%, #6b5a3a 45%, #a89a72 75%, #d8d2c4 100%)',
  dark: 'linear-gradient(135deg, #05070f 0%, #10192b 50%, #1b2a44 100%)',
};

/**
 * Basemap switcher.
 *
 * Rendered as radio cards rather than a dropdown so the active basemap is
 * always visible â€” on a globe, "which map am I looking at" is a safety-critical
 * piece of context, not a preference.
 */
export function LayersPanel({ activeLayer, onLayerChange, className }: LayersPanelProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', className)} role="radiogroup" aria-label="Basemap">
      {LAYERS.map((layer) => {
        const active = layer.id === activeLayer;

        return (
          <button
            key={layer.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={layer.description}
            onClick={() => onLayerChange?.(layer.id)}
            className={cn(
              'group relative overflow-hidden rounded-xl border p-2 text-left transition-all duration-200 ease-mission',
              active
                ? 'border-accent/55 bg-accent/10 shadow-glow-accent'
                : 'border-hairline/10 bg-elevate/3 hover:border-accent/30 hover:bg-elevate/6',
            )}
          >
            {/* Thumbnail */}
            <span
              className="relative mb-1.5 block h-11 w-full overflow-hidden rounded-lg border border-black/40"
              style={{ background: SWATCH[layer.id] }}
              aria-hidden
            >
              {/* Faint graticule makes the swatch read as a map, not a chip. */}
              <span className="absolute inset-0 bg-grid-faint bg-grid opacity-45" />
              {active && (
                <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-on-accent">
                  <Check className="h-2.5 w-2.5" strokeWidth={3.2} />
                </span>
              )}
            </span>

            <span className="flex items-center gap-1.5">
              <Icon
                name={layer.icon}
                className={cn(
                  'h-3 w-3 shrink-0',
                  active ? 'text-accent' : 'text-ink-faint group-hover:text-ink-muted',
                )}
              />
              <span
                className={cn(
                  'truncate text-[10.5px] font-medium',
                  active ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {layer.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
