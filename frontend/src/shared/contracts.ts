import {
  errorMessage,
  isErrorCode,
  isRetryable,
  type ErrorCode,
} from './errors';
import {
  PROFILE_ID,
  isModelId,
  isProviderId,
  isRouteSlot,
  type ProviderId,
  type RouteSlot,
} from './models';
import { toQuotaNote, type QuotaNote } from './quota';

/**
 * Sent by the options page only: one tiny, possibly billed generation through
 * the route saved for `slot`. Carries no key and no page text.
 */
export const TEST_CONNECTION = 'correctly.v5.testConnection';
/** Sent by the options page only: free key check + model list for one profile. */
export const TEST_KEY = 'correctly.v5.testKey';
/** Sent by the injected content script with the user's selected text. */
export const CORRECT_TEXT = 'correctly.v5.correctText';
/** Sent by the options page to open tabs when the smart button is turned off. */
export const SMART_BUTTON_OFF = 'correctly.v5.smartButtonOff';
/** 5.15: settings page → open tabs: remove the translate button now. */
export const SELECTION_BUTTON_OFF = 'correctly.v5.selectionButtonOff';
/**
 * 5.15: the translate button (page script) → worker: open the Correctly
 * window on the Translation tab with this text, and translate it at once
 * when `generate` is true. Never replied to; the worker sends nothing to a
 * provider for it.
 */
export const OPEN_TRANSLATION = 'correctly.v5.openTranslation';
/** Sent by the injected content script with selected text and style IDs. */
export const REWRITE_TEXT = 'correctly.v5.rewriteText';
/** Sent by the injected content script with text, languages and styles. */
export const TRANSLATE_TEXT = 'correctly.v5.translateText';
/** V5.12: sent by the modal's Summary tab with text, target and options. */
export const SUMMARIZE_TEXT = 'correctly.v5.summarizeText';
/**
 * V6.1: sent by the page script while the user types (API engine only):
 * one sentence plus the previous one; answered with the issues found.
 */
export const CHECK_TEXT = 'correctly.v5.checkText';
/**
 * V6.1.4: sent by the page script when "Add to dictionary" is used on a
 * suggestion card: `{ type, word }`; the worker stores it, nothing is replied.
 */
export const ADD_WORD = 'correctly.v5.addWord';
/**
 * V7.1: sent by the window's "Capture text" flow with the rectangle the user
 * drew (CSS px) and the viewport size; the worker captures, crops and reads
 * the image. Only numbers travel: the screenshot never enters the page.
 */
export const EXTRACT_TEXT = 'correctly.v5.extractText';
/**
 * V7.1: `{ type, action: 'status' | 'grant' }` from the window: reads or
 * grants the separate image consent (the page never writes storage itself).
 */
export const IMAGE_CONSENT = 'correctly.v5.imageConsent';
/**
 * V5.11: sent by the right-edge handle (no data): asks the worker to open the
 * Correctly modal in that frame, like the toolbar icon and Ctrl+M.
 */
export const OPEN_MODAL = 'correctly.v5.openModal';
/** V5.11: sent by the modal's Settings gear: opens the options page. */
export const OPEN_SETTINGS = 'correctly.v5.openSettings';
/** V5.11: sent by the handle after a drag: its vertical position (0–1). */
export const HANDLE_POSITION = 'correctly.v5.handlePosition';
/** Sent by the page script: is the smart button on, which shortcuts are active. */
export const PAGE_CONFIG = 'correctly.v5.pageConfig';
/**
 * Sent by the page script when one of Correctly's own keyboard shortcuts is
 * pressed: `{ type, action }` only; the worker runs that action in the frame.
 */
export const KEY_COMMAND = 'correctly.v5.keyCommand';
/** Sent by the content script ("Manage limits"): opens the usage limits. */
export const OPEN_LIMITS = 'correctly.v5.openLimits';
/** V5.9: sent by the content script after an AI edit was really applied or undone. */
export const AI_EDIT = 'correctly.v5.aiEdit';
/** Opaque request ID returned to the page (never derived from text or keys). */
export const OPERATION_ID = /^[A-Za-z0-9-]{8,64}$/;

export interface AiEditRequest {
  type: typeof AI_EDIT;
  operationId: string;
  action: 'applied' | 'undone';
}

