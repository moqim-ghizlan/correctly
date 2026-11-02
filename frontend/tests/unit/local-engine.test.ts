import { describe, expect, it, vi } from 'vitest';
import { LocalEngine, pageLanguage } from '../../src/content/local-engine';
import { CONTENT } from '../../src/content/messages';
import {
  MAX_DICTIONARY_WORDS,
  addWord,
  cleanWord,
  loadDictionary,
  normalizeDictionary,
  saveDictionary,
} from '../../src/shared/dictionary';
import { CheckFailure, isAddWordRequest } from '../../src/shared/realtime';
import { FakeStorage } from '../helpers/fake-storage';

const request = { sentence: 'Je suis aller a Lyon.', context: '' };

describe('R5: local engine (Chrome built-in AI)', () => {
  it('nothing in this browser: unavailable, never a request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const engine = new LocalEngine({}, 'fr');
    expect(await engine.status()).toBe('unavailable');
    await expect(engine.check(request)).rejects.toMatchObject({
      code: 'ENGINE_UNAVAILABLE',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Proofreader API: corrections become validated-shape issues', async () => {
    const proofread = vi.fn(() =>
      Promise.resolve({
        corrections: [
          { startIndex: 8, endIndex: 13, correction: 'allé', type: 'grammar' },
          { startIndex: 14, endIndex: 15, correction: 'à', type: 'spelling' },
        ],
      }),
    );
    const availability = vi.fn(() => Promise.resolve('available'));
    const create = vi.fn(() => Promise.resolve({ proofread }));
    const engine = new LocalEngine(
      { Proofreader: { availability, create } },
      'fr',
    );
    expect(await engine.status()).toBe('ready');
    const issues = (await engine.check(request)) as { original: string }[];
    expect(issues.map((i) => i.original)).toEqual(['aller', 'a']);
    expect(availability).toHaveBeenCalledWith({
      expectedInputLanguages: ['fr'],
    });
    expect(create).toHaveBeenCalledTimes(1);
    await engine.check(request);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('Prompt API: JSON schema answer, one clone per sentence, destroyed after', async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(() =>
      Promise.resolve(
        JSON.stringify({
          issues: [
            { original: 'aller', suggestions: ['allé'], kind: 'grammar' },
          ],
        }),
      ),
    );
    const session = {
      prompt: vi.fn(),
      clone: vi.fn(() => Promise.resolve({ prompt, clone: vi.fn(), destroy })),
    };
    const engine = new LocalEngine(
      {
        LanguageModel: {
          availability: () => Promise.resolve('available'),
          create: () => Promise.resolve(session),
        },
      },
      'fr',
    );
    const issues = (await engine.check(request)) as { start: number }[];
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(8);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect((prompt.mock.calls[0] as unknown[])[0]).toContain(
      'SENTENCE:\nJe suis',
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('model still downloading: reports it and starts nothing else', async () => {
    const create = vi.fn(() => new Promise<never>(() => undefined));
    const engine = new LocalEngine(
      {
        Proofreader: {
          availability: () => Promise.resolve('downloadable'),
          create,
        },
      },
      'en',
    );
    expect(await engine.status()).toBe('downloadable');
    await expect(engine.check(request)).rejects.toBeInstanceOf(CheckFailure);
    await expect(engine.check(request)).rejects.toMatchObject({
      code: 'ENGINE_DOWNLOADING',
    });
  });

  it('a throwing browser API is "unavailable", not a crash', async () => {
    const engine = new LocalEngine(
      {
        Proofreader: {
          availability: () => Promise.reject(new Error('boom')),
          create: vi.fn(),
        },
      },
      'en',
    );
    expect(await engine.status()).toBe('unavailable');
  });

  it('page language: base tag, English by default', () => {
    document.documentElement.lang = 'fr-CA';
    expect(pageLanguage(document)).toBe('fr');
    document.documentElement.lang = 'zz-nonsense-123';
    expect(pageLanguage(document)).toBe('zz');
    document.documentElement.lang = '';
    expect(['en', 'fr', 'de', 'es']).toContain(pageLanguage(document));
  });
});

describe('R9: personal dictionary', () => {
  it('cleans words: trimmed, one line, 1–64 characters', () => {
    expect(cleanWord('  Lyon ')).toBe('Lyon');
    for (const bad of ['', '   ', 'a\nb', 'a\tb', 'x'.repeat(65), 5, null])
      expect(cleanWord(bad)).toBe('');
    expect(cleanWord('x'.repeat(64))).toHaveLength(64);
  });

  it('normalizes: unique ignoring case, bounded, bad input = empty', () => {
    expect(
      normalizeDictionary({ words: [' Lyon', 'lyon', 'Correctly', '', 7] }),
    ).toEqual({ words: ['Lyon', 'Correctly'] });
    for (const bad of [null, undefined, 'x', [], { words: 'x' }])
      expect(normalizeDictionary(bad)).toEqual({ words: [] });
    const many = Array.from({ length: 2500 }, (_, i) => `w${i}`);
    expect(normalizeDictionary({ words: many }).words).toHaveLength(
      MAX_DICTIONARY_WORDS,
    );
  });

  it('adds one word at a time, never twice, never past the limit', async () => {
    const area = new FakeStorage();
    expect(await addWord(area, 'Correctly')).toBe(true);
    expect(await addWord(area, 'correctly')).toBe(true);
    expect(await addWord(area, 'two\nlines')).toBe(false);
    expect((await loadDictionary(area)).words).toEqual(['Correctly']);
    await saveDictionary(area, {
      words: Array.from({ length: MAX_DICTIONARY_WORDS }, (_, i) => `w${i}`),
    });
    expect(await addWord(area, 'overflow')).toBe(false);
    expect(await addWord(area, 'W5')).toBe(true);
  });

  it('a damaged or unreadable store gives an empty dictionary', async () => {
    const area = new FakeStorage();
    area.data.set('correctly.v5.dictionary', { words: 'nope' });
    expect((await loadDictionary(area)).words).toEqual([]);
    area.failGet = true;
    expect((await loadDictionary(area)).words).toEqual([]);
  });

  it('the add-word message has an exact shape', () => {
    const ok = { type: 'correctly.v5.addWord', word: 'Lyon' };
    expect(isAddWordRequest(ok)).toBe(true);
    for (const bad of [
      { ...ok, extra: 1 },
      { type: ok.type },
      { ...ok, word: '' },
      { ...ok, word: 'x'.repeat(65) },
      { ...ok, word: 3 },
      { ...ok, type: 'other' },
      null,
    ])
      expect(isAddWordRequest(bad)).toBe(false);
  });
});

describe('R12: fr/en strings for real-time', () => {
  it('every real-time message exists in both languages and is not empty', () => {
    const en = CONTENT.en.realtime;
    const fr = CONTENT.fr.realtime;
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      for (const catalog of [en, fr]) {
        const value = catalog[key];
        const text = typeof value === 'function' ? value('x') : value;
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
    expect(fr.ignore).not.toBe(en.ignore);
  });
});
