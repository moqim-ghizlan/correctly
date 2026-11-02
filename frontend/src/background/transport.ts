import type { TokenUsage } from '../shared/contracts';
import type { ErrorCode } from '../shared/errors';

// Shared by the Gemini and OpenAI adapters: one HTTPS request to a fixed
// provider origin, bounded in time and size, never retried, never logged.

export const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 256 * 1024;

/** Provider-neutral task: the adapter maps it to its own JSON envelope. */
export interface TaskRequest {
  /** Schema name (OpenAI strict JSON schema). */
  name: string;
  /** Fixed task instructions; never contains the user's text. */
  instruction: string;
  /** The (already protected) user text, sent as its own message. */
  text: string;
  temperature: number;
  maxOutputTokens: number;
  /** The exact task contract; absent = plain text answer (smoke test). */
  schema?: Record<string, unknown>;
  /** V7.1: one image sent next to the text (text-only tasks never set it). */
  image?: TaskImage;
}

/** A cropped screen area: base64 without the data-URL prefix. */
export interface TaskImage {
  mimeType: 'image/png' | 'image/jpeg';
  data: string;
}

/** Upper bound of the base64 sent (about 3 MB of image bytes). */
export const MAX_IMAGE_BASE64_CHARS = 4 * 1024 * 1024;

export const isTaskImage = (value: unknown): value is TaskImage => {
  const data = object(value);
  return (
    !!data &&
    Object.keys(data).sort().join() === 'data,mimeType' &&
    (data.mimeType === 'image/png' || data.mimeType === 'image/jpeg') &&
    typeof data.data === 'string' &&
    data.data.length > 0 &&
    data.data.length <= MAX_IMAGE_BASE64_CHARS &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(data.data)
  );
};

export interface CallOptions {
  key: string;
  modelId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Aborted when the profile is deleted or its key replaced mid-request. */
  signal?: AbortSignal;
}

/**
 * `answered` = the provider sent an HTTP response; otherwise the request may
 * or may not have reached it, and billing is unknown.
 */
export type Generation =
  | { ok: true; text: string; usage?: TokenUsage }
  | { ok: false; code: ErrorCode; httpStatus?: number; answered: boolean };

export type ModelList =
  | { ok: true; models: string[] }
  | { ok: false; code: ErrorCode; httpStatus?: number };

export interface ProviderAdapter {
  /** Exactly one POST; never retried. */
  generate(options: CallOptions, task: TaskRequest): Promise<Generation>;
  /** Free metadata call: proves the key is accepted, not that a model works. */
  listModels(options: Omit<CallOptions, 'modelId'>): Promise<ModelList>;
}

export type HttpReply =
  | { ok: true; status: number; json: unknown }
  | { ok: false; code: 'TIMEOUT' | 'NETWORK_ERROR' | 'ROUTE_CHANGED' };

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length > MAX_BODY_CHARS ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export async function requestJson(
  url: string,
  init: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    headers: Record<string, string>;
    body?: string;
  },
  {
    fetchImpl = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal,
  }: Pick<CallOptions, 'fetchImpl' | 'timeoutMs' | 'signal'>,
): Promise<HttpReply> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const stop = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', stop);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    return {
      ok: true,
      status: response.status,
      json: await readJson(response),
    };
  } catch {
    if (timedOut) return { ok: false, code: 'TIMEOUT' };
    return {
      ok: false,
      code: signal?.aborted ? 'ROUTE_CHANGED' : 'NETWORK_ERROR',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

export const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const tokenCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
