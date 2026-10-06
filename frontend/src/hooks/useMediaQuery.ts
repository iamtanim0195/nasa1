'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe media query hook.
 *
 * Always returns `false` on the server and during the first client render so
 * that hydration output matches the server markup; the real value lands in an
 * effect. Components must therefore be written so the `false` branch is a valid
 * (if less convenient) layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Tailwind `lg` and up. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** Tailwind `md` and up. */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

/** True for users who asked for reduced motion — animations must be suppressed. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
