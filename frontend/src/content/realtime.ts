// V6.1 real-time correction, page side (opt-in page script). While the user
// types, the sentence that changed is checked after a pause or at a sentence
// end; mistakes are underlined by an OVERLAY (closed shadow root, never a
// node inside the field) and fixed with one click. Nothing is ever changed
// without that click. The checks themselves are the pure core in
// shared/realtime.ts; this file is only listeners, geometry and a small card.
import { ADD_WORD, CHECK_TEXT } from '../shared/contracts';
import { cleanWord, wordKey } from '../shared/dictionary';
import type { Locale } from '../shared/locale';
import {
  CheckFailure,
  IssueCache,
  createFieldChecker,
  issuesFor,
  splitSentences,
  type CheckFn,
  type FieldChecker,
  type RealtimeIssue,
} from '../shared/realtime';
import { LocalEngine, pageLanguage, type LocalStatus } from './local-engine';
import { CONTENT, type ContentMessages } from './messages';
import {
  isEligibleField,
  replaceRange,
  shortcutEditingHost,
} from './correction';

/** Fields longer than this are not checked (keeps typing fast). */
export const MAX_FIELD_CHARS = 20_000;
const HIDE_DELAY_MS = 350;
const CARD_GAP = 4;
const Z_INDEX = '2147483646';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
type TextField = HTMLInputElement | HTMLTextAreaElement;

interface Segment {
  node: Text;
  start: number;
  end: number;
}

/** What is being checked: a text field or a contenteditable host. */
interface ActiveField {
  el: HTMLElement;
  text: TextField | null;
  segments: Segment[];
  checker: FieldChecker;
  issues: RealtimeIssue[];
  mirror: Mirror | null;
}

export type Measure = (
  field: ActiveField,
  start: number,
  end: number,
) => Rect[];

/** A local engine as the feature needs it (replaceable in tests). */
export interface LocalChecker {
  check: CheckFn;
  status(): Promise<LocalStatus>;
}

export interface RealtimeOptions {
  locale: Locale;
  /** auto = built-in AI only; api = the user's key through the worker. */
  engine?: 'auto' | 'local' | 'api';
  /** Personal dictionary: words never underlined. */
  dictionary?: readonly string[];
  localEngine?: LocalChecker;
  send?: (message: unknown) => Promise<unknown>;
  pauseMs?: number;
  /** Tests build untrusted events; real typing is always trusted. */
  trusted?: (event: Event) => boolean;
  /** Tests have no layout engine. */
  measure?: Measure;
}

// ---- eligibility -----------------------------------------------------------

const AUTOFILL_PERSONAL =
  /^(?:email|tel|url|username|name|given-name|family-name|new-password|current-password|one-time-code|cc-|bday|postal-code|street-address|address-|organization|country|transaction)/u;
const NON_TEXT_INPUT_MODE = /^(?:email|tel|url|numeric|decimal)$/u;

/** Hints that a field holds an identifier, not prose. */
function looksLikeData(el: HTMLElement): boolean {
  const hint = (el.getAttribute('autocomplete') ?? '').trim().toLowerCase();
  const mode = (el.getAttribute('inputmode') ?? '').trim().toLowerCase();
  return (
    hint.split(/\s+/u).some((token) => AUTOFILL_PERSONAL.test(token)) ||
    NON_TEXT_INPUT_MODE.test(mode) ||
    el.getAttribute('spellcheck') === 'false' ||
    !!el.closest('[aria-hidden="true"], [inert]')
  );
}

/**
 * The field to check for a focused node, or null. Same exclusions as the
 * other actions (credentials, payment, code editors, disabled, read-only)
 * plus autofill and visibility hints.
 */
export function realtimeField(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  if (isEligibleField(node))
    return looksLikeData(node) || node.getAttribute('aria-readonly') === 'true'
      ? null
      : node;
  const host = shortcutEditingHost(node);
  if (
    !host ||
    looksLikeData(host) ||
    host.getAttribute('aria-readonly') === 'true'
  )
    return null;
  return host;
}

