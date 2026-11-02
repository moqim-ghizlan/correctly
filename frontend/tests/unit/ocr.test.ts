import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import { geminiBody } from '../../src/background/gemini-client';
import { ocrTask, OCR_TIMEOUT_MS } from '../../src/background/ocr';
import { responsesBody } from '../../src/background/openai-client';
import { correctionTask } from '../../src/background/correction';
import { isTaskImage, type TaskImage } from '../../src/background/transport';
import { CorrectlyError } from '../../src/shared/errors';
import { MODEL_CATALOG, readsImages } from '../../src/shared/models';
import { cleanOcrText, parseOcrAnswer } from '../../src/shared/ocr';
import {
  OCR_DAILY_DEFAULT,
  defaultPolicy,
  parsePolicy,
} from '../../src/shared/quota';
import { normalizeSettings } from '../../src/shared/settings';
import { saveSettings } from '../../src/shared/storage';
import {
  FakeStorage,
  FAKE_KEY,
  GEMINI_ID,
  geminiOk,
  jsonResponse,
  openaiOk,
  profile,
  seedProviders,
  usageToday,
} from '../helpers/fake-storage';

const IMAGE: TaskImage = { mimeType: 'image/png', data: 'iVBORw0KGgo=' };
const ANSWER = JSON.stringify({ found: true, text: 'Bonjour\nle monde' });

describe('O1/O2: image in the provider bodies', () => {
  it('Gemini: the image part follows the text part; no image = unchanged body', () => {
    const body = JSON.parse(geminiBody(ocrTask(IMAGE))) as {
      contents: { parts: unknown[] }[];
    };
    expect(body.contents[0]!.parts).toEqual([
      { text: 'Transcribe the text in this image.' },
      { inlineData: { mimeType: 'image/png', data: IMAGE.data } },
    ]);
    const plain = correctionTask('Je suis aller a Lyon.');
    expect(JSON.parse(geminiBody(plain))).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: plain.text }] }],
    });
    expect(
      (JSON.parse(geminiBody(plain)) as { contents: { parts: unknown[] }[] })
        .contents[0]!.parts,
    ).toHaveLength(1);
  });

  it('OpenAI: input_text + input_image data URL; no image = plain string content', () => {
    const body = JSON.parse(responsesBody('gpt-5.6-luna', ocrTask(IMAGE))) as {
      input: { role: string; content: unknown }[];
    };
    expect(body.input.at(-1)!.content).toEqual([
      { type: 'input_text', text: 'Transcribe the text in this image.' },
      { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
    ]);
    const plain = correctionTask('Je suis aller a Lyon.');
    const text = JSON.parse(responsesBody('gpt-5.6-luna', plain)) as {
      input: { content: unknown }[];
    };
    expect(text.input.at(-1)!.content).toBe(plain.text);
  });

  it('the image shape is guarded (mime, base64, size, extra field)', () => {
    expect(isTaskImage(IMAGE)).toBe(true);
    expect(isTaskImage({ ...IMAGE, mimeType: 'image/svg+xml' })).toBe(false);
    expect(isTaskImage({ ...IMAGE, data: 'not base64!' })).toBe(false);
    expect(isTaskImage({ ...IMAGE, data: '' })).toBe(false);
    expect(isTaskImage({ ...IMAGE, extra: 1 })).toBe(false);
    expect(
      isTaskImage({ ...IMAGE, data: 'A'.repeat(4 * 1024 * 1024 + 1) }),
    ).toBe(false);
  });
});

describe('O3: catalog vision flag', () => {
  it('every reviewed model has the flag; unknown models never read images', () => {
    for (const model of MODEL_CATALOG)
      expect(typeof model.vision).toBe('boolean');
    expect(readsImages('gemini', 'gemini-3.1-flash-lite')).toBe(true);
    expect(readsImages('gemini', 'gemini-unreviewed-9')).toBe(false);
    expect(readsImages('openai', 'gpt-5.6-luna')).toBe(true);
    expect(readsImages('openai', 'gpt-unknown')).toBe(false);
  });
});

describe('O4: answer validation', () => {
  it('accepts the exact fields and keeps line breaks', () => {
    expect(parseOcrAnswer(ANSWER)).toEqual({
      found: true,
      text: 'Bonjour\nle monde',
    });
  });

  it('found:false or empty text = no text; HTML-looking text stays text', () => {
    expect(parseOcrAnswer('{"found":false,"text":""}')).toEqual({
      found: false,
    });
    expect(parseOcrAnswer('{"found":true,"text":"  \\n "}')).toEqual({
      found: false,
    });
    expect(
      parseOcrAnswer('{"found":true,"text":"<img src=x onerror=1>"}'),
    ).toEqual({ found: true, text: '<img src=x onerror=1>' });
  });

  it('rejects other fields, wrong types, bad JSON and over-long text', () => {
    for (const raw of [
      'nope',
      '[]',
      '{"found":true}',
      '{"found":true,"text":"a","x":1}',
      '{"found":"yes","text":"a"}',
      '{"found":true,"text":1}',
      JSON.stringify({ found: true, text: 'a'.repeat(12_001) }),
    ])
      expect(parseOcrAnswer(raw)).toBeNull();
  });

  it('drops control characters except line breaks and tabs', () => {
    expect(cleanOcrText('a\u0000b\u0007\tc\r\nd\u009fe')).toBe('ab\tc\nde');
  });
});

