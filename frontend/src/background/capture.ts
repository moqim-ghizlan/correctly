// V7.1 capture: ONE screenshot of the visible tab, cropped to the rectangle
// the user drew and encoded in the worker. The screenshot never enters the
// page. Every browser dependency is injectable (jsdom has no canvas); the
// maths is pure. Never retried, never logged, never stored.
import { isLargeEnough, type Rect, type Size } from '../shared/area';
import { CorrectlyError, type ErrorCode } from '../shared/errors';
import { MAX_IMAGE_BASE64_CHARS, type TaskImage } from './transport';

/** D8: long side of the image sent (owner decision 2026-11-02). */
export const OCR_MAX_LONG_SIDE = 1600;
/** A tiny crop is enlarged (at most 2x) up to this long side to stay legible. */
export const OCR_MIN_LONG_SIDE = 512;
export const MAX_UPSCALE = 2;
/** PNG above this many base64 characters is re-encoded as JPEG. */
export const PNG_BUDGET_CHARS = 1_500_000;
export const JPEG_QUALITY = 0.9;

export interface CropPlan {
  /** Source rectangle in bitmap (device) pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Output size in pixels. */
  width: number;
  height: number;
}

/**
 * Bitmap pixels per CSS pixel come from the bitmap and the viewport the page
 * sent (page zoom and Windows scaling are already inside the screenshot):
 * `devicePixelRatio` alone is wrong with page zoom.
 */
export function cropScale(
  bitmap: Size,
  rect: Rect,
  viewport: Size,
  maxLongSide = OCR_MAX_LONG_SIDE,
): CropPlan {
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  const clamp = (value: number, max: number) =>
    Math.min(Math.max(Math.round(value), 0), max);
  const sx = clamp(rect.x * scaleX, bitmap.width - 1);
  const sy = clamp(rect.y * scaleY, bitmap.height - 1);
  const sw = Math.max(
    1,
    Math.min(Math.round(rect.width * scaleX), bitmap.width - sx),
  );
  const sh = Math.max(
    1,
    Math.min(Math.round(rect.height * scaleY), bitmap.height - sy),
  );
  const long = Math.max(sw, sh);
  const factor =
    long > maxLongSide
      ? maxLongSide / long
      : long < OCR_MIN_LONG_SIDE
        ? Math.min(MAX_UPSCALE, OCR_MIN_LONG_SIDE / long)
        : 1;
  return {
    sx,
    sy,
    sw,
    sh,
    width: Math.max(1, Math.round(sw * factor)),
    height: Math.max(1, Math.round(sh * factor)),
  };
}

export interface CaptureBitmap {
  width: number;
  height: number;
  close(): void;
}

export interface CaptureDeps {
  getTab(
    tabId: number,
  ): Promise<{ id?: number; windowId: number; active: boolean }>;
  /** A PNG data URL of the visible part of the window's active tab. */
  captureVisibleTab(windowId: number): Promise<string>;
  decode(dataUrl: string): Promise<CaptureBitmap>;
  /** The cropped, scaled bitmap as base64 (no data-URL prefix). */
  encode(
    bitmap: CaptureBitmap,
    plan: CropPlan,
    type: 'image/png' | 'image/jpeg',
    quality?: number,
  ): Promise<string>;
}

/**
 * Chrome says why a page cannot be captured only in an error message; the
 * message is matched, never shown. Anything else is a plain failure.
 */
export function captureErrorCode(error: unknown): ErrorCode {
  const message = error instanceof Error ? error.message : '';
  return /cannot access|activeTab|permission|not in effect|chrome:\/\/|extensions gallery|blocked/i.test(
    message,
  )
    ? 'CAPTURE_FORBIDDEN'
    : 'CAPTURE_FAILED';
}

export async function captureArea(
  tabId: number,
  rect: Rect,
  viewport: Size,
  deps: CaptureDeps,
): Promise<TaskImage> {
  if (!isLargeEnough(rect)) throw new CorrectlyError('AREA_TOO_SMALL');
  let bitmap: CaptureBitmap | null = null;
  try {
    const tab = await deps.getTab(tabId).catch(() => null);
    // Only the tab the user is looking at: never another tab or window.
    if (!tab || !tab.active) throw new CorrectlyError('CAPTURE_FAILED');
    let dataUrl: string;
    try {
      dataUrl = await deps.captureVisibleTab(tab.windowId);
    } catch (error) {
      throw new CorrectlyError(captureErrorCode(error));
    }
    bitmap = await deps.decode(dataUrl).catch(() => {
      throw new CorrectlyError('CAPTURE_FAILED');
    });
    const plan = cropScale(bitmap, rect, viewport);
    let mimeType: TaskImage['mimeType'] = 'image/png';
    let data = await deps.encode(bitmap, plan, mimeType);
    if (data.length > PNG_BUDGET_CHARS) {
      mimeType = 'image/jpeg';
      data = await deps.encode(bitmap, plan, mimeType, JPEG_QUALITY);
    }
    if (!data || data.length > MAX_IMAGE_BASE64_CHARS)
      throw new CorrectlyError('CAPTURE_FAILED');
    return { mimeType, data };
  } catch (error) {
    throw error instanceof CorrectlyError
      ? error
      : new CorrectlyError('CAPTURE_FAILED');
  } finally {
    bitmap?.close();
  }
}

// ------------------------------------------------- real browser dependencies

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** MV3 service worker: OffscreenCanvas and createImageBitmap are available. */
export function chromeCaptureDeps(): CaptureDeps {
  return {
    getTab: (tabId) => chrome.tabs.get(tabId),
    captureVisibleTab: (windowId) =>
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }),
    async decode(dataUrl) {
      // Not fetch(): the extension CSP does not allow data: in connect-src.
      const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    },
    async encode(bitmap, plan, type, quality) {
      const canvas = new OffscreenCanvas(plan.width, plan.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        bitmap,
        plan.sx,
        plan.sy,
        plan.sw,
        plan.sh,
        0,
        0,
        plan.width,
        plan.height,
      );
      const blob = await canvas.convertToBlob({ type, quality });
      return toBase64(new Uint8Array(await blob.arrayBuffer()));
    },
  };
}