// ---- reading text and locating it -----------------------------------------

const BLOCKS =
  /^(?:DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|TABLE|SECTION|ARTICLE)$/u;

/**
 * The visible text of a contenteditable with its text nodes. Line breaks and
 * block boundaries become "\n" (so sentences split there); every other
 * character keeps its index, so offsets map back to nodes.
 */
export function readEditable(root: HTMLElement): {
  text: string;
  segments: Segment[];
} {
  const segments: Segment[] = [];
  let text = '';
  const newline = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };
  const walk = (parent: Node) => {
    for (const child of parent.childNodes) {
      if (child instanceof Text) {
        segments.push({
          node: child,
          start: text.length,
          end: text.length + child.data.length,
        });
        text += child.data.replace(/\xa0/gu, ' ');
      } else if (child instanceof HTMLElement) {
        if (child.tagName === 'BR') text += '\n';
        else {
          const block = BLOCKS.test(child.tagName);
          if (block) newline();
          walk(child);
          if (block) newline();
        }
      }
      if (text.length > MAX_FIELD_CHARS) return;
    }
  };
  walk(root);
  return { text, segments };
}

/**
 * Hidden copy of a text field's box and text, living in the overlay root, so
 * the browser lays out the same lines and `Range.getClientRects` gives the
 * position of any word. The field itself is never touched.
 */
class Mirror {
  readonly box: HTMLDivElement;
  private static readonly STYLES = [
    'boxSizing',
    'width',
    'height',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'fontVariant',
    'fontStretch',
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'textTransform',
    'textIndent',
    'textAlign',
    'direction',
    'tabSize',
    'overflowWrap',
    'wordBreak',
  ] as const;

  constructor(
    private readonly doc: Document,
    root: ShadowRoot,
    private readonly field: TextField,
  ) {
    this.box = doc.createElement('div');
    this.box.className = 'mirror';
    root.append(this.box);
  }

  /** Rects (viewport coordinates) of [start, end) clipped to the field. */
  rects(start: number, end: number): Rect[] {
    const view = this.doc.defaultView;
    if (!view) return [];
    const style = view.getComputedStyle(this.field);
    for (const name of Mirror.STYLES)
      (this.box.style as unknown as Record<string, string>)[name] = style[name];
    this.box.style.whiteSpace =
      this.field instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';
    this.box.textContent = this.field.value;
    const node = this.box.firstChild;
    if (!(node instanceof Text) || typeof this.doc.createRange !== 'function')
      return [];
    const range = this.doc.createRange();
    range.setStart(node, Math.min(start, node.length));
    range.setEnd(node, Math.min(end, node.length));
    if (typeof range.getClientRects !== 'function') return [];
    const origin = this.box.getBoundingClientRect();
    const field = this.field.getBoundingClientRect();
    const out: Rect[] = [];
    for (const r of range.getClientRects()) {
      const left = r.left - origin.left + field.left - this.field.scrollLeft;
      const top = r.top - origin.top + field.top - this.field.scrollTop;
      const clipped = clip(
        { left, top, width: r.width, height: r.height },
        field,
      );
      if (clipped) out.push(clipped);
    }
    return out;
  }
}

