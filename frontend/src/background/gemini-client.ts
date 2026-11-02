import type { ErrorCode } from '../shared/errors';
import type { TokenUsage } from '../shared/contracts';
import { isModelId } from '../shared/models';
import { MAX_LISTED_MODELS } from '../shared/providers';
import {
  object,
  requestJson,
  tokenCount,
  type CallOptions,
  type Generation,
  type ModelList,
  type ProviderAdapter,
  type TaskRequest,
} from './transport';

export { REQUEST_TIMEOUT_MS } from './transport';
export const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';
export const SMOKE_TEST_PROMPT = 'Reply with OK only.';
// Room for minimal model "thinking" on Flash-Lite models; still a tiny
// request. This bounds tokens, it is not an exact cost cap.
export const MAX_OUTPUT_TOKENS = 128;
// Gemini "thinking" tokens share maxOutputTokens with the answer and the
// catalog models think by default: without headroom a longer translation or
// summary is cut (MAX_TOKENS) and rejected. Same headroom as an unreviewed
// OpenAI model; it bounds tokens, it is not a money cap.
export const THINKING_ALLOWANCE = 4096;
const MAX_SAMPLE_LENGTH = 40;
const MAX_LIST_PAGES = 5;

export type GeminiResult =
  | { ok: true; sample: string; usage?: TokenUsage }
  | { ok: false; code: ErrorCode; httpStatus?: number };

