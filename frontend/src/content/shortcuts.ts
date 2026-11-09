import { PAGE_CONFIG } from '../shared/contracts';
import { isLocale, type Locale } from '../shared/locale';
import {
  normalizeKeybindings,
  parseBinding,
  type KeyBinding,
  type KeybindingsStore,
} from '../shared/keybindings';
import { normalizeDictionary } from '../shared/dictionary';
import { normalizeHandle } from '../shared/settings';
import {
  normalizeTranslation,
  type TranslationPreferences,
} from '../shared/translate';
import {
  isShortcutSeparator,
  MAX_REPLACEMENT,
  shortcutExpansion,
  shortcutMap,
  type ShortcutMap,
} from '../shared/shortcuts';
import {
  deepActiveElement,
  isEligibleField,
  shortcutEditingHost,
} from './correction';

// V5.6 local text expansion. Runs in the opt-in page script, never calls the
// network and never sees the API key: the worker sends only the active
// trigger → replacement pairs.

export interface PageConfig {
  /** 5.13: interface language for the handle's labels. */
  locale: Locale;
  /** V5.11: show the right-edge handle (the former smart button setting). */
  smartButton: boolean;
  /** V5.11: saved vertical position of the handle (0–1). */
  handleY: number;
  /** 5.15: translate button on selected text, and its bubble's defaults. */
  selectionButton: boolean;
  translation: Pick<
    TranslationPreferences,
    'target' | 'variants' | 'favorites'
  >;
  /** V6.1: real-time correction is on (API engine consented), with its skip list. */
  realtime: boolean;
  /** 'auto' = the browser's built-in AI when there is one, never the API. */
  realtimeEngine: 'auto' | 'local' | 'api';
  realtimeDisabledSites: string[];
  /** 'finish' = check only once typing is over (cheaper). */
  realtimeTiming: 'live' | 'finish';
  /** Shortcut replacing the mistake at the caret by its first suggestion. */
  realtimeReplaceKey: KeyBinding | null;
  /** Shortcut replacing every mistake of the caret's sentence. */
  realtimeReplaceAllKey: KeyBinding | null;
  /** Words the personal dictionary tells real-time correction to skip. */
  dictionary: string[];
  shortcuts: { trigger: string; replacement: string }[];
  /** Correctly's own keyboard shortcuts ({} when they are off). */
  keybindings: KeybindingsStore['bindings'];
}

/** The worker's reply is untrusted here too: keep only well-formed pairs. */
export function toPageConfig(value: unknown): PageConfig {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const list = Array.isArray(data.shortcuts)
    ? (data.shortcuts as unknown[])
    : [];
  return {
    locale: isLocale(data.locale) ? data.locale : 'en',
    smartButton: data.smartButton === true,
    selectionButton: data.selectionButton === true,
    realtime: data.realtime === true,
    realtimeTiming: data.realtimeTiming === 'finish' ? 'finish' : 'live',
    realtimeReplaceKey: parseBinding(data.realtimeReplaceKey),
    realtimeReplaceAllKey: parseBinding(data.realtimeReplaceAllKey),
    realtimeEngine:
      data.realtimeEngine === 'api' || data.realtimeEngine === 'local'
        ? data.realtimeEngine
        : 'auto',
    dictionary: Array.isArray(data.dictionary)
      ? normalizeDictionary({ words: data.dictionary }).words
      : [],
    realtimeDisabledSites: Array.isArray(data.realtimeDisabledSites)
      ? (data.realtimeDisabledSites as unknown[])
          .filter((site): site is string => typeof site === 'string')
          .slice(0, 200)
      : [],
    translation: (({ target, variants, favorites }) => ({
      target,
      variants,
      favorites,
    }))(normalizeTranslation(data.translation)),
    handleY: normalizeHandle({ yRatio: data.handleY }).yRatio,
    shortcuts: list
      .map((item) => (item ?? {}) as Record<string, unknown>)
      .filter(
        (item): item is { trigger: string; replacement: string } =>
          typeof item.trigger === 'string' &&
          typeof item.replacement === 'string' &&
          item.replacement.length <= MAX_REPLACEMENT,
      )
      .slice(0, 500)
      .map(({ trigger, replacement }) => ({ trigger, replacement })),
    keybindings: normalizeKeybindings({ bindings: data.keybindings }).bindings,
  };
}

export const requestPageConfig = async (): Promise<PageConfig> => {
  let reply: unknown = null;
  try {
    reply = await chrome.runtime.sendMessage({ type: PAGE_CONFIG });
  } catch {
    // Worker unavailable or this page script outlived an extension reload.
  }
  return toPageConfig(reply);
};

/**
 * Upper bound of the wait for a rich editor to take in our selection before
 * the insertion (WhatsApp's Lexical ignores a selection set in the same task).
 */
const SELECTION_WAIT_MS = 50;

export class ShortcutExpander {
  private map: ShortcutMap = new Map();
  private expanding = false;

  constructor(
    private readonly doc: Document,
    private readonly load: () => Promise<PageConfig> = requestPageConfig,
  ) {
    doc.addEventListener('input', this.onInput, true);
    doc.addEventListener('beforeinput', this.onBeforeInput, true);
    // Pick up dictionary changes when the user comes back from the settings.
    doc.addEventListener('focusin', this.refresh, true);
    doc.addEventListener('visibilitychange', this.refresh);
  }

  readonly refresh = () => {
    void this.load()
      .then((config) => this.setShortcuts(config.shortcuts))
      .catch(() => undefined);
  };

  setShortcuts(entries: PageConfig['shortcuts']): void {
    this.map = shortcutMap(entries);
  }

