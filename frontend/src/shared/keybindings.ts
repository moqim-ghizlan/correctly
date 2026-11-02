// Correctly's own in-page keyboard shortcuts (owner request, 2026-10-16).
// Chrome does not let an extension change its `commands` shortcuts, so these
// are an optional second system: the opt-in page script (smart.js) listens
// for them on ordinary web pages and asks the worker to run the same action
// as the browser command. Stored under one namespaced key, written only by
// the settings page; every read goes through normalizeKeybindings.
import { KEY_COMMAND } from './contracts';

export const KEYBINDINGS_KEY = 'correctly.v5.keybindings';

/** Actions a shortcut can trigger (same as the browser commands). */
export const KEY_ACTIONS = [
  'open',
  'correct',
  'rewrite',
  'translate',
  'capture',
] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];
export const isKeyAction = (value: unknown): value is KeyAction =>
  (KEY_ACTIONS as readonly unknown[]).includes(value);

/** The browser command that does the same thing (manifest `commands`); capture has none. */
export const ACTION_COMMANDS: Partial<Record<KeyAction, string>> = {
  open: 'open-correctly',
  correct: 'correct-selection',
  rewrite: 'rewrite-selection',
  translate: 'translate-selection',
};

export interface KeyBinding {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** KeyboardEvent.code: the physical key, independent of the layout. */
  code: string;
  /** What the key showed when recorded (display only, e.g. "M"). */
  label: string;
}

export interface KeybindingsStore {
  schemaVersion: 1;
  /** Listen in web pages (needs the optional all-sites access). */
  enabled: boolean;
  bindings: Partial<Record<KeyAction, KeyBinding>>;
}

export const emptyKeybindings = (): KeybindingsStore => ({
  schemaVersion: 1,
  enabled: false,
  bindings: {},
});

/** Physical keys a shortcut may use. */
const CODE =
  /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote|Space)$/;
const isFunctionKey = (code: string) => /^F(?:[1-9]|1[0-2])$/.test(code);

/** Display text: "Ctrl+Shift+K". */
export function formatBinding(binding: KeyBinding): string {
  return [
    binding.ctrl ? 'Ctrl' : '',
    binding.alt ? 'Alt' : '',
    binding.shift ? 'Shift' : '',
    binding.meta ? 'Meta' : '',
    binding.label,
  ]
    .filter(Boolean)
    .join('+');
}

/** Same physical combination (the label is display only). */
export const sameBinding = (a: KeyBinding, b: KeyBinding): boolean =>
  a.code === b.code &&
  a.ctrl === b.ctrl &&
  a.alt === b.alt &&
  a.shift === b.shift &&
  a.meta === b.meta;

/** Label of a recorded key: letters and digits by position, else the key. */
function keyLabel(code: string, key: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (isFunctionKey(code)) return code;
  if (code === 'Space') return 'Space';
  return key.length === 1 ? key.toUpperCase() : code;
}

/** A keydown as a binding, or null for a lone modifier or an unknown key. */
export function bindingFromEvent(
  event: Pick<
    KeyboardEvent,
    'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
  >,
): KeyBinding | null {
  if (!CODE.test(event.code)) return null;
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    code: event.code,
    label: keyLabel(event.code, event.key),
  };
}

/**
 * Combinations a page or the browser needs (editing, tabs, devtools…):
 * taking them would break ordinary typing or browsing.
 */
const RESERVED = new Set([
  ...'ACVXZYSPFTWNRLDHJOGUE'.split('').map((k) => `Ctrl+Key${k}`),
  'Ctrl+Shift+KeyT',
  'Ctrl+Shift+KeyN',
  'Ctrl+Shift+KeyW',
  'Ctrl+Shift+KeyI',
  'Ctrl+Shift+KeyJ',
  'Ctrl+Shift+KeyC',
  'Ctrl+Shift+KeyZ',
  'Ctrl+Shift+KeyV',
  'Alt+F4',
  'F1',
  'F3',
  'F5',
  'F6',
  'F11',
  'F12',
  'Ctrl+F4',
  'Ctrl+F5',
]);
const reservedId = (b: KeyBinding) =>
  [
    b.ctrl && 'Ctrl',
    b.alt && 'Alt',
    b.shift && 'Shift',
    b.meta && 'Meta',
    b.code,
  ]
    .filter(Boolean)
    .join('+');