export interface GeminiRequest {
  apiKey: string;
  modelId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Only a strictly validated model ID reaches the URL path; anything else throws. */
export function generateContentUrl(modelId: string): string {
  if (!isModelId(modelId)) throw new Error('Invalid model ID');
  return `${GEMINI_API_ORIGIN}/v1beta/models/${modelId}:generateContent`;
}

/** The smoke test: one fixed prompt, plain text, no page text. */
export const smokeTask = (): TaskRequest => ({
  name: 'correctly_smoke_test',
  instruction: '',
  text: SMOKE_TEST_PROMPT,
  temperature: 0,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
});

/**
 * The generateContent body: instructions as the system instruction, the
 * text as its own part, JSON mode when the task has a contract (the shape
 * itself is enforced by the task parsers). 5.14.1: tasks with a contract get
 * thinking headroom; the smoke test keeps its tiny budget.
 */
export function geminiBody(task: TaskRequest): string {
  return JSON.stringify({
    ...(task.instruction
      ? { systemInstruction: { parts: [{ text: task.instruction }] } }
      : {}),
    contents: [
      {
        role: 'user',
        parts: [
          { text: task.text },
          // V7.1: the image part comes after the text part. Field names from
          // the generateContent REST reference (inlineData: mimeType + base64
          // data), https://ai.google.dev/gemini-api/docs/image-understanding,
          // checked 2026-11-02.
          ...(task.image
            ? [
                {
                  inlineData: {
                    mimeType: task.image.mimeType,
                    data: task.image.data,
                  },
                },
              ]
            : []),
        ],
      },
    ],
    generationConfig: {
      temperature: task.temperature,
      ...(task.schema ? { responseMimeType: 'application/json' } : {}),
      maxOutputTokens:
        task.maxOutputTokens + (task.schema ? THINKING_ALLOWANCE : 0),
    },
  });
}

export const smokeTestBody = (): string => geminiBody(smokeTask());

function parseUsage(value: unknown): TokenUsage | undefined {
  const usage = object(value);
  if (!usage) return undefined;
  const input = tokenCount(usage.promptTokenCount);
  const candidates = tokenCount(usage.candidatesTokenCount);
  const thoughts = tokenCount(usage.thoughtsTokenCount);
  // Thinking tokens are billed as output tokens.
  const output =
    candidates === undefined && thoughts === undefined
      ? undefined
      : (candidates ?? 0) + (thoughts ?? 0);
  // A subset of promptTokenCount, sent only when part of the prompt was
  // cached: absent next to a prompt count means none was.
  const cached =
    input === undefined
      ? undefined
      : (tokenCount(usage.cachedContentTokenCount) ??
        (usage.cachedContentTokenCount === undefined ? 0 : undefined));
  const result: TokenUsage = {};
  if (input !== undefined) result.inputTokens = input;
  if (output !== undefined) result.outputTokens = output;
  if (cached !== undefined && input !== undefined && cached <= input)
    result.cachedInputTokens = cached;
  return Object.keys(result).length ? result : undefined;
}

export function sanitizeSample(text: string, apiKey: string): string {
  const safe = text
    .split(apiKey)
    .join('[redacted]')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length > MAX_SAMPLE_LENGTH
    ? safe.slice(0, MAX_SAMPLE_LENGTH - 1) + '…'
    : safe;
}

export interface CandidateText {
  text: string;
  finishReason?: string;
  usage?: TokenUsage;
}

/** Joined non-thought text of the first candidate, or null when the prompt was blocked or the shape is wrong. */
export function candidateText(body: unknown): CandidateText | null {
  const data = object(body);
  if (!data || object(data.promptFeedback)?.blockReason) return null;
  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const candidate = object(candidates[0]);
  const parts = object(candidate?.content)?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map(object)
    .filter((part) => part && part.thought !== true)
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
  const finishReason =
    typeof candidate?.finishReason === 'string'
      ? candidate.finishReason
      : undefined;
  const usage = parseUsage(data.usageMetadata);
  return {
    text,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

const REFUSALS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);

/** A complete (STOP) answer, an explicit refusal, or an unusable body. */
export function parseGeneration(body: unknown): Generation {
  const data = object(body);
  const usage = parseUsage(data?.usageMetadata);
  const refused = (): Generation => ({
    ok: false,
    code: 'RESPONSE_REFUSED',
    answered: true,
  });
  if (object(data?.promptFeedback)?.blockReason) return refused();
  const candidate = candidateText(body);
  if (candidate?.finishReason && REFUSALS.has(candidate.finishReason))
    return refused();
  // A truncated (MAX_TOKENS) or otherwise unfinished answer is never parsed.
  if (
    !candidate ||
    (candidate.finishReason ?? 'STOP') !== 'STOP' ||
    !candidate.text
  )
    return { ok: false, code: 'INVALID_RESPONSE', answered: true };
  return { ok: true, text: candidate.text, ...(usage ? { usage } : {}) };
}

/** Success requires a non-empty, non-thought text part in the first candidate. */
export function parseSuccess(body: unknown, apiKey: string): GeminiResult {
  const candidate = candidateText(body);
  const sample = candidate ? sanitizeSample(candidate.text, apiKey) : '';
  if (!candidate || !sample) return { ok: false, code: 'INVALID_RESPONSE' };
  return candidate.usage
    ? { ok: true, sample, usage: candidate.usage }
    : { ok: true, sample };
}

/** Maps an HTTP failure to a code using only status and Google's enum fields. */
export function classifyHttpError(status: number, body: unknown): ErrorCode {
  const error = object(object(body)?.error);
  const providerStatus = typeof error?.status === 'string' ? error.status : '';
  const reasons = Array.isArray(error?.details)
    ? error.details
        .map((detail) => object(detail)?.reason)
        .filter((reason): reason is string => typeof reason === 'string')
    : [];
  if (reasons.some((reason) => /^API_KEY_(INVALID|EXPIRED)$/.test(reason)))
    return 'INVALID_KEY';
  if (status === 401) return 'INVALID_KEY';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 && providerStatus === 'FAILED_PRECONDITION')
    return 'PERMISSION_DENIED';
  return 'PROVIDER_ERROR';
}

export type GeminiReply =
  | { ok: true; body: unknown }
  | { ok: false; code: ErrorCode; httpStatus?: number };

/**
 * POSTs one generateContent request. Never retries: every dispatch may
 * consume quota, so retrying is always an explicit user action.
 */
export async function postGemini(
  { apiKey, modelId, fetchImpl, timeoutMs, signal }: GeminiRequest,
  body: string,
): Promise<GeminiReply> {
  const reply = await requestJson(
    generateContentUrl(modelId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    },
    { fetchImpl, timeoutMs, signal },
  );
  if (!reply.ok) return reply;
  if (reply.status < 200 || reply.status > 299)
    return {
      ok: false,
      code: classifyHttpError(reply.status, reply.json),
      httpStatus: reply.status,
    };
  return { ok: true, body: reply.json };
}

/** Sends the fixed smoke-test prompt once. */
export async function testGemini(
  request: GeminiRequest,
): Promise<GeminiResult> {
  const reply = await postGemini(request, smokeTestBody());
  return reply.ok ? parseSuccess(reply.body, request.apiKey) : reply;
}

// Writing tasks need generateContent and text; these families are not text models.
const NOT_TEXT =
  /(embedding|imagen|veo|tts|image|aqa|native-audio|live|robotics|computer-use|lyria)/;

/** `models/<id>` entries that support generateContent, across pages. */
export function parseGeminiModels(body: unknown): string[] {
  const models = object(body)?.models;
  if (!Array.isArray(models)) return [];
  return models.flatMap((raw) => {
    const model = object(raw);
    const name = typeof model?.name === 'string' ? model.name : '';
    const id = name.startsWith('models/') ? name.slice(7) : '';
    const methods = Array.isArray(model?.supportedGenerationMethods)
      ? model.supportedGenerationMethods
      : [];
    return isModelId(id) &&
      methods.includes('generateContent') &&
      !NOT_TEXT.test(id)
      ? [id]
      : [];
  });
}

export const geminiAdapter: ProviderAdapter = {
  async generate(
    { key, modelId, fetchImpl, timeoutMs, signal }: CallOptions,
    task: TaskRequest,
  ): Promise<Generation> {
    const reply = await postGemini(
      { apiKey: key, modelId, fetchImpl, timeoutMs, signal },
      geminiBody(task),
    );
    if (!reply.ok)
      return { ...reply, answered: reply.httpStatus !== undefined };
    return parseGeneration(reply.body);
  },

  async listModels({ key, fetchImpl, timeoutMs, signal }): Promise<ModelList> {
    const found = new Set<string>();
    let pageToken = '';
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const url = new URL(`${GEMINI_API_ORIGIN}/v1beta/models`);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const reply = await requestJson(
        url.href,
        { method: 'GET', headers: { 'x-goog-api-key': key } },
        { fetchImpl, timeoutMs, signal },
      );
      if (!reply.ok) return reply;
      if (reply.status < 200 || reply.status > 299)
        return {
          ok: false,
          code: classifyHttpError(reply.status, reply.json),
          httpStatus: reply.status,
        };
      if (!Array.isArray(object(reply.json)?.models))
        return { ok: false, code: 'INVALID_RESPONSE' };
      for (const id of parseGeminiModels(reply.json)) found.add(id);
      const next = object(reply.json)?.nextPageToken;
      if (typeof next !== 'string' || !next || next.length > 512) break;
      pageToken = next;
    }
    return { ok: true, models: [...found].sort().slice(0, MAX_LISTED_MODELS) };
  },
};
