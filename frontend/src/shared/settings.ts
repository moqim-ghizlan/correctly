import { DEFAULT_MODEL_ID, isAllowedModelId } from './models';
import { isLocalDate } from './local-date';
import {
  DEFAULT_FORMALITY,
  DEFAULT_REWRITE_STYLES,
  normalizeFormality,
  normalizeStyleIds,
  type Formality,
  type RewriteStyleId,
} from './rewrite';
import { normalizeTranslation, type TranslationPreferences } from './translate';
import { isLanguageSetting, type LanguageSetting } from './locale';

export const DAILY_LIMIT_DEFAULT = 20;
export const DAILY_LIMIT_MIN = 1;
export const DAILY_LIMIT_MAX = 100;

/** Written only by the options page. */
export interface V51Settings {
  schemaVersion: 1;
  // V5.1 single key: read once by the V5.7 migration (shared/providers.ts),
  // which then clears apiKey. Keys now live in correctly.v5.secrets.
  gemini: {
    apiKey: string | null;
    modelId: string;
    keyRevision: number;
  };
  // Counts every generation request, all providers and keys together.
  safety: { dailyTestAttemptLimit: number };
  // V5.2: no selected text is ever sent before the user opts in.
  correction: { consent: boolean };
  // V5.3 entry points. The smart button needs optional all-sites access, so
  // it is off until the user enables it (and grants that access). 5.15: the
  // translate button on selected text needs the same access, also opt-in.
  triggers: {
    keyboard: boolean;
    contextMenu: boolean;
    smartButton: boolean;
    selectionButton: boolean;
    // V6.1: real-time correction while typing; same all-sites access, opt-in.
    realtime: boolean;
  };
  // V5.4: styles pre-selected in the rewrite picker (stable IDs only).
  // Custom formality (2026-10-16): the slider's starting level.
  rewrite: {
    enabled: boolean;
    defaultStyles: RewriteStyleId[];
    formality: Formality;
  };
  // V5.5: picker defaults; Translate & rewrite reuses rewrite.defaultStyles.
  translation: TranslationPreferences;
  // V6.1: how checks run. Nothing is sent to a provider unless engine is
  // 'api' AND apiConsent was given through the warning dialog.
  realtime: RealtimeSettings;
  // 5.13: interface language ('auto' follows the browser's language).
  ui: { language: LanguageSetting };
}

export type RealtimeEngine = 'auto' | 'local' | 'api';
export interface RealtimeSettings {
  engine: RealtimeEngine;
  apiConsent: boolean;
  /** Hostnames where nothing is checked (at most MAX_DISABLED_SITES). */
  disabledSites: string[];
}
export const MAX_DISABLED_SITES = 200;
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

export function normalizeRealtime(value: unknown): RealtimeSettings {
  const data = record(value);
  const sites = Array.isArray(data.disabledSites) ? data.disabledSites : [];
  const unique = new Set<string>();
  for (const site of sites as unknown[]) {
    const host = typeof site === 'string' ? site.trim().toLowerCase() : '';
    if (HOSTNAME.test(host)) unique.add(host);
    if (unique.size >= MAX_DISABLED_SITES) break;
  }
  return {
    engine:
      data.engine === 'local' || data.engine === 'api' ? data.engine : 'auto',
    apiConsent: data.apiConsent === true,
    disabledSites: [...unique],
  };
}

/**
 * V5.11: vertical position of the right-edge handle as a fraction of the
 * viewport height (0.5 = centered), one global value for every site.
 */
export interface HandlePosition {
  schemaVersion: 1;
  yRatio: number;
}

export const DEFAULT_HANDLE_Y = 0.5;

export function normalizeHandle(value: unknown): HandlePosition {
  const y = record(value).yRatio;
  return {
    schemaVersion: 1,
    yRatio:
      typeof y === 'number' && Number.isFinite(y)
        ? Math.min(1, Math.max(0, y))
        : DEFAULT_HANDLE_Y,
  };
}

/** Per provider, key (profile ID + revision), model and task, for one day. */
export interface RouteUsage {
  attempts: number;
  completed: number;
  failed: number;
  unknown: number;
  inputTokens: number;
  outputTokens: number;
}

/** Written only by the service worker's serialized usage guard. */
export interface DailyUsageRecord {
  schemaVersion: 1;
  localDate: string;
  /** Every reserved generation request (the daily limit counts these). */
  testAttempts: number;
  completed: number;
  failed: number;
  /** Sent, but the answer was lost (timeout, network, worker stopped): billing unknown. */
  unknown: number;
  inputTokensObserved: number;
  outputTokensObserved: number;
  /** V5.7 attribution; requests before V5.7 stay unattributed. */
  routes: Record<string, RouteUsage>;
  /** Requests reserved and not settled yet: operation ID → route key. */
  pending: Record<string, string>;
}

export const MAX_ROUTE_ENTRIES = 100;
// provider|profileId|revision|model|task — no text, no key.
export const ROUTE_KEY =
  /^(gemini|openai)\|[A-Za-z0-9-]{8,64}\|\d{1,9}\|[a-z0-9][a-z0-9._-]{0,79}\|(correction|rewrite|translation|translateRewrite|test)$/;
