import { ApiError } from '@/services/apiClient';
import type { ApiEnvelope, ApiMeta } from '@/types';
import { uid } from '@/lib/utils';

/**
 * Mock transport.
 *
 * The whole point of this module is that `services/apiService.ts` talks to one
 * interface — `request()` — and does not care whether the bytes come from a
 * real backend or from here. Switching is a single env flag
 * (`NEXT_PUBLIC_USE_MOCK_API`).
 *
 * Error states are demoable too: any request whose params contain the token
 * `__fail` is rejected with a realistic ApiError, so the UI's error branches can
 * be exercised in a demo. Every call site in `services/apiService.ts` forwards
 * its params for exactly this reason; the multipart upload applies the same
 * check by hand.
 */

export interface MockRequestConfig {
  endpoint: string;
  params?: Record<string, unknown>;
  /** Artificial latency in ms — keeps loading skeletons honest. */
  latencyMs?: number;
}

const DEFAULT_LATENCY = 420;

function meta(source: ApiMeta['source'], elapsedMs: number): ApiMeta {
  return {
    requestId: uid('req'),
    generatedAt: new Date().toISOString(),
    source,
    elapsedMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldSimulateFailure(params?: Record<string, unknown>): boolean {
  if (!params) return false;
  return Object.values(params).some(
    (value) => typeof value === 'string' && value.includes('__fail'),
  );
}

/**
 * Wraps a fixture producer in the standard envelope + latency + failure hooks.
 */
export async function mockRequest<T>(
  config: MockRequestConfig,
  produce: (params: Record<string, unknown>) => T | Promise<T>,
): Promise<ApiEnvelope<T>> {
  const started = performance.now();
  const latency = config.latencyMs ?? DEFAULT_LATENCY;

  await sleep(latency + Math.random() * 160);

  if (shouldSimulateFailure(config.params)) {
    throw new ApiError({
      code: 'MOCK_SIMULATED_FAILURE',
      message:
        'The analysis service rejected this request (simulated upstream failure). Retry or clear the "__fail" token.',
      status: 503,
      details: { endpoint: config.endpoint, params: config.params },
    });
  }

  const data = await produce(config.params ?? {});
  return {
    data,
    meta: meta('mock', Math.round(performance.now() - started)),
  };
}
