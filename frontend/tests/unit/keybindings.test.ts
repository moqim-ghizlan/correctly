import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyCommands, safeSend } from '../../src/content/keys';
import { KEY_COMMAND } from '../../src/shared/contracts';
import {
  KEYBINDINGS_KEY,
  bindingFromEvent,
  bindingProblem,
  formatBinding,
  isKeyCommandRequest,
  loadKeybindings,
  matchBinding,
  matchesChromeShortcut,
  normalizeKeybindings,
  type KeyBinding,
} from '../../src/shared/keybindings';
import { FakeStorage } from '../helpers/fake-storage';

// Correctly's own keyboard shortcuts (settings page + page script).

const key = (
  code: string,
  mods: Partial<
    Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>
  > = {},
  keyText = code.replace(/^Key|^Digit/, '').toLowerCase(),
) => ({
  code,
  key: keyText,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});
const binding = (code: string, mods: Partial<KeyBinding> = {}): KeyBinding => ({
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  code,
  label: code.replace(/^Key|^Digit/, ''),
  ...mods,
});

afterEach(() => vi.unstubAllGlobals());

describe('combinations', () => {
  it('a key press becomes a layout-independent binding with a readable label', () => {
    const b = bindingFromEvent(key('KeyK', { ctrlKey: true, shiftKey: true }));
    expect(b).toEqual(binding('KeyK', { ctrl: true, shift: true }));
    expect(formatBinding(b!)).toBe('Ctrl+Shift+K');
    expect(formatBinding(bindingFromEvent(key('F2'))!)).toBe('F2');
    // A lone modifier or an unsupported key is not a binding.
    expect(bindingFromEvent(key('ShiftLeft', {}, 'Shift'))).toBeNull();
    expect(bindingFromEvent(key('ArrowUp', {}, 'ArrowUp'))).toBeNull();
  });

  it('refuses keys that would break typing or the browser', () => {
    expect(bindingProblem(binding('KeyK'))).toBe('modifier');
    expect(bindingProblem(binding('KeyK', { shift: true }))).toBe('modifier');
    for (const reserved of [
      binding('KeyC', { ctrl: true }),
      binding('KeyV', { ctrl: true }),
      binding('KeyT', { ctrl: true }),
      binding('KeyT', { ctrl: true, shift: true }),
      binding('KeyI', { ctrl: true, shift: true }),
      binding('F5'),
      binding('F12'),
      binding('F4', { alt: true }),
    ])
      expect(bindingProblem(reserved)).toBe('reserved');
    for (const ok of [
      binding('KeyM', { ctrl: true }),
      binding('KeyK', { ctrl: true, shift: true }),
      binding('KeyS', { alt: true, shift: true }),
      binding('F2'),
      binding('Digit1', { alt: true }),
    ])
      expect(bindingProblem(ok)).toBe('');
  });

  it('matches only the exact modifiers', () => {
    const store = {
      bindings: {
        open: binding('KeyK', { ctrl: true, shift: true }),
        correct: binding('Digit1', { alt: true }),
      },
    };
    expect(
      matchBinding(store, key('KeyK', { ctrlKey: true, shiftKey: true })),
    ).toBe('open');
    expect(matchBinding(store, key('KeyK', { ctrlKey: true }))).toBeNull();
    expect(
      matchBinding(
        store,
        key('KeyK', { ctrlKey: true, shiftKey: true, altKey: true }),
      ),
    ).toBeNull();
    expect(matchBinding(store, key('Digit1', { altKey: true }))).toBe(
      'correct',
    );
  });

  it('compares with Chrome’s own shortcut text, in any modifier order', () => {
    expect(
      matchesChromeShortcut(binding('KeyM', { ctrl: true }), 'Ctrl+M'),
    ).toBe(true);
    expect(
      matchesChromeShortcut(
        binding('KeyC', { alt: true, shift: true }),
        'Shift+Alt+C',
      ),
    ).toBe(true);
    expect(matchesChromeShortcut(binding('KeyM', { ctrl: true }), '')).toBe(
      false,
    );
  });
});

describe('storage (one key, normalized on every read)', () => {
  it('keeps valid bindings, drops invalid, reserved, unknown or duplicated ones', () => {
    const ok = binding('KeyK', { ctrl: true, shift: true });
    expect(
      normalizeKeybindings({
        enabled: true,
        bindings: {
          open: ok,
          correct: { ...ok }, // same keys as "open"
          rewrite: binding('KeyC', { ctrl: true }), // reserved
          translate: { code: 'KeyQ' }, // malformed
          evil: binding('KeyJ', { alt: true }),
        },
      }),
    ).toEqual({ schemaVersion: 1, enabled: true, bindings: { open: ok } });
    expect(normalizeKeybindings('garbage')).toEqual({
      schemaVersion: 1,
      enabled: false,
      bindings: {},
    });
  });

  it('a missing key reads as "off, nothing bound"', async () => {
    const area = new FakeStorage();
    expect(await loadKeybindings(area)).toEqual({
      schemaVersion: 1,
      enabled: false,
      bindings: {},
    });
    area.data.set(KEYBINDINGS_KEY, { enabled: 'yes' });
    expect((await loadKeybindings(area)).enabled).toBe(false);
  });

  it('the page message has an exact shape and a known action', () => {
    expect(isKeyCommandRequest({ type: KEY_COMMAND, action: 'capture' })).toBe(
      true,
    );
    expect(isKeyCommandRequest({ type: KEY_COMMAND, action: 'open' })).toBe(
      true,
    );
    for (const bad of [
      { type: KEY_COMMAND, action: 'delete' },
      { type: KEY_COMMAND, action: 'open', tabId: 3 },
      { type: 'correctly.v5.openModal', action: 'open' },
      null,
    ])
      expect(isKeyCommandRequest(bad)).toBe(false);
  });
});

describe('page script listener', () => {
  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.body.dispatchEvent(event);
    return event;
  };

  it('a bound real key press sends one KEY_COMMAND and is not passed on', () => {
    const send = vi.fn();
    const keys = new KeyCommands(
      document,
      send,
      () => Promise.reject(new Error('unused')),
      () => true,
    );
    keys.setBindings({ open: binding('KeyK', { ctrl: true, shift: true }) });
    const event = press({
      code: 'KeyK',
      key: 'K',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(send).toHaveBeenCalledWith({ type: KEY_COMMAND, action: 'open' });
    expect(event.defaultPrevented).toBe(true);
    press({ code: 'KeyK', key: 'k', ctrlKey: true });
    press({
      code: 'KeyK',
      key: 'K',
      ctrlKey: true,
      shiftKey: true,
      repeat: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
    keys.dispose();
  });

  it('synthetic (page-made) key presses and nothing bound send nothing', () => {
    const send = vi.fn();
    const keys = new KeyCommands(document, send, () =>
      Promise.reject(new Error('unused')),
    );
    keys.setBindings({ open: binding('KeyK', { ctrl: true, shift: true }) });
    const event = press({
      code: 'KeyK',
      key: 'K',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(send).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    keys.dispose();
  });

  it('never throws when the extension context is gone (old page script)', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: () => {
          throw new Error('Extension context invalidated.');
        },
      },
    });
    expect(() => safeSend({ type: KEY_COMMAND, action: 'open' })).not.toThrow();
  });
});