describe('O5: task kind, quota caps and migration', () => {
  it('a fresh policy has an ocr daily cap (off)', () => {
    const policy = defaultPolicy('UTC');
    expect(policy.tasks.ocr.daily).toEqual({
      enabled: false,
      max: OCR_DAILY_DEFAULT,
    });
  });

  it('a stored policy without ocr caps is migrated, with and without them', () => {
    const fresh = defaultPolicy('UTC');
    const rest: Record<string, unknown> = { ...fresh.tasks };
    delete rest.ocr;
    const migrated = parsePolicy({ ...fresh, tasks: rest });
    expect(migrated?.tasks.ocr.daily.max).toBe(OCR_DAILY_DEFAULT);
    expect(migrated?.tasks.correction).toEqual(fresh.tasks.correction);
    expect(parsePolicy(fresh)?.tasks.ocr).toEqual(fresh.tasks.ocr);
  });
});

describe('extractText (controller)', () => {
  let area: FakeStorage;
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
  const clock = Date.parse('2026-10-15T10:00:00Z');
  const make = () =>
    new ConnectionController({
      area,
      fetchImpl,
      today: () => '2026-10-15',
      now: () => new Date(clock),
      isOnline: () => true,
    });
  const consent = (text: boolean, image: boolean) =>
    saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY, keyRevision: 1 },
        correction: { consent: text },
        ocr: { consent: image },
      }),
    );
  const capture = vi.fn<() => Promise<TaskImage>>();

  beforeEach(() => {
    area = new FakeStorage();
    capture.mockReset().mockResolvedValue(IMAGE);
    fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          200,
          geminiOk(ANSWER, { promptTokenCount: 700, candidatesTokenCount: 20 }),
        ),
      ),
    );
  });

  it('O10/O11: consents → route → vision → capture → one fetch, counted once', async () => {
    await consent(true, true);
    const result = await make().extractText(capture);
    expect(result).toMatchObject({ ok: true, text: 'Bonjour\nle monde' });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as RequestInit).body as string,
    ) as { contents: { parts: unknown[] }[] };
    expect(body.contents[0]!.parts).toHaveLength(2);
    expect((await usageToday(clock)).attempts).toBe(1);
  });

  it('no text consent / no image consent: nothing captured, sent or counted', async () => {
    await consent(false, true);
    expect(await make().extractText(capture)).toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    await consent(true, false);
    expect(await make().extractText(capture)).toMatchObject({
      code: 'IMAGE_CONSENT_REQUIRED',
    });
    expect(capture).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await usageToday(clock)).attempts).toBe(0);
  });

  it('a model that cannot read images is refused before capture and admit', async () => {
    await consent(true, true);
    seedProviders(
      area,
      [profile(GEMINI_ID, 'gemini')],
      { default: { credentialId: GEMINI_ID, modelId: 'gemini-unreviewed-9' } },
      { [GEMINI_ID]: FAKE_KEY },
    );
    expect(await make().extractText(capture)).toMatchObject({
      ok: false,
      code: 'MODEL_NO_VISION',
    });
    expect(capture).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await usageToday(clock)).attempts).toBe(0);
  });

  it('a failing capture is not counted and not sent', async () => {
    await consent(true, true);
    capture.mockRejectedValue(new CorrectlyError('CAPTURE_FORBIDDEN'));
    expect(await make().extractText(capture)).toMatchObject({
      code: 'CAPTURE_FORBIDDEN',
    });
    capture.mockRejectedValue(new Error('boom'));
    expect(await make().extractText(capture)).toMatchObject({
      code: 'CAPTURE_FAILED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await usageToday(clock)).attempts).toBe(0);
  });

  it('"no text" is still counted (it was sent)', async () => {
    await consent(true, true);
    fetchImpl.mockResolvedValue(
      jsonResponse(200, geminiOk('{"found":false,"text":""}')),
    );
    expect(await make().extractText(capture)).toMatchObject({
      ok: false,
      code: 'NO_TEXT_FOUND',
    });
    expect((await usageToday(clock)).attempts).toBe(1);
  });

  it('a malformed answer is INVALID_RESPONSE, counted, never retried', async () => {
    await consent(true, true);
    fetchImpl.mockResolvedValue(jsonResponse(200, geminiOk('{"text":"x"}')));
    expect(await make().extractText(capture)).toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses OCR_TIMEOUT_MS, longer than the default', async () => {
    expect(OCR_TIMEOUT_MS).toBeGreaterThan(15_000);
    await consent(true, true);
    const timer = vi.spyOn(globalThis, 'setTimeout');
    await make().extractText(capture);
    expect(timer.mock.calls.some(([, ms]) => ms === OCR_TIMEOUT_MS)).toBe(true);
    timer.mockRestore();
  });

  it('works through OpenAI too (input_image sent once)', async () => {
    await consent(true, true);
    seedProviders(
      area,
      [profile('openai-profile-1', 'openai')],
      {
        default: {
          credentialId: 'openai-profile-1',
          modelId: 'gpt-5.6-luna',
        },
      },
      {},
    );
    fetchImpl.mockResolvedValue(jsonResponse(200, openaiOk(ANSWER)));
    expect(await make().extractText(capture)).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0]![1] as RequestInit).body).toContain(
      'input_image',
    );
  });
});
