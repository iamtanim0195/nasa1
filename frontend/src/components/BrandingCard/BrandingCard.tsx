'use client';

import { Globe2, Radio } from 'lucide-react';
import { assetPath, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

export interface BrandingCardProps {
  /** Overrides the bundled mark. */
  logoSrc?: string;
  className?: string;
  /** Rendered under the wordmark. */
  tagline?: string;
  /** Live indicator on the right of the header row. */
  status?: 'online' | 'degraded' | 'offline';
}

const STATUS_META = {
  online: { tone: 'success' as const, label: 'Live', dot: 'bg-signal-low' },
  degraded: { tone: 'warning' as const, label: 'Degraded', dot: 'bg-signal-medium' },
  offline: { tone: 'danger' as const, label: 'Offline', dot: 'bg-signal-critical' },
};

/**
 * Mission wordmark card.
 *
 * Sits directly under the search box: the operator's eye lands on it while
 * results load, so it doubles as the "which system am I on" anchor.
 */
export function BrandingCard({
  logoSrc = '/logo.svg',
  className,
  tagline = 'NISAR Change Detection Platform',
  status = 'online',
}: BrandingCardProps) {
  const meta = STATUS_META[status];

  return (
    <div
      className={cn(
        'sheen relative flex items-center gap-3 overflow-hidden rounded-2xl glass-strong p-3',
        className,
      )}
    >
      {/* Mark */}
      <div className="relative grid h-12 w-12 shrink-0 place-items-center">
        <span className="absolute inset-0 rounded-xl bg-accent/10 blur-md" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetPath(logoSrc)}
          alt="EARTH-METAMORPHOSIS mark"
          width={48}
          height={48}
          className="relative h-12 w-12 rounded-xl"
          loading="eager"
          decoding="async"
        />
      </div>

      {/* Wordmark */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Globe2 className="h-3 w-3 shrink-0 text-accent" aria-hidden />
          <h1 className="truncate text-[12.5px] font-bold uppercase leading-none tracking-[0.11em] text-gradient">
            Earth-Metamorphosis
          </h1>
        </div>

        <p className="mt-1 truncate text-[10px] leading-tight text-ink-muted">{tagline}</p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <Badge tone={meta.tone} className="gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
            {meta.label}
          </Badge>
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-ink-faint">
            <Radio className="h-2.5 w-2.5" aria-hidden />
            NISAR · L-band
          </span>
        </div>
      </div>
    </div>
  );
}
