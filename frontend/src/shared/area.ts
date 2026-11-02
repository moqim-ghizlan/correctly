// V7.1 screen area: pure geometry shared by the page (which draws the
// rectangle) and the worker (which validates it and crops the screenshot).
// All numbers are CSS pixels relative to the viewport unless noted.

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Point, Size {}

/** Smaller than this (either side) is refused: nothing is sent. */
export const MIN_AREA_SIDE = 8;
/** A viewport above this is not a real window: refused by the guard. */
export const MAX_VIEWPORT_SIDE = 10_000;

/** A drag in any direction becomes a rectangle with positive size. */
export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** Keeps the rectangle inside the viewport (a drag can leave the window). */
export function clampRect(rect: Rect, viewport: Size): Rect {
  const x = Math.min(Math.max(rect.x, 0), viewport.width);
  const y = Math.min(Math.max(rect.y, 0), viewport.height);
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.x + rect.width, viewport.width) - x),
    height: Math.max(0, Math.min(rect.y + rect.height, viewport.height) - y),
  };
}

export const isLargeEnough = (rect: Size): boolean =>
  rect.width >= MIN_AREA_SIDE && rect.height >= MIN_AREA_SIDE;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function isSize(value: unknown): value is Size {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'height,width' &&
    finite(data.width) &&
    finite(data.height) &&
    data.width > 0 &&
    data.height > 0 &&
    data.width <= MAX_VIEWPORT_SIDE &&
    data.height <= MAX_VIEWPORT_SIDE
  );
}

/** Exact shape, finite numbers, big enough and inside `viewport`. */
export function isRectIn(value: unknown, viewport: Size): value is Rect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).sort().join() !== 'height,width,x,y' ||
    !finite(data.x) ||
    !finite(data.y) ||
    !finite(data.width) ||
    !finite(data.height)
  )
    return false;
  const rect = data as unknown as Rect;
  // A small tolerance for sub-pixel pointer positions.
  const EPS = 0.5;
  return (
    isLargeEnough(rect) &&
    rect.x >= -EPS &&
    rect.y >= -EPS &&
    rect.x + rect.width <= viewport.width + EPS &&
    rect.y + rect.height <= viewport.height + EPS
  );
}

/** What the page sends to the worker (part 3): no image, only numbers. */
export interface AreaSelection {
  rect: Rect;
  viewport: Size;
}
