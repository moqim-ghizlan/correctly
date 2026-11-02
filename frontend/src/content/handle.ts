import {
  HANDLE_POSITION,
  OPEN_MODAL,
  SMART_BUTTON_OFF,
} from '../shared/contracts';
import type { Locale } from '../shared/locale';
import { logo } from './icons';
import { CONTENT } from './messages';

// V5.11: one logo semicircle on the right edge of the viewport (replaces the
// V5.3 three-button smart button). A click asks the worker to open the
// Correctly modal in this frame; a vertical drag only moves it. Showing,
// hovering or dragging it never sends any text.

export const HANDLE_HEIGHT = 48;
export const HANDLE_WIDTH = 25;
/** Keeps the handle reachable at the top and bottom of the viewport. */
export const HANDLE_MARGIN = 16;
/** Vertical movement (CSS px) that turns a press into a drag. */
export const DRAG_THRESHOLD = 6;
/** Arrow keys move the focused handle by this fraction of the viewport. */
const KEY_STEP = 0.05;

const CSS = `
:host { all: initial; }
.handle {
  position: fixed; right: 0; z-index: 2147483645; box-sizing: border-box;
  width: ${HANDLE_WIDTH}px; height: ${HANDLE_HEIGHT}px; padding: 0 0 0 4px;
  display: grid; place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.14); border-right: 0;
  border-radius: ${HANDLE_HEIGHT / 2}px 0 0 ${HANDLE_HEIGHT / 2}px;
  background: #181b22; color: #fff; cursor: pointer; touch-action: none;
  box-shadow: -2px 2px 10px rgba(0, 0, 0, 0.25); opacity: 0.85;
  transform-origin: right center;
  transition: transform 140ms ease-out, opacity 140ms ease-out;
  user-select: none; -webkit-user-select: none;
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .handle { background: rgba(24, 27, 34, 0.82); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
}
.handle:hover, .handle:focus-visible, .handle[data-dragging] { transform: scale(1.08); opacity: 1; }
.handle[data-dragging] { cursor: grabbing; }
.handle:focus-visible { outline: 2px solid #6d95ff; outline-offset: 2px; }
.handle svg { display: block; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .handle { transition: none; } }
@media (forced-colors: active) { .handle { border: 1px solid ButtonText; border-right: 0; } }
[hidden] { display: none !important; }
`;

export interface HandleDeps {
  /** chrome.runtime.sendMessage, injectable for tests. */
  send: (message: unknown) => Promise<unknown>;
  /** Saved position (0–1 of the viewport height). */
  yRatio: number;
  /** Only real gestures count; page scripts cannot click it. */
  trusted?: (event: Event) => boolean;
  /** 5.13: interface language of the tooltip and accessible name. */
  locale?: Locale;
  /** False once the extension context is gone (reload/update). */
  alive?: () => boolean;
}

function defaultAlive(): boolean {
  try {
    return (
      typeof chrome === 'undefined' || !chrome.runtime || !!chrome.runtime.id
    );
  } catch {
    return false;
  }
}

interface Gesture {
  pointerId: number;
  startY: number;
  startCenter: number;
  dragging: boolean;
}

export class RightEdgeHandle {
  readonly host: HTMLElement;
  /** Inside a closed shadow root; exposed for tests only. */
  readonly button: HTMLElement;
  yRatio: number;
  private gesture: Gesture | null = null;
  private modalIsOpen = false;
  private readonly trusted: (event: Event) => boolean;

  constructor(
    private readonly doc: Document,
    private readonly deps: HandleDeps,
  ) {
    this.yRatio = clampRatio(deps.yRatio);
    this.trusted = deps.trusted ?? ((event) => event.isTrusted);
    this.host = doc.createElement('correctly-handle');
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    const button = doc.createElement('div');
    button.className = 'handle';
    button.tabIndex = 0;
    button.setAttribute('role', 'button');
    const m = CONTENT[deps.locale ?? 'en'];
    button.setAttribute('aria-label', m.handleLabel);
    button.title = m.handleTitle;
    button.append(logo(doc, 18));
    root.append(style, button);
    this.button = button;

    // Keep focus and the page selection where they are when pressed.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('pointerenter', () => void this.checkAlive());
    button.addEventListener('pointerdown', this.onPointerDown);
    button.addEventListener('pointermove', this.onPointerMove);
    button.addEventListener('pointerup', this.onPointerUp);
    button.addEventListener('pointercancel', this.endGesture);
    button.addEventListener('lostpointercapture', this.endGesture);
    button.addEventListener('keydown', this.onKeyDown);
    doc.defaultView?.addEventListener('resize', this.place);
    doc.defaultView?.addEventListener('blur', this.endGesture);
    this.place();
    doc.documentElement.append(this.host);
  }

  private viewportHeight(): number {
    return (
      this.doc.documentElement.clientHeight ||
      this.doc.defaultView?.innerHeight ||
      0
    );
  }