/** 5.13: why a combination is refused; the settings page words it. */
export type BindingProblem = '' | 'key' | 'modifier' | 'altSpace' | 'reserved';

/** Why this combination cannot be used ('' = it can). */
export function bindingProblem(binding: KeyBinding): BindingProblem {
  if (!CODE.test(binding.code)) return 'key';
  if (
    !binding.ctrl &&
    !binding.alt &&
    !binding.meta &&
    !isFunctionKey(binding.code)
  )
    return 'modifier';
  if (binding.alt && !binding.ctrl && binding.code === 'Space')
    return 'altSpace';
  if (RESERVED.has(reservedId(binding))) return 'reserved';
  return '';
}

export function parseBinding(value: unknown): KeyBinding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.code !== 'string' ||
    typeof data.label !== 'string' ||
    data.label.length > 12 ||
    !['ctrl', 'alt', 'shift', 'meta'].every(
      (key) => typeof data[key] === 'boolean',
    )
  )
    return null;
  const binding: KeyBinding = {
    ctrl: data.ctrl as boolean,
    alt: data.alt as boolean,
    shift: data.shift as boolean,
    meta: data.meta as boolean,
    code: data.code,
    label: data.label,
  };
  return bindingProblem(binding) ? null : binding;
}

/** Untrusted stored value → valid store; bad or duplicated entries are dropped. */
export function normalizeKeybindings(value: unknown): KeybindingsStore {
  const data =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const raw =
    data.bindings &&
    typeof data.bindings === 'object' &&
    !Array.isArray(data.bindings)
      ? (data.bindings as Record<string, unknown>)
      : {};
  const bindings: KeybindingsStore['bindings'] = {};
  for (const action of KEY_ACTIONS) {
    const binding = parseBinding(raw[action]);
    if (
      binding &&
      !Object.values(bindings).some((other) => sameBinding(other, binding))
    )
      bindings[action] = binding;
  }
  return { schemaVersion: 1, enabled: data.enabled === true, bindings };
}

export interface KeyCommandRequest {
  type: typeof KEY_COMMAND;
  action: KeyAction;
}

/** Exact shape: `{ type: KEY_COMMAND, action }` with a known action. */
export function isKeyCommandRequest(
  value: unknown,
): value is KeyCommandRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (
    Object.keys(data).sort().join() === 'action,type' &&
    data.type === KEY_COMMAND &&
    isKeyAction(data.action)
  );
}

/** The action bound to this keydown, if any. */
export function matchBinding(
  store: Pick<KeybindingsStore, 'bindings'>,
  event: Pick<
    KeyboardEvent,
    'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
  >,
): KeyAction | null {
  const pressed = bindingFromEvent(event);
  if (!pressed) return null;
  for (const action of KEY_ACTIONS) {
    const binding = store.bindings[action];
    if (binding && sameBinding(binding, pressed)) return action;
  }
  return null;
}

/** Is this the shortcut Chrome reports for a command ("Ctrl+M", "Alt+Shift+C")? */
export function matchesChromeShortcut(
  binding: KeyBinding,
  shortcut: string,
): boolean {
  const parts = (text: string) =>
    text
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('+');
  return !!shortcut && parts(formatBinding(binding)) === parts(shortcut);
}

export async function loadKeybindings(area: {
  get(keys: string[]): Promise<Record<string, unknown>>;
}): Promise<KeybindingsStore> {
  return normalizeKeybindings(
    (await area.get([KEYBINDINGS_KEY]))[KEYBINDINGS_KEY],
  );
}

export async function saveKeybindings(
  area: { set(items: Record<string, unknown>): Promise<void> },
  store: KeybindingsStore,
): Promise<KeybindingsStore> {
  const normalized = normalizeKeybindings(store);
  await area.set({ [KEYBINDINGS_KEY]: normalized });
  return normalized;
}