  private readonly onInput = (event: Event) => {
    // Only real typing: page scripts, paste, drop, undo and our own edits
    // never expand.
    if (!(event instanceof InputEvent) || !event.isTrusted) return;
    const target = event.composedPath()[0];
    if (target instanceof Element)
      this.typed(target, event.inputType, event.data, event.isComposing);
  };

  private readonly onBeforeInput = (event: Event) => {
    if (
      !(event instanceof InputEvent) ||
      !event.isTrusted ||
      this.expanding ||
      event.isComposing ||
      event.inputType !== 'insertText' ||
      !event.data ||
      !isShortcutSeparator(event.data) ||
      !this.map.size
    )
      return;
    const target = event.composedPath()[0];
    if (
      !(target instanceof Element) ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    )
      return;
    // Rich editors (WhatsApp's Lexical…) may cancel the native insertion and
    // render the character themselves, with no input event: look once done.
    setTimeout(() => void this.typedInEditable(target), 0);
  };

  /**
   * A separator was just typed in the contenteditable `target`; resolves true
   * when it expanded. Only a trigger inside the caret's own text node is
   * replaced, through the browser's insertText (native undo, seen by the
   * editor like typing); the editor's DOM is never rewritten directly.
   */
  typedInEditable(target: Element): Promise<boolean> {
    if (this.expanding || !this.map.size) return Promise.resolve(false);
    const host = shortcutEditingHost(target);
    const selection = this.doc.getSelection();
    const node = selection?.anchorNode;
    if (
      !host ||
      !selection?.isCollapsed ||
      host !== deepActiveElement(this.doc) ||
      !(node instanceof Text) ||
      shortcutEditingHost(node) !== host
    )
      return Promise.resolve(false);
    const caret = selection.anchorOffset;
    const text = node.data;
    const plan = shortcutExpansion(text, caret, this.map);
    if (!plan || text.slice(plan.start, plan.end) !== plan.trigger)
      return Promise.resolve(false);
    // The separator is replaced too, so the caret ends up after it.
    const separator = text.slice(plan.end, caret).replace(/\xa0/gu, ' ');
    const range = this.doc.createRange();
    range.setStart(node, plan.start);
    range.setEnd(node, caret);
    selection.removeAllRanges();
    selection.addRange(range);
    // Rich editors read the selection on selectionchange: insert only after
    // they saw it. A key pressed meanwhile cancels, so it is never lost.
    return new Promise((resolve) => {
      let settled = false;
      const finish = (insert: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.doc.removeEventListener('selectionchange', onChange);
        this.doc.removeEventListener('keydown', onKey, true);
        const current = selection.rangeCount ? selection.getRangeAt(0) : null;
        const unchanged =
          node.data === text &&
          host === deepActiveElement(this.doc) &&
          current?.startContainer === node &&
          current.startOffset === plan.start &&
          current.endContainer === node &&
          current.endOffset === caret;
        if (!unchanged) return resolve(false);
        let inserted = false;
        if (insert) {
          this.expanding = true;
          try {
            inserted =
              typeof this.doc.execCommand === 'function' &&
              this.doc.execCommand(
                'insertText',
                false,
                plan.replacement + separator,
              );
          } finally {
            this.expanding = false;
          }
        }
        // Cancelled or refused: the text stays as typed, caret back in place.
        if (!inserted) selection.collapse(node, caret);
        resolve(inserted);
      };
      const onChange = () => setTimeout(() => finish(true), 0);
      const onKey = () => finish(false);
      const timer = setTimeout(() => finish(true), SELECTION_WAIT_MS);
      this.doc.addEventListener('selectionchange', onChange);
      this.doc.addEventListener('keydown', onKey, true);
    });
  }

  /** One typed character in `field`; returns true when it expanded. */
  typed(
    field: Element,
    inputType: string,
    data: string | null,
    composing: boolean,
  ): boolean {
    if (
      this.expanding ||
      composing ||
      inputType !== 'insertText' ||
      !data ||
      [...data].length !== 1 ||
      !this.map.size ||
      !isEligibleField(field) ||
      field !== deepActiveElement(this.doc) ||
      field.selectionStart === null ||
      field.selectionStart !== field.selectionEnd
    )
      return false;
    const caret = field.selectionStart;
    const plan = shortcutExpansion(field.value, caret, this.map);
    if (!plan || field.value.slice(plan.start, plan.end) !== plan.trigger)
      return false;
    this.expanding = true;
    try {
      field.setSelectionRange(plan.start, plan.end);
      // insertText keeps the browser's own undo (Ctrl+Z restores the trigger)
      // and is seen by frameworks like typing; setRangeText is the fallback.
      const inserted =
        typeof this.doc.execCommand === 'function' &&
        this.doc.execCommand('insertText', false, plan.replacement) &&
        field.value.slice(plan.start, plan.start + plan.replacement.length) ===
          plan.replacement;
      if (!inserted) {
        field.setRangeText(plan.replacement, plan.start, plan.end, 'end');
        field.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertReplacementText',
          }),
        );
      }
      // Caret after the separator the user typed, which was kept as is.
      const after = plan.start + plan.replacement.length + (caret - plan.end);
      field.setSelectionRange(after, after);
    } finally {
      this.expanding = false;
    }
    return true;
  }

  dispose(): void {
    this.doc.removeEventListener('input', this.onInput, true);
    this.doc.removeEventListener('beforeinput', this.onBeforeInput, true);
    this.doc.removeEventListener('focusin', this.refresh, true);
    this.doc.removeEventListener('visibilitychange', this.refresh);
  }
}

/** One expander per document. */
export function installShortcutExpander(doc: Document): ShortcutExpander {
  const state = globalThis as { correctlyExpander?: ShortcutExpander };
  state.correctlyExpander ??= new ShortcutExpander(doc);
  state.correctlyExpander.refresh();
  return state.correctlyExpander;
}
