import {
  AI_EDIT,
  CORRECT_TEXT,
  MAX_CORRECTION_CODE_POINTS,
  MAX_SUMMARY_CODE_POINTS,
  OPEN_LIMITS,
  OPEN_SETTINGS,
  REWRITE_TEXT,
  SUMMARIZE_TEXT,
  TRANSLATE_TEXT,
  toCorrectionResult,
  EXTRACT_TEXT,
  IMAGE_CONSENT,
} from '../shared/contracts';
import type { ErrorCode } from '../shared/errors';
import { COMMON, targetName, type CommonMessages } from '../shared/i18n';
import { toImageConsent, toOcrResult } from '../shared/ocr';
import { fillLanguages, linkVariants } from '../shared/language-menu';
import type { Locale } from '../shared/locale';
import type { QuotaNote } from '../shared/quota';
import {
  DEFAULT_FORMALITY,
  REWRITE_STYLES,
  formalityField,
  normalizeFormality,
  normalizeStyleIds,
  toRewriteResult,
  type Formality,
  type RewriteStyleId,
} from '../shared/rewrite';
import {
  DEFAULT_SUMMARY_FORMAT,
  DEFAULT_SUMMARY_LENGTH,
  SUMMARY_FORMATS,
  SUMMARY_LENGTHS,
  isSummaryFormat,
  isSummaryLength,
  toSummaryResult,
  type SummaryOptions,
} from '../shared/summary';
import {
  NEUTRAL,
  isLanguageId,
  isRtl,
  langTag,
  normalizeTranslation,
  translationKeys,
  variantFor,
  type TranslateTextRequest,
  type TranslationKey,
} from '../shared/translate';
import {
  LIMIT_CODES,
  applyBlocker,
  capture,
  formalitySlider,
  replaceRange,
  styleName,
  type Snapshot,
} from './correction';
import { afterPaint, hideOwnUi, selectArea } from './area';
import { captureIcon, closeIcon, gearIcon, logo, minimizeIcon } from './icons';
import { CONTENT, type ContentMessages } from './messages';

// V5.11: the one Correctly modal, opened by the right-edge handle, Ctrl+M or
// the toolbar icon. Opening, switching tabs, typing or changing options never
// sends anything; only a Generate click does, through the same worker
// messages (consent, route, usage limits) as the V5.2–V5.5 pickers.
// V5.12: a fourth tab, Summary, and plain page text as a copy-only source.

export type ModalTab =
  'correction' | 'reformulation' | 'translation' | 'summary';
export const MODAL_TABS: readonly {
  id: ModalTab;
  label: string;
  action: string;
  loading: string;
}[] = [
  {
    id: 'correction',
    label: 'Correction',
    action: 'Generate correction',
    loading: 'Checking with your AI provider…',
  },
  {
    id: 'reformulation',
    label: 'Reformulation',
    action: 'Generate reformulation',
    loading: 'Generating reformulations…',
  },
  {
    id: 'translation',
    label: 'Translation',
    action: 'Generate translation',
    loading: 'Translating…',
  },
  {
    id: 'summary',
    label: 'Summary',
    action: 'Generate summary',
    loading: 'Summarizing…',
  },
];
/** How long the Undo offer stays after a successful Apply. */
export const UNDO_MS = 5000;

/** Picker defaults from the settings (style IDs and languages, never a key). */
export interface ModalOptions {
  styles: readonly string[];
  translation: unknown;
  rewriteEnabled: boolean;
  /** 5.13: interface language (English when absent). */
  locale?: Locale;
  /** Starting level of the custom-formality slider (normalized here). */
  formality?: unknown;
  /**
   * 5.15 translate button: start on Translation with this text (the live
   * selection when it is the same text, else a copy-only page text), and
   * translate it at once when `generate` is true.
   */
  open?: OpenWith | null;
}

export interface OpenWith {
  text: string;
  generate: boolean;
  /** Shortcut "capture text": the window opens and asks for an area. */
  capture?: boolean;
}

/** The worker's argument is untrusted here too: exact fields, bounded text. */
export function toOpenWith(value: unknown): OpenWith | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.capture === true)
    return { text: '', generate: false, capture: true };
  return typeof data.text === 'string' &&
    data.text.trim() !== '' &&
    [...data.text].length <= MAX_SUMMARY_CODE_POINTS &&
    typeof data.generate === 'boolean'
    ? { text: data.text, generate: data.generate }
    : null;
}

/** chrome.runtime.sendMessage, injectable for tests. */
export type Send = (message: unknown) => Promise<unknown>;

type TextField = NonNullable<Snapshot['field']>;
type TranslationChoice = Omit<TranslateTextRequest, 'type' | 'text'>;

interface Choice {
  label: string;
  text: string;
  suspicious: boolean;
  /** Language of the result when known (summaries, translations). */
  lang?: string;
  /** 5.16: the result is in a right-to-left target (Persian, Hebrew…). */
  rtl?: boolean;
}

/** Everything one tab shows; replaced as a whole on any reset. */
interface TabState {
  choices: Choice[];
  chosen: number;
  operationId: string | null;
  status: string;
  tone: 'info' | 'error';
  quota: string;
  urgent: boolean;
  limits: boolean;
  /** Token of the request this tab waits for (0 = none). */
  pending: number;
}

const emptyTab = (): TabState => ({
  choices: [],
  chosen: -1,
  operationId: null,
  status: '',
  tone: 'info',
  quota: '',
  urgent: false,
  limits: false,
  pending: 0,
});

const emptyTabs = (): Record<ModalTab, TabState> =>
  Object.fromEntries(MODAL_TABS.map((item) => [item.id, emptyTab()])) as Record<
    ModalTab,
    TabState
  >;

/** Longest text each tab may send in its one request. */
const TEXT_LIMITS: Record<ModalTab, number> = {
  correction: MAX_CORRECTION_CODE_POINTS,
  reformulation: MAX_CORRECTION_CODE_POINTS,
  translation: MAX_CORRECTION_CODE_POINTS,
  summary: MAX_SUMMARY_CODE_POINTS,
};

/** Shared by every bundle loaded in this isolated world (content.js, smart.js). */
interface PageUi {
  correctlyModal?: CorrectlyModal;
  correctlyHandle?: { modalOpen(open: boolean): void };
  correctlyUndo?: UndoToast;
  correctlyPanel?: { busy: boolean; close(): void };
}
const pageUi = globalThis as PageUi;

