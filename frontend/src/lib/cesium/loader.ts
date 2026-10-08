/**
 * Cesium runtime loader.
 *
 * WHY A LOADER INSTEAD OF `import * as Cesium from 'cesium'`?
 *
 * Cesium is ~1.4 MB of JS plus a Workers/Assets/Widgets tree. Bundling it
 * through Next.js means webpack plugins, worker URL rewriting and a very slow
 * cold build — for a dependency that only ever runs in the browser.
 *
 * Instead the runtime is fetched once at mount time and cached on `window`.
 * Consequences:
 *   - The dashboard's first paint is not blocked by Cesium.
 *   - The globe is a lazily-mounted client component with a real loading state.
 *   - Self-hosting is a one-line env change (see .env.example): copy
 *     node_modules/cesium/Build/Cesium into public/cesium and point
 *     NEXT_PUBLIC_CESIUM_BASE_URL at it. Air-gapped deployments work unchanged.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CesiumNamespace = Record<string, any>;

declare global {
  interface Window {
    Cesium?: CesiumNamespace;
    CESIUM_BASE_URL?: string;
  }
}

/** Pinned runtime version — bump deliberately, then re-run the smoke test. */
export const CESIUM_VERSION = '1.126.0';

const DEFAULT_BASE_URL = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium`;

const SCRIPT_ID = 'cesium-runtime-script';
const STYLE_ID = 'cesium-runtime-style';

let loaderPromise: Promise<CesiumNamespace> | null = null;

export function getCesiumBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CESIUM_BASE_URL;
  return configured && configured.length > 0 ? configured : DEFAULT_BASE_URL;
}

export function isCesiumLoaded(): boolean {
  return typeof window !== 'undefined' && Boolean(window.Cesium);
}

function injectStylesheet(baseUrl: string): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = `${baseUrl}/Widgets/widgets.css`;
  document.head.appendChild(link);
}

function injectScript(baseUrl: string): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Cesium can only be loaded in the browser.'));
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load Cesium from ${baseUrl}/Cesium.js`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `${baseUrl}/Cesium.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(
          new Error(
            `Cesium runtime could not be fetched from ${baseUrl}. Check the network policy or self-host it under /public/cesium.`,
          ),
        );
      },
      { once: true },
    );

    document.head.appendChild(script);
  });
}

/**
 * Resolves the global Cesium namespace, loading it on first call.
 * The promise is memoised: concurrent callers share a single network request.
 */
export async function loadCesium(): Promise<CesiumNamespace> {
  if (typeof window === 'undefined') {
    throw new Error('loadCesium() must be called from a client component.');
  }

  if (window.Cesium) return window.Cesium;
  if (loaderPromise) return loaderPromise;

  const baseUrl = getCesiumBaseUrl();

  // Cesium resolves its Workers/Assets relative to this global.
  window.CESIUM_BASE_URL = baseUrl;

  loaderPromise = (async () => {
    injectStylesheet(baseUrl);
    await injectScript(baseUrl);

    const cesium = window.Cesium;
    if (!cesium) {
      throw new Error('Cesium.js loaded but did not register the global namespace.');
    }

    // Optional Ion token unlocks World Terrain + Bing imagery. Everything the
    // dashboard needs by default is token-free.
    const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
    if (token && token.length > 0 && cesium.Ion) {
      cesium.Ion.defaultAccessToken = token;
    }

    return cesium;
  })();

  try {
    return await loaderPromise;
  } catch (error) {
    // Allow a later retry (transient network failure).
    loaderPromise = null;
    throw error;
  }
}

/** Removes the injected runtime. Only used by tests. */
export function unloadCesium(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(SCRIPT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  loaderPromise = null;
  delete window.Cesium;
}
