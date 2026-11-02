// V5.7 providers and the reviewed model catalog. Reviewed against the
// official model pages on 2026-10-15 (https://ai.google.dev/gemini-api/docs/models,
// https://developers.openai.com/api/docs/models/all): each entry is a text
// model documented with structured output. Availability for a specific key is
// only proven by the provider; a listed model can still be refused.
export type ProviderId = 'gemini' | 'openai';

export const PROVIDER_IDS: readonly ProviderId[] = ['gemini', 'openai'];

export const PROVIDERS: Record<
  ProviderId,
  { label: string; keysUrl: string; keysSite: string; pricingUrl: string }
> = {
  gemini: {
    label: 'Google Gemini',
    keysUrl: 'https://aistudio.google.com/apikey',
    keysSite: 'Google AI Studio',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  openai: {
    label: 'OpenAI',
    keysUrl: 'https://platform.openai.com/api-keys',
    keysSite: 'the OpenAI API dashboard',
    pricingUrl: 'https://openai.com/api/pricing/',
  },
};

// The actions a route can be chosen for (V5.7). "default" is the fallback
// only for actions set to "use the default".
export const TASKS = [
  'correction',
  'rewrite',
  'translation',
  'translateRewrite',
  // V5.12: its own route, limits and statistics (never counted as translation).
  'summary',
  // V6.1: real-time checks while typing, with their own route, limits, stats.
  'realtime',
] as const;
export type TaskKind = (typeof TASKS)[number];
export type RouteSlot = 'default' | TaskKind;
export const ROUTE_SLOTS: readonly RouteSlot[] = ['default', ...TASKS];
export const SLOT_LABELS: Record<RouteSlot, string> = {
  default: 'Default',
  correction: 'Correction',
  rewrite: 'Rewrite',
  translation: 'Translation',
  translateRewrite: 'Translate & rewrite',
  summary: 'Summary',
  realtime: 'Real-time',
};
export const isRouteSlot = (value: unknown): value is RouteSlot =>
  typeof value === 'string' &&
  (ROUTE_SLOTS as readonly string[]).includes(value);
/** Stable generated profile IDs (never a label or a key). */
export const PROFILE_ID = /^[A-Za-z0-9-]{8,64}$/;

export const isProviderId = (value: unknown): value is ProviderId =>
  value === 'gemini' || value === 'openai';

export interface ModelInfo {
  provider: ProviderId;
  id: string;
  label: string;
  note: string;
  /**
   * OpenAI reasoning effort sent with this model (documented lowest value);
   * unset = the parameter is never sent.
   */
  reasoning?: 'none' | 'minimal';
}

export const MODEL_CATALOG: readonly ModelInfo[] = [
  {
    provider: 'gemini',
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    note: 'Lowest listed price per token (V5.1 default).',
  },
  {
    provider: 'gemini',
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    note: 'Newer Flash-Lite model; slightly higher listed price.',
  },
  {
    provider: 'openai',
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    note: 'Documented for cost-sensitive workloads; sent with reasoning "none".',
    reasoning: 'none',
  },
  {
    provider: 'openai',
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    note: 'Documented for high-volume tasks; sent with reasoning "none".',
    reasoning: 'none',
  },
  {
    provider: 'openai',
    id: 'gpt-5-nano',
    label: 'GPT-5 nano',
    note: 'Older small model; sent with reasoning "minimal".',
    reasoning: 'minimal',
  },
];

/** Kept for V5.1 data: the model a migrated Gemini key used. */
export const GEMINI_MODELS = MODEL_CATALOG.filter(
  (m) => m.provider === 'gemini',
);
export const DEFAULT_MODEL_ID = 'gemini-3.1-flash-lite';

// Defence in depth: a model ID is data, never a URL. Only this character set
// (no "/", "?", "#", "%" or "..") is ever interpolated into a request path.
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export function isModelId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    MODEL_ID_PATTERN.test(value) &&
    !value.includes('..')
  );
}

/** V5.1 allowlist: a reviewed Gemini model. */
export function isAllowedModelId(value: unknown): value is string {
  return isModelId(value) && GEMINI_MODELS.some((model) => model.id === value);
}

export const catalogModel = (provider: ProviderId, id: string) =>
  MODEL_CATALOG.find((model) => model.provider === provider && model.id === id);

export type ModelStatus = 'reviewed' | 'unknown' | 'mismatch' | 'invalid';

/**
 * 'mismatch' = clearly another provider's model (rejected before any HTTP
 * call); 'unknown' = a syntactically valid ID Correctly has not reviewed.
 */
export function modelStatus(provider: ProviderId, id: unknown): ModelStatus {
  if (!isModelId(id)) return 'invalid';
  if (catalogModel(provider, id)) return 'reviewed';
  const other = MODEL_CATALOG.some(
    (m) => m.provider !== provider && m.id === id,
  );
  const looksGemini = /^(gemini|gemma)-/.test(id);
  const looksOpenAi = /^(gpt-|o\d|chatgpt-)/.test(id);
  if (other || (provider === 'gemini' ? looksOpenAi : looksGemini))
    return 'mismatch';
  return 'unknown';
}

export function modelLabel(id: string): string {
  return MODEL_CATALOG.find((model) => model.id === id)?.label ?? id;
}
