import {
  REWRITE_STYLES,
  normalizeFormality,
  normalizeStyleIds,
  type Formality,
} from '../shared/rewrite';
import {
  MAX_DICTIONARY_WORDS,
  cleanWord,
  loadDictionary,
  saveDictionary,
  wordKey,
} from '../shared/dictionary';
import {
  MAX_FAVORITES,
  hasVariants,
  isLanguageId,
  isVariantOf,
  normalizeTranslation,
  preferredVariant,
} from '../shared/translate';
import { COMMON, languageOptions, type CommonMessages } from '../shared/i18n';
import { fillLanguages, fillVariants } from '../shared/language-menu';
import {
  isLanguageSetting,
  resolveLocale,
  type Locale,
} from '../shared/locale';
import {
  bindingFromEvent,
  bindingProblem,
  formatBinding,
  sameBinding,
  type KeyBinding,
} from '../shared/keybindings';
import {
  DEFAULT_REPLACE_ALL_KEY,
  DEFAULT_REPLACE_KEY,
  normalizeRealtime,
  type V51Settings,
} from '../shared/settings';
import { OPTIONS, type OptionsMessages } from './messages';
import {
  STORAGE_KEYS,
  loadSettings,
  saveSettings,
  type StorageArea,
} from '../shared/storage';

// General settings: consent, entry points, rewrite/translation defaults.
// API keys and routes: providers-ui.ts; usage limits (V5.8): limits-ui.ts.

export interface SettingsDeps {
  area: StorageArea;
  confirm: (question: string) => boolean;
  /** Opens the browser's own shortcut editor (chrome://extensions/shortcuts). */
  openShortcuts?: () => void;
  /** Requests all-sites access and registers the right-edge handle script. */
  enableSmartButton?: () => Promise<boolean>;
  /** Unregisters it, drops the access and removes open buttons. */
  disableSmartButton?: () => Promise<void>;
  /** 5.15: same access for the translate button on selected text. */
  enableSelectionButton?: () => Promise<boolean>;
  /** 5.15: removes the button from open tabs and releases unused access. */
  disableSelectionButton?: () => Promise<void>;
  /** V6.1: same access for real-time correction. */
  enableRealtime?: () => Promise<boolean>;
  /** V6.1: releases the access if nothing else needs it. */
  disableRealtime?: () => Promise<void>;
  /** V6.1.4: what the browser says about its built-in AI model. */
  localStatus?: () => Promise<
    'ready' | 'downloadable' | 'downloading' | 'unavailable'
  >;
  /** V6.1.4: saves a text file for the user (dictionary export). */
  download?: (filename: string, text: string) => void;
  /** V6.1: the privacy warning before API checking; true only on confirm. */
  confirmRealtimeApi?: (question: string, action: string) => Promise<boolean>;
  uiTimeoutMs?: number;
  /** 5.13: language of this page (French when absent). */
  locale?: Locale;
  /** 5.13: the interface language was saved (the page re-renders in it). */
  onLanguageChanged?: (locale: Locale) => void;
}

export type Tone = 'neutral' | 'ok' | 'error' | 'info';

export class SettingsPage {
  private settings: V51Settings | null = null;
  private readonly m: OptionsMessages;
  private readonly c: CommonMessages;