const OPERATION_ID = /^[A-Za-z0-9-]{8,64}$/;

export const defaultSettings = (): V51Settings => ({
  schemaVersion: 1,
  gemini: { apiKey: null, modelId: DEFAULT_MODEL_ID, keyRevision: 0 },
  safety: { dailyTestAttemptLimit: DAILY_LIMIT_DEFAULT },
  correction: { consent: false },
  triggers: {
    keyboard: true,
    contextMenu: true,
    smartButton: false,
    selectionButton: false,
    realtime: false,
  },
  rewrite: {
    enabled: true,
    defaultStyles: [...DEFAULT_REWRITE_STYLES],
    formality: DEFAULT_FORMALITY,
  },
  translation: normalizeTranslation(undefined),
  realtime: normalizeRealtime(undefined),
  ui: { language: 'auto' },
});

export const emptyUsage = (date: string): DailyUsageRecord => ({
  schemaVersion: 1,
  localDate: date,
  testAttempts: 0,
  completed: 0,
  failed: 0,
  unknown: 0,
  inputTokensObserved: 0,
  outputTokensObserved: 0,
  routes: {},
  pending: {},
});

export const emptyRouteUsage = (): RouteUsage => ({
  attempts: 0,
  completed: 0,
  failed: 0,
  unknown: 0,
  inputTokens: 0,
  outputTokens: 0,
});

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

// Structural check only: proves nothing about validity at Google.
const API_KEY_PATTERN = /^[A-Za-z0-9_.-]{20,200}$/;

export function isApiKeyShaped(value: unknown): value is string {
  return typeof value === 'string' && API_KEY_PATTERN.test(value);
}

/** Returns the limit, or null when the input is not an integer in range. */
export function parseDailyLimit(value: unknown): number | null {
  const number =
    typeof value === 'string' && /^\s*\d+\s*$/.test(value)
      ? Number(value)
      : value;
  return typeof number === 'number' &&
    Number.isInteger(number) &&
    number >= DAILY_LIMIT_MIN &&
    number <= DAILY_LIMIT_MAX
    ? number
    : null;
}

export function normalizeSettings(value: unknown): V51Settings {
  const data = record(value),
    gemini = record(data.gemini),
    safety = record(data.safety),
    triggers = record(data.triggers),
    rewrite = record(data.rewrite);
  return {
    schemaVersion: 1,
    gemini: {
      apiKey: isApiKeyShaped(gemini.apiKey) ? gemini.apiKey : null,
      // A corrupt or unknown model falls back to the cheapest allowlisted one.
      modelId: isAllowedModelId(gemini.modelId)
        ? gemini.modelId
        : DEFAULT_MODEL_ID,
      keyRevision: count(gemini.keyRevision),
    },
    safety: {
      dailyTestAttemptLimit:
        parseDailyLimit(safety.dailyTestAttemptLimit) ?? DAILY_LIMIT_DEFAULT,
    },
    correction: { consent: record(data.correction).consent === true },
    triggers: {
      keyboard: triggers.keyboard !== false,
      contextMenu: triggers.contextMenu !== false,
      smartButton: triggers.smartButton === true,
      selectionButton: triggers.selectionButton === true,
      realtime: triggers.realtime === true,
    },
    rewrite: {
      enabled: rewrite.enabled !== false,
      defaultStyles: normalizeStyleIds(rewrite.defaultStyles).length
        ? normalizeStyleIds(rewrite.defaultStyles)
        : [...DEFAULT_REWRITE_STYLES],
      formality: normalizeFormality(rewrite.formality),
    },
    translation: normalizeTranslation(data.translation),
    realtime: normalizeRealtime(data.realtime),
    ui: {
      language: isLanguageSetting(record(data.ui).language)
        ? (record(data.ui).language as LanguageSetting)
        : 'auto',
    },
  };
}

/** A record for another day (or a corrupt one) becomes a fresh record for `today`. */
export function normalizeUsage(
  value: unknown,
  today: string,
): DailyUsageRecord {
  const data = record(value);
  if (!isLocalDate(data.localDate) || data.localDate !== today)
    return emptyUsage(today);
  return {
    schemaVersion: 1,
    localDate: today,
    testAttempts: count(data.testAttempts),
    completed: count(data.completed),
    failed: count(data.failed),
    unknown: count(data.unknown),
    inputTokensObserved: count(data.inputTokensObserved),
    outputTokensObserved: count(data.outputTokensObserved),
    routes: Object.fromEntries(
      Object.entries(record(data.routes))
        .filter(([key]) => ROUTE_KEY.test(key))
        .slice(0, MAX_ROUTE_ENTRIES)
        .map(([key, value]) => {
          const item = record(value);
          return [
            key,
            {
              attempts: count(item.attempts),
              completed: count(item.completed),
              failed: count(item.failed),
              unknown: count(item.unknown),
              inputTokens: count(item.inputTokens),
              outputTokens: count(item.outputTokens),
            },
          ];
        }),
    ),
    pending: Object.fromEntries(
      Object.entries(record(data.pending)).filter(
        (entry): entry is [string, string] =>
          OPERATION_ID.test(entry[0]) &&
          typeof entry[1] === 'string' &&
          ROUTE_KEY.test(entry[1]),
      ),
    ),
  };
}