/** Strict shape check: exactly `{ type, operationId, action }`. */
export function isAiEditRequest(value: unknown): value is AiEditRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'action,operationId,type' &&
    data.type === AI_EDIT &&
    typeof data.operationId === 'string' &&
    OPERATION_ID.test(data.operationId) &&
    (data.action === 'applied' || data.action === 'undone')
  );
}
export interface HandlePositionRequest {
  type: typeof HANDLE_POSITION;
  yRatio: number;
}

/** Strict shape check: exactly `{ type, yRatio }` with a finite 0–1 ratio. */
export function isHandlePositionRequest(
  value: unknown,
): value is HandlePositionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'type,yRatio' &&
    data.type === HANDLE_POSITION &&
    typeof data.yRatio === 'number' &&
    Number.isFinite(data.yRatio) &&
    data.yRatio >= 0 &&
    data.yRatio <= 1
  );
}

/** Manifest command names of the keyboard shortcuts. */
export const CORRECT_COMMAND = 'correct-selection';
/** V5.11: Ctrl+M opens the Correctly modal. */
export const OPEN_COMMAND = 'open-correctly';
export const REWRITE_COMMAND = 'rewrite-selection';
export const TRANSLATE_COMMAND = 'translate-selection';
/** Bounds cost and latency; longer selections are refused, never truncated. */
export const MAX_CORRECTION_CODE_POINTS = 2000;
/**
 * V5.12: a summary may read a longer selection (about 2,000 words), still in
 * ONE bounded request. Longer text is refused, never truncated or chunked.
 */
export const MAX_SUMMARY_CODE_POINTS = 12000;
// A reply may double the length (2× + 50 code points, see parseCorrection);
// in UTF-16 units that is at most 4× + 100.
const MAX_CORRECTED_CHARS = 4 * MAX_CORRECTION_CODE_POINTS + 100;

export interface TestConnectionRequest {
  type: typeof TEST_CONNECTION;
  slot: RouteSlot;
}

export interface TestKeyRequest {
  type: typeof TEST_KEY;
  credentialId: string;
}

/** Provider-reported tokens; a missing field is unknown, never zero. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** V5.9: the part of inputTokens served from the provider's cache (a subset). */
  cachedInputTokens?: number;
}

export type ConnectionResult =
  | {
      ok: true;
      provider: ProviderId;
      model: string;
      checkedAt: string;
      sample: string;
      usage?: TokenUsage;
      notice?: QuotaNote;
    }
  | {
      ok: false;
      code: ErrorCode;
      message: string;
      retryable: boolean;
      httpStatus?: number;
      /** V5.8: the usage limit that refused this request (nothing was sent). */
      quota?: QuotaNote;
      /** V5.8: a usage warning crossed by this (sent, failed) request. */
      notice?: QuotaNote;
    };

export interface CorrectTextRequest {
  type: typeof CORRECT_TEXT;
  text: string;
}

export type FailureResult = Extract<ConnectionResult, { ok: false }>;

/** `models` = how many text models the key can list (the list itself is stored). */
export type KeyCheckResult = { ok: true; models: number } | FailureResult;

export type CorrectionResult =
  | { ok: true; hasErrors: false; notice?: QuotaNote; operationId?: string }
  | {
      ok: true;
      hasErrors: true;
      correctedText: string;
      // Numbers, links or emails differ: shown, but Apply stays disabled.
      suspicious: boolean;
      /** V5.8: a usage warning (80/95/100 %) this request crossed. */
      notice?: QuotaNote;
      /** V5.9: lets the page report a confirmed Apply/Undo for statistics. */
      operationId?: string;
    }
  | FailureResult;

/** A validated V5.8 usage warning carried by a successful reply. */
export function noticeOf(data: Record<string, unknown>): {
  notice?: QuotaNote;
} {
  const notice = toQuotaNote(data.notice);
  return notice && !notice.blocked ? { notice } : {};
}

/** A validated V5.9 request ID carried by a successful reply. */
export function operationOf(data: Record<string, unknown>): {
  operationId?: string;
} {
  return typeof data.operationId === 'string' &&
    OPERATION_ID.test(data.operationId)
    ? { operationId: data.operationId }
    : {};
}

/** Fixed local copy for the code; only a validated quota note is kept. */
export function failureOf(data: Record<string, unknown>): FailureResult {
  const code =
    data.ok === false && isErrorCode(data.code) ? data.code : 'UNKNOWN_ERROR';
  const quota = code === 'QUOTA_EXCEEDED' ? toQuotaNote(data.quota) : null;
  return {
    ok: false,
    code,
    message: errorMessage(code),
    retryable: isRetryable(code),
    ...(quota?.blocked ? { quota } : noticeOf(data)),
  };
}

