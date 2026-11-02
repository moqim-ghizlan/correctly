// V7.1 text from a screen area: the answer contract and its strict, pure
// parser. The image itself never reaches this module; model output is
// untrusted data (shown with textContent only, never interpreted).
import { isRectIn, isSize, type AreaSelection } from './area';
import {
  EXTRACT_TEXT,
  IMAGE_CONSENT,
  MAX_SUMMARY_CODE_POINTS,
  failureOf,
  noticeOf,
  operationOf,
} from './contracts';
import type { FailureResult } from './contracts';
import type { QuotaNote } from './quota';

export type OcrResult =
  | {
      ok: true;
      text: string;
      notice?: QuotaNote;
      operationId?: string;
    }
  | FailureResult;

export type ParsedOcr = { found: false } | { found: true; text: string };

/** Everything but a line break or a tab is dropped (C0/C1 controls, DEL). */
const CONTROLS = /[\p{Cc}]/gu;

export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(CONTROLS, (char) => (char === '\n' || char === '\t' ? char : ''))
    .trim();
}

/**
 * Exact fields `{ text: string, found: boolean }`, bounded. `found:false` or
 * an empty text is the "no text" result; anything malformed is null.
 */
export function parseOcrAnswer(raw: string): ParsedOcr | null {
  // Generous for \u-escaped scripts; the transport bounds the body anyway.
  if (raw.length > 6 * MAX_SUMMARY_CODE_POINTS + 2000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const fields = data as Record<string, unknown>;
  if (
    Object.keys(fields).sort().join() !== 'found,text' ||
    typeof fields.found !== 'boolean' ||
    typeof fields.text !== 'string'
  )
    return null;
  const text = cleanOcrText(fields.text);
  if (!fields.found || !text) return { found: false };
  if ([...text].length > MAX_SUMMARY_CODE_POINTS) return null;
  return { found: true, text };
}

export interface ExtractTextRequest extends AreaSelection {
  type: typeof EXTRACT_TEXT;
}

/** Exact shape `{ type, rect, viewport }`; numbers checked by shared/area. */
export function isExtractTextRequest(
  value: unknown,
): value is ExtractTextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'rect,type,viewport' &&
    data.type === EXTRACT_TEXT &&
    isSize(data.viewport) &&
    isRectIn(data.rect, data.viewport)
  );
}

export interface ImageConsentRequest {
  type: typeof IMAGE_CONSENT;
  action: 'status' | 'grant';
}

export function isImageConsentRequest(
  value: unknown,
): value is ImageConsentRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'action,type' &&
    data.type === IMAGE_CONSENT &&
    (data.action === 'status' || data.action === 'grant')
  );
}

/** The worker's answer to IMAGE_CONSENT, bounded and checked in the page. */
export const toImageConsent = (value: unknown): boolean =>
  !!value &&
  typeof value === 'object' &&
  (value as Record<string, unknown>).consent === true;

/** The worker's reply is untrusted in the page: accept only documented shapes. */
export function toOcrResult(value: unknown): OcrResult {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (
    data.ok === true &&
    typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_SUMMARY_CODE_POINTS
  )
    return {
      ok: true,
      text: data.text,
      ...noticeOf(data),
      ...operationOf(data),
    };
  return failureOf(data);
}
