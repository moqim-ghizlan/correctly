import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionController } from '../../src/background/connection-controller';
import {
  TEST_CONNECTION,
  TEST_KEY,
  isTestConnectionRequest,
  isTestKeyRequest,
} from '../../src/shared/contracts';
import { LimitsSection } from '../../src/options/limits-ui';
import { ProvidersSection } from '../../src/options/providers-ui';
import {
  PROVIDERS_KEY,
  loadProviders,
  type ProviderStore,
} from '../../src/shared/providers';
import { normalizeSettings } from '../../src/shared/settings';
import { STORAGE_KEYS, saveSettings } from '../../src/shared/storage';
import {
  FAKE_KEY,
  FakeStorage,
  OPENAI_KEY,
  OTHER_KEY,
  geminiOk,
  jsonResponse,
  openaiOk,
  quotaStore,
  usageToday,
} from '../helpers/fake-storage';

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const TODAY = '2026-10-15';

let area: FakeStorage;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let confirm: ReturnType<typeof vi.fn<(question: string) => boolean>>;
let sent: unknown[];

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';
const buttons = (label: string) =>
  [
    ...document.querySelectorAll<HTMLButtonElement>('#profile-list button'),
  ].filter((b) => b.textContent === label);

async function openPage() {
  document.body.innerHTML = body;
  const worker = new ConnectionController({
    area,
    fetchImpl,
    today: () => TODAY,
    isOnline: () => true,
  });
  const section = new ProvidersSection(document, {
    area,
    confirm,
    // Mimics chrome.runtime.sendMessage → worker (with its guards) → reply.
    send: async (message) => {
      sent.push(message);
      const hop = JSON.parse(JSON.stringify(message)) as unknown;
      const reply = isTestKeyRequest(hop)
        ? await worker.testKey(hop.credentialId)
        : isTestConnectionRequest(hop)
          ? await worker.testConnection(hop.slot)
          : undefined;
      return JSON.parse(JSON.stringify(reply ?? null)) as unknown;
    },
  });
  await section.init();
  return section;
}

async function addKey(
  section: ProvidersSection,
  provider: 'gemini' | 'openai',
  label: string,
  key: string,
) {
  $<HTMLSelectElement>('profile-provider').value = provider;
  $<HTMLInputElement>('profile-label').value = label;
  $<HTMLInputElement>('profile-key').value = key;
  await section.saveProfile();
}

async function chooseRoute(
  section: ProvidersSection,
  slot: string,
  label: string,
  modelId: string,
) {
  const select = $<HTMLSelectElement>(`route-key-${slot}`);
  const option = [...select.options].find((o) =>
    o.textContent?.startsWith(label),
  );
  select.value = option?.value ?? '';
  select.dispatchEvent(new Event('change'));
  const model = $<HTMLInputElement>(`route-model-${slot}`);
  model.value = modelId;
  model.dispatchEvent(new Event('input'));
  await section.saveRoute(slot as 'default');
}

beforeEach(() => {
  area = new FakeStorage();
  sent = [];
  confirm = vi.fn(() => true);
  fetchImpl = vi.fn<typeof fetch>();
});