/** Strict shape check: exactly `{ type: CORRECT_TEXT, text }` with a bounded, non-blank text. */
export function isCorrectTextRequest(
  value: unknown,
): value is CorrectTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'text,type' &&
    data.type === CORRECT_TEXT &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_CORRECTION_CODE_POINTS
  );
}

/** The worker's reply is untrusted in the page too: accept only documented shapes. */
export function toCorrectionResult(value: unknown): CorrectionResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true && data.hasErrors === false)
    return {
      ok: true,
      hasErrors: false,
      ...noticeOf(data),
      ...operationOf(data),
    };
  if (
    data.ok === true &&
    data.hasErrors === true &&
    typeof data.correctedText === 'string' &&
    data.correctedText.trim() !== '' &&
    data.correctedText.length <= MAX_CORRECTED_CHARS &&
    typeof data.suspicious === 'boolean'
  )
    return {
      ok: true,
      hasErrors: true,
      correctedText: data.correctedText,
      suspicious: data.suspicious,
      ...noticeOf(data),
      ...operationOf(data),
    };
  return failureOf(data);
}

/** Strict shape check: exactly `{ type: TEST_CONNECTION, slot }`, nothing else. */
export function isTestConnectionRequest(
  value: unknown,
): value is TestConnectionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'slot,type' &&
    data.type === TEST_CONNECTION &&
    isRouteSlot(data.slot)
  );
}

/** Strict shape check: exactly `{ type: TEST_KEY, credentialId }`. */
export function isTestKeyRequest(value: unknown): value is TestKeyRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'credentialId,type' &&
    data.type === TEST_KEY &&
    typeof data.credentialId === 'string' &&
    PROFILE_ID.test(data.credentialId)
  );
}

/** The worker's reply to TEST_KEY is untrusted in the page too. */
export function toKeyCheckResult(value: unknown): KeyCheckResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (
    data.ok === true &&
    typeof data.models === 'number' &&
    Number.isSafeInteger(data.models) &&
    data.models >= 0
  )
    return { ok: true, models: data.models };
  const code =
    data.ok === false && isErrorCode(data.code) ? data.code : 'UNKNOWN_ERROR';
  return {
    ok: false,
    code,
    message: errorMessage(code),
    retryable: isRetryable(code),
  };
}

/** The worker's reply to TEST_CONNECTION: accept only the documented shapes. */
export function toConnectionResult(value: unknown): ConnectionResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (
    data.ok === true &&
    isProviderId(data.provider) &&
    isModelId(data.model) &&
    typeof data.checkedAt === 'string' &&
    typeof data.sample === 'string'
  ) {
    const usage =
      data.usage && typeof data.usage === 'object'
        ? (data.usage as Record<string, unknown>)
        : null;
    const tokens = (item: unknown) =>
      typeof item === 'number' && Number.isSafeInteger(item) && item >= 0
        ? item
        : undefined;
    const input = tokens(usage?.inputTokens),
      output = tokens(usage?.outputTokens);
    return {
      ok: true,
      provider: data.provider,
      model: data.model,
      checkedAt: data.checkedAt,
      sample: data.sample.slice(0, 40),
      ...(input === undefined && output === undefined
        ? {}
        : {
            usage: {
              ...(input === undefined ? {} : { inputTokens: input }),
              ...(output === undefined ? {} : { outputTokens: output }),
            },
          }),
      ...noticeOf(data),
    };
  }
  const status =
    typeof data.httpStatus === 'number' &&
    Number.isInteger(data.httpStatus) &&
    data.httpStatus >= 100 &&
    data.httpStatus <= 599
      ? data.httpStatus
      : undefined;
  return {
    ...failureOf(data),
    ...(status === undefined ? {} : { httpStatus: status }),
  };
}

export interface OpenTranslationRequest {
  type: typeof OPEN_TRANSLATION;
  text: string;
  generate: boolean;
}

/** Exact shape `{ type, text, generate }`; the text is a bounded selection. */
export function isOpenTranslationRequest(
  value: unknown,
): value is OpenTranslationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'generate,text,type' &&
    data.type === OPEN_TRANSLATION &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_SUMMARY_CODE_POINTS &&
    typeof data.generate === 'boolean'
  );
}
