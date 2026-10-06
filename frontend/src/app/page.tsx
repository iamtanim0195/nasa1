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
 */
export default function DashboardPage() {
  return <Workspace />;
}
