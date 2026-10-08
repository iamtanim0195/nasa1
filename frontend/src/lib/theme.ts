import type { Theme } from '@/types';

/**
 * Theme plumbing.
 *
 * The theme is a single class on `<html>`; every colour in the app then comes
 * from the CSS variables those classes set (see `src/app/globals.css`). Only two
 * subsystems cannot consume CSS and need the value in JavaScript: the Cesium
 * scene and the chart renderers.
 *
 * The pre-paint script below is inlined into `<head>` by `src/app/layout.tsx`. It
 * runs before the first paint, so a light-theme user never sees a dark flash —
 * which is the whole reason it is an inline string rather than an effect.
 */

export const THEME_STORAGE_KEY = 'earth-metamorphosis:theme';

export const THEMES: Theme[] = ['dark', 'light'];

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/**
 * Applies a theme to the document and remembers it.
 *
 * Safe to call on the server and in private-browsing modes where `localStorage`
 * throws.
 */
export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle('theme-light', theme === 'light');
  root.classList.toggle('theme-dark', theme === 'dark');
  root.dataset.theme = theme;
  // Drives native scrollbars, form controls and the canvas backdrop.
  root.style.colorScheme = theme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage disabled — the theme still applies for this session */
  }
}

/** Reads the theme the pre-paint script already committed to the DOM. */
export function readDocumentTheme(): Theme | null {
  if (typeof document === 'undefined') return null;
  const stored = document.documentElement.dataset.theme;
  return isTheme(stored) ? stored : null;
}

/**
 * The script that runs before first paint.
 *
 * Order of precedence: an explicit stored choice, then the OS preference, then
 * dark. Kept as a single line so it costs nothing and cannot be reformatted into
 * something that breaks when inlined.
 */
export const THEME_INIT_SCRIPT = [
  '(function(){try{',
  `var k=${JSON.stringify(THEME_STORAGE_KEY)};`,
  'var s=localStorage.getItem(k);',
  "var t=(s==='light'||s==='dark')?s:",
  "((window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark');",
  'var r=document.documentElement;',
  "r.classList.toggle('theme-light',t==='light');",
  "r.classList.toggle('theme-dark',t==='dark');",
  'r.dataset.theme=t;r.style.colorScheme=t;',
  '}catch(e){}})();',
].join('');
