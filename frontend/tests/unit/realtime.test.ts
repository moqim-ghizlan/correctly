import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IssueCache,
  MAX_ISSUES,
  PAUSE_MS,
  createFieldChecker,
  endsSentence,
  issuesFor,
  splitSentences,
  validateIssues,
  type CheckRequest,
  type RealtimeIssue,
} from '../../src/shared/realtime';

const issue = (
  sentence: string,
  word: string,
  suggestion = 'x',
): RealtimeIssue => {
  const start = sentence.indexOf(word);
  return {
    start,
    end: start + word.length,
    original: word,
    suggestions: [suggestion],
    kind: 'spelling',
  };
};

/** An engine answering from a script, one deferred answer per request. */
function engine() {
  const requests: CheckRequest[] = [];
  const pending: ((raw: unknown) => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const check = (request: CheckRequest) => {
    requests.push(request);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<unknown>((resolve) => {
      pending.push((raw) => {
        inFlight--;
        resolve(raw);
      });
    });
  };
  return {
    check,
    requests,
    answer: async (raw: unknown) => {
      pending.shift()?.(raw);
      await vi.advanceTimersByTimeAsync(0);
    },
    maxInFlight: () => maxInFlight,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sentence splitting', () => {
  it('trims sentences and keeps their exact position', () => {
    const text = 'Je suis aller a Lyon.  Les chat mange!\nOk';
    const sentences = splitSentences(text);
    expect(sentences.map((s) => s.text)).toEqual([
      'Je suis aller a Lyon.',
      'Les chat mange!',
      'Ok',
    ]);
    for (const s of sentences) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it('detects the end of a sentence', () => {
    for (const done of ['Fin.', 'Quoi ?', 'Oui !', 'Bon…', 'Ligne\n', 'Fin. '])
      expect(endsSentence(done)).toBe(true);
    for (const open of ['Fin', 'Je suis', 'a, b'])
      expect(endsSentence(open)).toBe(false);
  });
});

describe('R1: when a check happens', () => {
  it('waits for the pause, then checks the changed sentence once', async () => {
    const e = engine();
    const onIssues = vi.fn();
    const checker = createFieldChecker({ check: e.check, onIssues });
    checker.input('Je suis aller');
    await vi.advanceTimersByTimeAsync(PAUSE_MS - 1);
    expect(e.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(e.requests).toEqual([{ sentence: 'Je suis aller', context: '' }]);
    await e.answer([issue('Je suis aller', 'aller', 'allé')]);
    expect(onIssues).toHaveBeenLastCalledWith([
      issue('Je suis aller', 'aller', 'allé'),
    ]);
  });

  it('checks at once at the end of a sentence, with the previous one as context', async () => {
    const e = engine();
    const checker = createFieldChecker({ check: e.check, onIssues: vi.fn() });
    checker.input('Bonjour tout le monde. Les chat mange.');
    await vi.advanceTimersByTimeAsync(0);
    expect(e.requests).toEqual([
      { sentence: 'Bonjour tout le monde.', context: '' },
    ]);
    await e.answer([]);
    expect(e.requests[1]).toEqual({
      sentence: 'Les chat mange.',
      context: 'Bonjour tout le monde.',
    });
  });

  it('never sends an unchanged sentence again (cache)', async () => {
    const e = engine();
    const checker = createFieldChecker({ check: e.check, onIssues: vi.fn() });
    checker.input('Les chat mange.');
    await vi.advanceTimersByTimeAsync(0);
    await e.answer([]);
    checker.input('Les chat mange. Et alors');
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(e.requests.map((r) => r.sentence)).toEqual([
      'Les chat mange.',
      'Et alors',
    ]);
    await e.answer([]);
    checker.input('Les chat mange. Et alors');
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(e.requests).toHaveLength(2);
  });

  it('skips text without letters and sentences over the size limit', async () => {
    const e = engine();
    const checker = createFieldChecker({ check: e.check, onIssues: vi.fn() });
    checker.input(`12 + 34 = 46. ${'a'.repeat(1001)}.`);
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(e.requests).toHaveLength(0);
  });

  it('removes the mark of an edited word at once, from the cache', async () => {
    const e = engine();
    const onIssues = vi.fn();
    const checker = createFieldChecker({ check: e.check, onIssues });
    checker.input('Je suis aller.');
    await vi.advanceTimersByTimeAsync(0);
    await e.answer([issue('Je suis aller.', 'aller', 'allé')]);
    expect(onIssues).toHaveBeenLastCalledWith([expect.anything()]);
    checker.input('Je suis allé.');
    expect(onIssues).toHaveBeenLastCalledWith([]);
  });

  it('bounds the cache', () => {
    const cache = new IssueCache(2);
    cache.set('a b', []);
    cache.set('c d', []);
    cache.get('a b');
    cache.set('e f', []);
    expect(cache.has('a b')).toBe(true);
    expect(cache.has('c d')).toBe(false);
    expect(cache.size).toBe(2);
  });
});

describe('R2: typing during a check', () => {
  it('drops the stale result, keeps one in flight, rechecks after the pause', async () => {
    const e = engine();
    const onIssues = vi.fn();
    const checker = createFieldChecker({ check: e.check, onIssues });
    checker.input('Je suis aller.');
    await vi.advanceTimersByTimeAsync(0);
    expect(e.requests).toHaveLength(1);
    onIssues.mockClear();

    checker.input('Je suis aller a');
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    // Pause elapsed while the first check is still open: no second request.
    expect(e.requests).toHaveLength(1);

    await e.answer([issue('Je suis aller.', 'aller', 'allé')]);
    // Not shown for the newer text...
    expect(onIssues).not.toHaveBeenCalledWith([
      expect.objectContaining({ original: 'aller' }),
    ]);
    // ...the new sentence is then checked.
    expect(e.requests).toHaveLength(2);
    expect(e.requests[1]?.sentence).toBe('Je suis aller a');
    expect(e.maxInFlight()).toBe(1);
    await e.answer([]);
  });

  it('a failed check reports a problem and does not retry by itself', async () => {
    const onProblem = vi.fn();
    const check = vi.fn(() => Promise.reject(new Error('limit')));
    const checker = createFieldChecker({
      check,
      onIssues: vi.fn(),
      onProblem,
    });
    checker.input('Les chat mange.');
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 5);
    expect(check).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledWith(expect.any(Error));
  });

  it('dispose stops everything', async () => {
    const e = engine();
    const checker = createFieldChecker({ check: e.check, onIssues: vi.fn() });
    checker.input('Les chat mange');
    checker.dispose();
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 2);
    expect(e.requests).toHaveLength(0);
  });
});

describe('R3: result contract', () => {
  const sentence = 'Je suis aller a Lyon.';
  const ok = issue(sentence, 'aller', 'allé');

  it('keeps a valid issue and sorts by position', () => {
    const a = { ...issue(sentence, 'a', 'à'), start: 14, end: 15 };
    const out = validateIssues([a, ok], sentence);
    expect(out.map((i) => i.original)).toEqual(['aller', 'a']);
  });

  it('drops wrong offsets, text mismatches and bad kinds', () => {
    const bad = [
      { ...ok, start: ok.start + 1 },
      { ...ok, end: 999 },
      { ...ok, start: -1 },
      { ...ok, start: 5, end: 5, original: '' },
      { ...ok, original: 'allez' },
      { ...ok, kind: 'style' },
      { ...ok, start: 1.5 },
    ];
    expect(validateIssues(bad, sentence)).toEqual([]);
  });

  it('drops extra or missing fields', () => {
    expect(validateIssues([{ ...ok, reason: 'x' }], sentence)).toEqual([]);
    const { kind: _kind, ...missing } = ok;
    void _kind;
    expect(validateIssues([missing], sentence)).toEqual([]);
  });

  it('drops bad suggestions', () => {
    for (const suggestions of [
      [],
      ['a', 'b', 'c', 'd'],
      ['aller'],
      [''],
      [1],
      ['x', 'x'],
      ['y'.repeat(201)],
      'allé',
    ])
      expect(validateIssues([{ ...ok, suggestions }], sentence)).toEqual([]);
  });

  it('rejects the whole answer over the issue cap or when not an array', () => {
    expect(
      validateIssues(
        Array.from({ length: MAX_ISSUES + 1 }, () => ok),
        sentence,
      ),
    ).toEqual([]);
    for (const raw of [null, undefined, {}, 'x', { issues: [ok] }])
      expect(validateIssues(raw, sentence)).toEqual([]);
  });

  it('drops overlapping issues, keeping the earliest', () => {
    const wide = { ...ok, start: 8, end: 16, original: 'aller a ' };
    expect(validateIssues([wide, ok], sentence)).toEqual([ok]);
  });

  it('ignores prototype tricks', () => {
    const lookalike = Object.create({ ...ok }) as unknown;
    expect(validateIssues([lookalike], sentence)).toEqual([]);
  });

  it('the scheduler only shows validated issues, positioned in the field', async () => {
    const e = engine();
    const onIssues = vi.fn();
    const checker = createFieldChecker({ check: e.check, onIssues });
    const text = `Salut. ${sentence}`;
    checker.input(text);
    await vi.advanceTimersByTimeAsync(0);
    await e.answer([]);
    await e.answer([ok, { ...ok, original: 'nope' }]);
    const shown = onIssues.mock.lastCall?.[0] as RealtimeIssue[];
    expect(shown).toHaveLength(1);
    const first = shown[0] as RealtimeIssue;
    expect(text.slice(first.start, first.end)).toBe('aller');
  });

  it('issuesFor offsets cached issues by sentence position', () => {
    const cache = new IssueCache();
    cache.set(sentence, [ok]);
    const text = `Salut. ${sentence}`;
    const [found] = issuesFor(text, cache);
    expect(text.slice(found?.start, found?.end)).toBe('aller');
  });
});

describe('R11: IME composition', () => {
  it('checks nothing until compositionend', async () => {
    const e = engine();
    const checker = createFieldChecker({ check: e.check, onIssues: vi.fn() });
    checker.compositionStart();
    checker.input('こんにちは');
    checker.input('こんにちは。');
    await vi.advanceTimersByTimeAsync(PAUSE_MS * 5);
    expect(e.requests).toHaveLength(0);
    checker.compositionEnd('こんにちは。');
    await vi.advanceTimersByTimeAsync(0);
    expect(e.requests).toHaveLength(1);
  });

  it('a pause already running is cancelled by compositionstart', async () => {
    const e = engine();
    const checker = createFieldChecker({ check: e.check, onIssues: vi.fn() });
    checker.input('Les chat mange');
    await vi.advanceTimersByTimeAsync(PAUSE_MS - 100);
    checker.compositionStart();
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(e.requests).toHaveLength(0);
    checker.compositionEnd('Les chat mangent');
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    expect(e.requests.map((r) => r.sentence)).toEqual(['Les chat mangent']);
  });
});