  /** Center Y (px) for a ratio, kept inside the safe margins. */
  private centerFor(ratio: number): number {
    const height = this.viewportHeight();
    const min = HANDLE_MARGIN + HANDLE_HEIGHT / 2;
    const max = Math.max(min, height - HANDLE_MARGIN - HANDLE_HEIGHT / 2);
    return Math.min(max, Math.max(min, ratio * height));
  }

  /** Current top (px); X never changes: always flush with the right edge. */
  get top(): number {
    return this.centerFor(this.yRatio) - HANDLE_HEIGHT / 2;
  }

  readonly place = (): void => {
    this.button.style.top = `${this.top}px`;
    this.button.hidden = this.modalIsOpen;
  };

  /** The modal is visible: the handle hides; it returns when hidden. */
  modalOpen(open: boolean): void {
    this.modalIsOpen = open;
    if (open) this.endGesture();
    this.place();
  }

  /** Click (not drag), Enter or Space. */
  activate(): void {
    if (this.modalIsOpen || !this.host.isConnected) return;
    if (!this.checkAlive()) return;
    void this.deps.send({ type: OPEN_MODAL }).catch(() => undefined);
  }

  /**
   * After an extension reload or update this script is orphaned: messages
   * go nowhere. A dead handle removes itself instead of staying as a button
   * that does nothing (the toolbar icon injects a fresh script).
   */
  private checkAlive(): boolean {
    const alive = this.deps.alive ?? defaultAlive;
    if (alive()) return true;
    this.dispose();
    delete (globalThis as { correctlyHandle?: unknown }).correctlyHandle;
    return false;
  }

  private save() {
    void this.deps
      .send({ type: HANDLE_POSITION, yRatio: this.yRatio })
      .catch(() => undefined);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.trusted(event) || event.button !== 0 || this.gesture) return;
    // No preventDefault here: that would suppress the mousedown whose
    // preventDefault (above) is what keeps the focus in the page field.
    this.gesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startCenter: this.centerFor(this.yRatio),
      dragging: false,
    };
    try {
      this.button.setPointerCapture(event.pointerId);
    } catch {
      // Not supported (or pointer gone): moves still arrive on the button.
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      this.button.dataset.dragging = '';
    }
    // Vertical only: clientX is ignored on purpose.
    const height = this.viewportHeight();
    if (height > 0)
      this.yRatio = clampRatio(
        this.centerFor((gesture.startCenter + dy) / height) / height,
      );
    this.place();
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    this.finish();
    // A drag never opens the modal; a plain press-release opens it once.
    if (gesture.dragging) this.save();
    else if (this.trusted(event)) this.activate();
  };

  /** Cancel, lost capture or window blur: keep the position, never open. */
  private readonly endGesture = () => {
    const gesture = this.gesture;
    if (!gesture) return;
    this.finish();
    if (gesture.dragging) this.save();
  };

  private finish() {
    const id = this.gesture?.pointerId;
    this.gesture = null;
    delete this.button.dataset.dragging;
    try {
      if (id !== undefined && this.button.hasPointerCapture?.(id))
        this.button.releasePointerCapture(id);
    } catch {
      // Already released.
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.trusted(event)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.activate();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const height = this.viewportHeight();
      const next =
        this.yRatio + (event.key === 'ArrowUp' ? -KEY_STEP : KEY_STEP);
      this.yRatio = clampRatio(
        height > 0 ? this.centerFor(next) / height : next,
      );
      this.place();
      this.save();
    }
  };

  /** Removes the handle and every listener (setting turned off). */
  dispose(): void {
    this.finish();
    this.host.remove();
    this.doc.defaultView?.removeEventListener('resize', this.place);
    this.doc.defaultView?.removeEventListener('blur', this.endGesture);
  }
}

const clampRatio = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;

/** One handle per document, however many times the script is loaded. */
export function installHandle(
  doc: Document,
  yRatio: number,
  send: HandleDeps['send'] = (message) => {
    // A page script that outlived an extension reload throws synchronously.
    try {
      return chrome.runtime.sendMessage(message);
    } catch {
      return Promise.resolve(undefined);
    }
  },
  locale: Locale = 'en',
): RightEdgeHandle {
  const state = globalThis as {
    correctlyHandle?: RightEdgeHandle;
    correctlyModal?: { visible: boolean; minimized?: boolean };
  };
  if (state.correctlyHandle) return state.correctlyHandle;
  // A handle left by a script orphaned by an extension reload is dead.
  doc.querySelectorAll('correctly-handle').forEach((node) => node.remove());
  const handle = new RightEdgeHandle(doc, { send, yRatio, locale });
  state.correctlyHandle = handle;
  if (state.correctlyModal?.visible && !state.correctlyModal.minimized)
    handle.modalOpen(true);
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (
        sender.id === chrome.runtime.id &&
        (message as { type?: unknown } | null)?.type === SMART_BUTTON_OFF
      ) {
        handle.dispose();
        delete state.correctlyHandle;
      }
    },
  );
  return handle;
}
