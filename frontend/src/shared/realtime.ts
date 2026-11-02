// V6.1 real-time correction, pure core: result contract and validator,
// sentence splitting, in-memory cache, and the per-field scheduler (pause /
// sentence end, one check in flight, stale results never shown, IME guard).
// No DOM, no chrome.*, no network: engines are injected as `check`.
import { ADD_WORD, CHECK_TEXT, type FailureResult } from './contracts';
import { cleanWord } from './dictionary';
import type { QuotaNote } from './quota';

export type IssueKind = 'spelling' | 'grammar';

/** Offsets are UTF-16 indices into the text the issue was validated against. */
export interface RealtimeIssue {
  start: number;
  end: number;
  original: string;
  suggestions: string[];
  kind: IssueKind;
}

export interface Sentence {
  start: number;
  end: number;
  text: string;
}

export interface CheckRequest {
  sentence: string;
  /** The previous sentence ('' when there is none). */
  context: string;
}

/** An engine answer is untrusted: the scheduler validates it. */
export type CheckFn = (request: CheckRequest) => Promise<unknown>;

export const PAUSE_MS = 1000;
export const MAX_ISSUES = 20;
export const MAX_SUGGESTIONS = 3;
export const MAX_SUGGESTION_LENGTH = 200;
export const MAX_CHECK_CODE_POINTS = 1000;
export const MAX_SENTENCES_PER_RUN = 3;
export const CACHE_SIZE = 500;

const ISSUE_KEYS = ['start', 'end', 'original', 'suggestions', 'kind'];
const END_OF_SENTENCE = /[.!?…。！？]\s*$|\n\s*$/u;

let segmenter: Intl.Segmenter | undefined;

/** Trimmed sentences with their exact position in `text`. */
export function splitSentences(text: string): Sentence[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const sentences: Sentence[] = [];
  for (const { index, segment } of segmenter.segment(text)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const start = index + (segment.length - segment.trimStart().length);
    sentences.push({ start, end: start + trimmed.length, text: trimmed });
  }
  return sentences;
}

/** True when the last thing typed closes a sentence (. ! ? … or a line break). */
export function endsSentence(text: string): boolean {
  return END_OF_SENTENCE.test(text);
}