function clip(r: Rect, bounds: DOMRect): Rect | null {
  const left = Math.max(r.left, bounds.left);
  const top = Math.max(r.top, bounds.top);
  const right = Math.min(r.left + r.width, bounds.right);
  const bottom = Math.min(r.top + r.height, bounds.bottom);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

const defaultMeasure: Measure = (field, start, end) => {
  if (field.mirror) return field.mirror.rects(start, end);
  const doc = field.el.ownerDocument;
  const from = field.segments.find((s) => start >= s.start && start < s.end);
  const to = field.segments.find((s) => end > s.start && end <= s.end);
  if (!from || !to || !from.node.isConnected || !to.node.isConnected) return [];
  const range = doc.createRange();
  range.setStart(from.node, start - from.start);
  range.setEnd(to.node, end - to.start);
  if (typeof range.getClientRects !== 'function') return [];
  const bounds = field.el.getBoundingClientRect();
  const out: Rect[] = [];
  for (const r of range.getClientRects()) {
    const clipped = clip(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      bounds,
    );
    if (clipped) out.push(clipped);
  }
  return out;
};

// ---- overlay ---------------------------------------------------------------

const CSS = `
:host { all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: ${Z_INDEX}; }
* { box-sizing: border-box; }
.mirror { position: fixed; left: 0; top: 0; visibility: hidden; pointer-events: none; overflow: hidden; }
.mark { position: fixed; height: 4px; pointer-events: none; background-repeat: repeat-x; background-size: 6px 4px; }
.mark[data-kind="spelling"] { --c: #d93025; }
.mark[data-kind="grammar"] { --c: #1a73e8; }
.mark { background-image: linear-gradient(-45deg, transparent 65%, var(--c) 80%, transparent 90%), linear-gradient(45deg, transparent 65%, var(--c) 80%, transparent 90%); }
.card { position: fixed; max-width: 280px; padding: 8px; border-radius: 8px; font: 13px/1.4 system-ui, sans-serif;
  background: #fff; color: #202124; border: 1px solid #dadce0; box-shadow: 0 2px 10px rgba(0,0,0,.2); }
.card .kind { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
.card[data-kind="spelling"] .kind { color: #d93025; }
.card[data-kind="grammar"] .kind { color: #1a73e8; }
.card .word { font-weight: 600; margin-bottom: 6px; word-break: break-word; }
.card button { display: block; width: 100%; margin: 2px 0; padding: 5px 8px; text-align: left; cursor: pointer;
  font: inherit; color: inherit; background: #f1f3f4; border: 1px solid transparent; border-radius: 6px; }
.card button:hover, .card button:focus-visible { border-color: #1a73e8; outline: none; }
.card button.sel { border-color: #1a73e8; }
.card .skip { display: flex; gap: 12px; margin-top: 6px; }
.card button.link { display: inline; width: auto; margin: 0; padding: 0; background: none; border: none; font-size: 12px; text-decoration: underline; color: #5f6368; }
.badge { position: fixed; max-width: 216px; padding: 3px 8px; border-radius: 10px; font: 11px/1.3 system-ui, sans-serif; pointer-events: none;
  background: #fef7e0; color: #5f370e; border: 1px solid #f9ab00; }
.card .note {: 4px; font-size: 12px; color: #5f6368; }
@media (prefers-color-scheme: dark) {
  .mark[data-kind="spelling"] { --c: #f28b82; }
  .mark[data-kind="grammar"] { --c: #8ab4f8; }
  .card { background: #292a2d; color: #e8eaed; border-color: #5f6368; }
  .card button { background: #3c4043; }
  .card .note { color: #9aa0a6; }
  .card button.link { color: #9aa0a6; }
  .badge { background: #3c3420; color: #fde293; border-color: #f9ab00; }
}
@media (forced-colors: active) {
  .mark { background: none; border-bottom: 2px solid LinkText; height: 2px; }
  .card { background: Canvas; color: CanvasText; border-color: CanvasText; }
}
`;

interface Mark {
  issue: RealtimeIssue;
  rects: Rect[];
  nodes: HTMLElement[];
}

// ---- the feature -----------------------------------------------------------

export class RealtimeCorrection {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly cache = new IssueCache();
  private readonly m: ContentMessages;
  private readonly send: (message: unknown) => Promise<unknown>;
  private readonly measure: Measure;
  private readonly trusted: (event: Event) => boolean;
  private active: ActiveField | null = null;
  private marks: Mark[] = [];
  private card: HTMLElement | null = null;
  private cardIssue: RealtimeIssue | null = null;
  private byKeyboard = false;
  /** The pointer is on the card (events inside a closed root are retargeted, so it is tracked on the card). */
  private overCard = false;
  /** Buttons of the open card in Tab order, and the one Enter applies. */
  private choices: HTMLElement[] = [];
  private selected = 0;
  private cursor = -1;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private disposed = false;
  private readonly local: LocalChecker;
  private readonly ignored = new Set<string>();
  private readonly known: Set<string>;
  private badge: HTMLElement | null = null;
  private problem: string | null = null;

  constructor(
    private readonly doc: Document,
    private readonly options: RealtimeOptions,
  ) {
    this.m = CONTENT[options.locale];
    this.send =
      options.send ?? ((message) => chrome.runtime.sendMessage(message));
    this.measure = options.measure ?? defaultMeasure;
    this.local =
      options.localEngine ?? new LocalEngine(globalThis, pageLanguage(doc));
    this.known = new Set((options.dictionary ?? []).map(wordKey));
    this.trusted = options.trusted ?? ((event) => event.isTrusted);
    this.host = doc.createElement('correctly-realtime');
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    this.root.append(style);
    doc.documentElement.append(this.host);
    const win = doc.defaultView;
    doc.addEventListener('focusin', this.onFocusIn, true);
    doc.addEventListener('focusout', this.onFocusOut, true);
    doc.addEventListener('input', this.onInput, true);
    doc.addEventListener('compositionstart', this.onCompositionStart, true);
    doc.addEventListener('compositionend', this.onCompositionEnd, true);
    doc.addEventListener('scroll', this.reposition, {
      capture: true,
      passive: true,
    });
    doc.addEventListener('mousemove', this.onMouseMove, {
      capture: true,
      passive: true,
    });
    doc.addEventListener('keydown', this.onKeyDown, true);
    win?.addEventListener('resize', this.reposition, { passive: true });
    win?.addEventListener('pagehide', this.dispose);
    // The field may already have focus when the script starts.
    const current = doc.activeElement;
    if (current) this.activate(current);
  }

  // ---- test hooks ----

  /** Underline elements, for tests only. */
  get underlines(): readonly HTMLElement[] {
    return this.marks.flatMap((mark) => mark.nodes);
  }
  get currentBadge(): HTMLElement | null {
    return this.badge;
  }
  get currentCard(): HTMLElement | null {
    return this.card;
  }
  get current(): readonly RealtimeIssue[] {
    return this.active?.issues ?? [];
  }

  // ---- lifecycle ----

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.deactivate();
    const doc = this.doc;
    doc.removeEventListener('focusin', this.onFocusIn, true);
    doc.removeEventListener('focusout', this.onFocusOut, true);
    doc.removeEventListener('input', this.onInput, true);
    doc.removeEventListener('compositionstart', this.onCompositionStart, true);
    doc.removeEventListener('compositionend', this.onCompositionEnd, true);
    doc.removeEventListener('scroll', this.reposition, true);
    doc.removeEventListener('mousemove', this.onMouseMove, true);
    doc.removeEventListener('keydown', this.onKeyDown, true);
    doc.defaultView?.removeEventListener('resize', this.reposition);
    doc.defaultView?.removeEventListener('pagehide', this.dispose);
    this.cache.clear();
    this.host.remove();
  };

  private activate(target: EventTarget | null): void {
    const el = realtimeField(target);
    if (!el || el === this.active?.el) return;
    this.deactivate();
    const text = isTextFieldEl(el) ? el : null;
    const field: ActiveField = {
      el,
      text,
      segments: [],
      issues: [],
      mirror: text ? new Mirror(this.doc, this.root, text) : null,
      checker: createFieldChecker({
        check: this.engine,
        pauseMs: this.options.pauseMs,
        cache: this.cache,
        onIssues: (issues) => {
          if (this.active?.el !== el) return;
          this.active.issues = this.visible(issues);
          this.render();
        },
        onProblem: (error) => {
          if (this.active?.el !== el) return;
          this.setProblem(error);
        },
      }),
    };
    this.active = field;
    // Focusing a field only shows what is already known: typing is what
    // makes text leave the page.
    const { text: value } = this.read(field);
    field.issues = this.visible(issuesFor(value, this.cache));
    this.render();
  }

  private deactivate(): void {
    const field = this.active;
    this.active = null;
    field?.checker.dispose();
    field?.mirror?.box.remove();
    this.closeCard();
    this.marks = [];
    this.badge?.remove();
    this.badge = null;
    for (const node of this.root.querySelectorAll('.mark')) node.remove();
  }

  /** Engine for the API mode: the worker checks one sentence. */
  private readonly engine: CheckFn = async (request) => {
    if (this.options.engine === 'api') return this.apiCheck(request);
    return this.local.check(request);
  };

  private readonly apiCheck: CheckFn = async ({ sentence, context }) => {
    const reply = (await this.send({
      type: CHECK_TEXT,
      text: sentence,
      context,
    })) as { ok?: unknown; issues?: unknown; code?: unknown } | null;
    if (!reply || reply.ok !== true)
      throw new CheckFailure(
        typeof reply?.code === 'string' ? reply.code : 'UNKNOWN_ERROR',
      );
    return reply.issues;
  };

  /** Hides what the owner said to skip: ignored this session, or in the dictionary. */
  private visible(issues: RealtimeIssue[]): RealtimeIssue[] {
    return issues.filter((issue) => {
      const key = wordKey(issue.original.trim());
      return !this.ignored.has(key) && !this.known.has(key);
    });
  }

  /** Re-draws from what is known, after Ignore or a new dictionary word. */
  private refresh(): void {
    const field = this.active;
    if (!field) return;
    field.issues = this.visible(issuesFor(this.read(field).text, this.cache));
    this.render();
  }

  /** null = the last check worked. Otherwise a small badge says why it is paused. */
  private setProblem(error: unknown): void {
    this.problem = error === null ? null : errorCode(error);
    this.badge?.remove();
    this.badge = null;
    const field = this.active;
    if (!this.problem || !field) return;
    const m = this.m.realtime;
    const text =
      this.problem === 'QUOTA_EXCEEDED' || this.problem === 'AI_PAUSED'
        ? m.badgePaused
        : this.problem === 'NETWORK_ERROR'
          ? m.badgeOffline
          : this.problem === 'ENGINE_UNAVAILABLE'
            ? m.badgeNeedsEngine
            : this.problem === 'ENGINE_DOWNLOADING'
              ? m.badgeDownloading
              : m.badgeError;
    const badge = this.doc.createElement('div');
    badge.className = 'badge';
    badge.setAttribute('role', 'status');
    badge.textContent = text;
    this.root.append(badge);
    this.badge = badge;
    this.placeBadge();
  }

  private placeBadge(): void {
    const field = this.active;
    if (!this.badge || !field) return;
    const box = field.el.getBoundingClientRect();
    this.badge.style.left = `${Math.max(4, box.right - 220)}px`;
    this.badge.style.top = `${box.bottom + 2}px`;
  }

  private read(field: ActiveField): { text: string } {
    if (field.text) return { text: field.text.value };
    const read = readEditable(field.el);
    field.segments = read.segments;
    return { text: read.text };
  }

  // ---- events ----

  private readonly onFocusIn = (event: Event) => {
    this.activate(event.composedPath()[0] ?? null);
  };

  private readonly onFocusOut = (event: Event) => {
    const field = this.active;
    if (!field) return;
    const next = (event as FocusEvent).relatedTarget;
    // Moving inside the same editor keeps the field; leaving ends the checks.
    if (next instanceof Node && field.el.contains(next)) return;
    const target = event.composedPath()[0];
    if (target instanceof Node && field.el.contains(target)) this.deactivate();
  };

  private fieldOf(event: Event): ActiveField | null {
    const field = this.active;
    const target = event.composedPath()[0];
    return field && target instanceof Node && field.el.contains(target)
      ? field
      : null;
  }

  private readonly onInput = (event: Event) => {
    const field = this.fieldOf(event);
    if (!field || !this.trusted(event)) return;
    const { text } = this.read(field);
    if (text.length > MAX_FIELD_CHARS) return;
    this.closeCard();
    field.checker.input(text);
  };

  private readonly onCompositionStart = (event: Event) => {
    this.fieldOf(event)?.checker.compositionStart();
  };

  private readonly onCompositionEnd = (event: Event) => {
    const field = this.fieldOf(event);
    if (field) field.checker.compositionEnd(this.read(field).text);
  };

  readonly reposition = () => {
    if (this.frame || !this.active) return;
    const win = this.doc.defaultView;
    const run = () => {
      this.frame = 0;
      this.render();
    };
    this.frame = win?.requestAnimationFrame
      ? win.requestAnimationFrame(run)
      : (setTimeout(run, 16) as unknown as number);
  };

  private readonly onMouseMove = (event: Event) => {
    // The pointer is on the card itself: it must stay, whatever else happened.
    if (this.card && this.overCard) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
      return;
    }
    if (!this.marks.length) return;
    const { clientX: x, clientY: y } = event as MouseEvent;
    const hit = this.marks.find((mark) =>
      mark.rects.some(
        (r) =>
          x >= r.left - 2 &&
          x <= r.left + r.width + 2 &&
          y >= r.top - 2 &&
          y <= r.top + r.height + 4,
      ),
    );
    if (hit) {
      clearTimeout(this.hideTimer);
      if (this.cardIssue !== hit.issue) this.showCard(hit, false);
    } else if (this.card && !this.byKeyboard) {
      this.hideTimer ??= setTimeout(() => this.closeCard(), HIDE_DELAY_MS);
    }
  };

  private readonly onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    if (!this.active) return;
    if (key.altKey && key.shiftKey && key.key === 'ArrowDown') {
      if (!this.marks.length) return;
      key.preventDefault();
      this.cursor = (this.cursor + 1) % this.marks.length;
      const mark = this.marks[this.cursor];
      if (mark) this.showCard(mark, true);
    } else if (this.card && this.byKeyboard && key.key === 'Tab') {
      // Tab / Shift+Tab walk the suggestions (and "Replace all").
      key.preventDefault();
      key.stopPropagation();
      this.select(this.selected + (key.shiftKey ? -1 : 1));
    } else if (this.card && this.byKeyboard && key.key === 'Enter') {
      key.preventDefault();
      key.stopPropagation();
      this.choices[this.selected]?.click();
    } else if (this.card && key.key === 'Escape') {
      key.preventDefault();
      key.stopPropagation();
      this.closeCard();
    }
  };

  // ---- drawing ----

  private render(): void {
    const field = this.active;
    for (const node of this.root.querySelectorAll('.mark')) node.remove();
    this.marks = [];
    if (!field) return;
    this.placeBadge();
    if (field.issues.length && !field.text) this.read(field);
    for (const issue of field.issues) {
      const rects = this.measure(field, issue.start, issue.end);
      const nodes = rects.map((r) => {
        const node = this.doc.createElement('div');
        node.className = 'mark';
        node.dataset.kind = issue.kind;
        node.style.left = `${r.left}px`;
        node.style.top = `${r.top + r.height - 3}px`;
        node.style.width = `${r.width}px`;
        this.root.append(node);
        return node;
      });
      this.marks.push({ issue, rects, nodes });
    }
    // The card follows its word, or goes when the word is gone.
    if (this.cardIssue) {
      const same = this.marks.find(
        (mark) =>
          mark.issue.start === this.cardIssue?.start &&
          mark.issue.original === this.cardIssue.original,
      );
      if (same) this.cardIssue = same.issue;
      else this.closeCard();
    }
  }

  private showCard(mark: Mark, byKeyboard: boolean): void {
    this.closeCard();
    const field = this.active;
    const first = mark.rects[0];
    if (!field || !first) return;
    const m = this.m.realtime;
    const copyOnly = !field.text;
    const choices: HTMLElement[] = [];
    const card = this.doc.createElement('div');
    card.className = 'card';
    card.dataset.kind = mark.issue.kind;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', m.cardLabel);
    const kind = this.doc.createElement('div');
    kind.className = 'kind';
    kind.textContent = mark.issue.kind === 'spelling' ? m.spelling : m.grammar;
    const word = this.doc.createElement('div');
    word.className = 'word';
    word.textContent = mark.issue.original;
    card.append(kind, word);
    for (const suggestion of mark.issue.suggestions) {
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.textContent = copyOnly
        ? m.copyWith(suggestion)
        : m.replaceWith(suggestion);
      button.addEventListener('click', () => {
        void this.choose(mark.issue, suggestion);
      });
      card.append(button);
      choices.push(button);
    }
    // Several mistakes in the same sentence: fix them all in one click.
    const together = copyOnly ? [] : this.inSentence(mark.issue);
    if (together.length > 1) {
      const all = this.doc.createElement('button');
      all.type = 'button';
      all.textContent = m.replaceAll(together.length);
      all.addEventListener('click', () => this.replaceAll(together));
      card.append(all);
      choices.push(all);
    }
    if (copyOnly) card.append(this.note(m.copyOnlyHint));
    const skip = this.doc.createElement('div');
    skip.className = 'skip';
    skip.append(
      this.link(m.ignore, () => {
        this.ignored.add(wordKey(mark.issue.original.trim()));
        this.closeCard();
        this.refresh();
      }),
      this.link(m.addToDictionary, () => {
        const word = cleanWord(mark.issue.original);
        if (word) {
          this.known.add(wordKey(word));
          void Promise.resolve(this.send({ type: ADD_WORD, word })).catch(
            () => undefined,
          );
        }
        this.closeCard();
        this.refresh();
      }),
    );
    card.append(skip);
    // The field keeps the focus while the card is used.
    card.addEventListener('mousedown', (event) => event.preventDefault());
    card.addEventListener('mouseenter', () => {
      this.overCard = true;
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    });
    card.addEventListener('mouseleave', () => {
      this.overCard = false;
      if (!this.byKeyboard)
        this.hideTimer = setTimeout(() => this.closeCard(), HIDE_DELAY_MS);
    });
    const view = this.doc.defaultView;
    const maxLeft = (view?.innerWidth ?? 1024) - 290;
    card.style.left = `${Math.max(4, Math.min(first.left, maxLeft))}px`;
    card.style.top = `${first.top + first.height + CARD_GAP}px`;
    this.root.append(card);
    // Near the bottom of the window, the card opens above the word instead.
    const height = card.getBoundingClientRect().height;
    const below = first.top + first.height + CARD_GAP + height;
    const above = first.top - CARD_GAP - height;
    if (below > (view?.innerHeight ?? 768) && above >= 4)
      card.style.top = `${above}px`;
    this.card = card;
    this.cardIssue = mark.issue;
    this.byKeyboard = byKeyboard;
    this.choices = choices;
    this.select(0);
  }

  /** Marks the choice Enter will apply (shown only for keyboard use). */
  private select(index: number): void {
    const count = this.choices.length;
    if (!count) return;
    this.selected = (index + count) % count;
    this.choices.forEach((button, i) =>
      button.classList.toggle('sel', this.byKeyboard && i === this.selected),
    );
  }

  /** Issues of the card's sentence (the field's issues that sit inside it). */
  private inSentence(issue: RealtimeIssue): RealtimeIssue[] {
    const field = this.active;
    if (!field?.text) return [];
    const sentence = splitSentences(field.text.value).find(
      (s) => issue.start >= s.start && issue.end <= s.end,
    );
    return sentence
      ? field.issues.filter(
          (i) => i.start >= sentence.start && i.end <= sentence.end,
        )
      : [];
  }

  /**
   * Applies the first suggestion of each issue, last to first so earlier
   * offsets stay valid. Every range is re-checked against the field first;
   * one that no longer matches is skipped, never guessed.
   */
  private replaceAll(issues: readonly RealtimeIssue[]): void {
    const field = this.active;
    const text = field?.text;
    if (!field || !text || text.disabled || text.readOnly) return;
    for (const issue of [...issues].sort((a, b) => b.start - a.start)) {
      const first = issue.suggestions[0];
      if (first && text.value.slice(issue.start, issue.end) === issue.original)
        replaceKeepingCaret(this.doc, text, issue.start, issue.end, first);
    }
    this.closeCard();
    field.checker.input(text.value);
  }

  private link(label: string, run: () => void): HTMLElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = 'link';
    button.textContent = label;
    button.addEventListener('click', run);
    return button;
  }

  private note(text: string): HTMLElement {
    const note = this.doc.createElement('div');
    note.className = 'note';
    note.textContent = text;
    return note;
  }

  private closeCard(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    this.card?.remove();
    this.choices = [];
    this.selected = 0;
    this.overCard = false;
    this.card = null;
    this.cardIssue = null;
    this.byKeyboard = false;
  }

  // ---- acting ----

  /**
   * Replace (text fields) or copy (editors we never rewrite). Replace
   * re-reads the field and requires the range to still hold the checked
   * word; otherwise the card says it is outdated and the sentence is checked
   * again.
   */
  private async choose(
    issue: RealtimeIssue,
    suggestion: string,
  ): Promise<void> {
    const field = this.active;
    if (!field) return;
    const text = field.text;
    if (!text) {
      await this.copy(suggestion);
      return;
    }
    const still =
      text.isConnected &&
      !text.disabled &&
      !text.readOnly &&
      text.value.slice(issue.start, issue.end) === issue.original;
    if (!still) {
      this.card?.append(this.note(this.m.realtime.outdated));
      field.checker.input(text.value);
      return;
    }
    replaceKeepingCaret(this.doc, text, issue.start, issue.end, suggestion);
    this.closeCard();
    // Our own edit is not a trusted keystroke: look at the new text now.
    field.checker.input(text.value);
  }

  private async copy(suggestion: string): Promise<void> {
    const m = this.m.realtime;
    const message = await this.doc.defaultView?.navigator.clipboard
      .writeText(suggestion)
      .then(
        () => m.copied,
        () => m.copyFailed,
      );
    this.card?.append(this.note(message ?? m.copyFailed));
  }
}

