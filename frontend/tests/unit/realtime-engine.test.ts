import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import { parseRealtime, realtimeTask } from '../../src/background/realtime';
import { CHECK_TEXT } from '../../src/shared/contracts';
import {
  isCheckTextRequest,
  type RealtimeIssue,
} from '../../src/shared/realtime';
import { emptyProviders, resolveRoute } from '../../src/shared/providers';
import { defaultPolicy, parsePolicy } from '../../src/shared/quota';
import {
  DEFAULT_REPLACE_ALL_KEY,
  DEFAULT_REPLACE_KEY,
  normalizeSettings,
} from '../../src/shared/settings';
import { saveSettings } from '../../src/shared/storage';
import {
  FakeStorage,
  FAKE_KEY,
  GEMINI_ID,
  OPENAI_ID,
  OPENAI_KEY,
  changePolicy,
  dumpQuota,
  geminiOk,
  jsonResponse,
  openaiOk,
  profile,
  seedProviders,
  usageToday,
} from '../helpers/fake-storage';

const SENTENCE = 'Les chat mange la souris.';
const CONTEXT = 'Bonjour tout le monde.';
const GOOD = {
  issues: [
    { original: 'chat', suggestions: ['chats'], kind: 'grammar' },
    { original: 'mange', suggestions: ['mangent'], kind: 'grammar' },
  ],
};

describe('request contract (exact shape)', () => {
  const valid = { type: CHECK_TEXT, text: SENTENCE, context: CONTEXT };

  it('accepts exactly {type, text, context}', () => {
    expect(isCheckTextRequest(valid)).toBe(true);
    expect(isCheckTextRequest({ ...valid, context: '' })).toBe(true);
  });

  it('rejects extra fields, wrong types, no letters and oversize text', () => {
    for (const bad of [
      { ...valid, url: 'https://x.test' },
      { ...valid, title: 'page' },
      { type: CHECK_TEXT, text: SENTENCE },
      { ...valid, text: 5 },
      { ...valid, context: null },
      { ...valid, type: 'other' },
      { ...valid, text: '12 + 34' },
      { ...valid, text: 'a'.repeat(1001) },
      { ...valid, context: 'a'.repeat(1001) },
      null,
      [],
      'x',
    ])
      expect(isCheckTextRequest(bad)).toBe(false);
    expect(
      isCheckTextRequest({ ...valid, text: '😀'.repeat(1000) + 'a' }),
    ).toBe(false);
  });
});

describe('prompt and parser', () => {
  it('sends the sentence and the previous one as data, not as instructions', () => {
    const task = realtimeTask(SENTENCE, CONTEXT);
    expect(task.instruction).not.toContain(SENTENCE);
    expect(task.instruction).not.toContain(CONTEXT);
    expect(task.text).toBe(`CONTEXT:\n${CONTEXT}\n\nSENTENCE:\n${SENTENCE}`);
    expect(task.temperature).toBe(0);
    expect(task.maxOutputTokens).toBeLessThanOrEqual(1024);
  });

  it('computes offsets itself and validates against the sentence', () => {
    const issues = parseRealtime(JSON.stringify(GOOD), SENTENCE);
    expect(issues).toHaveLength(2);
    for (const issue of issues as RealtimeIssue[])
      expect(SENTENCE.slice(issue.start, issue.end)).toBe(issue.original);
  });

  it('a repeated word marks its next occurrence', () => {
    const text = 'Il a a manger.';
    const issues = parseRealtime(
      JSON.stringify({
        issues: [
          { original: 'a', suggestions: ['à'], kind: 'grammar' },
          { original: 'a', suggestions: ['à'], kind: 'grammar' },
        ],
      }),
      text,
    );
    expect(issues?.map((i) => i.start)).toEqual([3, 5]);
  });

  it('drops what cannot be located and accepts "no issue"', () => {
    expect(
      parseRealtime(
        JSON.stringify({
          issues: [{ original: 'zzz', suggestions: ['y'], kind: 'spelling' }],
        }),
        SENTENCE,
      ),
    ).toEqual([]);
    expect(parseRealtime('{"issues":[]}', SENTENCE)).toEqual([]);
  });

  it('rejects anything but the documented shape', () => {
    const item = { original: 'chat', suggestions: ['chats'], kind: 'grammar' };
    for (const raw of [
      'not json',
      '[]',
      '{}',
      '{"issues":{}}',
      JSON.stringify({ issues: [], extra: 1 }),
      JSON.stringify({ issues: [{ ...item, start: 4 }] }),
      JSON.stringify({ issues: [{ original: 'chat' }] }),
      JSON.stringify({
        issues: Array.from({ length: 21 }, () => item),
      }),
      'x'.repeat(20_001),
    ])
      expect(parseRealtime(raw, SENTENCE)).toBeNull();
  });
});

