import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'EARTH-METAMORPHOSIS · NISAR Change Detection Platform',
    template: '%s · EARTH-METAMORPHOSIS',
  },
  description:
    'Earth observation and change-detection console for NISAR SAR data — flood, landslide, earthquake, infrastructure, sea-level, river-erosion and farming monitoring on an interactive 3D globe.',
  applicationName: 'EARTH-METAMORPHOSIS',
  keywords: [
    'NISAR',
    'SAR',
    'InSAR',
    'Earth observation',
    'change detection',
    'Cesium',
    'GIS',
    'flood monitoring',
  ],
  authors: [{ name: 'Nova Matrics - VI' }],
  openGraph: {
    title: 'EARTH-METAMORPHOSIS',
    description:
      'NISAR-based Earth Observation and Change Detection Platform — interactive 3D globe, D-SAR-D pipeline and hazard analytics.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#040711',
  width: 'device-width',
  initialScale: 1,
  // The globe needs the full viewport; pinch-zoom is handled inside Cesium.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Runs before first paint so a light-theme user never sees a dark flash.
          It sets `theme-light` / `theme-dark` and `data-theme` on <html>; every
          colour in the app then comes from the CSS variables those classes set.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full bg-space-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