  constructor(
    private readonly doc: Document,
    private readonly deps: SettingsDeps,
  ) {
    this.m = OPTIONS[deps.locale ?? 'fr'];
    this.c = COMMON[deps.locale ?? 'fr'];
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  async init(): Promise<void> {
    this.populateStyles();
    this.populateLanguages();
    this.bind();
    try {
      await this.reload();
      this.setControlsEnabled(true);
    } catch {
      this.message('consent-message', this.c.error('STORAGE_ERROR'), 'error');
    } finally {
      this.el('app').setAttribute('aria-busy', 'false');
    }
  }

  /** Re-reads everything from storage (also used when another tab or the worker writes). */
  async reload(): Promise<void> {
    this.settings = await loadSettings(this.deps.area);
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    if (keys.includes(STORAGE_KEYS.settings))
      void this.reload().catch(() => undefined);
  }

  private populateStyles() {
    const fieldset = this.el('rewrite-styles');
    for (const style of REWRITE_STYLES) {
      const label = this.doc.createElement('label');
      label.className = 'check';
      const box = this.doc.createElement('input');
      box.type = 'checkbox';
      box.value = style.id;
      box.disabled = true;
      box.dataset.rewriteStyle = '';
      const text = this.doc.createElement('span');
      const words = this.c.style[style.id];
      const name = this.doc.createElement('strong');
      name.textContent = words.label;
      text.append(name, ` — ${words.description}`);
      label.append(box, text);
      fieldset.append(label);
    }
  }

  /** 5.16 "Your languages": one box per catalog language, A→Z. */
  private populateLanguages() {
    const all = languageOptions(this.c, []).at(-1)?.items ?? [];
    this.el('translation-favorites').append(
      ...all.map((item) => {
        const label = this.doc.createElement('label');
        label.className = 'check';
        const box = this.doc.createElement('input');
        box.type = 'checkbox';
        box.value = item.id;
        box.disabled = true;
        box.dataset.favorite = '';
        const text = this.doc.createElement('span');
        text.textContent = item.label;
        label.append(box, text);
        return label;
      }),
    );
  }

  private get favoriteBoxes(): HTMLInputElement[] {
    return [
      ...this.doc.querySelectorAll<HTMLInputElement>('input[data-favorite]'),
    ];
  }

  private get styleBoxes(): HTMLInputElement[] {
    return [
      ...this.doc.querySelectorAll<HTMLInputElement>(
        'input[data-rewrite-style]',
      ),
    ];
  }

  private bind() {
    for (const id of [
      'translation-source',
      'translation-target',
      'translation-variant',
    ])
      this.el<HTMLSelectElement>(id).addEventListener('change', () => {
        void this.saveTranslation();
      });
    for (const box of this.favoriteBoxes)
      box.addEventListener('change', () => {
        void this.saveTranslation();
      });
    this.el<HTMLInputElement>('rewrite-enabled').addEventListener(
      'change',
      () => {
        void this.saveRewrite();
      },
    );
    for (const box of this.styleBoxes)
      box.addEventListener('change', () => {
        void this.saveRewrite();
      });
    const formality = this.el<HTMLInputElement>('rewrite-formality');
    formality.addEventListener('input', () =>
      this.showFormality(normalizeFormality(Number(formality.value))),
    );
    formality.addEventListener('change', () => {
      void this.saveRewrite();
    });
    this.el<HTMLButtonElement>('image-consent-reset').addEventListener(
      'click',
      () => {
        void this.resetImageConsent();
      },
    );
    this.el<HTMLInputElement>('correction-consent').addEventListener(
      'change',
      () => {
        void this.saveConsent();
      },
    );
    for (const id of ['trigger-keyboard', 'trigger-menu'] as const)
      this.el<HTMLInputElement>(id).addEventListener('change', () => {
        void this.saveTriggers();
      });
    this.el<HTMLInputElement>('trigger-smart').addEventListener(
      'change',
      () => {
        void this.saveSmartButton();
      },
    );
    this.el<HTMLInputElement>('trigger-selection').addEventListener(
      'change',
      () => {
        void this.saveSelectionButton();
      },
    );
    this.el<HTMLInputElement>('realtime-enabled').addEventListener(
      'change',
      () => {
        void this.saveRealtime();
      },
    );
    this.el<HTMLInputElement>('realtime-api').addEventListener('change', () => {
      void this.saveRealtimeApi();
    });
    this.el<HTMLInputElement>('realtime-finish').addEventListener(
      'change',
      () => {
        void this.saveRealtimeTiming();
      },
    );
    for (const [id, which, fallback] of [
      ['key', 'replaceKey', DEFAULT_REPLACE_KEY],
      ['all', 'replaceAllKey', DEFAULT_REPLACE_ALL_KEY],
    ] as const) {
      this.el<HTMLButtonElement>(`realtime-${id}-record`).addEventListener(
        'click',
        () => this.recordReplaceKey(which),
      );
      this.el<HTMLButtonElement>(`realtime-${id}-off`).addEventListener(
        'click',
        () => {
          void this.saveReplaceKey(which, null);
        },
      );
      this.el<HTMLButtonElement>(`realtime-${id}-reset`).addEventListener(
        'click',
        () => {
          void this.saveReplaceKey(which, fallback);
        },
      );
    }
    this.el<HTMLButtonElement>('realtime-sites-save').addEventListener(
      'click',
      () => {
        void this.saveSites();
      },
    );
    this.el<HTMLButtonElement>('realtime-word-add').addEventListener(
      'click',
      () => {
        void this.addWord();
      },
    );
    this.el<HTMLInputElement>('realtime-word').addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void this.addWord();
      },
    );
    this.el<HTMLButtonElement>('realtime-dict-export').addEventListener(
      'click',
      () => {
        void this.exportWords();
      },
    );
    this.el<HTMLButtonElement>('open-shortcuts').addEventListener('click', () =>
      this.deps.openShortcuts?.(),
    );
    this.el<HTMLSelectElement>('ui-language').addEventListener('change', () => {
      void this.saveLanguage();
    });
  }

  private setControlsEnabled(enabled: boolean) {
    for (const id of [
      'correction-consent',
      'image-consent-reset',
      'trigger-keyboard',
      'trigger-menu',
      'trigger-smart',
      'trigger-selection',
      'realtime-enabled',
      'realtime-api',
      'realtime-finish',
      'realtime-key-record',
      'realtime-key-off',
      'realtime-key-reset',
      'realtime-all-record',
      'realtime-all-off',
      'realtime-all-reset',
      'realtime-sites',
      'realtime-word',
      'open-shortcuts',
      'rewrite-enabled',
      'rewrite-formality',
      'translation-source',
      'translation-target',
      'translation-variant',
      'ui-language',
    ])
      this.el<HTMLInputElement>(id).disabled = !enabled;
    for (const box of [...this.styleBoxes, ...this.favoriteBoxes])
      box.disabled = !enabled;
  }

  private message(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  render(): void {
    const settings = this.settings;
    if (!settings) return;
    this.el<HTMLInputElement>('correction-consent').checked =
      settings.correction.consent;
    this.el('image-consent-state').textContent = this.m.imageConsentState(
      settings.ocr.consent,
    );
    this.el<HTMLButtonElement>('image-consent-reset').hidden =
      !settings.ocr.consent;
    this.el<HTMLInputElement>('trigger-keyboard').checked =
      settings.triggers.keyboard;
    this.el<HTMLInputElement>('trigger-menu').checked =
      settings.triggers.contextMenu;
    this.el<HTMLInputElement>('trigger-smart').checked =
      settings.triggers.smartButton;
    this.el<HTMLInputElement>('trigger-selection').checked =
      settings.triggers.selectionButton;
    this.el<HTMLInputElement>('realtime-enabled').checked =
      settings.triggers.realtime;
    this.el<HTMLInputElement>('realtime-api').checked =
      settings.realtime.engine === 'api' && settings.realtime.apiConsent;
    this.el<HTMLInputElement>('realtime-finish').checked =
      settings.realtime.timing === 'finish';
    this.el<HTMLTextAreaElement>('realtime-sites').value =
      settings.realtime.disabledSites.join('\n');
    this.el('realtime-key-current').textContent = settings.realtime.replaceKey
      ? formatBinding(settings.realtime.replaceKey)
      : this.m.realtimeKeyNone;
    this.el('realtime-all-current').textContent = settings.realtime
      .replaceAllKey
      ? formatBinding(settings.realtime.replaceAllKey)
      : this.m.realtimeKeyNone;
    void this.renderStatus();
    void this.renderWords();
    this.el<HTMLInputElement>('rewrite-enabled').checked =
      settings.rewrite.enabled;
    this.el<HTMLSelectElement>('ui-language').value = settings.ui.language;
    // 5.16: menus rebuilt from the saved favorites; the variant menu shows
    // the target's own variants (each language keeps its saved one).
    const translation = settings.translation;
    fillLanguages(
      this.el<HTMLSelectElement>('translation-source'),
      this.c,
      translation.favorites,
      translation.source,
      [{ id: 'auto', label: this.m.autoDetect }],
    );
    fillLanguages(
      this.el<HTMLSelectElement>('translation-target'),
      this.c,
      translation.favorites,
      translation.target,
    );
    this.el('translation-variant-row').hidden = !fillVariants(
      this.el<HTMLSelectElement>('translation-variant'),
      this.c,
      translation.target,
      preferredVariant(translation, translation.target),
    );
    for (const box of this.favoriteBoxes)
      box.checked = translation.favorites.some((id) => id === box.value);
    for (const box of this.styleBoxes)
      box.checked = settings.rewrite.defaultStyles.some(
        (id) => id === box.value,
      );
    this.el<HTMLInputElement>('rewrite-formality').value = String(
      settings.rewrite.formality,
    );
    this.showFormality(settings.rewrite.formality);
  }

  private showFormality(level: Formality) {
    const range = this.el<HTMLInputElement>('rewrite-formality');
    range.setAttribute('aria-valuetext', this.c.formality[level]);
    this.el('rewrite-formality-level').textContent = this.c.formality[level];
  }

  /** Read-modify-write from fresh storage so other tabs' changes survive. */
  private async update(
    mutate: (settings: V51Settings) => V51Settings,
  ): Promise<V51Settings> {
    const fresh = await loadSettings(this.deps.area);
    this.settings = await saveSettings(this.deps.area, mutate(fresh));
    return this.settings;
  }

  /** V7.1: withdraws the image consent; the window asks again next time. */
  async resetImageConsent(): Promise<void> {
    try {
      await this.update((settings) => ({
        ...settings,
        ocr: { consent: false },
      }));
      this.message('image-consent-message', this.m.imageConsentReset, 'ok');
    } catch {
      this.message(
        'image-consent-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
    this.render();
  }

  async saveConsent(): Promise<void> {
    const consent = this.el<HTMLInputElement>('correction-consent').checked;
    try {
      await this.update((settings) => ({
        ...settings,
        correction: { consent },
      }));
      this.message(
        'consent-message',
        consent ? this.m.consentOn : this.m.consentOff,
        'ok',
      );
    } catch {
      this.message('consent-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveTriggers(): Promise<void> {
    const keyboard = this.el<HTMLInputElement>('trigger-keyboard').checked;
    const contextMenu = this.el<HTMLInputElement>('trigger-menu').checked;
    try {
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, keyboard, contextMenu },
      }));
      this.message('triggers-message', this.m.triggersSaved, 'ok');
    } catch {
      this.message('triggers-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveTranslation(): Promise<void> {
    const value = (id: string) => this.el<HTMLSelectElement>(id).value;
    const source = value('translation-source');
    const target = value('translation-target');
    const variant = value('translation-variant');
    const checked = this.favoriteBoxes
      .filter((box) => box.checked)
      .map((box) => box.value)
      .filter(isLanguageId);
    if (source === target) {
      this.message('translation-message', this.m.sameLanguages, 'error');
      this.render();
      return;
    }
    if (checked.length > MAX_FAVORITES) {
      this.message(
        'translation-message',
        this.m.tooManyFavorites(MAX_FAVORITES),
        'error',
      );
      this.render();
      return;
    }
    try {
      await this.update((settings) => {
        const old = settings.translation;
        // Favorites keep the order they were added in; new ones go last.
        const favorites = [
          ...old.favorites.filter((id) => checked.includes(id)),
          ...checked.filter((id) => !old.favorites.includes(id)),
        ];
        // A variant counts only for the target it was shown for.
        const variants =
          hasVariants(target) && isVariantOf(target, variant)
            ? { ...old.variants, [target]: variant }
            : old.variants;
        const translation = normalizeTranslation({
          source,
          target,
          variants,
          favorites,
        });
        return { ...settings, translation };
      });
      this.message('translation-message', this.m.translationSaved, 'ok');
    } catch {
      this.message(
        'translation-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
    this.render();
  }

  async saveRewrite(): Promise<void> {
    const enabled = this.el<HTMLInputElement>('rewrite-enabled').checked;
    const formality = normalizeFormality(
      Number(this.el<HTMLInputElement>('rewrite-formality').value),
    );
    const defaultStyles = normalizeStyleIds(
      this.styleBoxes.filter((box) => box.checked).map((box) => box.value),
    );
    if (!defaultStyles.length) {
      this.message('rewrite-message', this.m.keepOneStyle, 'error');
      this.render();
      return;
    }
    try {
      await this.update((settings) => ({
        ...settings,
        rewrite: { enabled, defaultStyles, formality },
      }));
      this.message('rewrite-message', this.m.rewriteSaved, 'ok');
    } catch {
      this.message('rewrite-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /**
   * 5.13: saves the interface language; the page then shows itself in it.
   * Already open web pages use it from their next opening of Correctly.
   */
  async saveLanguage(): Promise<void> {
    const value = this.el<HTMLSelectElement>('ui-language').value;
    if (!isLanguageSetting(value)) return this.render();
    try {
      await this.update((settings) => ({
        ...settings,
        ui: { language: value },
      }));
      const locale = resolveLocale(value);
      this.message(
        'language-message',
        OPTIONS[locale].languageSaved(locale === 'fr' ? 'Français' : 'English'),
        'ok',
      );
      this.deps.onLanguageChanged?.(locale);
    } catch {
      this.message('language-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  async saveSmartButton(): Promise<void> {
    const on = this.el<HTMLInputElement>('trigger-smart').checked;
    try {
      // The permission prompt must come first, while the click still counts
      // as a user gesture.
      if (on && !(await this.deps.enableSmartButton?.())) {
        this.message('triggers-message', this.m.handleNoAccess, 'error');
        this.render();
        return;
      }
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, smartButton: on },
      }));
      // After saving "off": access is released only if shortcuts don't need it.
      if (!on) await this.deps.disableSmartButton?.();
      this.message(
        'triggers-message',
        on ? this.m.handleOn : this.m.handleOff,
        'ok',
      );
    } catch {
      this.message('triggers-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /** 5.15: the translate button on selected text (needs all-sites access). */
  async saveSelectionButton(): Promise<void> {
    const on = this.el<HTMLInputElement>('trigger-selection').checked;
    try {
      // The permission prompt must come first, while the click still counts
      // as a user gesture.
      if (on && !(await this.deps.enableSelectionButton?.())) {
        this.message('triggers-message', this.m.selectionNoAccess, 'error');
        this.render();
        return;
      }
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, selectionButton: on },
      }));
      if (!on) await this.deps.disableSelectionButton?.();
      this.message(
        'triggers-message',
        on ? this.m.selectionOn : this.m.selectionOff,
        'ok',
      );
    } catch {
      this.message('triggers-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /** V6.1: real-time correction (needs all-sites access, off by default). */
  async saveRealtime(): Promise<void> {
    const on = this.el<HTMLInputElement>('realtime-enabled').checked;
    try {
      // The permission prompt must come first, while the click still counts
      // as a user gesture.
      if (on && !(await this.deps.enableRealtime?.())) {
        this.message('realtime-message', this.m.realtimeNoAccess, 'error');
        this.render();
        return;
      }
      await this.update((settings) => ({
        ...settings,
        triggers: { ...settings.triggers, realtime: on },
        // Turning the feature off also withdraws the sending consent.
        realtime: on
          ? settings.realtime
          : { ...settings.realtime, engine: 'auto', apiConsent: false },
      }));
      if (!on) await this.deps.disableRealtime?.();
      this.message(
        'realtime-message',
        on ? this.m.realtimeOn : this.m.realtimeOff,
        'ok',
      );
    } catch {
      this.message('realtime-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /** The next key press is the new replace shortcut (Esc cancels). */
  recordReplaceKey(which: 'replaceKey' | 'replaceAllKey'): void {
    const doc = this.doc;
    this.message('realtime-key-message', this.m.realtimeKeyPress, 'neutral');
    const stop = () => doc.removeEventListener('keydown', onKey, true);
    const onKey = (event: KeyboardEvent) => {
      // Capture phase: this press is the recording, never an action.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        stop();
        this.message('realtime-key-message', '', 'neutral');
        return;
      }
      const binding = bindingFromEvent(event);
      if (!binding) return; // a lone modifier: keep waiting
      stop();
      const problem = bindingProblem(binding);
      if (problem) {
        this.message(
          'realtime-key-message',
          this.m.bindingProblem(problem, formatBinding(binding)),
          'error',
        );
        return;
      }
      const other =
        this.settings?.realtime[
          which === 'replaceKey' ? 'replaceAllKey' : 'replaceKey'
        ];
      if (other && sameBinding(other, binding)) {
        this.message(
          'realtime-key-message',
          this.m.realtimeKeyDuplicate(formatBinding(binding)),
          'error',
        );
        return;
      }
      void this.saveReplaceKey(which, binding);
    };
    doc.addEventListener('keydown', onKey, true);
  }

  async saveReplaceKey(
    which: 'replaceKey' | 'replaceAllKey',
    replaceKey: KeyBinding | null,
  ): Promise<void> {
    try {
      await this.update((settings) => ({
        ...settings,
        realtime: { ...settings.realtime, [which]: replaceKey },
      }));
      this.message(
        'realtime-key-message',
        replaceKey
          ? this.m.realtimeKeySaved(formatBinding(replaceKey))
          : this.m.realtimeKeyRemoved,
        'ok',
      );
    } catch {
      this.message(
        'realtime-key-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
    this.render();
  }

  /** V6.1: API checking sends typed sentences out: warning first, then consent. */
  async saveRealtimeApi(): Promise<void> {
    const on = this.el<HTMLInputElement>('realtime-api').checked;
    try {
      if (on) {
        if (!this.settings?.triggers.realtime) {
          this.message('realtime-message', this.m.realtimeNeedsSwitch, 'error');
          this.render();
          return;
        }
        const agreed = await this.deps.confirmRealtimeApi?.(
          this.m.realtimeApiWarning,
          this.m.realtimeApiConfirm,
        );
        if (!agreed) {
          this.render();
          return;
        }
      }
      await this.update((settings) => ({
        ...settings,
        realtime: {
          ...settings.realtime,
          engine: on ? 'api' : 'auto',
          apiConsent: on,
        },
      }));
      this.message(
        'realtime-message',
        on ? this.m.realtimeApiOn : this.m.realtimeApiOff,
        'ok',
      );
    } catch {
      this.message('realtime-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /** Check only once typing is over (fewer requests, lower cost). */
  async saveRealtimeTiming(): Promise<void> {
    const finish = this.el<HTMLInputElement>('realtime-finish').checked;
    try {
      await this.update((settings) => ({
        ...settings,
        realtime: { ...settings.realtime, timing: finish ? 'finish' : 'live' },
      }));
      this.message(
        'realtime-message',
        finish ? this.m.realtimeFinishOn : this.m.realtimeFinishOff,
        'ok',
      );
    } catch {
      this.message('realtime-message', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /** V6.1.4: the local engine's state as the browser reports it. */
  private async renderStatus(): Promise<void> {
    const node = this.el('realtime-local-status');
    const status: keyof OptionsMessages['realtimeStatus'] =
      (await this.deps.localStatus?.().catch(() => 'unknown' as const)) ??
      'unknown';
    node.textContent = this.m.realtimeStatus[status];
  }

  /** V6.1.4: sites where nothing is checked (hostnames, normalized on save). */
  async saveSites(): Promise<void> {
    const lines = this.el<HTMLTextAreaElement>('realtime-sites').value;
    try {
      await this.update((settings) => ({
        ...settings,
        realtime: {
          ...settings.realtime,
          disabledSites: normalizeSiteList(lines),
        },
      }));
      this.message(
        'realtime-sites-message',
        this.m.realtimeSitesSaved(
          this.settings?.realtime.disabledSites.length ?? 0,
        ),
        'ok',
      );
    } catch {
      this.message(
        'realtime-sites-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
    this.render();
  }

  private async renderWords(): Promise<void> {
    const list = this.el('realtime-dict-list');
    const { words } = await loadDictionary(this.deps.area);
    list.replaceChildren();
    if (!words.length) {
      const empty = this.doc.createElement('li');
      empty.className = 'hint';
      empty.textContent = this.m.dictEmpty;
      list.append(empty);
      return;
    }
    for (const word of words) {
      const item = this.doc.createElement('li');
      const label = this.doc.createElement('span');
      label.textContent = word;
      const remove = this.doc.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost';
      remove.textContent = '×';
      remove.setAttribute('aria-label', this.m.dictRemove(word));
      remove.addEventListener('click', () => {
        void this.removeWord(word);
      });
      item.append(label, remove);
      list.append(item);
    }
  }

  async addWord(): Promise<void> {
    const input = this.el<HTMLInputElement>('realtime-word');
    const word = cleanWord(input.value);
    if (!word || /\s/u.test(word)) {
      this.message('realtime-dict-message', this.m.dictInvalid, 'error');
      return;
    }
    try {
      const current = await loadDictionary(this.deps.area);
      if (
        current.words.length >= MAX_DICTIONARY_WORDS &&
        !current.words.some((w) => wordKey(w) === wordKey(word))
      ) {
        this.message('realtime-dict-message', this.m.dictFull, 'error');
        return;
      }
      await saveDictionary(this.deps.area, { words: [...current.words, word] });
      input.value = '';
      this.message('realtime-dict-message', this.m.dictAdded(word), 'ok');
      await this.renderWords();
    } catch {
      this.message(
        'realtime-dict-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
  }

  async removeWord(word: string): Promise<void> {
    try {
      const current = await loadDictionary(this.deps.area);
      await saveDictionary(this.deps.area, {
        words: current.words.filter((w) => w !== word),
      });
      this.message('realtime-dict-message', this.m.dictRemoved(word), 'ok');
      await this.renderWords();
    } catch {
      this.message(
        'realtime-dict-message',
        this.c.error('STORAGE_ERROR'),
        'error',
      );
    }
  }

  async exportWords(): Promise<void> {
    const { words } = await loadDictionary(this.deps.area);
    this.deps.download?.(
      'correctly-dictionary.txt',
      words.join('\n') + (words.length ? '\n' : ''),
    );
    this.message('realtime-dict-message', this.m.dictExported, 'ok');
  }
}

/** One hostname per line (or comma): lower case, valid and unique ones only. */
export function normalizeSiteList(text: string): string[] {
  return normalizeRealtime({ disabledSites: text.split(/[\s,;]+/u) })
    .disabledSites;
}