describe('settings, routes and limits (data model)', () => {
  it('off by default: no real-time, auto engine, no consent', () => {
    const settings = normalizeSettings(undefined);
    expect(settings.triggers.realtime).toBe(false);
    expect(settings.realtime).toEqual({
      engine: 'auto',
      apiConsent: false,
      disabledSites: [],
      replaceKey: DEFAULT_REPLACE_KEY,
      replaceAllKey: DEFAULT_REPLACE_ALL_KEY,
    });
  });

  it('normalizes the real-time settings', () => {
    const settings = normalizeSettings({
      triggers: { realtime: 'yes' },
      realtime: {
        engine: 'cloud',
        apiConsent: 'true',
        disabledSites: [
          ' Mail.Example.com ',
          'mail.example.com',
          'bad host',
          'http://x.test',
          5,
          '',
        ],
      },
    });
    expect(settings.triggers.realtime).toBe(false);
    expect(settings.realtime).toEqual({
      engine: 'auto',
      apiConsent: false,
      disabledSites: ['mail.example.com'],
      replaceKey: DEFAULT_REPLACE_KEY,
      replaceAllKey: DEFAULT_REPLACE_ALL_KEY,
    });
    const kept = normalizeSettings({
      triggers: { realtime: true },
      realtime: { engine: 'api', apiConsent: true },
    });
    expect(kept.triggers.realtime).toBe(true);
    expect(kept.realtime).toMatchObject({ engine: 'api', apiConsent: true });
  });

  it('caps the disabled sites list', () => {
    const settings = normalizeSettings({
      realtime: {
        disabledSites: Array.from({ length: 300 }, (_, i) => `s${i}.test`),
      },
    });
    expect(settings.realtime.disabledSites).toHaveLength(200);
  });

  it('a V5.11–V5.17 store without a Real-time route uses the default route', () => {
    const store = emptyProviders();
    expect(store.routes.realtime).toBeNull();
    expect(
      resolveRoute(store, { schemaVersion: 1, secrets: {} }, 'realtime'),
    ).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
  });

  it('a V5.8–V5.17 policy gains Real-time caps (500/day offered, off); the rest is kept', () => {
    const current = defaultPolicy('Europe/Paris', 7, 1000);
    expect(current.tasks.realtime.daily).toEqual({ enabled: false, max: 500 });
    current.tasks.translation.daily = { enabled: true, max: 3 };
    current.revision = 9;
    const old = structuredClone(current) as unknown as {
      tasks: Record<string, unknown>;
    };
    delete old.tasks.realtime;
    const migrated = parsePolicy(old);
    expect(migrated).not.toBeNull();
    expect(migrated!.tasks.realtime).toEqual({
      daily: { enabled: false, max: 500 },
      weekly: { enabled: false, max: 49 },
      monthly: { enabled: false, max: 210 },
    });
    expect(migrated!.tasks.translation.daily).toEqual({
      enabled: true,
      max: 3,
    });
    expect(migrated!.revision).toBe(9);
    expect(
      parsePolicy({ ...current, tasks: { ...current.tasks, realtime: {} } }),
    ).toBeNull();
  });
});

