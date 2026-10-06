'use client';

import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type Toast, type ToastVariant } from '@/store/toastStore';

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string; Icon: typeof Info }> = {
  info: { border: 'border-accent/40', icon: 'text-accent', Icon: Info },
  success: { border: 'border-signal-low/40', icon: 'text-signal-low', Icon: CheckCircle2 },
  warning: { border: 'border-signal-medium/40', icon: 'text-signal-medium', Icon: AlertTriangle },
  error: { border: 'border-signal-critical/45', icon: 'text-signal-critical', Icon: XCircle },
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const { border, icon, Icon } = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    if (!toast.duration) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-[min(92vw,380px)] items-start gap-3 rounded-xl border bg-space-900/95 p-3 shadow-glass backdrop-blur-xl',
        'animate-fade-up',
        border,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-ink-muted">
            {toast.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-elevate/8 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Global notification stack. Mounted once by `<Providers>`. */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-toast flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