describe('profiles', () => {
  it('UI-01: an empty list shows the setup prompt; nothing is sent', async () => {
    await openPage();
    expect($('profile-empty').hidden).toBe(false);
    expect(text('route-summary-default')).toMatch(/Aucune route par défaut/);
    expect(text('route-summary-correction')).toMatch(/À configurer/);
    expect($<HTMLInputElement>('profile-key').type).toBe('password');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('UI-02/03/KEY-13: adding keys never renders them and never calls a provider', async () => {
    const section = await openPage();
    $<HTMLInputElement>('profile-key').type = 'text';
    await addKey(section, 'gemini', 'Gemini Personal', `  ${FAKE_KEY} `);
    expect(text('profile-message')).toMatch(
      /Clé enregistrée\. Rien n’a été envoyé/,
    );
    expect($<HTMLInputElement>('profile-key').value).toBe('');
    expect($<HTMLInputElement>('profile-key').type).toBe('password');
    $<HTMLSelectElement>('profile-provider').value = 'openai';
    $('profile-provider').dispatchEvent(new Event('change'));
    expect($<HTMLAnchorElement>('profile-help-link').href).toBe(
      'https://platform.openai.com/api-keys',
    );
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    expect(text('profile-list')).toMatch(
      /Gemini Personal.*Google Gemini.*Non vérifiée/,
    );
    expect(text('profile-list')).toMatch(/OpenAI Personal.*OpenAI/);
    await openPage();
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
    expect(document.body.innerHTML).not.toContain(OPENAI_KEY);
    expect(document.body.innerHTML).not.toContain('SENTINEL');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('UI-22/KEY-04: invalid input shows an error and writes nothing', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'A', '   ');
    expect(text('profile-message')).toBe(
      'Collez une clé API avant d’enregistrer.',
    );
    expect($('profile-message').dataset.tone).toBe('error');
    await addKey(section, 'openai', 'A', 'AIza' + 'q'.repeat(35));
    expect(text('profile-message')).toMatch(/clé Google/);
    expect(area.data.has(PROVIDERS_KEY)).toBe(false);
  });

  it('UI-04/UI-05/KEY-25: rename sends nothing; replace needs a new value and confirmation', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'Main', FAKE_KEY);
    buttons('Modifier')[0]!.click();
    expect($<HTMLInputElement>('profile-key').value).toBe('');
    expect($<HTMLSelectElement>('profile-provider').disabled).toBe(true);
    $<HTMLInputElement>('profile-label').value = 'Gemini Main';
    await section.saveProfile();
    let loaded = await loadProviders(area);
    expect(loaded.store.profiles[0]).toMatchObject({
      label: 'Gemini Main',
      revision: 1,
    });
    // Cancelled replacement keeps the saved key.
    confirm.mockReturnValueOnce(false);
    buttons('Modifier')[0]!.click();
    $<HTMLInputElement>('profile-key').value = OTHER_KEY;
    await section.saveProfile();
    loaded = await loadProviders(area);
    expect(loaded.secrets.secrets[loaded.store.profiles[0]!.id]!.key).toBe(
      FAKE_KEY,
    );
    // Confirmed replacement: new revision, old key gone.
    await section.saveProfile();
    loaded = await loadProviders(area);
    expect(loaded.store.profiles[0]!.revision).toBe(2);
    expect(area.dump()).not.toContain(FAKE_KEY);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('UI-06/07/08/09: disable and delete warn about the affected actions; cancel changes nothing', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'Main', FAKE_KEY);
    await chooseRoute(section, 'correction', 'Main', 'gemini-3.1-flash-lite');
    confirm.mockReturnValueOnce(false);
    buttons('Supprimer')[0]!.click();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls.at(-1)![0]).toMatch(
      /Correction cessera de fonctionner.*aucune autre clé n’est utilisée automatiquement/,
    );
    expect((await loadProviders(area)).store.profiles).toHaveLength(1);
    buttons('Désactiver')[0]!.click();
    await vi.waitFor(() =>
      expect(text('route-summary-correction')).toMatch(/Bloquée/),
    );
    expect(text('profile-list')).toMatch(/Désactivée/);
    buttons('Supprimer')[0]!.click();
    await vi.waitFor(() =>
      expect(text('route-summary-correction')).toMatch(
        /À configurer : la clé choisie a été supprimée/,
      ),
    );
    expect(area.dump()).not.toContain(FAKE_KEY);
  });

  it('UI-10/Q-05: “Check key” is one free GET, shows the result, and is not counted', async () => {
    const section = await openPage();
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    let release!: (response: Response) => void;
    fetchImpl.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    const { store } = await loadProviders(area);
    const pending = section.checkKey(store.profiles[0]!);
    await vi.waitFor(() => expect(buttons('Vérification…')).toHaveLength(1));
    expect(buttons('Vérification…')[0]!.disabled).toBe(true);
    void section.checkKey(store.profiles[0]!); // second click ignored
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    release(
      jsonResponse(200, { data: [{ id: 'gpt-5-nano' }, { id: 'dall-e-3' }] }),
    );
    await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([
      { type: TEST_KEY, credentialId: store.profiles[0]!.id },
    ]);
    expect(text('profile-message')).toMatch(
      /acceptée par OpenAI : 1 modèle\(s\) de texte/,
    );
    expect(text('profile-list')).toMatch(/Acceptée le .* \(1 modèles\)/);
    expect((await usageToday()).attempts).toBe(0);
  });

  it('UI-11: a refused key is shown as such, with fixed copy only', async () => {
    const section = await openPage();
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { message: `Incorrect API key provided: ${OPENAI_KEY}` },
      }),
    );
    await section.checkKey((await loadProviders(area)).store.profiles[0]!);
    expect(text('profile-message')).toMatch(
      /Le fournisseur a refusé cette clé API/,
    );
    expect(text('profile-list')).toMatch(/Échec de la vérification/);
    expect(document.body.innerHTML).not.toContain(OPENAI_KEY);
  });
});

