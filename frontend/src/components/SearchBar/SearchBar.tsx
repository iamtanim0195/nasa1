'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { useMap } from '@/hooks/useMap';
import { useAppStore } from '@/store/appStore';
import { cn, formatCoordinate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import type { GeoLocation } from '@/types';

export interface SearchBarProps {
  className?: string;
  placeholder?: string;
  /** Fires after a result is chosen â€” the API-ready integration point. */
  onLocationSelect?: (location: GeoLocation) => void;
  /** Hide the "Try Sundarbans, Nepalâ€¦" hint line. */
  showHelper?: boolean;
  /**
   * Hide the selected-location chip. The control panel renders its own, fuller
   * version (with the coordinates and a clear action), so it suppresses this one.
   */
  showSelectedSummary?: boolean;
}

/**
 * Location search.
 *
 * One box, several grammars: country, region, city, place name, or raw
 * coordinates. Keyboard-first (â†‘ â†“ Enter Esc) because analysts drive this
 * console from the keyboard.
 *
 * Used twice: once at the top of the rail as the global search, and once inside
 * the control panel's Location Input, where it replaces what used to be a fixed
 * list of areas.
 */
export function SearchBar({
  className,
  placeholder = 'Search country, city, region, coordinatesâ€¦',
  onLocationSelect,
  showHelper = true,
  showSelectedSummary = true,
}: SearchBarProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLocation = useAppStore((state) => state.selectedLocation);
  const { flyTo } = useMap();
  const { results, isLoading, isFetching, isError, error, isCoordinateQuery } =
    useLocationSearch(query);

  const showPanel = open && query.trim().length >= 2;

  /* Close on outside click â€” the result list floats above the panels. */
  useEffect(() => {
    if (!showPanel) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showPanel]);

  useEffect(() => setActiveIndex(0), [query]);

  const commit = (location: GeoLocation) => {
    flyTo(location);
    onLocationSelect?.(location);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const target = results[activeIndex];
      if (target) {
        event.preventDefault();
        commit(target);
      }
    }
  };

  const helper = useMemo(() => {
    if (isError && error) {
      // The list stays mounted so the failure is visible in context.
      return null;
    }
    if (isCoordinateQuery) return 'Coordinate pair detected â€” resolved locally, no round trip.';
    return 'Try â€œSundarbansâ€, â€œNepalâ€, or â€œ23.81, 90.41â€.';
  }, [isCoordinateQuery, isError, error]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Input */}
      <div
        className={cn(
          'flex h-11 items-center gap-2 rounded-xl border bg-sunken px-3 transition-colors',
          open ? 'border-accent/55' : 'border-hairline/12 hover:border-accent/30',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-accent" aria-hidden />

        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          aria-label="Search location"
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
        />

        {(isLoading || isFetching) && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
        )}

        {query && !isFetching && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            aria-label="Clear search"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-elevate/8 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Selected location summary */}
      {showSelectedSummary && selectedLocation && !showPanel && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/6 px-2.5 py-1.5">
          <MapPin className="h-3 w-3 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
            {selectedLocation.name}
          </span>
          <span className="telemetry shrink-0 text-[10px] text-ink-faint">
            {formatCoordinate(selectedLocation)}
          </span>
        </div>
      )}

      {/* Results */}
      {showPanel && (
        <div
          id={`${inputId}-listbox`}
          role="listbox"
          aria-label="Location results"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-chrome max-h-[19rem] overflow-y-auto rounded-xl border border-accent/25 bg-space-900/97 p-1.5 shadow-glass backdrop-blur-xl scrollbar-mission"
        >
          {isError && (
            <div className="px-2.5 py-3">
              <p className="text-[11px] font-semibold text-signal-critical">
                Location search failed
              </p>
              <p className="mt-0.5 text-[10px] text-ink-faint">
                The service is unreachable. Coordinates still work â€” type â€œlat, lngâ€.
              </p>
            </div>
          )}

          {!isError && results.length === 0 && !isFetching && (
            <div className="px-2.5 py-4 text-center">
              <p className="text-[11px] text-ink-muted">No match for â€œ{query}â€</p>
              {helper && <p className="mt-1 text-[10px] text-ink-faint">{helper}</p>}
            </div>
          )}

          {results.map((location, index) => (
            <button
              key={location.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(location)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                index === activeIndex ? 'bg-accent/12' : 'hover:bg-elevate/6',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-md border',
                  location.source === 'manual'
                    ? 'border-signal-medium/35 bg-signal-medium/10 text-signal-medium'
                    : 'border-hairline/10 bg-elevate/5 text-ink-faint',
                )}
              >
                {location.source === 'manual' ? (
                  <Crosshair className="h-3 w-3" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-medium text-ink">
                  {location.name}
                </span>
                <span className="telemetry block truncate text-[10px] text-ink-faint">
                  {formatCoordinate(location)}
                </span>
              </span>

              {location.country && (
                <Badge tone="neutral" className="shrink-0">
                  {location.country}
                </Badge>
              )}
            </button>
          ))}

          {/* Loading skeletons keep the panel geometry stable. */}
          {isFetching && results.length === 0 && (
            <div className="space-y-1.5 p-1.5" aria-busy="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <div className="h-6 w-6 animate-pulse rounded-md bg-elevate/6" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-elevate/6" />
                    <div className="h-2 w-1/2 animate-pulse rounded bg-elevate/4" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keyboard hint */}
      {showHelper && !showPanel && helper && (
        <p className="mt-1.5 px-0.5 text-[10px] leading-relaxed text-ink-faint">{helper}</p>
      )}
    </div>
  );
}