const errorCode = (error: unknown): string =>
  error instanceof CheckFailure ? error.code : 'UNKNOWN_ERROR';

const isTextFieldEl = (el: HTMLElement): el is TextField =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

/**
 * One exact-range replacement. The browser's own insertText keeps the
 * field's undo history; where it is unavailable the V5 range replacement is
 * used. The caret stays on the same text.
 */
export function replaceKeepingCaret(
  doc: Document,
  el: TextField,
  start: number,
  end: number,
  text: string,
): void {
  const selStart = el.selectionStart ?? 0;
  const selEnd = el.selectionEnd ?? 0;
  const original = el.value.slice(start, end);
  el.setSelectionRange(start, end);
  let done = false;
  if (typeof doc.execCommand === 'function') {
    try {
      done = doc.execCommand('insertText', false, text);
    } catch {
      done = false;
    }
  }
  if (!done || el.value.slice(start, start + text.length) !== text) {
    // Only if the range was left untouched, so a change is never doubled.
    if (el.value.slice(start, end) === original)
      replaceRange(el, start, end, text);
  }
  const delta = text.length - (end - start);
  const move = (offset: number) =>
    offset <= start
      ? offset
      : offset >= end
        ? offset + delta
        : start + text.length;
  el.setSelectionRange(move(selStart), move(selEnd));
}

export function installRealtime(
  doc: Document,
  options: RealtimeOptions,
): RealtimeCorrection {
  return new RealtimeCorrection(doc, options);
}
