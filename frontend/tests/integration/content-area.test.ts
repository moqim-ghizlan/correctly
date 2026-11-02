/* eslint-disable @typescript-eslint/unbound-method -- vi.fn mocks are asserted on, never detached */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterPaint, hideOwnUi, selectArea } from '../../src/content/area';

const win = Object.assign(new EventTarget(), {
  innerWidth: 800,
  innerHeight: 600,
}) as unknown as Window;

function pointer(
  type: string,
  x: number,
  y: number,
  init: { button?: number; id?: number } = {},
): MouseEvent {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: init.button ?? 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'pointerId', { value: init.id ?? 1 });
  return event;
}

// The overlay lives in a closed shadow root: capture the layer through the
// event listeners it registers (attachShadow is spied to reach the root).
let roots: ShadowRoot[] = [];
const realAttach = Element.prototype.attachShadow;

beforeEach(() => {
  roots = [];
  document.body.replaceChildren();
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
    this: Element,
    init: ShadowRootInit,
  ) {
    const root = realAttach.call(this, { ...init, mode: 'open' });
    roots.push(root);
    return init.mode === 'closed' ? root : root;
  });
});
afterEach(() => vi.restoreAllMocks());

const layer = () => roots[0]!.querySelector('.layer') as HTMLElement;
const overlay = () => document.querySelector('[data-correctly-area]');

describe('O8: area overlay', () => {
  it('a drag in any direction confirms the rectangle and removes the overlay', async () => {
    const result = selectArea(document, { win });
    expect(overlay()).not.toBeNull();
    layer().dispatchEvent(pointer('pointerdown', 300, 200));
    layer().dispatchEvent(pointer('pointermove', 100, 100));
    expect(roots[0]!.querySelector('.size')!.textContent).toBe('200 × 100');
    layer().dispatchEvent(pointer('pointerup', 100, 100));
    await expect(result).resolves.toEqual({
      rect: { x: 100, y: 100, width: 200, height: 100 },
      viewport: { width: 800, height: 600 },
    });
    expect(overlay()).toBeNull();
  });

  it('the rectangle is clamped when the drag leaves the window', async () => {
    const result = selectArea(document, { win });
    layer().dispatchEvent(pointer('pointerdown', 700, 500));
    layer().dispatchEvent(pointer('pointerup', 1200, 900));
    await expect(result).resolves.toMatchObject({
      rect: { x: 700, y: 500, width: 100, height: 100 },
    });
  });

  it('Esc, right click, blur and a hidden tab cancel with null', async () => {
    const cancels: [string, () => void][] = [
      [
        'esc',
        () =>
          document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          ),
      ],
      [
        'right click',
        () =>
          layer().dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
          ),
      ],
      ['blur', () => window.dispatchEvent(new Event('blur'))],
    ];
    for (const [, run] of cancels) {
      roots = [];
      const result = selectArea(document, { win: window });
      run();
      await expect(result).resolves.toBeNull();
      expect(overlay()).toBeNull();
    }
    roots = [];
    const hiddenTab = selectArea(document, { win: window });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await expect(hiddenTab).resolves.toBeNull();
  });

  it('a too small area keeps the overlay open with a message, then Esc cancels', async () => {
    const result = selectArea(document, { win });
    layer().dispatchEvent(pointer('pointerdown', 50, 50));
    layer().dispatchEvent(pointer('pointerup', 53, 52));
    expect(overlay()).not.toBeNull();
    expect(roots[0]!.querySelector('.hint')!.textContent).toMatch(/too small/i);
    layer().dispatchEvent(pointer('pointerdown', 50, 50));
    layer().dispatchEvent(pointer('pointerup', 150, 150));
    await expect(result).resolves.toMatchObject({
      rect: { width: 100, height: 100 },
    });
  });

  it('only the primary button draws', async () => {
    const result = selectArea(document, { win });
    layer().dispatchEvent(pointer('pointerdown', 50, 50, { button: 1 }));
    layer().dispatchEvent(pointer('pointerup', 150, 150, { button: 1 }));
    expect(overlay()).not.toBeNull();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await expect(result).resolves.toBeNull();
  });

  it('no listener is left on the document or the window', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const wadd = vi.spyOn(window, 'addEventListener');
    const wremove = vi.spyOn(window, 'removeEventListener');
    const result = selectArea(document, { win: window });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await result;
    const types = (calls: unknown[][]) => calls.map((c) => c[0]).sort();
    expect(types(remove.mock.calls)).toEqual(types(add.mock.calls));
    expect(types(wremove.mock.calls)).toEqual(types(wadd.mock.calls));
    expect(add.mock.calls.length).toBeGreaterThan(0);
  });

  it('the page does not see typing and cannot scroll while selecting', async () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    const result = selectArea(document, { win: window });
    const space = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    layer().dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await result;
    window.removeEventListener('keydown', seen);
    // Page scrolling works again: nothing was changed on the document.
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('is a closed shadow root in production (page scripts cannot reach it)', async () => {
    vi.restoreAllMocks();
    const result = selectArea(document, { win });
    const host = document.querySelector('[data-correctly-area]')!;
    expect(host.shadowRoot).toBeNull();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await result;
  });

  it('French wording when the locale is fr', async () => {
    const result = selectArea(document, { win, locale: 'fr' });
    expect(roots[0]!.querySelector('.hint')!.textContent).toMatch(/Échap/);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await result;
  });
});

describe('hide helpers', () => {
  it('hides and restores the elements; afterPaint waits two frames', async () => {
    const a = document.createElement('div');
    a.style.display = 'block';
    const b = document.createElement('div');
    const show = hideOwnUi([a, null, b]);
    expect(a.style.display).toBe('none');
    expect(b.style.display).toBe('none');
    show();
    expect(a.style.display).toBe('block');
    expect(b.style.display).toBe('');
    const frames: FrameRequestCallback[] = [];
    const fake = {
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      },
    };
    let resolved = false;
    void afterPaint(fake).then(() => (resolved = true));
    frames.shift()!(0);
    await Promise.resolve();
    expect(resolved).toBe(false);
    frames.shift()!(0);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});