describe('ConnectionController.check (mocked provider)', () => {
  let area: FakeStorage;
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
  const controller = () =>
    new ConnectionController({
      area,
      fetchImpl,
      isOnline: () => true,
      timeoutMs: 50,
    });
  const configure = (
    realtime: Record<string, unknown> = { engine: 'api', apiConsent: true },
    enabled = true,
    limit = 20,
  ) =>
    saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        safety: { dailyTestAttemptLimit: limit },
        triggers: { realtime: enabled },
        realtime,
      }),
    );
  const reply = (value: unknown) =>
    jsonResponse(
      200,
      geminiOk(JSON.stringify(value), {
        promptTokenCount: 80,
        candidatesTokenCount: 20,
      }),
    );
  const check = (c: ConnectionController, text = SENTENCE) =>
    c.check({ text, context: CONTEXT });

  beforeEach(() => {
    area = new FakeStorage();
    fetchImpl = vi.fn<typeof fetch>();
  });

  it('R6: off by default — nothing is sent', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
      }),
    );
    expect(await check(controller())).toMatchObject({
      ok: false,
      code: 'CONSENT_REQUIRED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['feature off', { engine: 'api', apiConsent: true }, false],
    ['no apiConsent', { engine: 'api', apiConsent: false }, true],
    ['auto engine', { engine: 'auto', apiConsent: true }, true],
    ['R5: local engine', { engine: 'local', apiConsent: true }, true],
  ])('R5/R6: %s — no request at all', async (_name, realtime, enabled) => {
    await configure(realtime, enabled);
    expect(await check(controller())).toMatchObject({
      ok: false,
      code: 'CONSENT_REQUIRED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await usageToday()).attempts).toBe(0);
  });

  it('R6: with consent, sends only the sentence and the previous one', async () => {
    await configure();
    fetchImpl.mockResolvedValueOnce(reply(GOOD));
    const result = await check(controller());
    expect(result).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = fetchImpl.mock.calls[0]![1]!.body as string;
    expect(sent).toContain('SENTENCE:\\n' + SENTENCE);
    expect(sent).toContain('CONTEXT:\\n' + CONTEXT);
    expect(sent).not.toContain('http');
    if (result.ok) {
      expect(result.issues.map((i) => i.original)).toEqual(['chat', 'mange']);
      for (const issue of result.issues)
        expect(SENTENCE.slice(issue.start, issue.end)).toBe(issue.original);
    }
  });

  it('R7: counted once under the realtime task, with tokens', async () => {
    await configure();
    fetchImpl.mockResolvedValueOnce(reply(GOOD));
    await check(controller());
    expect(await usageToday()).toMatchObject({
      attempts: 1,
      completed: 1,
      inputTokens: 80,
      outputTokens: 20,
    });
    const stored = JSON.parse(await dumpQuota()) as unknown[][];
    const operation = stored
      .flat()
      .find((item) => (item as { task?: unknown } | null)?.task === 'realtime');
    expect(operation).toBeTruthy();
  });

  it('R7: no text is stored anywhere', async () => {
    await configure();
    fetchImpl.mockResolvedValueOnce(reply(GOOD));
    await check(controller());
    const stored = (await dumpQuota()) + area.dump();
    expect(stored).not.toContain('souris');
    expect(stored).not.toContain('Bonjour tout');
    expect(await dumpQuota()).not.toContain(FAKE_KEY);
  });

  it('R7: uses the Real-time route, not the default one', async () => {
    await configure();
    seedProviders(
      area,
      [profile(GEMINI_ID, 'gemini'), profile(OPENAI_ID, 'openai')],
      {
        default: { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' },
        realtime: { credentialId: OPENAI_ID, modelId: 'gpt-5-nano' },
      },
      { [OPENAI_ID]: OPENAI_KEY },
    );
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, openaiOk(JSON.stringify(GOOD))),
    );
    expect(await check(controller())).toMatchObject({ ok: true });
    expect(fetchImpl.mock.calls[0]![0] as string).toContain('openai');
  });

  it('R7: inherits the default route when none is set', async () => {
    await configure();
    seedProviders(area, [profile(GEMINI_ID, 'gemini')], {
      default: { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' },
    });
    fetchImpl.mockResolvedValueOnce(reply(GOOD));
    expect(await check(controller())).toMatchObject({ ok: true });
    expect(fetchImpl.mock.calls[0]![0] as string).toContain(
      'generativelanguage',
    );
  });

  it('R7: a provider error is not retried and stays counted', async () => {
    await configure();
    fetchImpl.mockResolvedValue(jsonResponse(429, { error: {} }));
    expect(await check(controller())).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await usageToday()).toMatchObject({ attempts: 1, failed: 1 });
  });

  it('R7: an invalid answer is INVALID_RESPONSE (counted, not retried)', async () => {
    await configure();
    fetchImpl.mockResolvedValueOnce(reply({ nope: true }));
    expect(await check(controller())).toMatchObject({
      ok: false,
      code: 'INVALID_RESPONSE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('R7: the Real-time cap pauses checks only; other actions still work', async () => {
    await configure();
    fetchImpl.mockImplementation(() => Promise.resolve(reply(GOOD)));
    const c = controller();
    await c.reconcile();
    await changePolicy((policy) => {
      policy.tasks.realtime.daily = { enabled: true, max: 1 };
      return policy;
    });
    expect(await check(c)).toMatchObject({ ok: true });
    expect(await check(c)).toMatchObject({
      ok: false,
      code: 'QUOTA_EXCEEDED',
      quota: { scope: 'task', task: 'realtime', blocked: true },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockResolvedValueOnce(
      reply({ hasErrors: true, correctedText: 'Les chats mangent.' }),
    );
    expect(await c.correct('Les chat mange.')).toMatchObject({ ok: true });
  });

  it('R7: the global cap also pauses checks', async () => {
    await configure(undefined, true, 1);
    fetchImpl.mockResolvedValue(reply(GOOD));
    const c = controller();
    expect(await check(c)).toMatchObject({ ok: true });
    expect(await check(c)).toMatchObject({
      ok: false,
      code: 'QUOTA_EXCEEDED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