describe('routes', () => {
  it('UI-13/UI-14/UI-15: default + per-task routes persist and send nothing', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'Gemini Personal', FAKE_KEY);
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    await chooseRoute(
      section,
      'default',
      'Gemini Personal',
      'gemini-3.1-flash-lite',
    );
    await chooseRoute(section, 'correction', 'OpenAI Personal', 'gpt-5.6-luna');
    await chooseRoute(section, 'translation', 'OpenAI Personal', 'gpt-5-nano');
    await openPage();
    expect(text('route-summary-correction')).toBe(
      'Correction → OpenAI Personal (OpenAI) • gpt-5.6-luna',
    );
    expect(text('route-summary-rewrite')).toBe(
      'Reformulation → Gemini Personal (Google Gemini) • gemini-3.1-flash-lite (par défaut)',
    );
    expect(text('route-summary-translation')).toMatch(/gpt-5-nano$/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('changing the key to another provider clears the model; mismatches are refused', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'Gemini Personal', FAKE_KEY);
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    await chooseRoute(
      section,
      'default',
      'Gemini Personal',
      'gemini-3.1-flash-lite',
    );
    const select = $<HTMLSelectElement>('route-key-default');
    select.value = [...select.options].find((o) =>
      o.textContent?.startsWith('OpenAI'),
    )!.value;
    select.dispatchEvent(new Event('change'));
    expect($<HTMLInputElement>('route-model-default').value).toBe('');
    const options = [
      ...document.querySelectorAll('#route-models-default option'),
    ].map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(
      expect.arrayContaining(['gpt-5.6-luna', 'gpt-5-nano']),
    );
    expect(options).not.toContain('gemini-3.1-flash-lite');
    $<HTMLInputElement>('route-model-default').value = 'gemini-3.1-flash-lite';
    $('route-model-default').dispatchEvent(new Event('input'));
    expect(text('route-note-default')).toMatch(/pas un modèle OpenAI/);
    await section.saveRoute('default');
    expect(text('route-message-default')).toMatch(/autre fournisseur/);
    expect((await loadProviders(area)).store.routes.default?.modelId).toBe(
      'gemini-3.1-flash-lite',
    );
  });

  it('UI-12: an unreviewed model shows an explicit warning', async () => {
    const section = await openPage();
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    const select = $<HTMLSelectElement>('route-key-default');
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change'));
    $<HTMLInputElement>('route-model-default').value = 'gpt-7-experimental';
    $('route-model-default').dispatchEvent(new Event('input'));
    expect(text('route-note-default')).toMatch(/Non vérifié par Correctly/);
  });

  it('Q-06: “Test” asks first, sends one tiny prompt through the saved route, and is counted', async () => {
    await saveSettings(area, normalizeSettings({}));
    const section = await openPage();
    await addKey(section, 'openai', 'OpenAI Personal', OPENAI_KEY);
    await chooseRoute(section, 'default', 'OpenAI Personal', 'gpt-5-nano');
    confirm.mockReturnValueOnce(false);
    await section.testRoute('default');
    expect(fetchImpl).not.toHaveBeenCalled();
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, openaiOk('OK')));
    await section.testRoute('default');
    expect(confirm.mock.calls.at(-1)![0]).toMatch(/peut être facturé/);
    expect(sent.at(-1)).toEqual({ type: TEST_CONNECTION, slot: 'default' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![0] as string).toBe(
      'https://api.openai.com/v1/responses',
    );
    expect(
      JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string),
    ).toMatchObject({
      input: [{ role: 'user', content: 'Reply with OK only.' }],
    });
    expect(text('route-message-default')).toMatch(
      /OpenAI • gpt-5-nano a répondu « OK »/,
    );
    const usage = await usageToday();
    expect(usage.attempts).toBe(1);
    expect(usage.rows).toMatchObject([{ task: 'test', provider: 'openai' }]);
    // The list itself belongs to the V5.8 usage limits section.
    await new LimitsSection(document, {
      area,
      quota: quotaStore(),
      confirm,
    }).init();
    expect(text('usage-routes')).toMatch(
      /Test → OpenAI Personal \(OpenAI\) • gpt-5-nano : 1 requête/,
    );
  });

  it('KEY-27/T13: nothing in the page holds a key after every action', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'Gemini Personal', FAKE_KEY);
    await chooseRoute(
      section,
      'default',
      'Gemini Personal',
      'gemini-3.1-flash-lite',
    );
    fetchImpl.mockResolvedValue(jsonResponse(200, geminiOk(`OK ${FAKE_KEY}`)));
    await section.testRoute('default');
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
    expect(JSON.stringify(sent)).not.toContain(FAKE_KEY);
  });

  it('UI-21: a change made in another window is picked up', async () => {
    const section = await openPage();
    const store: ProviderStore = {
      schemaVersion: 1,
      revision: 5,
      profiles: [
        {
          id: 'other-window-1',
          provider: 'openai',
          label: 'From another window',
          enabled: true,
          revision: 1,
          createdAt: '2026-10-15T08:00:00.000Z',
          updatedAt: '2026-10-15T08:00:00.000Z',
        },
      ],
      routes: {
        default: null,
        correction: null,
        rewrite: null,
        translation: null,
        translateRewrite: null,
        summary: null,
        realtime: null,
      },
    };
    area.data.set(PROVIDERS_KEY, store);
    section.onStorageChanged([PROVIDERS_KEY]);
    await vi.waitFor(() =>
      expect(text('profile-list')).toMatch(/From another window/),
    );
    section.onStorageChanged([STORAGE_KEYS.settings]);
  });
});

describe('V5.12 Summary route', () => {
  it('Summary has its own route, using the default until one is chosen', async () => {
    const section = await openPage();
    await addKey(section, 'gemini', 'Main', FAKE_KEY);
    await chooseRoute(section, 'default', 'Main', 'gemini-3.1-flash-lite');
    expect(text('route-summary-summary')).toMatch(/par défaut/i);
    await chooseRoute(section, 'summary', 'Main', 'gemini-3.5-flash-lite');
    const { store } = await loadProviders(area);
    expect(store.routes.summary).toEqual({
      credentialId: store.profiles[0]!.id,
      modelId: 'gemini-3.5-flash-lite',
    });
    expect(store.routes.translation).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
