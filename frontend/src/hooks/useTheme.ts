'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { readDocumentTheme } from '@/lib/theme';
import type { Theme } from '@/types';

export interface UseThemeResult {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Theme access.
 *
 * The inline pre-paint script in `<head>` has already decided the theme and
 * applied it to `<html>` (stored choice, then OS preference, then dark). The
 * store starts at the server's default and adopts the committed value on mount,
 * so the toggle reflects reality instead of the default.
 *
 * There is no `auto` state on purpose: one control, two states. The OS preference
 * only ever decides the initial value.
 */
export function useTheme(): UseThemeResult {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  useEffect(() => {
    const committed = readDocumentTheme();
    if (committed && committed !== theme) setTheme(committed);
  }, [theme, setTheme]);

  return { theme, isDark: theme === 'dark', setTheme, toggleTheme };
}
