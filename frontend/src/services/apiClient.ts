import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';
import type { ApiEnvelope, ApiErrorShape } from '@/types';
import { uid } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export const API_TIMEOUT = Number(process.env.NEXT_PUBLIC_API_TIMEOUT ?? 20_000);

/**
 * `true` until the backend implements docs/API-CONTRACT.md.
 * Flip NEXT_PUBLIC_USE_MOCK_API=false to switch the entire app to real HTTP.
 */
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API !== 'false';

/**
 * Resolve a backend-relative path (e.g. `/artifacts/feni/feni_preview.png`)
 * against the API origin.
 *
 * The results endpoint returns pipeline artifact paths relative to the BACKEND,
 * so using them directly as an `<img src>` would resolve them against the
 * frontend origin and 404. Absolute URLs pass through untouched.
 */
export function resolveApiUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/* -------------------------------------------------------------------------- */
/* Normalised error                                                            */
/* -------------------------------------------------------------------------- */

export interface ApiErrorInit extends ApiErrorShape {
  cause?: unknown;
}

/**
 * Single error type surfaced to the UI. Every transport failure — HTTP status,
 * timeout, offline, simulated — is folded into this shape so components only
 * ever branch on `code` / `status` / `isRetryable`.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.cause = init.cause;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** 408/429/5xx and transport-level failures are worth retrying. */
  get isRetryable(): boolean {
    if (this.code === 'NETWORK_OFFLINE' || this.code === 'TIMEOUT') return true;
    if (this.status === undefined) return false;
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }

  get isOffline(): boolean {
    return this.code === 'NETWORK_OFFLINE';
  }

  get isTimeout(): boolean {
    return this.code === 'TIMEOUT';
  }

  get isValidation(): boolean {
    return this.status === 400 || this.status === 422;
  }

  toShape(): ApiErrorShape {
    return { code: this.code, message: this.message, status: this.status, details: this.details };
  }

  /** Folds anything thrown (AxiosError, DOMException, plain Error) into ApiError. */
  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: ApiErrorShape; message?: string }>;

      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        return new ApiError({
          code: 'TIMEOUT',
          message: `The service did not respond within ${API_TIMEOUT} ms.`,
          cause: error,
        });
      }

      if (!axiosError.response) {
        return new ApiError({
          code: 'NETWORK_OFFLINE',
          message:
            'No response from the analysis service. Check the API base URL and your connection.',
          cause: error,
        });
      }

      const { status, data } = axiosError.response;
      const payload = data as { error?: ApiErrorShape; message?: string } | undefined;

      return new ApiError({
        code: payload?.error?.code ?? `HTTP_${status}`,
        message:
          payload?.error?.message ?? payload?.message ?? `Request failed with status ${status}.`,
        status,
        details: payload?.error?.details ?? payload,
        cause: error,
      });
    }

    if (error instanceof Error) {
      return new ApiError({ code: 'UNEXPECTED', message: error.message, cause: error });
    }

    return new ApiError({
      code: 'UNEXPECTED',
      message: 'An unknown error occurred.',
      cause: error,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP client                                                                 */
/* -------------------------------------------------------------------------- */

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: API_TIMEOUT,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  config.headers.set('x-request-id', uid('req'));
  config.headers.set('x-client', 'earth-metamorphosis/1.0.0');
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(ApiError.from(error)),
);

/**
 * Unwraps the `{ data, meta }` envelope.
 *
 * A bare (non-enveloped) JSON body is tolerated and wrapped locally so a
 * backend that returns a plain payload does not break the UI.
 */
export async function httpRequest<T>(config: AxiosRequestConfig): Promise<ApiEnvelope<T>> {
  const response: AxiosResponse<ApiEnvelope<T> | T> = await apiClient.request(config);
  const body = response.data;

  if (body && typeof body === 'object' && 'data' in body && 'meta' in body) {
    return body as ApiEnvelope<T>;
  }

  return {
    data: body as T,
    meta: {
      requestId: String(response.headers['x-request-id'] ?? uid('req')),
      generatedAt: new Date().toISOString(),
      source: 'backend',
    },
  };
}
