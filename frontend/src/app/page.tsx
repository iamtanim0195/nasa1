import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Workspace } from '@/components/Workspace';

export const metadata: Metadata = {
  title: 'Mission Dashboard',
  description:
    'Full-screen NISAR change-detection console: 3D globe, basemap layers, job control, live event feed and before/after comparison.',
};

/**
 * `/` — the dashboard.
 *
 * A server component that simply mounts the client workspace. Keeping the route
 * server-side means metadata stays declarative while the heavy interactivity
 * lives behind a single client boundary.
 *
 * `Workspace` reads `useSearchParams()` (for `?result=feni` deep links), which
 * forces a client-side bailout during prerendering — Next.js requires that to
 * sit inside a Suspense boundary or `next build` fails on this page.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}
