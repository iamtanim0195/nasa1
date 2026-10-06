import { SEVERITIES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export interface GlobeLegendProps {
  className?: string;
  /** Also list detection-type colours instead of only severity. */
  showDetectionTypes?: boolean;
  detectionTypes?: Array<{ label: string; hex: string }>;
}

/**
 * Change legend.
 *
 * Colour is the only channel carrying severity on the globe, so the legend is
 * mandatory rather than decorative — it stays pinned above the comparison
 * control.
 */
export function GlobeLegend({
  className,
  showDetectionTypes = false,
  detectionTypes = [],
}: GlobeLegendProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-hairline/8 bg-space-950/72 px-3 py-2.5 backdrop-blur-md',
        className,
      )}
    >
      <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
        Change Legend
      </h4>

      <ul className="space-y-1.5">
        {SEVERITIES.map((severity) => (
          <li key={severity.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: severity.hex, boxShadow: `0 0 8px ${severity.hex}66` }}
              aria-hidden
            />
            <span className="text-[10px] text-ink-muted">{severity.label} severity</span>
          </li>
        ))}

        <li className="flex items-center gap-2 border-t border-hairline/8 pt-1.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute h-2.5 w-2.5 animate-pulse-ring rounded-full bg-accent/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="text-[10px] text-ink-muted">Selected AOI</span>
        </li>
      </ul>

      {showDetectionTypes && detectionTypes.length > 0 && (
        <>
          <div className="my-2 h-px bg-elevate/8" />
          <ul className="space-y-1">
            {detectionTypes.map((type) => (
              <li key={type.label} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: type.hex }}
                  aria-hidden
                />
                <span className="text-[10px] text-ink-faint">{type.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