const CSS = `
:host { all: initial; }
.scrim {
  position: fixed; inset: 0; z-index: 2147483646;
  background: rgba(8, 10, 16, 0.38);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  animation: correctly-fade 160ms ease-out;
}
.modal {
  --solid: #161922; --glass: rgba(22, 25, 34, 0.92);
  --surface: rgba(255, 255, 255, 0.05); --surface-2: rgba(255, 255, 255, 0.09);
  --text: #eef1f7; --muted: #a3abba; --border: rgba(255, 255, 255, 0.11);
  --border-strong: rgba(255, 255, 255, 0.2);
  --accent: #7c9cff; --accent-2: #a67cff; --accent-soft: rgba(124, 156, 255, 0.16);
  --accent-text: #0b1020; --warn: #f2c66d; --error: #ff8a80; --ok: #7ad69b;
  --shadow: 0 32px 80px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  position: fixed; z-index: 2147483647; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
  width: min(760px, calc(100vw - 32px));
  height: min(620px, calc(100vh - 32px));
  height: min(620px, calc(100dvh - 32px));
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border); border-radius: 20px;
  background: var(--solid); color: var(--text);
  box-shadow: var(--shadow);
  font: 14.5px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif;
  animation: correctly-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.modal::before {
  content: ''; position: absolute; inset: 0 0 auto; height: 3px; pointer-events: none;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .modal { background: var(--glass); backdrop-filter: blur(22px) saturate(150%); -webkit-backdrop-filter: blur(22px) saturate(150%); }
}
@media (prefers-color-scheme: light) {
  .modal {
    --solid: #ffffff; --glass: rgba(255, 255, 255, 0.94);
    --surface: rgba(20, 30, 60, 0.04); --surface-2: rgba(20, 30, 60, 0.08);
    --text: #141821; --muted: #5b6475; --border: rgba(20, 30, 60, 0.12);
    --border-strong: rgba(20, 30, 60, 0.24);
    --accent: #3461e8; --accent-2: #7b4fe0; --accent-soft: rgba(52, 97, 232, 0.1);
    --accent-text: #ffffff; --warn: #8a5a00; --error: #b42318; --ok: #1d7a42;
    --shadow: 0 32px 80px rgba(20, 30, 60, 0.22), 0 2px 8px rgba(20, 30, 60, 0.1);
  }
  .scrim { background: rgba(20, 26, 40, 0.28); }
}
@keyframes correctly-in { from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); } }
@keyframes correctly-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .modal, .scrim { animation: none; } * { transition: none !important; } }
.head { flex: none; display: flex; align-items: center; gap: 12px; padding: 18px 16px 12px 22px; }
.head h1 { flex: 1; margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.icon {
  width: 36px; height: 36px; min-height: 0; padding: 0; display: inline-grid; place-items: center;
  border: 1px solid transparent; border-radius: 10px; background: transparent;
  color: var(--muted); cursor: pointer; transition: background 120ms, color 120ms;
}
.icon:hover { background: var(--surface-2); color: var(--text); }
.tabrow { flex: none; display: flex; align-items: center; gap: 8px; margin: 0 22px; }
.tabrow .tabs { flex: 1 1 auto; min-width: 0; margin: 0; }
.tabrow .icon { flex: none; border-color: var(--border); background: var(--surface); }
.tabrow .icon:disabled { opacity: 0.45; cursor: default; }
.dialog {
  position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; padding: 20px;
  background: rgba(8, 10, 16, 0.55);
}
.dialog .card {
  max-width: 440px; padding: 20px; border: 1px solid var(--border-strong); border-radius: 16px;
  background: var(--solid); box-shadow: var(--shadow);
}
.dialog h2 { margin: 0 0 8px; font-size: 16px; }
.dialog p { margin: 0 0 16px; color: var(--muted); }
.dialog .row { display: flex; justify-content: flex-end; gap: 10px; }
.tabs {
  flex: none; display: flex; gap: 4px; margin: 0 22px; padding: 4px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow-x: auto;
}
[role='tab'] {
  flex: 1 1 0; font: inherit; font-weight: 550; min-height: 36px; padding: 6px 14px; margin: 0;
  cursor: pointer; white-space: nowrap;
  border: 0; border-radius: 10px; background: transparent; color: var(--muted);
  transition: background 140ms, color 140ms, box-shadow 140ms;
}
[role='tab']:hover { color: var(--text); background: var(--surface-2); }
[role='tab'][aria-selected='true'] {
  color: var(--text); background: var(--solid);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), inset 0 0 0 1px var(--border-strong);
}
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 18px 22px 16px; }
.label { display: block; margin: 0 0 6px; font-size: 12.5px; font-weight: 600; color: var(--muted); letter-spacing: 0.01em; }
textarea {
  box-sizing: border-box; width: 100%; min-height: 150px; max-height: 300px; resize: vertical;
  padding: 12px 14px; font: inherit; line-height: 1.6; color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 14px;
  transition: border-color 140ms, box-shadow 140ms, background 140ms;
}
textarea::placeholder { color: var(--muted); opacity: 0.8; }
textarea:hover { border-color: var(--border-strong); }
textarea:focus { outline: none; border-color: var(--accent); background: var(--solid); box-shadow: 0 0 0 4px var(--accent-soft); }
.hint { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
.hint:empty, .quota:empty, .status:empty, .note:empty { display: none; }
[role='tabpanel'] { margin-top: 16px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
.status { margin: 12px 0 0; padding: 10px 12px; border-radius: 12px; font-weight: 600; background: var(--surface); }
.status[data-tone='error'] { color: var(--error); background: color-mix(in srgb, var(--error) 10%, transparent); }
.quota { margin: 8px 0 0; color: var(--warn); font-size: 13px; }
h2 { margin: 18px 0 6px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
button {
  font: inherit; font-weight: 550; min-height: 38px; padding: 6px 16px; cursor: pointer;
  border: 1px solid var(--border-strong); border-radius: 11px; background: var(--surface); color: var(--text);
  transition: background 140ms, border-color 140ms, transform 80ms, box-shadow 140ms, filter 140ms;
}
button:hover:not(:disabled) { background: var(--surface-2); }
button:active:not(:disabled) { transform: translateY(1px); }
button.primary {
  border-color: transparent; color: var(--accent-text); font-weight: 650;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent);
}
button.primary:hover:not(:disabled) { background: linear-gradient(135deg, var(--accent), var(--accent-2)); filter: brightness(1.08); }
button.icon { min-height: 0; border-color: transparent; background: transparent; }
button.icon:hover { background: var(--surface-2); }
button:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
button:focus-visible, textarea:focus-visible, select:focus-visible, input:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
fieldset { margin: 14px 0 0; padding: 10px 14px 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
legend { padding: 0 6px; font-size: 12.5px; font-weight: 600; color: var(--muted); }
.choice { display: flex; gap: 10px; align-items: baseline; margin: 6px 0; }
.choice small { color: var(--muted); }
input[type='checkbox'], input[type='radio'], input[type='range'] { accent-color: var(--accent); }
.formality { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 10px; align-items: center; margin: 2px 0 8px 26px; }
.formality small { color: var(--muted); }
.formality input { width: 100%; margin: 0; }
.formality .level { grid-column: 1 / -1; }
.card {
  display: block; margin-top: 10px; padding: 12px 14px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
  transition: border-color 140ms, background 140ms, box-shadow 140ms;
}
.card:hover { border-color: var(--border-strong); }
.card:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent); }
.card strong { margin-left: 6px; }
.card .text { margin-top: 6px; }
.langs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px 12px; margin-top: 6px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; color: var(--muted); }
select {
  font: inherit; font-size: 14px; font-weight: 400; color: var(--text); background: var(--solid);
  border: 1px solid var(--border-strong); border-radius: 10px; padding: 6px 10px; min-height: 38px;
  cursor: pointer; transition: border-color 140ms;
}
select:hover { border-color: var(--accent); }
.foot {
  flex: none; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: flex-end;
  padding: 14px 22px 18px; border-top: 1px solid var(--border); background: var(--surface);
}
.note { flex: 1 1 100%; margin: 0; color: var(--warn); font-size: 13px; }
.note[data-tone='ok'] { color: var(--ok); }
.body::-webkit-scrollbar { width: 10px; }
.body::-webkit-scrollbar-thumb { background: var(--surface-2); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
@media (max-width: 560px) {
  .head { padding: 14px 10px 10px 16px; }
  .tabrow { margin: 0 12px; }
  [role='tab'] { flex: 0 0 auto; padding: 6px 10px; }
  .body { padding: 14px 14px 12px; }
  .foot { padding: 12px 14px 14px; }
}
@media (forced-colors: active) {
  .modal { border: 1px solid CanvasText; }
  .modal::before { display: none; }
  [role='tab'][aria-selected='true'] { outline: 2px solid Highlight; }
}
[hidden] { display: none !important; }
`;

