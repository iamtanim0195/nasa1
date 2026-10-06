import type { Config } from 'tailwindcss';

/**
 * EARTH-METAMORPHOSIS design system.
 *
 * The palette is derived from NASA/ISRO mission-console aesthetics, and it ships
 * in two themes. Every surface and text colour resolves through a CSS variable,
 * so switching themes is one class on `<html>` â€” no component knows which theme
 * is active. See the token tables in `src/app/globals.css`.
 *
 * Two naming families exist on purpose:
 *
 *   space / ink / accent / signal  â€” semantic roles that stay *themselves* across
 *                                    themes (a panel is a panel).
 *   elevate / hairline / sunken    â€” tint layers that must *invert*: they are
 *                                    white-ish on dark and slate-ish on light.
 *
 * Using `bg-white/6` for a raised surface was the original sin here: it is
 * invisible in light mode. `bg-elevate/6` means the same thing in both.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: 'rgb(var(--space-950) / <alpha-value>)',
          900: 'rgb(var(--space-900) / <alpha-value>)',
          850: 'rgb(var(--space-850) / <alpha-value>)',
          800: 'rgb(var(--space-800) / <alpha-value>)',
          700: 'rgb(var(--space-700) / <alpha-value>)',
          600: 'rgb(var(--space-600) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          deep: 'rgb(var(--accent-deep) / <alpha-value>)',
          glow: 'rgb(var(--accent) / 0.55)',
        },
        signal: {
          critical: 'rgb(var(--signal-critical) / <alpha-value>)',
          high: 'rgb(var(--signal-high) / <alpha-value>)',
          medium: 'rgb(var(--signal-medium) / <alpha-value>)',
          low: 'rgb(var(--signal-low) / <alpha-value>)',
          info: 'rgb(var(--signal-info) / <alpha-value>)',
          violet: 'rgb(var(--signal-violet) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },

        /** Raised/hover tint: white on dark, slate on light. */
        elevate: 'rgb(var(--elevate) / <alpha-value>)',
        /** Border tint: same inversion as `elevate`. */
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        /** Inset input/well background. A complete colour, so no `/alpha`. */
        sunken: 'var(--sunken)',
        /** Text placed on the accent gradient â€” dark in both themes. */
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-accent': '0 0 24px -4px rgb(var(--accent) / 0.55)',
        'glow-critical': '0 0 24px -4px rgb(var(--signal-critical) / 0.5)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgb(var(--accent) / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent) / 0.05) 1px, transparent 1px)',
        'accent-sweep': 'linear-gradient(90deg, #27C9FF 0%, #B477FF 100%)',
        'panel-sheen': 'var(--panel-sheen)',
      },
      backgroundSize: {
        grid: '28px 28px',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.9' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'float 4s ease-in-out infinite',
        scan: 'scan 3.2s linear infinite',
        'fade-up': 'fade-up 0.35s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'spin-slow': 'spin-slow 12s linear infinite',
      },
      transitionTimingFunction: {
        mission: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      zIndex: {
        globe: '0',
        chrome: '40',
        slider: '60',
        overlay: '80',
        toast: '90',
      },
    },
  },
  plugins: [],
};

export default config;
