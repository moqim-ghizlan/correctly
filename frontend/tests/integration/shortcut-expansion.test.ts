import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutExpander, toPageConfig } from '../../src/content/shortcuts';
import { DEFAULT_TRANSLATION } from '../../src/shared/translate';

/** What the page script keeps of the translation defaults (5.16). */
const PAGE_TRANSLATION = {
  target: DEFAULT_TRANSLATION.target,
  variants: DEFAULT_TRANSLATION.variants,
  favorites: DEFAULT_TRANSLATION.favorites,
};

const ENTRIES = [
  { trigger: 'bjr', replacement: 'Bonjour' },
  { trigger: 'sig', replacement: 'Best regards,\nAlex' },
];
let expander: ShortcutExpander;
let fetchSpy: ReturnType<typeof vi.fn>;

/** Simulates the browser state right after the user typed `char` at the caret. */
function type(field: HTMLInputElement | HTMLTextAreaElement, char: string) {
  const caret = field.selectionStart ?? field.value.length;
  field.value = field.value.slice(0, caret) + char + field.value.slice(caret);
  field.setSelectionRange(caret + char.length, caret + char.length);
  return expander.typed(field, 'insertText', char, false);
}

function field(html = '<textarea></textarea>', value = '') {
  document.body.innerHTML = html;
  const el = document.body.firstElementChild as HTMLTextAreaElement;
  el.value = value;
  el.focus();
  el.setSelectionRange(value.length, value.length);
  return el;
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  expander?.dispose();
  expander = new ShortcutExpander(document, () =>
    Promise.resolve({
      smartButton: false,
      selectionButton: false,
      realtime: false,
      realtimeEngine: 'auto' as const,
      realtimeDisabledSites: [],
      dictionary: [],
      translation: PAGE_TRANSLATION,
      locale: 'en' as const,
      keybindings: {},
      handleY: 0.5,
      shortcuts: ENTRIES,
    }),
  );
  expander.setShortcuts(ENTRIES);
});

describe('2.1/I01: local expansion, zero network', () => {
  it('bjr + space → "Bonjour " with the caret after the space', () => {
    const el = field();
    for (const char of 'bjr') type(el, char);
    expect(type(el, ' ')).toBe(true);
    expect(el.value).toBe('Bonjour ');
    expect(el.selectionStart).toBe(8);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('expands in the middle of text, keeps punctuation and following text', () => {
    const el = field('<input type="text">', 'Salut  et merci');
    el.setSelectionRange(6, 6);
    for (const char of 'bjr') type(el, char);
    type(el, ',');
    expect(el.value).toBe('Salut bjr, et merci'.replace('bjr', 'Bonjour'));
    expect(el.selectionStart).toBe('Salut Bonjour,'.length);
  });

  it('multiline replacement and one input event for frameworks', () => {
    const el = field();
    const events = vi.fn();
    el.addEventListener('input', events);
    for (const char of 'sig') type(el, char);
    type(el, '.');
    expect(el.value).toBe('Best regards,\nAlex.');
    expect(events).toHaveBeenCalledTimes(1);
  });
});

describe('I03/I05/I06: never expand when unsafe', () => {
  it('partial words, missing separator and Tab/Enter', () => {
    const el = field('<textarea></textarea>', 'abjr');
    expect(type(el, ' ')).toBe(false);
    expect(el.value).toBe('abjr ');
    const other = field('<textarea></textarea>', 'bjr');
    expect(type(other, '\t')).toBe(false);
    expect(type(other, '\n')).toBe(false);
  });

  it('paste, drop, undo, composition and multi-character input are ignored', () => {
    const el = field('<textarea></textarea>', 'bjr ');
    for (const inputType of [
      'insertFromPaste',
      'insertFromDrop',
      'historyUndo',
      'insertReplacementText',
    ])
      expect(expander.typed(el, inputType, ' ', false)).toBe(false);
    expect(expander.typed(el, 'insertText', ' ', true)).toBe(false);
    expect(expander.typed(el, 'insertText', 'r ', false)).toBe(false);
    expect(el.value).toBe('bjr ');
  });

  it('synthetic (page-script) input events never expand', () => {
    const el = field('<textarea></textarea>', 'bjr ');
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ' ',
      }),
    );
    expect(el.value).toBe('bjr ');
  });

  it('password, payment, OTP, read-only, code editors and email fields are excluded', () => {
    for (const html of [
      '<input type="password">',
      '<input type="email">',
      '<input type="text" name="card-number">',
      '<input type="text" autocomplete="one-time-code">',
      '<textarea readonly></textarea>',
      '<div class="monaco-editor"><textarea></textarea></div>',
      '<div class="CodeMirror"><textarea></textarea></div>',
    ]) {
      document.body.innerHTML = html;
      const el = document.querySelector(
        'input, textarea',
      ) as HTMLTextAreaElement;
      el.value = 'bjr ';
      el.focus();
      try {
        el.setSelectionRange(4, 4);
      } catch {
        // email inputs have no selection API; eligibility is checked first.
      }
      const before = el.value; // email inputs sanitize their value
      expect(expander.typed(el, 'insertText', ' ', false)).toBe(false);
      expect(el.value).toBe(before);
    }
  });

  it('a field that is not the focused one, or with a selection, is left alone', () => {
    const el = field('<textarea></textarea>', 'bjr ');
    el.setSelectionRange(0, 4);
    expect(expander.typed(el, 'insertText', ' ', false)).toBe(false);
    el.blur();
    el.setSelectionRange(4, 4);
    expect(expander.typed(el, 'insertText', ' ', false)).toBe(false);
  });

  it('2.4: a refreshed dictionary without the entry stops expanding', async () => {
    expander.dispose();
    let entries = ENTRIES;
    expander = new ShortcutExpander(document, () =>
      Promise.resolve({
        smartButton: false,
        selectionButton: false,
        realtime: false,
        realtimeEngine: 'auto' as const,
        realtimeDisabledSites: [],
        dictionary: [],
        translation: PAGE_TRANSLATION,
        locale: 'en' as const,
        keybindings: {},
        handleY: 0.5,
        shortcuts: entries,
      }),
    );
    entries = [];
    expander.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const el = field('<textarea></textarea>', 'bjr');
    expect(type(el, ' ')).toBe(false);
  });
});