const TOAST_CSS = `
:host { all: initial; }
.toast {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%);
  box-sizing: border-box; max-width: calc(100vw - 24px);
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 8px 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px;
  background: #181b22; color: #eef1f6; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: light) {
  .toast { background: #ffffff; color: #15181e; border-color: rgba(15, 20, 30, 0.14); }
}
button {
  font: inherit; min-height: 32px; padding: 4px 12px; cursor: pointer; font-weight: 600;
  border: 1px solid currentColor; border-radius: 8px; background: transparent; color: inherit;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid #6d95ff; outline-offset: 2px; }
@media (forced-colors: active) { .toast { border: 1px solid CanvasText; } }
`;

const FOCUSABLE =
  'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled])';

/** Hosts of Correctly's own page UI, hidden while the screenshot is taken. */
const OWN_UI =
  'correctly-handle, correctly-selection, correctly-realtime, correctly-undo, correctly-panel';

/** The capture button only exists where the rectangle is the tab's viewport. */
function isTopFrame(doc: Document): boolean {
  try {
    const win = doc.defaultView;
    return !win || win === win.top;
  } catch {
    return false;
  }
}

/** Keys of the page must not see typing inside the modal (site shortcuts). */
const ISOLATED_EVENTS = ['keydown', 'keyup', 'keypress', 'input'] as const;

