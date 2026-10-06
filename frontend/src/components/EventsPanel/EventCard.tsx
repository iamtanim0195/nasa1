'use client';

import { MapPin } from 'lucide-react';
import { DETECTION_TYPE_MAP } from '@/lib/constants';
import { cn, formatArea, formatDate, formatPercent } from '@/lib/utils';
import { Badge, SeverityBadge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { DetectedEvent } from '@/types';

export interface EventCardProps {
  event: DetectedEvent;
  selected?: boolean;
  hovered?: boolean;
  onSelect?: (event: DetectedEvent) => void;
  onHover?: (eventId: string | null) => void;
  className?: string;
}

/**
 * One detection record.
 *
 * The five fields the spec calls out (ID, type, date, location, severity) plus
 * confidence and area — confidence is rendered as a bar because a bare number
 * does not communicate "how much should I trust this" at a glance.
 */
export function EventCard({
  event,
  selected = false,
  hovered = false,
  onSelect,
  onHover,
  className,
}: EventCardProps) {
  const detection = DETECTION_TYPE_MAP[event.detectionType];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      onMouseEnter={() => onHover?.(event.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(event.id)}
      onBlur={() => onHover?.(null)}
      aria-pressed={selected}
      className={cn(
        'group w-full rounded-xl border p-2.5 text-left transition-all duration-200 ease-mission',
        selected
          ? 'border-accent/55 bg-accent/10 shadow-glow-accent'
          : hovered
            ? 'border-accent/30 bg-elevate/6'
            : 'border-hairline/8 bg-elevate/3 hover:border-accent/25 hover:bg-elevate/6',
        className,
      )}
      style={selected ? undefined : { borderLeft: `2px solid ${detection.hex}66` }}
    >
      {/* Row 1: id + severity */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon name={detection.icon} className="h-3 w-3 shrink-0" />
          <span className="telemetry truncate text-[11px] font-semibold text-ink">{event.id}</span>
        </span>
        <SeverityBadge severity={event.severity} />
      </div>

      {/* Row 2: detection type + date */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <Badge tone="neutral" className="truncate">
          {detection.shortLabel}
        </Badge>
        <span className="telemetry shrink-0 text-[10px] text-ink-faint">
          {formatDate(event.eventDate)}
        </span>
      </div>

      {/* Row 3: location */}
      <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-snug text-ink-muted">
        <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0 text-ink-faint" aria-hidden />
        <span className="line-clamp-2">{event.location.name}</span>
      </p>

      {/* Row 4: confidence + area */}
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-ink-faint">Confidence</span>
            <span className="telemetry text-[9.5px] font-semibold text-ink-muted">
              {formatPercent(event.confidence, 1)}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-elevate/8">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(event.confidence * 100)}%`,
                background: detection.hex,
              }}
            />
          </div>
        </div>

        <span className="telemetry shrink-0 text-[10px] font-semibold text-signal-medium">
          {formatArea(event.areaKm2)}
        </span>
      </div>
    </button>
  );
}
