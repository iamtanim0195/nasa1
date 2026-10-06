'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/services';
import { ToastViewport } from '@/components/ui/ToastViewport';
import { useTheme } from '@/hooks/useTheme';

/**
 * Global providers.
 *
 * The QueryClient is created inside `useState` so that it is never shared
 * between requests during SSR (and never recreated on re-render).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Retry only the failures worth retrying (network, 5xx, timeouts).
        retry: (failureCount, error) => {
          const apiError = ApiError.from(error);
          if (!apiError.isRetryable) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      },
      mutations: { retry: 0 },
    },
  });
}

/**
 * Adopts the theme the inline pre-paint script committed to `<html>`, once for
 * the whole app rather than per route.
 */
function ThemeSync() {
  useTheme();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      {children}
      <ToastViewport />
    </QueryClientProvider>
  );
}