export class CorrectlyModal {
  readonly host: HTMLElement;
  /** Closed root: page scripts cannot read or click into it. Exposed for tests. */
  readonly root: ShadowRoot;
  /** False once closed: this session is over and late answers are dropped. */
  visible = true;
  /**
   * Minimized (owner request): hidden but the session is kept (text, tab,
   * results, a request in flight); the next opening shows it again as is.
   */
  minimized = false;
  activeTab: ModalTab = 'correction';
  sharedText: string;
  /** Bumped by every real change of the shared text. */
  revision = 0;
  /** The verified original selection, or null (Apply disabled, Copy only). */
  readonly target: Snapshot | null;
  private readonly captureNotice: string;
  private readonly rewriteEnabled: boolean;
  private tabs: Record<ModalTab, TabState> = emptyTabs();
  private nextToken = 0;
  private composing = false;
  private copied = '';
  /** V7.1: the text came from an image: no field to write it into. */
  private imageSource = false;
  private captureBusy = false;
  private captureStatus = '';
  private captureTone: 'info' | 'error' | 'ok' = 'info';
  private readonly m: ContentMessages;
  private readonly c: CommonMessages;
  private readonly make: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K];
  private readonly ui: {
    textarea: HTMLTextAreaElement;
    textNote: HTMLElement;
    capture: HTMLButtonElement;
    tab: Record<ModalTab, HTMLButtonElement>;
    panel: Record<ModalTab, HTMLElement>;
    generate: Record<ModalTab, HTMLButtonElement>;
    status: Record<ModalTab, HTMLElement>;
    quota: Record<ModalTab, HTMLElement>;
    limits: Record<ModalTab, HTMLButtonElement>;
    results: Record<ModalTab, HTMLElement>;
    rewriteStyles: HTMLInputElement[];
    rewriteFormality: () => Formality;
    translateStyles: HTMLInputElement[];
    translateFormality: () => Formality;
    rewriteRange: HTMLInputElement | null;
    translateRange: HTMLInputElement | null;
    translateStyleBox: HTMLElement;
    from: HTMLSelectElement;
    to: HTMLSelectElement;
    variant: HTMLSelectElement;
    alsoRewrite: HTMLInputElement;
    sameNote: HTMLElement;
    summaryTo: HTMLSelectElement;
    summaryVariant: HTMLSelectElement;
    summaryLength: HTMLSelectElement;
    summaryFormat: HTMLSelectElement;
    apply: HTMLButtonElement;
    copy: HTMLButtonElement;
    cancel: HTMLButtonElement;
    note: HTMLElement;
    settings: HTMLButtonElement;
    minimize: HTMLButtonElement;
    close: HTMLButtonElement;
  };

  constructor(
    private readonly doc: Document,
    captured: Snapshot | string,
    options: ModalOptions,
    private readonly send: Send,
  ) {
    this.m = CONTENT[options.locale ?? 'en'];
    this.c = COMMON[options.locale ?? 'en'];
    const m = this.m;
    this.target = typeof captured === 'string' ? null : captured;
    this.sharedText = this.target?.text ?? '';
    this.captureNotice =
      typeof captured === 'string'
        ? captured !== m.notices.select
          ? captured
          : ''
        : captured.source === 'read_only_page'
          ? m.notices.pageText
          : '';
    this.rewriteEnabled = options.rewriteEnabled;
    this.host = doc.createElement('correctly-modal');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const make = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className = '',
      text = '',
    ) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      node.textContent = text;
      return node;
    };
    this.make = make;

    const style = make('style');
    style.textContent = CSS;
    const scrim = make('div', 'scrim');
    const modal = make('div', 'modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'correctly-title');

    // Header: identity, then Settings, Minimize (keeps the session) and
    // Close (ends it). Owner decision 2026-10-16: the V5.11 "no X" rule is
    // replaced by this pair.
    const head = make('header', 'head');
    const title = make('h1', '', 'Correctly');
    title.id = 'correctly-title';
    const iconButton = (label: string, glyph: SVGSVGElement) => {
      const node = make('button', 'icon');
      node.type = 'button';
      node.title = label;
      node.setAttribute('aria-label', label);
      node.append(glyph);
      return node;
    };
    const settings = iconButton(m.openSettings, gearIcon(doc));
    const minimize = iconButton(m.minimize, minimizeIcon(doc));
    const close = iconButton(m.close, closeIcon(doc));
    head.append(logo(doc, 22), title, settings, minimize, close);

    const tablist = make('div', 'tabs');
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', m.tablist);
    const body = make('div', 'body');
    const label = make('label', 'label', m.textLabel);
    label.htmlFor = 'correctly-text';
    const textarea = make('textarea');
    textarea.id = 'correctly-text';
    textarea.dir = 'auto';
    textarea.spellcheck = true;
    textarea.value = this.sharedText;
    textarea.placeholder = m.placeholder;
    const textNote = make('p', 'hint');
    textNote.setAttribute('aria-live', 'polite');
    body.append(label, textarea, textNote);

    const tab = {} as Record<ModalTab, HTMLButtonElement>;
    const panel = {} as Record<ModalTab, HTMLElement>;
    const generate = {} as Record<ModalTab, HTMLButtonElement>;
    const status = {} as Record<ModalTab, HTMLElement>;
    const quota = {} as Record<ModalTab, HTMLElement>;
    const limits = {} as Record<ModalTab, HTMLButtonElement>;
    const results = {} as Record<ModalTab, HTMLElement>;
    for (const item of MODAL_TABS) {
      const button = make('button', '', m.tabs[item.id].label);
      button.type = 'button';
      button.id = `correctly-tab-${item.id}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `correctly-panel-${item.id}`);
      tablist.append(button);
      tab[item.id] = button;
      const section = make('section');
      section.id = `correctly-panel-${item.id}`;
      section.setAttribute('role', 'tabpanel');
      section.setAttribute('aria-labelledby', button.id);
      panel[item.id] = section;
      generate[item.id] = Object.assign(
        make('button', 'primary', m.tabs[item.id].action),
        { type: 'button' },
      );
      status[item.id] = make('p', 'status');
      status[item.id].setAttribute('role', 'status');
      status[item.id].setAttribute('aria-live', 'polite');
      quota[item.id] = make('p', 'quota');
      quota[item.id].setAttribute('aria-live', 'polite');
      limits[item.id] = Object.assign(make('button', '', m.manageLimits), {
        type: 'button',
      });
      results[item.id] = make('div', 'results');
      body.append(section);
    }

    // Correction: no options.
    panel.correction.append(make('p', 'hint', m.correctionHint));

    // Reformulation: the V5.4 styles; all chosen styles in ONE request.
    const startLevel = normalizeFormality(options.formality);
    const styleBoxes = (defaults: readonly RewriteStyleId[]) => {
      const fieldset = make('fieldset');
      fieldset.append(make('legend', '', m.styles));
      let formality = (): Formality => DEFAULT_FORMALITY;
      const boxes = REWRITE_STYLES.map((item) => {
        const row = make('label', 'choice');
        const box = make('input');
        box.type = 'checkbox';
        box.value = item.id;
        box.checked = defaults.includes(item.id);
        row.append(
          box,
          make('span', '', this.c.style[item.id].label),
          make('small', '', this.c.style[item.id].description),
        );
        fieldset.append(row);
        if (item.id === 'custom') {
          const slider = formalitySlider(doc, this.c, startLevel);
          const sync = () => (slider.wrap.hidden = !box.checked);
          box.addEventListener('change', sync);
          sync();
          formality = slider.value;
          fieldset.append(slider.wrap);
        }
        return box;
      });
      const range =
        fieldset.querySelector<HTMLInputElement>('input[type=range]');
      return { fieldset, boxes, formality: () => formality(), range };
    };
    const normalized = normalizeStyleIds(options.styles);
    const defaults: RewriteStyleId[] = normalized.length
      ? normalized
      : ['professional'];
    const rewrite = styleBoxes(defaults);
    panel.reformulation.append(
      ...(options.rewriteEnabled
        ? [rewrite.fieldset, make('p', 'hint', m.oneRequestStyles)]
        : [make('p', 'hint', m.notices.rewriteOff)]),
    );

    // Translation: the 5.16 catalog (favorites first), the target's variant
    // and optional styles.
    const prefs = normalizeTranslation(options.translation);
    const select = (
      text: string,
      items: readonly { id: string; label: string }[],
      value: string,
    ) => {
      const wrap = make('label', 'field');
      const node = make('select');
      for (const item of items) {
        const option = make('option', '', item.label);
        option.value = item.id;
        node.append(option);
      }
      node.value = value;
      wrap.append(make('span', '', text), node);
      return { wrap, node };
    };
    const languageSelect = (text: string, value: string, auto = false) => {
      const item = select(text, [], '');
      fillLanguages(
        item.node,
        this.c,
        prefs.favorites,
        value,
        auto ? [{ id: 'auto', label: m.autoDetect }] : [],
      );
      return item;
    };
    const from = languageSelect(m.from, prefs.source, true);
    const to = languageSelect(m.to, prefs.target);
    const variant = select(m.variant, [], '');
    linkVariants(to.node, variant.node, variant.wrap, this.c, prefs.variants);
    const langs = make('div', 'langs');
    langs.append(from.wrap, to.wrap, variant.wrap);
    const also = make('label', 'choice');
    const alsoRewrite = make('input');
    alsoRewrite.type = 'checkbox';
    also.append(alsoRewrite, make('span', '', m.alsoRewrite));
    const translate = styleBoxes(defaults);
    const sameNote = make('p', 'hint');
    sameNote.setAttribute('aria-live', 'polite');
    panel.translation.append(langs, also, translate.fieldset, sameNote);

    // Summary (V5.12): written directly in the chosen language, ONE request.
    const summaryTo = languageSelect(m.summaryLanguage, prefs.target);
    const summaryVariant = select(m.variant, [], '');
    linkVariants(
      summaryTo.node,
      summaryVariant.node,
      summaryVariant.wrap,
      this.c,
      prefs.variants,
    );
    const summaryLength = select(
      m.length,
      SUMMARY_LENGTHS.map((item) => ({
        id: item.id,
        label: this.c.summaryLength[item.id],
      })),
      DEFAULT_SUMMARY_LENGTH,
    );
    const summaryFormat = select(
      m.format,
      SUMMARY_FORMATS.map((item) => ({
        id: item.id,
        label: this.c.summaryFormat[item.id],
      })),
      DEFAULT_SUMMARY_FORMAT,
    );
    const summaryOptions = make('div', 'langs');
    summaryOptions.append(
      summaryTo.wrap,
      summaryVariant.wrap,
      summaryLength.wrap,
      summaryFormat.wrap,
    );
    panel.summary.append(summaryOptions, make('p', 'hint', m.summaryHint));

    for (const item of MODAL_TABS) {
      const row = make('div', 'row');
      row.append(generate[item.id], limits[item.id]);
      panel[item.id].append(
        row,
        status[item.id],
        quota[item.id],
        results[item.id],
      );
    }

    const foot = make('footer', 'foot');
    const note = make('p', 'note');
    note.setAttribute('aria-live', 'polite');
    const apply = Object.assign(make('button', 'primary', m.apply), {
      type: 'button',
    });
    const copy = Object.assign(make('button', '', m.copy), { type: 'button' });
    const cancel = Object.assign(make('button', '', m.cancel), {
      type: 'button',
    });
    foot.append(note, apply, copy, cancel);
    const captureButton = iconButton(m.capture.button, captureIcon(doc));
    // Capture needs the viewport of the tab itself: top frame only.
    captureButton.hidden = !isTopFrame(doc);
    const tabrow = make('div', 'tabrow');
    tabrow.append(tablist, captureButton);
    modal.append(head, tabrow, body, foot);
    this.root.append(style, scrim, modal);

    this.ui = {
      textarea,
      textNote,
      capture: captureButton,
      tab,
      panel,
      generate,
      status,
      quota,
      limits,
      results,
      rewriteStyles: rewrite.boxes,
      rewriteFormality: rewrite.formality,
      translateStyles: translate.boxes,
      translateFormality: translate.formality,
      rewriteRange: rewrite.range,
      translateRange: translate.range,
      translateStyleBox: translate.fieldset,
      from: from.node,
      to: to.node,
      variant: variant.node,
      alsoRewrite,
      sameNote,
      summaryTo: summaryTo.node,
      summaryVariant: summaryVariant.node,
      summaryLength: summaryLength.node,
      summaryFormat: summaryFormat.node,
      apply,
      copy,
      cancel,
      note,
      settings,
      minimize,
      close,
    };

    textarea.addEventListener('input', () => this.setText(textarea.value));
    for (const item of MODAL_TABS) {
      tab[item.id].addEventListener('click', () => this.selectTab(item.id));
      generate[item.id].addEventListener(
        'click',
        () => void this.generate(item.id),
      );
      limits[item.id].addEventListener('click', () => {
        void this.send({ type: OPEN_LIMITS }).catch(() => undefined);
      });
    }
    // Changing options never sends; it only drops that tab's older result.
    for (const box of rewrite.boxes)
      box.addEventListener('change', () =>
        this.optionsChanged('reformulation'),
      );
    rewrite.range?.addEventListener('change', () =>
      this.optionsChanged('reformulation'),
    );
    translate.range?.addEventListener('change', () =>
      this.optionsChanged('translation'),
    );
    for (const node of [
      from.node,
      to.node,
      variant.node,
      alsoRewrite,
      ...translate.boxes,
    ])
      node.addEventListener('change', () => this.optionsChanged('translation'));
    for (const node of [
      summaryTo.node,
      summaryVariant.node,
      summaryLength.node,
      summaryFormat.node,
    ])
      node.addEventListener('change', () => this.optionsChanged('summary'));
    apply.addEventListener('click', () => this.apply());
    copy.addEventListener('click', () => void this.copy());
    cancel.addEventListener('click', () => this.cancel());
    settings.addEventListener('click', () => {
      void this.send({ type: OPEN_SETTINGS }).catch(() => undefined);
    });
    captureButton.addEventListener('click', () => void this.captureText());
    minimize.addEventListener('click', () => this.minimize());
    close.addEventListener('click', () => this.close());
    tablist.addEventListener('keydown', (event) => this.onTabKey(event));
    this.root.addEventListener('keydown', (event) =>
      this.onKey(event as KeyboardEvent),
    );
    for (const type of ISOLATED_EVENTS)
      this.root.addEventListener(type, (event) => event.stopPropagation());
    this.watch(true);

    this.render();
    doc.documentElement.append(this.host);
  }

  // --- state changes ----------------------------------------------------

  /** One real edit of the shared text clears every tab's result. */
  setText(next: string): void {
    if (!this.visible || next === this.sharedText) return;
    this.sharedText = next;
    if (this.ui.textarea.value !== next) this.ui.textarea.value = next;
    this.revision += 1;
    this.copied = '';
    this.tabs = emptyTabs();
    for (const item of MODAL_TABS) this.renderResults(item.id);
    this.render();
  }

  /** Switching keeps the shared text and every tab's result; nothing is sent. */
  selectTab(id: ModalTab, focus = false): void {
    if (!this.visible) return;
    this.activeTab = id;
    this.copied = '';
    this.render();
    if (focus) this.ui.tab[id].focus();
  }

  private optionsChanged(tab: ModalTab) {
    // A result no longer matches the options shown: drop it, never relabel it.
    if (!this.tabs[tab].pending) {
      this.tabs[tab] = emptyTab();
      this.renderResults(tab);
    }
    this.copied = '';
    this.render();
  }

  /** Why the shared text cannot be sent by this tab ('' = it can). */
  private textProblem(tab: ModalTab = this.activeTab): string {
    if (!this.sharedText.trim()) return 'empty';
    const max = TEXT_LIMITS[tab];
    if ([...this.sharedText].length <= max) return '';
    // Never cut automatically: the user shortens the text or switches tab.
    const number = (value: number) =>
      value.toLocaleString(this.c.locale === 'fr' ? 'fr-FR' : 'en');
    return max === MAX_SUMMARY_CODE_POINTS
      ? this.m.summaryTooLong(number(max))
      : this.m.tooLongForTab(number(MAX_SUMMARY_CODE_POINTS));
  }

  private summaryChoice(): SummaryOptions {
    const { summaryTo, summaryVariant, summaryLength, summaryFormat } = this.ui;
    const target = isLanguageId(summaryTo.value) ? summaryTo.value : 'en';
    return {
      target,
      variant: variantFor(target, summaryVariant.value),
      length: isSummaryLength(summaryLength.value)
        ? summaryLength.value
        : DEFAULT_SUMMARY_LENGTH,
      format: isSummaryFormat(summaryFormat.value)
        ? summaryFormat.value
        : DEFAULT_SUMMARY_FORMAT,
    };
  }

  private chosenStyles(boxes: HTMLInputElement[]): RewriteStyleId[] {
    return normalizeStyleIds(
      boxes.filter((box) => box.checked).map((box) => box.value),
    );
  }

  private translationChoice(): TranslationChoice {
    const { from, to, variant, alsoRewrite } = this.ui;
    const target = isLanguageId(to.value) ? to.value : 'en';
    const source =
      from.value === 'auto' || isLanguageId(from.value) ? from.value : 'auto';
    const styleIds = alsoRewrite.checked
      ? this.chosenStyles(this.ui.translateStyles)
      : [];
    return {
      source,
      target,
      variant: variantFor(target, variant.value),
      styleIds,
      ...formalityField(styleIds, this.ui.translateFormality()),
    };
  }

  /** Generate is possible for this tab now (no request in flight, valid input). */
  ready(tab: ModalTab): boolean {
    if (
      !this.visible ||
      this.captureBusy ||
      this.tabs[tab].pending ||
      this.textProblem(tab)
    )
      return false;
    if (tab === 'reformulation')
      return (
        this.rewriteEnabled &&
        this.chosenStyles(this.ui.rewriteStyles).length > 0
      );
    if (tab === 'translation') {
      const choice = this.translationChoice();
      return (
        choice.source !== choice.target &&
        (!this.ui.alsoRewrite.checked || choice.styleIds.length > 0)
      );
    }
    return true;
  }

  /**
   * One explicit click → one request for that tab. The answer is shown only
   * if this session is still open, the text unchanged and the tab still
   * waiting for this very request.
   */
  async generate(tab: ModalTab): Promise<void> {
    if (!this.ready(tab)) return;
    const token = ++this.nextToken;
    const revision = this.revision;
    const text = this.sharedText;
    const loading = this.m.tabs[tab].loading;
    this.tabs[tab] = { ...emptyTab(), pending: token, status: loading };
    this.copied = '';
    this.renderResults(tab);
    this.render();

    let message: unknown;
    let parse: (reply: unknown) => TabState;
    if (tab === 'correction') {
      message = { type: CORRECT_TEXT, text };
      parse = (reply) => this.parseCorrection(reply);
    } else if (tab === 'reformulation') {
      const styles = this.chosenStyles(this.ui.rewriteStyles);
      const formality = this.ui.rewriteFormality();
      message = {
        type: REWRITE_TEXT,
        text,
        styleIds: styles,
        ...formalityField(styles, formality),
      };
      parse = (reply) =>
        this.parseCandidates(
          reply,
          styles,
          (id: RewriteStyleId) => styleName(this.c, id, formality),
          text,
          'reformulation',
        );
    } else if (tab === 'summary') {
      // Options are frozen with the request (the controls stay locked while
      // it runs), so the label always matches what was asked.
      const choice = this.summaryChoice();
      const target = targetName(this.c, choice.target, choice.variant);
      message = { type: SUMMARIZE_TEXT, text, ...choice };
      parse = (reply) =>
        this.inScript(
          this.parseSummary(reply, this.m.summaryLabel(target)),
          choice,
        );
    } else {
      const choice = this.translationChoice();
      const target = targetName(this.c, choice.target, choice.variant);
      const formality = choice.formality ?? DEFAULT_FORMALITY;
      message = { type: TRANSLATE_TEXT, text, ...choice };
      parse = (reply) =>
        this.inScript(
          this.parseCandidates(
            reply,
            translationKeys(choice.styleIds),
            (key: TranslationKey) =>
              key === NEUTRAL
                ? this.m.translationLabel(target)
                : this.m.styledLabel(styleName(this.c, key, formality), target),
            text,
            'translation',
            this.m.sameLanguage(target, 'reformulation'),
          ),
          choice,
        );
    }
    let reply: unknown;
    try {
      reply = await this.send(message);
    } catch {
      // Worker restarted or channel closed: shown as an error, nothing applied.
      reply = undefined;
    }
    if (
      !this.visible ||
      revision !== this.revision ||
      this.tabs[tab].pending !== token
    )
      return;
    this.tabs[tab] = parse(reply);
    this.renderResults(tab);
    this.render();
  }

  private withQuota(
    state: TabState,
    result:
      | { ok: true; notice?: QuotaNote }
      | { ok: false; code: ErrorCode; quota?: QuotaNote; notice?: QuotaNote },
  ): TabState {
    const note = result.ok ? result.notice : (result.quota ?? result.notice);
    return {
      ...state,
      quota: note ? this.c.note(note) : '',
      urgent: !!note && (note.blocked || note.level === 100),
      limits: !!note || (!result.ok && LIMIT_CODES.includes(result.code)),
    };
  }

  private parseCorrection(reply: unknown): TabState {
    const result = toCorrectionResult(reply);
    const state = this.withQuota(emptyTab(), result);
    if (!result.ok)
      return {
        ...state,
        status: this.m.notChanged(this.c.error(result.code)),
        tone: 'error',
      };
    if (!result.hasErrors) return { ...state, status: this.m.noCorrections };
    return {
      ...state,
      status: this.m.suggestedCorrection,
      operationId: result.operationId ?? null,
      choices: [
        {
          label: this.m.corrected,
          text: result.correctedText,
          suspicious: result.suspicious,
        },
      ],
      chosen: 0,
    };
  }

  /** Results in this target: its language tag and writing direction. */
  private inScript(
    state: TabState,
    choice: Pick<SummaryOptions, 'target' | 'variant'>,
  ): TabState {
    const lang = langTag(choice.target, choice.variant);
    const rtl = isRtl(choice.target, choice.variant);
    return {
      ...state,
      choices: state.choices.map((item) => ({ ...item, lang, rtl })),
    };
  }

  private parseSummary(reply: unknown, label: string): TabState {
    const result = toSummaryResult(reply);
    const state = this.withQuota(emptyTab(), result);
    if (!result.ok)
      return {
        ...state,
        status: this.m.notChanged(this.c.error(result.code)),
        tone: 'error',
      };
    if (result.unsummarizable)
      return {
        ...state,
        status: this.m.unsummarizable,
      };
    return {
      ...state,
      status: this.m.suggestedSummary,
      operationId: result.operationId ?? null,
      choices: [{ label, text: result.text, suspicious: result.suspicious }],
      chosen: 0,
    };
  }

  private parseCandidates<K extends string>(
    reply: unknown,
    keys: readonly K[],
    label: (key: K) => string,
    text: string,
    tab: 'reformulation' | 'translation',
    sameLanguage = '',
  ): TabState {
    const result = toRewriteResult(reply, keys);
    const state = this.withQuota(emptyTab(), result);
    if (!result.ok)
      return {
        ...state,
        status: this.m.notChanged(this.c.error(result.code)),
        tone: 'error',
      };
    if (result.sameLanguage) return { ...state, status: sameLanguage };
    const useful = result.candidates.filter(
      (candidate) => candidate.text !== text,
    );
    const missing = keys.filter(
      (key) => !useful.some((candidate) => candidate.styleId === key),
    );
    const noun = tab;
    const lacking = missing.length
      ? this.m.noneReturned(noun, missing.map(label).join(', '))
      : '';
    if (!useful.length) return { ...state, status: this.m.noMeaningful(noun) };
    return {
      ...state,
      status:
        (useful.length > 1
          ? this.m.chooseOne(noun)
          : this.m.suggestedOne(noun)) + lacking,
      operationId: result.operationId ?? null,
      choices: useful.map((candidate) => ({
        label: label(candidate.styleId),
        text: candidate.text,
        suspicious: candidate.suspicious,
      })),
      chosen: 0,
    };
  }

  private choice(): Choice | undefined {
    const state = this.tabs[this.activeTab];
    return state.choices[state.chosen];
  }

  /** Why Apply must not run now ('' = safe): the V5.2 guard, unchanged. */
  private blocker(choice: Choice): string {
    if (this.imageSource) return this.m.capture.copyOnly;
    if (!this.target) return this.m.notices.noTarget;
    if (choice.suspicious) return this.m.notices.suspicious;
    return applyBlocker(this.target, this.composing, this.m.notices);
  }

  /**
   * Replaces exactly the original selection (same field, value and range),
   * then hides the modal and offers Undo for five seconds.
   */
  apply(): boolean {
    const choice = this.choice();
    if (!this.visible || !choice) return false;
    const field = this.target?.field;
    if (this.blocker(choice) || !this.target || !field) {
      this.render();
      return false;
    }
    const { start, end, text: before } = this.target;
    replaceRange(field, start, end, choice.text);
    const stop = start + choice.text.length;
    const operationId = this.tabs[this.activeTab].operationId;
    const report = (action: 'applied' | 'undone') => {
      if (operationId)
        void this.send({ type: AI_EDIT, operationId, action }).catch(
          () => undefined,
        );
    };
    // Counted only when the field really holds the applied text.
    if (field.value.slice(start, stop) === choice.text) report('applied');
    const applied = { start, end: stop, before, value: field.value };
    this.close();
    showUndo(this.doc, field, applied, () => report('undone'), this.m);
    return true;
  }

  async copy(): Promise<void> {
    const choice = this.choice();
    if (!this.visible || !choice) return;
    try {
      await navigator.clipboard.writeText(choice.text);
      this.copied = this.m.copied;
    } catch {
      this.copied = this.m.copyFailed;
    }
    if (this.visible) this.renderFooter();
  }

  /** Discards this tab's result or waiting request; never edits the page. */
  cancel(): void {
    if (!this.visible) return;
    const pending = this.tabs[this.activeTab].pending;
    this.tabs[this.activeTab] = {
      ...emptyTab(),
      status: pending ? this.m.cancelled : '',
    };
    this.copied = '';
    this.renderResults(this.activeTab);
    this.render();
  }

  /** Ends the session: nothing is applied, copied or sent; the handle returns. */
  close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.minimized = false;
    this.watch(false);
    const field = this.target?.field;
    const restore =
      this.host.isConnected &&
      this.host.style.display !== 'none' &&
      field?.isConnected;
    this.host.remove();
    if (pageUi.correctlyModal === this) delete pageUi.correctlyModal;
    pageUi.correctlyHandle?.modalOpen(false);
    if (restore) field?.focus({ preventScroll: true });
  }

  /**
   * Hides the window but keeps the session: a request in flight still lands
   * in its tab. The handle returns; any opening shows the same session.
   */
  minimize(): void {
    if (!this.visible || this.minimized) return;
    this.minimized = true;
    this.host.style.setProperty('display', 'none', 'important');
    pageUi.correctlyHandle?.modalOpen(false);
    const field = this.target?.field;
    if (field?.isConnected) field.focus({ preventScroll: true });
  }

  /** Shows a minimized session again, exactly as it was. */
  restore(): void {
    if (!this.visible || !this.minimized) return;
    this.minimized = false;
    this.host.style.removeProperty('display');
    pageUi.correctlyHandle?.modalOpen(true);
    this.render();
  }

  focus(): void {
    if (this.visible && !this.minimized)
      this.ui.textarea.focus({ preventScroll: true });
  }

  // --- V7.1 text from a screen area ---------------------------------------

  /** A small in-window question; Esc and Cancel answer false. */
  private ask(title: string, body: string, accept: string): Promise<boolean> {
    const { make } = this;
    const modal = this.root.querySelector('.modal');
    return new Promise((resolve) => {
      if (!modal) return resolve(false);
      const dialog = make('div', 'dialog');
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      const card = make('div', 'card');
      const heading = make('h2', '', title);
      heading.id = 'correctly-dialog-title';
      dialog.setAttribute('aria-labelledby', heading.id);
      const row = make('div', 'row');
      const cancel = Object.assign(make('button', '', this.m.capture.cancel), {
        type: 'button',
      });
      const ok = Object.assign(make('button', 'primary', accept), {
        type: 'button',
      });
      row.append(cancel, ok);
      card.append(heading, make('p', '', body), row);
      dialog.append(card);
      const settle = (answer: boolean) => {
        dialog.remove();
        resolve(answer);
        if (this.visible) this.ui.capture.focus({ preventScroll: true });
      };
      cancel.addEventListener('click', () => settle(false));
      ok.addEventListener('click', () => settle(true));
      dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        settle(false);
      });
      modal.append(dialog);
      cancel.focus({ preventScroll: true });
    });
  }

  private say(text: string, tone: 'info' | 'error' | 'ok' = 'info') {
    this.captureStatus = text;
    this.captureTone = tone;
    this.render();
  }

  /**
   * One click = at most one request. Order: image consent (asked once),
   * confirmation when the box holds text, the area (cancel = nothing sent),
   * then the worker captures, crops and reads it. The window is shown again
   * on every path.
   */
  async captureText(): Promise<void> {
    if (
      !this.visible ||
      this.captureBusy ||
      this.ui.capture.hidden ||
      this.ui.capture.disabled
    )
      return;
    this.captureBusy = true;
    this.captureStatus = '';
    this.render();
    let showUi: (() => void) | null = null;
    try {
      const status = await this.send({
        type: IMAGE_CONSENT,
        action: 'status',
      }).catch(() => undefined);
      if (!toImageConsent(status)) {
        const { consentTitle, consentBody, accept } = this.m.capture;
        if (!(await this.ask(consentTitle, consentBody, accept))) return;
        const granted = await this.send({
          type: IMAGE_CONSENT,
          action: 'grant',
        }).catch(() => undefined);
        if (!toImageConsent(granted)) {
          this.say(this.c.error('IMAGE_CONSENT_REQUIRED'), 'error');
          return;
        }
      }
      if (this.sharedText.trim()) {
        const { confirmTitle, confirmBody, replace } = this.m.capture;
        if (!(await this.ask(confirmTitle, confirmBody, replace))) return;
      }
      // Our own UI must not be in the screenshot: window, handle, bubble,
      // underlines and the Undo offer are hidden, then two frames are
      // painted before anything is asked of the worker.
      showUi = hideOwnUi([
        this.host,
        ...this.doc.querySelectorAll<HTMLElement>(OWN_UI),
      ]);
      const selection = await selectArea(this.doc, {
        locale: this.c.locale,
      });
      if (!selection) return;
      await afterPaint(this.doc.defaultView ?? window);
      const revision = this.revision;
      const request = this.send({ type: EXTRACT_TEXT, ...selection }).catch(
        () => undefined,
      );
      // The answer may take seconds: the window is back with a loading line.
      showUi();
      showUi = null;
      this.say(this.m.capture.loading);
      const result = toOcrResult(await request);
      if (!this.visible) return;
      if (!result.ok) {
        const note = result.quota ?? result.notice;
        this.say(
          [this.c.error(result.code), note ? this.c.note(note) : '']
            .filter(Boolean)
            .join(' '),
          result.code === 'NO_TEXT_FOUND' ? 'info' : 'error',
        );
        return;
      }
      if (revision !== this.revision) {
        // The user edited the box meanwhile: their text wins, nothing lost.
        this.say('');
        return;
      }
      this.imageSource = true;
      this.captureStatus = '';
      this.setText(result.text);
      this.say(
        [this.m.capture.done, result.notice ? this.c.note(result.notice) : '']
          .filter(Boolean)
          .join(' '),
        'ok',
      );
    } finally {
      showUi?.();
      this.captureBusy = false;
      if (this.visible) {
        this.render();
        this.ui.capture.focus({ preventScroll: true });
      }
    }
  }

  // --- page field and keyboard ------------------------------------------

  private readonly onCompositionStart = () => {
    this.composing = true;
    this.renderFooter();
  };
  private readonly onCompositionEnd = () => {
    this.composing = false;
    this.renderFooter();
  };
  private readonly onFieldInput = () => this.renderFooter();

  private watch(on: boolean) {
    const field = this.target?.field;
    if (!field) return;
    const method = on ? 'addEventListener' : 'removeEventListener';
    field[method]('input', this.onFieldInput);
    field[method]('compositionstart', this.onCompositionStart);
    field[method]('compositionend', this.onCompositionEnd);
  }

  private onTabKey(event: KeyboardEvent) {
    const ids = MODAL_TABS.map((item) => item.id);
    const index = ids.indexOf(this.activeTab);
    const next =
      event.key === 'ArrowRight'
        ? ids[(index + 1) % ids.length]
        : event.key === 'ArrowLeft'
          ? ids[(index + ids.length - 1) % ids.length]
          : event.key === 'Home'
            ? ids[0]
            : event.key === 'End'
              ? ids[ids.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    this.selectTab(next, true);
  }

  private onKey(event: KeyboardEvent) {
    // Escape = Minimize (keeps the session; Close is the X button).
    if (event.key === 'Escape') {
      event.preventDefault();
      this.minimize();
      return;
    }
    if (event.key !== 'Tab') return;
    // Focus stays inside the dialog while it is open.
    const items = [
      ...this.root.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((node) => !node.closest('[hidden]'));
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.root.activeElement;
    if (!first || !last) return;
    if (event.shiftKey && (active === first || !active)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !active)) {
      event.preventDefault();
      first.focus();
    }
  }

  // --- rendering --------------------------------------------------------

  private renderResults(tab: ModalTab) {
    const state = this.tabs[tab];
    const box = this.ui.results[tab];
    box.replaceChildren();
    const [only] = state.choices;
    if (!only) return;
    const text = ({ text: value, lang = '', rtl }: Choice) =>
      Object.assign(this.make('p', 'text', value), {
        dir: rtl ? 'rtl' : 'auto',
        lang,
      });
    if (state.choices.length === 1) {
      box.append(this.make('h2', '', only.label), text(only));
      return;
    }
    const group = this.make('div');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', this.m.results);
    state.choices.forEach((choice, index) => {
      const card = this.make('label', 'card');
      const radio = this.make('input');
      radio.type = 'radio';
      radio.name = `correctly-${tab}`;
      radio.checked = index === state.chosen;
      // Choosing only changes what Apply/Copy use; it never edits the page.
      radio.addEventListener('change', () => {
        if (this.tabs[tab] !== state) return;
        state.chosen = index;
        this.copied = '';
        this.renderFooter();
      });
      card.append(radio, this.make('strong', '', choice.label), text(choice));
      group.append(card);
    });
    box.append(group);
  }

  private render() {
    if (!this.visible) return;
    const { ui } = this;
    const problem = this.textProblem();
    ui.textNote.textContent =
      this.captureStatus ||
      (problem && problem !== 'empty' ? problem : '') ||
      (this.imageSource ? this.m.capture.imageNotice : this.captureNotice);
    ui.textNote.dataset.tone = this.captureStatus ? this.captureTone : 'info';
    ui.capture.disabled =
      this.captureBusy ||
      MODAL_TABS.some((item) => this.tabs[item.id].pending !== 0);
    for (const item of MODAL_TABS) {
      const id = item.id;
      const selected = id === this.activeTab;
      const state = this.tabs[id];
      ui.tab[id].setAttribute('aria-selected', String(selected));
      ui.tab[id].tabIndex = selected ? 0 : -1;
      ui.panel[id].hidden = !selected;
      ui.panel[id].setAttribute('aria-busy', String(!!state.pending));
      ui.generate[id].disabled = !this.ready(id);
      ui.status[id].textContent = state.status;
      ui.status[id].dataset.tone = state.tone;
      ui.quota[id].textContent = state.quota;
      ui.quota[id].setAttribute(
        'aria-live',
        state.urgent ? 'assertive' : 'polite',
      );
      ui.limits[id].hidden = !state.limits;
    }
    const busyRewrite = !!this.tabs.reformulation.pending;
    for (const box of ui.rewriteStyles) box.disabled = busyRewrite;
    if (ui.rewriteRange) ui.rewriteRange.disabled = busyRewrite;
    const busyTranslate = !!this.tabs.translation.pending;
    for (const node of [
      ui.from,
      ui.to,
      ui.variant,
      ui.alsoRewrite,
      ...ui.translateStyles,
      ...(ui.translateRange ? [ui.translateRange] : []),
    ])
      node.disabled = busyTranslate;
    ui.translateStyleBox.hidden = !ui.alsoRewrite.checked;
    const busySummary = !!this.tabs.summary.pending;
    for (const node of [
      ui.summaryTo,
      ui.summaryVariant,
      ui.summaryLength,
      ui.summaryFormat,
    ])
      node.disabled = busySummary;
    const choice = this.translationChoice();
    ui.sameNote.textContent =
      choice.source === choice.target
        ? this.m.sameSourceTarget('reformulation')
        : '';
    this.renderFooter();
  }

  private renderFooter() {
    if (!this.visible) return;
    const state = this.tabs[this.activeTab];
    const choice = this.choice();
    const blocker = choice ? this.blocker(choice) : '';
    this.ui.apply.disabled = !choice || !!blocker;
    this.ui.copy.disabled = !choice;
    this.ui.cancel.disabled = !state.pending && !choice && !state.status;
    this.ui.note.textContent = this.copied || blocker;
    this.ui.note.dataset.tone = this.copied === this.m.copied ? 'ok' : 'warn';
  }
}

interface Applied {
  start: number;
  end: number;
  before: string;
  value: string;
}

/** The five-second Undo offer after a successful Apply (modal hidden). */
export class UndoToast {
  readonly host: HTMLElement;
  /** Closed root, exposed for tests. */
  readonly root: ShadowRoot;
  readonly button: HTMLButtonElement;
  private readonly message: HTMLElement;
  private composing = false;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    doc: Document,
    private readonly field: TextField,
    private readonly applied: Applied,
    private readonly onUndone: () => void,
    ms = UNDO_MS,
    private readonly m: ContentMessages = CONTENT.en,
  ) {
    this.host = doc.createElement('correctly-undo');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = TOAST_CSS;
    const toast = doc.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    this.message = doc.createElement('span');
    this.message.textContent = m.textReplaced;
    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.textContent = m.undo;
    this.button.addEventListener('mousedown', (event) =>
      event.preventDefault(),
    );
    this.button.addEventListener('click', () => this.undo());
    toast.append(this.message, this.button);
    this.root.append(style, toast);
    field.addEventListener('compositionstart', this.onCompositionStart);
    field.addEventListener('compositionend', this.onCompositionEnd);
    // Expiry only removes the offer; it never edits anything.
    this.timer = setTimeout(() => this.dismiss(), ms);
    doc.documentElement.append(this.host);
  }

  private readonly onCompositionStart = () => (this.composing = true);
  private readonly onCompositionEnd = () => (this.composing = false);

  /** Same guard as V5.2: nothing typed since Apply, field still editable. */
  canUndo(): boolean {
    const field = this.field;
    return (
      this.host.isConnected &&
      field.isConnected &&
      !field.disabled &&
      !field.readOnly &&
      !this.composing &&
      field.value === this.applied.value
    );
  }

  /** Restores the original text only when safe; never calls the AI provider. */
  undo(): boolean {
    if (!this.canUndo()) {
      this.button.disabled = true;
      this.message.textContent = this.m.undoRefused;
      return false;
    }
    const { start, end, before } = this.applied;
    replaceRange(this.field, start, end, before);
    if (this.field.value.slice(start, start + before.length) === before)
      this.onUndone();
    this.dismiss();
    this.field.focus({ preventScroll: true });
    return true;
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.field.removeEventListener('compositionstart', this.onCompositionStart);
    this.field.removeEventListener('compositionend', this.onCompositionEnd);
    this.host.remove();
    if (pageUi.correctlyUndo === this) delete pageUi.correctlyUndo;
  }
}

/** One Undo offer at a time: a newer Apply replaces the previous offer. */
function showUndo(
  doc: Document,
  field: TextField,
  applied: Applied,
  onUndone: () => void,
  m: ContentMessages,
): UndoToast {
  pageUi.correctlyUndo?.dismiss();
  const toast = new UndoToast(doc, field, applied, onUndone, UNDO_MS, m);
  pageUi.correctlyUndo = toast;
  return toast;
}

/**
 * The single semantic action behind the handle, Ctrl+M and the toolbar icon.
 * Already open: focus it, keep the session; minimized: show it again as it
 * was. Otherwise: a fresh session on Correction with the verified selection
 * (or an empty text).
 */
export function openModal(
  doc: Document,
  options: ModalOptions,
  send: Send = (message) => chrome.runtime.sendMessage(message),
): CorrectlyModal {
  const current = pageUi.correctlyModal;
  const open = options.open ?? null;
  if (current?.visible && current.host.isConnected) {
    current.restore();
    // 5.15: an open session keeps its text; the button only shows the tab.
    if (open) current.selectTab('translation');
    current.focus();
    return current;
  }
  // Capture first: nothing below may move the focus or the selection. V5.12:
  // plain page text is accepted too, as a copy-only source.
  const m = CONTENT[options.locale ?? 'en'];
  let captured = capture(doc, {
    readOnlyPage: true,
    max: MAX_SUMMARY_CODE_POINTS,
    m,
  });
  // 5.15: the selection the button was shown for. When the page no longer
  // has it (focus moved), it is used as copy-only page text.
  if (
    open &&
    (typeof captured === 'string' || captured.text.trim() !== open.text.trim())
  )
    captured = {
      text: open.text,
      source: 'read_only_page',
      field: null,
      start: 0,
      end: 0,
      value: '',
      copyOnlyReason: m.notices.readOnlyPage,
    };
  const panel = pageUi.correctlyPanel;
  if (panel && !panel.busy) panel.close();
  const modal = new CorrectlyModal(doc, captured, options, send);
  pageUi.correctlyModal = modal;
  pageUi.correctlyHandle?.modalOpen(true);
  if (open?.capture) {
    // The shortcut was the explicit action; captureText asks for the area.
    void modal.captureText();
  } else if (open) {
    modal.selectTab('translation');
    // The click on the translate button was the explicit action.
    if (open.generate) void modal.generate('translation');
  }
  modal.focus();
  return modal;
}
