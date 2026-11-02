import {
  clampRect,
  isLargeEnough,
  normalizeRect,
  type AreaSelection,
  type Point,
  type Rect,
} from '../shared/area';
import type { Locale } from '../shared/locale';
import { CONTENT } from './messages';

// V7.1: the "screenshot tool" overlay. The user drags a rectangle over the
// page; the page only learns four numbers and the viewport size, never any
// pixels. Closed shadow root, highest z-index, no log, and every listener is
// removed on every exit path (confirm, cancel, error).

const CSS = `
:host { all: initial; }
.layer {
  position: fixed; inset: 0; z-index: 2147483647; cursor: crosshair;
  background: rgba(0, 0, 0, 0.45); touch-action: none;
  user-select: none; -webkit-user-select: none;
  font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.layer[data-drawing] { background: transparent; }
.box {
  position: fixed; box-sizing: border-box; pointer-events: none;
  border: 1px solid #fff; outline: 1px solid rgba(0, 0, 0, 0.6);
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
}
.size {
  position: absolute; left: 0; top: 100%; margin-top: 4px; padding: 1px 6px;
  border-radius: 4px; background: #181b22; color: #fff; white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.hint {
  position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
  max-width: calc(100vw - 32px); padding: 8px 14px; border-radius: 10px;
  background: #181b22; color: #fff; text-align: center;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35); pointer-events: none;
}
.hint[data-error] { background: #8a1f1f; }
[hidden] { display: none !important; }
@media (forced-colors: active) {
  .box { border-color: Highlight; outline-color: CanvasText; }
  .hint, .size { border: 1px solid CanvasText; }
}
`;

/** Keys that would scroll the page or reach its shortcuts while selecting. */
const SCROLL_KEYS = new Set([
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);
const KEY_EVENTS = ['keydown', 'keyup', 'keypress'] as const;

export interface SelectAreaOptions {
  locale?: Locale;
  /** The window to measure; tests pass a fake viewport size. */
  win?: Pick<Window, 'innerWidth' | 'innerHeight'> & EventTarget;
}

/**
 * Resolves with the confirmed rectangle (CSS px, inside the viewport) and
 * the viewport size, or null when the user cancels (Esc, right click, the
 * window loses focus or the tab is hidden). A rectangle that is too small
 * keeps the overlay open with a message so the user can draw again.
 */
export function selectArea(
  doc: Document,
  options: SelectAreaOptions = {},
): Promise<AreaSelection | null> {
  const win = options.win ?? doc.defaultView ?? window;
  const m = CONTENT[options.locale ?? 'en'].area;
  const host = doc.createElement('div');
  host.setAttribute('data-correctly-area', '');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const layer = doc.createElement('div');
  layer.className = 'layer';
  const box = doc.createElement('div');
  box.className = 'box';
  box.hidden = true;
  const size = doc.createElement('div');
  size.className = 'size';
  box.append(size);
  const hint = doc.createElement('div');
  hint.className = 'hint';
  hint.setAttribute('role', 'status');
  hint.textContent = m.hint;
  layer.append(box);
  root.append(style, layer, hint);

  const viewport = () => ({
    width: win.innerWidth,
    height: win.innerHeight,
  });

  return new Promise<AreaSelection | null>((resolve) => {
    let start: Point | null = null;
    let pointerId: number | null = null;
    let done = false;
    const cleanups: (() => void)[] = [];
    const listen = <T extends EventTarget>(
      target: T,
      type: string,
      handler: (event: never) => void,
      capture = true,
      passive = true,
    ) => {
      target.addEventListener(type, handler as EventListener, {
        capture,
        passive,
      });
      cleanups.push(() =>
        target.removeEventListener(type, handler as EventListener, {
          capture,
        }),
      );
    };

    const finish = (result: AreaSelection | null) => {
      if (done) return;
      done = true;
      try {
        if (pointerId !== null && layer.hasPointerCapture?.(pointerId))
          layer.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already be gone.
      }
      for (const cleanup of cleanups.splice(0)) cleanup();
      host.remove();
      resolve(result);
    };

    const point = (event: PointerEvent): Point => ({
      x: event.clientX,
      y: event.clientY,
    });
    const draw = (rect: Rect) => {
      box.hidden = false;
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    };
    const say = (text: string, error = false) => {
      hint.textContent = text;
      if (error) hint.setAttribute('data-error', '');
      else hint.removeAttribute('data-error');
    };

    try {
      listen(layer, 'pointerdown', (event: PointerEvent) => {
        if (event.button !== 0 || start) return;
        event.preventDefault();
        start = point(event);
        pointerId = event.pointerId;
        layer.setPointerCapture?.(event.pointerId);
        layer.setAttribute('data-drawing', '');
        say(m.hint);
        draw({ x: start.x, y: start.y, width: 0, height: 0 });
      });
      listen(layer, 'pointermove', (event: PointerEvent) => {
        if (!start || event.pointerId !== pointerId) return;
        draw(clampRect(normalizeRect(start, point(event)), viewport()));
      });
      listen(layer, 'pointerup', (event: PointerEvent) => {
        if (!start || event.pointerId !== pointerId || event.button !== 0)
          return;
        const view = viewport();
        const rect = clampRect(normalizeRect(start, point(event)), view);
        if (isLargeEnough(rect)) {
          finish({ rect, viewport: view });
          return;
        }
        // Too small: stay open so the user can draw again (nothing sent).
        start = null;
        pointerId = null;
        layer.removeAttribute('data-drawing');
        box.hidden = true;
        say(m.tooSmall, true);
      });
      listen(layer, 'pointercancel', () => finish(null));
      listen(
        layer,
        'contextmenu',
        (event: Event) => {
          event.preventDefault();
          finish(null);
        },
        true,
        false,
      );
      for (const type of KEY_EVENTS)
        listen(
          doc,
          type,
          (event: KeyboardEvent) => {
            // The page never sees typing while the overlay is up.
            event.stopPropagation();
            if (type === 'keydown' && event.key === 'Escape') finish(null);
            else if (SCROLL_KEYS.has(event.key)) event.preventDefault();
          },
          true,
          false,
        );
      // Scrolling would move the page under the rectangle: blocked without
      // touching overflow (that could change the viewport width).
      for (const type of ['wheel', 'touchmove'])
        listen(
          layer,
          type,
          (event: Event) => event.preventDefault(),
          true,
          false,
        );
      listen(win, 'blur', () => finish(null));
      listen(doc, 'visibilitychange', () => {
        if (doc.visibilityState === 'hidden') finish(null);
      });
      doc.documentElement.append(host);
    } catch {
      finish(null);
    }
  });
}

/** Two animation frames: the browser has really painted without the UI. */
export function afterPaint(win: Pick<Window, 'requestAnimationFrame'>) {
  return new Promise<void>((resolve) =>
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())),
  );
}

/**
 * Hides Correctly's own UI (window, handle, selection button, overlay) so it
 * is not in the screenshot. Returns the function that shows it again; call
 * it in a `finally` after the answer or the error.
 */
export function hideOwnUi(elements: readonly (HTMLElement | null)[]) {
  const hidden: [HTMLElement, string, string][] = [];
  for (const element of elements) {
    if (!element) continue;
    hidden.push([
      element,
      element.style.getPropertyValue('display'),
      element.style.getPropertyPriority('display'),
    ]);
    element.style.setProperty('display', 'none', 'important');
  }
  return () => {
    for (const [element, display, priority] of hidden) {
      if (display) element.style.setProperty('display', display, priority);
      else element.style.removeProperty('display');
    }
  };
}