describe('contenteditable (WhatsApp, Gmail…): one text node, native insertText', () => {
  /** Editor with `text` in one text node, focused, caret at the end. */
  function editable(html: string, text: string) {
    document.body.innerHTML = html;
    const host = document.querySelector<HTMLElement>('[contenteditable]')!;
    const leaf = document.querySelector('[data-leaf]') ?? host;
    leaf.textContent = text;
    host.focus();
    const node = leaf.firstChild as Text;
    document.getSelection()!.collapse(node, text.length);
    return { host, node };
  }
  /** Stands in for Chrome's execCommand('insertText') on the selection. */
  function fakeInsertText(ok = true) {
    const calls: string[] = [];
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: (command: string, _ui: boolean, value: string) => {
        calls.push(`${command}:${value}`);
        if (!ok) return false;
        const range = document.getSelection()!.getRangeAt(0);
        range.deleteContents();
        const text = range.startContainer as Text;
        text.insertData(range.startOffset, value);
        document
          .getSelection()!
          .collapse(text, range.startOffset + value.length);
        return true;
      },
    });
    return calls;
  }
  const LEXICAL =
    '<div contenteditable="true" role="textbox" data-lexical-editor="true"><p><span data-leaf data-lexical-text="true"></span></p></div>';

  it('WhatsApp-like Lexical editor: cpg + space → replacement and space, caret after', async () => {
    const calls = fakeInsertText();
    expander.setShortcuts([{ trigger: 'cpg', replacement: "c'est pas grave" }]);
    const { host, node } = editable(LEXICAL, 'ok cpg ');
    expect(await expander.typedInEditable(host)).toBe(true);
    expect(calls).toEqual(["insertText:c'est pas grave "]);
    expect(node.data).toBe("ok c'est pas grave ");
    expect(document.getSelection()!.anchorOffset).toBe(node.data.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('plain contenteditable with a non-breaking space separator', async () => {
    const calls = fakeInsertText();
    const { host, node } = editable(
      '<div contenteditable="true"></div>',
      'bjr\u00a0',
    );
    expect(await expander.typedInEditable(host)).toBe(true);
    expect(calls).toEqual(['insertText:Bonjour ']);
    expect(node.data).toBe('Bonjour ');
  });

  it('an untrusted (page-script) beforeinput never expands', async () => {
    fakeInsertText();
    const { host, node } = editable(LEXICAL, 'bjr ');
    const spy = vi.spyOn(expander, 'typedInEditable');
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: ' ',
    });
    host.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).not.toHaveBeenCalled();
    expect(node.data).toBe('bjr ');
  });

  it('never expands without separator, in a partial word, unfocused, with a selection or across nodes', async () => {
    const calls = fakeInsertText();
    let { host } = editable(LEXICAL, 'bjr');
    expect(await expander.typedInEditable(host)).toBe(false);
    ({ host } = editable(LEXICAL, 'abjr '));
    expect(await expander.typedInEditable(host)).toBe(false);
    ({ host } = editable(LEXICAL, 'bjr '));
    host.blur();
    expect(await expander.typedInEditable(host)).toBe(false);
    const { host: other, node } = editable(LEXICAL, 'bjr ');
    document.getSelection()!.setBaseAndExtent(node, 0, node, 4);
    expect(await expander.typedInEditable(other)).toBe(false);
    // Trigger split over two text nodes: no edit.
    const split = editable(LEXICAL, ' ');
    split.node.before('bj', 'r');
    document.getSelection()!.collapse(split.node, 1);
    expect(await expander.typedInEditable(split.host)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('code editors, sensitive or non-editable areas are excluded', async () => {
    const calls = fakeInsertText();
    for (const html of [
      '<div class="cm-editor"><div contenteditable="true"></div></div>',
      '<div contenteditable="true" aria-label="Security code"></div>',
      '<div contenteditable="true"><pre data-leaf></pre></div>',
      '<div contenteditable="false"></div>',
    ]) {
      const { host } = editable(html, 'bjr ');
      expect(await expander.typedInEditable(host)).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('waits for the editor to see the selection, then inserts once', async () => {
    const calls = fakeInsertText();
    const { host, node } = editable(LEXICAL, 'bjr ');
    const pending = expander.typedInEditable(host);
    // Trigger and separator are selected, nothing inserted yet.
    expect(document.getSelection()!.toString()).toBe('bjr ');
    expect(calls).toEqual([]);
    expect(await pending).toBe(true);
    expect(calls).toEqual(['insertText:Bonjour ']);
    expect(node.data).toBe('Bonjour ');
  });

  it('a key pressed during the wait cancels: text as typed, caret restored', async () => {
    const calls = fakeInsertText();
    const { host, node } = editable(LEXICAL, 'bjr ');
    const pending = expander.typedInEditable(host);
    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    expect(await pending).toBe(false);
    expect(calls).toEqual([]);
    expect(node.data).toBe('bjr ');
    expect(document.getSelection()!.isCollapsed).toBe(true);
    expect(document.getSelection()!.anchorOffset).toBe(4);
  });

  it('text changed by the page during the wait: no insertion', async () => {
    const calls = fakeInsertText();
    const { host, node } = editable(LEXICAL, 'bjr ');
    const pending = expander.typedInEditable(host);
    node.data = 'bjr x';
    expect(await pending).toBe(false);
    expect(calls).toEqual([]);
  });

  it('a refused insertText leaves the text as typed and the caret in place', async () => {
    fakeInsertText(false);
    const { host, node } = editable(LEXICAL, 'bjr ');
    expect(await expander.typedInEditable(host)).toBe(false);
    expect(node.data).toBe('bjr ');
    expect(document.getSelection()!.isCollapsed).toBe(true);
    expect(document.getSelection()!.anchorOffset).toBe(4);
  });
});

describe('toPageConfig', () => {
  it('keeps only well-formed pairs from the worker reply', () => {
    expect(
      toPageConfig({
        smartButton: 'yes',
        shortcuts: [
          { trigger: 'bjr', replacement: 'Bonjour', extra: 1 },
          { trigger: 1, replacement: 'x' },
          null,
        ],
      }),
    ).toEqual({
      smartButton: false,
      selectionButton: false,
      realtime: false,
      realtimeEngine: 'auto' as const,
      realtimeDisabledSites: [],
      dictionary: [],
      translation: PAGE_TRANSLATION,
      locale: 'en' as const,
      keybindings: {},
      handleY: 0.5,
      shortcuts: [{ trigger: 'bjr', replacement: 'Bonjour' }],
    });
    expect(toPageConfig(undefined)).toEqual({
      smartButton: false,
      selectionButton: false,
      realtime: false,
      realtimeEngine: 'auto' as const,
      realtimeDisabledSites: [],
      dictionary: [],
      translation: PAGE_TRANSLATION,
      locale: 'en' as const,
      keybindings: {},
      handleY: 0.5,
      shortcuts: [],
    });
  });

  it('V5.11: keeps a valid handle position, clamps or resets bad ones', () => {
    expect(toPageConfig({ handleY: 0.2 }).handleY).toBe(0.2);
    expect(toPageConfig({ handleY: 7 }).handleY).toBe(1);
    expect(toPageConfig({ handleY: 'x' }).handleY).toBe(0.5);
  });
});