/** Worth a request: has a letter and fits the contract size. */
export function isCheckable(sentence: string): boolean {
  if (!/\p{L}/u.test(sentence)) return false;
  // Cheap bound before the exact code-point count.
  if (sentence.length > MAX_CHECK_CODE_POINTS * 2) return false;
  return [...sentence].length <= MAX_CHECK_CODE_POINTS;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function parseIssue(item: unknown, sentence: string): RealtimeIssue | null {
  if (!isPlainObject(item)) return null;
  const keys = Object.keys(item);
  if (keys.length !== ISSUE_KEYS.length) return null;
  if (!ISSUE_KEYS.every((key) => keys.includes(key))) return null;
  const { start, end, original, suggestions, kind } = item;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const from = start as number;
  const to = end as number;
  if (from < 0 || to <= from || to > sentence.length) return null;
  if (typeof original !== 'string' || sentence.slice(from, to) !== original)
    return null;
  if (kind !== 'spelling' && kind !== 'grammar') return null;
  if (
    !Array.isArray(suggestions) ||
    suggestions.length < 1 ||
    suggestions.length > MAX_SUGGESTIONS
  )
    return null;
  const seen = new Set<string>();
  for (const suggestion of suggestions as unknown[]) {
    if (
      typeof suggestion !== 'string' ||
      !suggestion ||
      suggestion.length > MAX_SUGGESTION_LENGTH ||
      suggestion === original ||
      seen.has(suggestion)
    )
      return null;
    seen.add(suggestion);
  }
  return {
    start: from,
    end: to,
    original,
    suggestions: [...(suggestions as string[])],
    kind,
  };
}

/**
 * Keeps only issues that exactly match the sentence snapshot. Anything else
 * (not an array, more than MAX_ISSUES, extra or missing fields, wrong
 * offsets, bad suggestions) is dropped; overlaps keep the earliest issue.
 */
export function validateIssues(
  raw: unknown,
  sentence: string,
): RealtimeIssue[] {
  if (!Array.isArray(raw) || raw.length > MAX_ISSUES) return [];
  const parsed: RealtimeIssue[] = [];
  for (const item of raw as unknown[]) {
    const issue = parseIssue(item, sentence);
    if (issue) parsed.push(issue);
  }
  parsed.sort((a, b) => a.start - b.start || a.end - b.end);
  const kept: RealtimeIssue[] = [];
  for (const issue of parsed) {
    const last = kept[kept.length - 1];
    if (!last || issue.start >= last.end) kept.push(issue);
  }
  return kept;
}

/** cyrb53: small, fast, non-cryptographic. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${text.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

/** hash(sentence) → validated issues (sentence-relative). Memory only, bounded. */
export class IssueCache {
  private readonly entries = new Map<string, RealtimeIssue[]>();

  constructor(private readonly capacity = CACHE_SIZE) {}

  get size(): number {
    return this.entries.size;
  }

  get(sentence: string): RealtimeIssue[] | undefined {
    const key = hash(sentence);
    const found = this.entries.get(key);
    if (found) {
      // Refresh recency.
      this.entries.delete(key);
      this.entries.set(key, found);
    }
    return found;
  }

  has(sentence: string): boolean {
    return this.entries.has(hash(sentence));
  }

  set(sentence: string, issues: RealtimeIssue[]): void {
    const key = hash(sentence);
    this.entries.delete(key);
    this.entries.set(key, issues);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Cached issues for every sentence of `text`, positioned in the field. */
export function issuesFor(text: string, cache: IssueCache): RealtimeIssue[] {
  const all: RealtimeIssue[] = [];
  for (const sentence of splitSentences(text)) {
    const cached = cache.get(sentence.text);
    if (!cached) continue;
    for (const issue of cached)
      all.push({
        ...issue,
        start: issue.start + sentence.start,
        end: issue.end + sentence.start,
      });
  }
  return all;
}

/** Why a check did not happen: a worker error code or an ENGINE_* code. */
export class CheckFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CheckFailure';
  }
}

export interface FieldCheckerOptions {
  check: CheckFn;
  /** Issues for the CURRENT text (never for an older one). */
  onIssues: (issues: RealtimeIssue[]) => void;
  /** A check failed (limit, offline, engine unavailable…). */
  onProblem?: (error: unknown) => void;
  cache?: IssueCache;
  pauseMs?: number;
}

export interface FieldChecker {
  /** The field text changed. */
  input(text: string): void;
  /** IME composition: nothing is checked until compositionEnd. */
  compositionStart(): void;
  compositionEnd(text: string): void;
  dispose(): void;
}

/**
 * One checker per field. Checks the sentences that changed after a pause
 * (or at once at a sentence end), at most one request in flight; a result
 * for text that has since changed is cached but never shown.
 */
export function createFieldChecker(options: FieldCheckerOptions): FieldChecker {
  const cache = options.cache ?? new IssueCache();
  const pauseMs = options.pauseMs ?? PAUSE_MS;
  let text = '';
  let version = 0;
  let composing = false;
  let inFlight = false;
  let again = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const emit = () => {
    if (!disposed) options.onIssues(issuesFor(text, cache));
  };

  const schedule = (delay: number) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, delay);
  };

  async function checkPending(): Promise<void> {
    const startVersion = version;
    const sentences = splitSentences(text);
    const todo = sentences
      .map((sentence, index) => ({
        sentence,
        context: sentences[index - 1]?.text ?? '',
      }))
      .filter(
        ({ sentence }) =>
          isCheckable(sentence.text) && !cache.has(sentence.text),
      )
      .slice(0, MAX_SENTENCES_PER_RUN);
    for (const { sentence, context } of todo) {
      if (disposed || version !== startVersion) return;
      let raw: unknown;
      try {
        raw = await options.check({
          sentence: sentence.text,
          context: [...context].slice(-MAX_CHECK_CODE_POINTS).join(''),
        });
      } catch (error) {
        options.onProblem?.(error);
        return;
      }
      // The answer is about this exact sentence text, so it is valid to
      // cache even when the field changed meanwhile.
      cache.set(sentence.text, validateIssues(raw, sentence.text));
      options.onProblem?.(null);
      if (version !== startVersion) return;
      emit();
    }
  }

  function run(): void {
    timer = undefined;
    if (disposed || composing) return;
    emit();
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    void checkPending().finally(() => {
      inFlight = false;
      if (again && !disposed) {
        again = false;
        if (timer === undefined && !composing) schedule(0);
      }
    });
  }

  return {
    input(next) {
      text = next;
      version++;
      if (composing) return;
      // Show what is still known right away (edited words lose their mark).
      emit();
      schedule(endsSentence(next) ? 0 : pauseMs);
    },
    compositionStart() {
      composing = true;
      version++;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
    compositionEnd(next) {
      composing = false;
      text = next;
      version++;
      emit();
      schedule(endsSentence(next) ? 0 : pauseMs);
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** V6.1.2: page script → worker (API engine). Exact shape, nothing else. */
export interface CheckTextRequest {
  type: typeof CHECK_TEXT;
  text: string;
  context: string;
}

const codePointsWithin = (value: string, max: number) =>
  value.length <= max * 2 && [...value].length <= max;

export function isCheckTextRequest(value: unknown): value is CheckTextRequest {
  if (!isPlainObject(value)) return false;
  return (
    Object.keys(value).sort().join() === 'context,text,type' &&
    value.type === CHECK_TEXT &&
    typeof value.text === 'string' &&
    typeof value.context === 'string' &&
    isCheckable(value.text) &&
    codePointsWithin(value.context, MAX_CHECK_CODE_POINTS)
  );
}

export type CheckTextResult =
  | {
      ok: true;
      issues: RealtimeIssue[];
      notice?: QuotaNote;
      operationId?: string;
    }
  | FailureResult;

/** V6.1.4: page script → worker, exact shape. */
export interface AddWordRequest {
  type: typeof ADD_WORD;
  word: string;
}

export function isAddWordRequest(value: unknown): value is AddWordRequest {
  return (
    isPlainObject(value) &&
    Object.keys(value).sort().join() === 'type,word' &&
    value.type === ADD_WORD &&
    cleanWord(value.word) !== ''
  );
}
