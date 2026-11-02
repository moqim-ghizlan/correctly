/* eslint-disable @typescript-eslint/unbound-method -- vi.fn mocks are asserted on, never detached */
import { describe, expect, it, vi } from 'vitest';
import {
  JPEG_QUALITY,
  OCR_MAX_LONG_SIDE,
  PNG_BUDGET_CHARS,
  captureArea,
  captureErrorCode,
  cropScale,
  type CaptureBitmap,
  type CaptureDeps,
} from '../../src/background/capture';
import {
  clampRect,
  isLargeEnough,
  isRectIn,
  isSize,
  normalizeRect,
} from '../../src/shared/area';
import { CorrectlyError } from '../../src/shared/errors';

describe('O6: geometry', () => {
  it('a drag in any direction gives the same positive rectangle', () => {
    const expected = { x: 10, y: 20, width: 30, height: 40 };
    expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(normalizeRect({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
    expect(normalizeRect({ x: 10, y: 60 }, { x: 40, y: 20 })).toEqual(expected);
  });

  it('clamps to the viewport, including a rect larger than it', () => {
    const view = { width: 800, height: 600 };
    expect(clampRect({ x: -20, y: -5, width: 100, height: 50 }, view)).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 45,
    });
    expect(
      clampRect({ x: 700, y: 550, width: 500, height: 500 }, view),
    ).toEqual({
      x: 700,
      y: 550,
      width: 100,
      height: 50,
    });
    expect(
      clampRect({ x: -50, y: -50, width: 5000, height: 5000 }, view),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(
      clampRect({ x: 900, y: 10, width: 50, height: 50 }, view).width,
    ).toBe(0);
  });

  it('minimum size is 8 x 8 CSS px', () => {
    expect(isLargeEnough({ width: 8, height: 8 })).toBe(true);
    expect(isLargeEnough({ width: 7.9, height: 100 })).toBe(false);
    expect(isLargeEnough({ width: 100, height: 5 })).toBe(false);
  });

  it('guards: exact shape, finite numbers, inside the viewport', () => {
    const view = { width: 800, height: 600 };
    const ok = { x: 10, y: 10, width: 100, height: 50 };
    expect(isSize(view)).toBe(true);
    expect(isSize({ ...view, extra: 1 })).toBe(false);
    expect(isSize({ width: 20_000, height: 10 })).toBe(false);
    expect(isSize({ width: Infinity, height: 10 })).toBe(false);
    expect(isRectIn(ok, view)).toBe(true);
    expect(isRectIn({ ...ok, extra: 1 }, view)).toBe(false);
    expect(isRectIn({ ...ok, x: NaN }, view)).toBe(false);
    expect(isRectIn({ ...ok, width: 4 }, view)).toBe(false);
    expect(isRectIn({ ...ok, x: 750 }, view)).toBe(false);
    expect(isRectIn({ ...ok, y: -3 }, view)).toBe(false);
    expect(isRectIn('x', view)).toBe(false);
  });

  it('scale comes from bitmap/viewport: zoom 150 %, DPR 1.25 and 2', () => {
    const rect = { x: 100, y: 50, width: 400, height: 200 };
    // Same viewport 1000 x 600 CSS px, bitmaps of 1.25x, 1.5x and 2x.
    for (const factor of [1, 1.25, 1.5, 2]) {
      const bitmap = { width: 1000 * factor, height: 600 * factor };
      const plan = cropScale(bitmap, rect, { width: 1000, height: 600 });
      expect(plan.sx).toBe(Math.round(100 * factor));
      expect(plan.sy).toBe(Math.round(50 * factor));
      expect(plan.sw).toBe(Math.round(400 * factor));
      expect(plan.sh).toBe(Math.round(200 * factor));
    }
  });

  it('a rect at the edge or past it stays inside the bitmap', () => {
    const plan = cropScale(
      { width: 1000, height: 600 },
      { x: 950, y: 580, width: 200, height: 100 },
      { width: 1000, height: 600 },
    );
    expect(plan.sx + plan.sw).toBeLessThanOrEqual(1000);
    expect(plan.sy + plan.sh).toBeLessThanOrEqual(600);
    expect(plan.sw).toBeGreaterThanOrEqual(1);
  });
});

describe('O7: output size', () => {
  const view = { width: 3000, height: 2000 };
  const bitmap = { width: 3000, height: 2000 };

  it('long side is capped at D8 and the ratio is kept', () => {
    const plan = cropScale(
      bitmap,
      { x: 0, y: 0, width: 3000, height: 1500 },
      view,
    );
    expect(plan.width).toBe(OCR_MAX_LONG_SIDE);
    expect(plan.height).toBe(800);
  });

  it('a medium crop is not resized', () => {
    const plan = cropScale(
      bitmap,
      { x: 10, y: 10, width: 900, height: 300 },
      view,
    );
    expect([plan.width, plan.height]).toEqual([900, 300]);
  });

  it('a tiny crop is enlarged at most 2x', () => {
    const plan = cropScale(
      bitmap,
      { x: 10, y: 10, width: 40, height: 20 },
      view,
    );
    expect([plan.width, plan.height]).toEqual([80, 40]);
  });
});

describe('captureArea (fakes)', () => {
  const view = { width: 1000, height: 600 };
  const rect = { x: 100, y: 100, width: 300, height: 100 };
  const close = vi.fn();
  const bitmap: CaptureBitmap = { width: 1500, height: 900, close };

  const deps = (extra: Partial<CaptureDeps> = {}): CaptureDeps => ({
    getTab: vi.fn(() => Promise.resolve({ id: 7, windowId: 3, active: true })),
    captureVisibleTab: vi.fn(() =>
      Promise.resolve('data:image/png;base64,AAAA'),
    ),
    decode: vi.fn(() => Promise.resolve(bitmap)),
    encode: vi.fn(() => Promise.resolve('QUJD')),
    ...extra,
  });

  it('captures the window of the active tab once and crops the rectangle', async () => {
    close.mockClear();
    const d = deps();
    const image = await captureArea(7, rect, view, d);
    expect(image).toEqual({ mimeType: 'image/png', data: 'QUJD' });
    expect(d.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(d.captureVisibleTab).toHaveBeenCalledWith(3);
    const [, plan] = vi.mocked(d.encode).mock.calls[0]!;
    expect(plan).toMatchObject({ sx: 150, sy: 150, sw: 450, sh: 150 });
    // A small crop (450 px long side) is enlarged to the 512 px minimum.
    expect([plan.width, plan.height]).toEqual([512, 171]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('inactive or unknown tab = CAPTURE_FAILED, nothing captured', async () => {
    const inactive = deps({
      getTab: vi.fn(() => Promise.resolve({ windowId: 3, active: false })),
    });
    await expect(captureArea(7, rect, view, inactive)).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
    });
    expect(inactive.captureVisibleTab).not.toHaveBeenCalled();
    const missing = deps({
      getTab: vi.fn(() => Promise.reject(new Error('x'))),
    });
    await expect(captureArea(7, rect, view, missing)).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
    });
  });

  it('Chrome refusals map to CAPTURE_FORBIDDEN, other errors to CAPTURE_FAILED, no retry', async () => {
    for (const [message, code] of [
      ['Cannot access contents of the page.', 'CAPTURE_FORBIDDEN'],
      ["The 'activeTab' permission is not in effect", 'CAPTURE_FORBIDDEN'],
      ['Tabs cannot be edited right now', 'CAPTURE_FAILED'],
    ] as const) {
      const d = deps({
        captureVisibleTab: vi.fn(() => Promise.reject(new Error(message))),
      });
      await expect(captureArea(7, rect, view, d)).rejects.toMatchObject({
        code,
      });
      expect(d.captureVisibleTab).toHaveBeenCalledTimes(1);
    }
    expect(captureErrorCode('weird')).toBe('CAPTURE_FAILED');
  });

  it('too small area = AREA_TOO_SMALL before any capture', async () => {
    const d = deps();
    await expect(
      captureArea(7, { ...rect, width: 5 }, view, d),
    ).rejects.toMatchObject({ code: 'AREA_TOO_SMALL' });
    expect(d.getTab).not.toHaveBeenCalled();
  });

  it('switches to JPEG above the PNG budget, and refuses an oversized result', async () => {
    const big = 'A'.repeat(PNG_BUDGET_CHARS + 1);
    const encode = vi.fn((_b, _p, type: string) =>
      Promise.resolve(type === 'image/png' ? big : 'SlBFRw=='),
    );
    const image = await captureArea(7, rect, view, deps({ encode }));
    expect(image).toEqual({ mimeType: 'image/jpeg', data: 'SlBFRw==' });
    expect(encode).toHaveBeenLastCalledWith(
      bitmap,
      expect.anything(),
      'image/jpeg',
      JPEG_QUALITY,
    );
    const huge = vi.fn(() => Promise.resolve('A'.repeat(5 * 1024 * 1024)));
    await expect(
      captureArea(7, rect, view, deps({ encode: huge })),
    ).rejects.toBeInstanceOf(CorrectlyError);
  });

  it('a decode or encode failure is CAPTURE_FAILED and the bitmap is closed', async () => {
    close.mockClear();
    const d = deps({ encode: vi.fn(() => Promise.reject(new Error('boom'))) });
    await expect(captureArea(7, rect, view, d)).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
    });
    expect(close).toHaveBeenCalledTimes(1);
    const bad = deps({ decode: vi.fn(() => Promise.reject(new Error('x'))) });
    await expect(captureArea(7, rect, view, bad)).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
    });
  });
});
