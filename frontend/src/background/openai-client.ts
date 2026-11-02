// V5.7 OpenAI adapter: the official Responses API with the user's own API
// key (Bearer). Stateless (store:false, no previous_response_id), no tools,
// no streaming, strict JSON schema per task. Checked against
// https://developers.openai.com/api/reference/resources/responses/methods/create
// on 2026-10-15.
import type { TokenUsage } from '../shared/contracts';
import type { ErrorCode } from '../shared/errors';
import { catalogModel, isModelId } from '../shared/models';
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

export const OPENAI_API_ORIGIN = 'https://api.openai.com';
export const RESPONSES_URL = `${OPENAI_API_ORIGIN}/v1/responses`;
export const MODELS_URL = `${OPENAI_API_ORIGIN}/v1/models`;
// Reasoning tokens are billed as output and share max_output_tokens: a model
// Correctly has not reviewed gets headroom for its default reasoning, still
// bounded. Not a money cap.
const REASONING_ALLOWANCE = { none: 0, minimal: 1024, unknown: 4096 };

/**
 * Temperature is never sent: several OpenAI reasoning models reject it.
 * `reasoning` is sent only with its documented value for reviewed models.
 */
export function responsesBody(modelId: string, task: TaskRequest): string {
  const reasoning = catalogModel('openai', modelId)?.reasoning;
  return JSON.stringify({
    model: modelId,
    input: [
      ...(task.instruction
        ? [{ role: 'developer', content: task.instruction }]
        : []),
      {
        role: 'user',
        // V7.1: Responses API image input, an `input_image` item with a data
        // URL next to the `input_text` item, per
        // https://developers.openai.com/api/docs/guides/images-vision
        // (checked 2026-11-02). Text-only tasks keep a plain string.
        content: task.image
          ? [
              { type: 'input_text', text: task.text },
              {
                type: 'input_image',
                image_url: `data:${task.image.mimeType};base64,${task.image.data}`,
              },
            ]
          : task.text,
      },
    ],
    store: false,
    stream: false,
    max_output_tokens:
      task.maxOutputTokens + REASONING_ALLOWANCE[reasoning ?? 'unknown'],
    ...(reasoning ? { reasoning: { effort: reasoning } } : {}),
    ...(task.schema
      ? {
          text: {
            format: {
              type: 'json_schema',
              name: task.name,
              strict: true,
              schema: task.schema,
            },
          },
        }
      : {}),
  });
}

function parseUsage(value: unknown): TokenUsage | undefined {
  const usage = object(value);
  const input = tokenCount(usage?.input_tokens);
  // output_tokens already includes reasoning tokens: never add them twice.
  const output = tokenCount(usage?.output_tokens);
  // input_tokens_details.cached_tokens is a subset of input_tokens.
  const cached = tokenCount(object(usage?.input_tokens_details)?.cached_tokens);
  const result: TokenUsage = {};
  if (input !== undefined) result.inputTokens = input;
  if (output !== undefined) result.outputTokens = output;
  if (cached !== undefined && input !== undefined && cached <= input)
    result.cachedInputTokens = cached;
  return Object.keys(result).length ? result : undefined;
}

/**
 * Walks the documented `output` array: only assistant `message` items with
 * `output_text` parts count (reasoning items are skipped); a `refusal` part
 * is an explicit failure; anything but status "completed" is rejected.
 */
export function parseResponse(body: unknown): Generation {
  const data = object(body);
  const usage = parseUsage(data?.usage);
  const invalid: Generation = {
    ok: false,
    code: 'INVALID_RESPONSE',
    answered: true,
  };
  if (!data || data.status !== 'completed' || !Array.isArray(data.output))
    return invalid;
  let text = '';
  for (const raw of data.output as unknown[]) {
    const item = object(raw);
    if (item?.type !== 'message') continue;
    if (!Array.isArray(item.content)) return invalid;
    for (const rawPart of item.content as unknown[]) {
      const part = object(rawPart);
      if (part?.type === 'refusal')
        return { ok: false, code: 'RESPONSE_REFUSED', answered: true };
      if (part?.type === 'output_text' && typeof part.text === 'string')
        text += part.text;
    }
  }
  if (!text) return invalid;
  return { ok: true, text, ...(usage ? { usage } : {}) };
}

const INCOMPATIBLE_PARAMS =
  /^(temperature|reasoning|text|max_output_tokens|store)/;

/** Maps an HTTP failure using only the status and OpenAI's `code`/`param` fields. */
export function classifyOpenAiError(status: number, body: unknown): ErrorCode {
  const error = object(object(body)?.error);
  const code = typeof error?.code === 'string' ? error.code : '';
  const param = typeof error?.param === 'string' ? error.param : '';
  if (status === 401) return 'INVALID_KEY';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404 || code === 'model_not_found') return 'MODEL_UNAVAILABLE';
  if (status === 429) return 'RATE_LIMITED';
  if (
    status === 400 &&
    (/^unsupported_(parameter|value)$/.test(code) ||
      INCOMPATIBLE_PARAMS.test(param))
  )
    return 'MODEL_INCOMPATIBLE';
  return 'PROVIDER_ERROR';
}

// The model list is not a capability list: these families never write text.
const NOT_TEXT =
  /(embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use|sora|babbage|davinci)/;

export function parseOpenAiModels(body: unknown): string[] {
  const list = object(body)?.data;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const id = object(raw)?.id;
    return isModelId(id) && !NOT_TEXT.test(id) ? [id] : [];
  });
}

const headers = (key: string, json: boolean): Record<string, string> => ({
  Authorization: `Bearer ${key}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

export const openaiAdapter: ProviderAdapter = {
  async generate(
    { key, modelId, fetchImpl, timeoutMs, signal }: CallOptions,
    task: TaskRequest,
  ): Promise<Generation> {
    if (!isModelId(modelId))
      return { ok: false, code: 'MODEL_UNAVAILABLE', answered: false };
    const reply = await requestJson(
      RESPONSES_URL,
      {
        method: 'POST',
        headers: headers(key, true),
        body: responsesBody(modelId, task),
      },
      { fetchImpl, timeoutMs, signal },
    );
    if (!reply.ok) return { ...reply, answered: false };
    if (reply.status < 200 || reply.status > 299)
      return {
        ok: false,
        code: classifyOpenAiError(reply.status, reply.json),
        httpStatus: reply.status,
        answered: true,
      };
    return parseResponse(reply.json);
  },

  async listModels({ key, fetchImpl, timeoutMs, signal }): Promise<ModelList> {
    const reply = await requestJson(
      MODELS_URL,
      { method: 'GET', headers: headers(key, false) },
      { fetchImpl, timeoutMs, signal },
    );
    if (!reply.ok) return reply;
    if (reply.status < 200 || reply.status > 299)
      return {
        ok: false,
        code: classifyOpenAiError(reply.status, reply.json),
        httpStatus: reply.status,
      };
    if (!Array.isArray(object(reply.json)?.data))
      return { ok: false, code: 'INVALID_RESPONSE' };
    return {
      ok: true,
      models: [...new Set(parseOpenAiModels(reply.json))]
        .sort()
        .slice(0, MAX_LISTED_MODELS),
    };
  },
};
