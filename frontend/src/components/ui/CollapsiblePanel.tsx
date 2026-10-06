'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PanelHeader } from './GlassPanel';

export interface CollapsiblePanelProps {
  /** Stable key used by the store to remember the open/closed state. */
  panelId: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Count or status chip rendered next to the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode — pass both to let the store own the state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** Caps the body height and enables internal scrolling. */
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Accessible collapsible section used for LAYERS / CONTROL PANEL / EVENTS.
 *
 * Implemented with a real `<button aria-expanded>` + `region` rather than
 * `<details>` so the header can host its own action buttons without nesting
 * interactive elements inside a summary.
 */
export function CollapsiblePanel({
  panelId,
  title,
  subtitle,
  icon,
  meta,
  actions,
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  bodyClassName,
  children,
}: CollapsiblePanelProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const bodyId = useId();

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      data-panel={panelId}
      className={cn(
        'relative overflow-hidden rounded-2xl glass transition-colors duration-300',
        isOpen && 'border-accent/20',
        className,
      )}
    >
      <div className="flex items-center gap-1 px-3 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-1 text-left transition-colors hover:bg-elevate/4"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-300 ease-mission',
              !isOpen && '-rotate-90',
            )}
            aria-hidden
          />
          <PanelHeader
            icon={icon}
            title={title}
            subtitle={subtitle}
            className="flex-1"
            actions={meta}
          />
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      <div
        id={bodyId}
        role="region"
        aria-label={title}
        hidden={!isOpen}
        className={cn('border-t border-hairline/6 px-3 pb-3 pt-3', bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}
