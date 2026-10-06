/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// EARTH-METAMORPHOSIS — Next.js configuration
//
// Three build targets:
//
//   1. `npm run build`         -> standard Next.js server / Vercel / Node host
//   2. `npm run build:static`  -> static export for GitHub Pages / S3 / CDN
//                                 (absolute /_next/... paths, trailing slashes)
//   3. `npm run build:preview` -> static export with RELATIVE asset paths, so the
//                                 out/ folder renders identically from any server
//                                 root, or straight off the disk
//
// For target 2 set NEXT_PUBLIC_BASE_PATH when the site is served from a
// sub-path, e.g. NEXT_PUBLIC_BASE_PATH=/Nova-Matrics---VI
// ---------------------------------------------------------------------------

const isStaticExport = process.env.BUILD_TARGET === 'static';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Target 3. A static export normally writes absolute paths (`/_next/...`), which
// forces the hosting server to use the export folder itself as its root. A
// relative prefix removes that constraint entirely, at the cost of one flat
// directory level (deep links become /page.html). Mutually exclusive with
// basePath, since a relative prefix already works wherever it is mounted.
const relativeAssets = isStaticExport && process.env.NEXT_RELATIVE_ASSETS === '1';

const nextConfig = {
  reactStrictMode: true,

  // Static export for GitHub Pages / any dumb file host.
  ...(isStaticExport
    ? {
        output: 'export',
        trailingSlash: relativeAssets ? false : true,
      }
    : {}),

  // A sub-path deployment (https://user.github.io/repo/) needs both of these.
  ...(relativeAssets ? { assetPrefix: './' } : basePath ? { basePath, assetPrefix: basePath } : {}),

  // No linter is bundled with this scaffold; TypeScript is the gate.
  eslint: { ignoreDuringBuilds: true },

  // Cesium ships its own Workers/Assets/Widgets; when it is self-hosted the
  // files land in /public/cesium and are served verbatim.
  images: { unoptimized: true },

  experimental: {
    // Keeps the heavy GIS/chart bundles out of the initial dashboard payload.
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],

    // Some hardened CI/sandboxed environments forbid spawning child processes
    // (the build then dies with `spawn EPERM`). Worker *threads* run in-process,
    // so this flag builds without ever forking. Also handy on 1-vCPU runners.
    //   NEXT_INPROCESS_BUILD=1 npm run build
    ...(process.env.NEXT_INPROCESS_BUILD === '1' ? { workerThreads: true, cpus: 1 } : {}),
  },
};

export default nextConfig;
