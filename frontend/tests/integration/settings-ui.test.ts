import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, STORAGE_KEYS } from '../../src/shared/storage';
import { SettingsPage } from '../../src/options/settings-ui';
import {
  FakeStorage,
  FAKE_KEY,
  geminiOk,
  jsonResponse,
} from '../helpers/fake-storage';

// General settings (consent, entry points, styles, languages). API keys and
// routes: providers-ui.test.ts; usage limits (V5.8): limits-ui.test.ts.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

let area: FakeStorage;
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;
let confirm: ReturnType<typeof vi.fn<(question: string) => boolean>>;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim();

async function openPage() {
  document.body.innerHTML = body;
  const page = new SettingsPage(document, { area, confirm });
  await page.init();
  return page;
}

beforeEach(() => {
  area = new FakeStorage();
  confirm = vi.fn(() => true);
  fetchImpl = vi.fn<typeof fetch>(() =>
    Promise.resolve(jsonResponse(200, geminiOk('OK'))),
  );
});

describe('initial state', () => {
  it('S01: enables controls after load', async () => {
    await openPage();
    expect($<HTMLInputElement>('correction-consent').disabled).toBe(false);
    expect($('app').getAttribute('aria-busy')).toBe('false');
  });

  it('S06: storage failure on load keeps controls disabled with a message', async () => {
    area.failGet = true;
    await openPage();
    expect(text('consent-message')).toContain('stockage du navigateur');
    expect($<HTMLInputElement>('correction-consent').disabled).toBe(true);
  });

  it('opening and changing settings never touches the network', async () => {
    const page = await openPage();
    $<HTMLInputElement>('correction-consent').checked = true;
    await page.saveConsent();
    await page.reload();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never renders a legacy V5.1 key', async () => {
    area.data.set(STORAGE_KEYS.settings, {
      gemini: { apiKey: FAKE_KEY },
    });
    await openPage();
    expect(document.body.innerHTML).not.toContain(FAKE_KEY);
  });
});

describe('correction consent', () => {
  it('is off by default, saved on toggle, and never touches the network', async () => {
    await openPage();
    const box = $<HTMLInputElement>('correction-consent');
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await vi.waitFor(async () =>
      expect((await loadSettings(area)).correction.consent).toBe(true),
    );
    expect(text('consent-message')).toContain('Envoi autorisé');
    await openPage();
    expect($<HTMLInputElement>('correction-consent').checked).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('V5.3 entry points', () => {
  async function openWith(
    deps: Partial<ConstructorParameters<typeof SettingsPage>[1]>,
  ) {
    document.body.innerHTML = body;
    const page = new SettingsPage(document, { area, confirm, ...deps });
    await page.init();
    return page;
  }

  it('defaults: shortcut and menu on, smart button off; toggles persist', async () => {
    const openShortcuts = vi.fn();
    const page = await openWith({ openShortcuts });
    expect($<HTMLInputElement>('trigger-keyboard').checked).toBe(true);
    expect($<HTMLInputElement>('trigger-menu').checked).toBe(true);
    expect($<HTMLInputElement>('trigger-smart').checked).toBe(false);
    $<HTMLInputElement>('trigger-keyboard').checked = false;
    await page.saveTriggers();
    expect((await loadSettings(area)).triggers).toEqual({
      keyboard: false,
      contextMenu: true,
      smartButton: false,
      selectionButton: false,
      realtime: false,
    });
    $('open-shortcuts').click();
    expect(openShortcuts).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the smart button is saved only when site access is granted', async () => {
    const enableSmartButton = vi.fn(() => Promise.resolve(false));
    const disableSmartButton = vi.fn(() => Promise.resolve());
    const page = await openWith({ enableSmartButton, disableSmartButton });
    $<HTMLInputElement>('trigger-smart').checked = true;
    await page.saveSmartButton();
    expect((await loadSettings(area)).triggers.smartButton).toBe(false);
    expect($<HTMLInputElement>('trigger-smart').checked).toBe(false);
    expect(text('triggers-message')).toContain('pas été accordé');

    enableSmartButton.mockResolvedValueOnce(true);
    $<HTMLInputElement>('trigger-smart').checked = true;
    await page.saveSmartButton();
    expect((await loadSettings(area)).triggers.smartButton).toBe(true);

    $<HTMLInputElement>('trigger-smart').checked = false;
    await page.saveSmartButton();
    expect(disableSmartButton).toHaveBeenCalledTimes(1);
    expect((await loadSettings(area)).triggers.smartButton).toBe(false);
  });

  it('5.15: the translate button is off by default and needs site access', async () => {
    const enableSelectionButton = vi.fn(() => Promise.resolve(false));
    const disableSelectionButton = vi.fn(() => Promise.resolve());
    const page = await openWith({
      enableSelectionButton,
      disableSelectionButton,
    });
    expect($<HTMLInputElement>('trigger-selection').checked).toBe(false);
    $<HTMLInputElement>('trigger-selection').checked = true;
    await page.saveSelectionButton();
    expect((await loadSettings(area)).triggers.selectionButton).toBe(false);
    expect($<HTMLInputElement>('trigger-selection').checked).toBe(false);
    expect(text('triggers-message')).toContain('pas été accordé');

    enableSelectionButton.mockResolvedValueOnce(true);
    $<HTMLInputElement>('trigger-selection').checked = true;
    await page.saveSelectionButton();
    expect((await loadSettings(area)).triggers.selectionButton).toBe(true);
    expect(text('triggers-message')).toContain('Bouton de traduction activé');

    $<HTMLInputElement>('trigger-selection').checked = false;
    await page.saveSelectionButton();
    expect(disableSelectionButton).toHaveBeenCalledTimes(1);
    expect((await loadSettings(area)).triggers.selectionButton).toBe(false);
  });
});

describe('V5.4 rewrite settings', () => {
  it('defaults to enabled + Professional, saves choices, refuses an empty set', async () => {
    const page = await openPage();
    const box = (id: string) =>
      document.querySelector<HTMLInputElement>(`input[value="${id}"]`)!;
    expect($<HTMLInputElement>('rewrite-enabled').checked).toBe(true);
    expect(box('professional').checked).toBe(true);
    expect(box('funny').checked).toBe(false);
    box('funny').checked = true;
    await page.saveRewrite();
    expect((await loadSettings(area)).rewrite).toEqual({
      enabled: true,
      defaultStyles: ['professional', 'funny'],
      formality: 3,
    });
    box('professional').checked = false;
    box('funny').checked = false;
    await page.saveRewrite();
    expect(text('rewrite-message')).toContain('au moins un');
    expect((await loadSettings(area)).rewrite.defaultStyles).toEqual([
      'professional',
      'funny',
    ]);
    expect(box('funny').checked).toBe(true);
    $<HTMLInputElement>('rewrite-enabled').checked = false;
    await page.saveRewrite();
    expect((await loadSettings(area)).rewrite.enabled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('V5.5 translation settings', () => {
  it('defaults Auto → English, saves choices, hides the Arabic variant unless Arabic', async () => {
    const page = await openPage();
    const select = (id: string) => $<HTMLSelectElement>(id);
    expect(select('translation-source').value).toBe('auto');
    expect(select('translation-target').value).toBe('en');
    expect($('translation-variant-row').hidden).toBe(true);
    // Choosing Arabic saves it and shows the Arabic variants (5.16).
    select('translation-target').value = 'ar';
    await page.saveTranslation();
    expect($('translation-variant-row').hidden).toBe(false);
    select('translation-variant').value = 'syrian';
    await page.saveTranslation();
    expect((await loadSettings(area)).translation).toMatchObject({
      source: 'auto',
      target: 'ar',
      variants: { ar: 'syrian' },
      arabicVariant: 'syrian',
    });
    select('translation-source').value = 'ar';
    await page.saveTranslation();
    expect(text('translation-message')).toContain('identiques');
    expect((await loadSettings(area)).translation.source).toBe('auto');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('5.16 languages in the settings', () => {
  const favorites = () => [
    ...document.querySelectorAll<HTMLInputElement>('input[data-favorite]'),
  ];
  const groupValues = (id: string, index: number) => {
    const group = $<HTMLSelectElement>(id).querySelectorAll('optgroup')[index]!;
    return [...group.querySelectorAll('option')].map((option) => option.value);
  };

  it('favorites: the V5.5 six by default, in the menus first; saved in the order added', async () => {
    const page = await openPage();
    const boxes = favorites();
    expect(boxes).toHaveLength(39);
    expect(
      boxes
        .filter((box) => box.checked)
        .map((box) => box.value)
        .sort(),
    ).toEqual(['ar', 'de', 'en', 'es', 'fr', 'tr']);
    // French page: "Allemand" first in the A→Z list.
    expect(boxes[0]!.value).toBe('de');
    expect(groupValues('translation-target', 0)).toEqual([
      'fr',
      'en',
      'ar',
      'tr',
      'de',
      'es',
    ]);
    for (const box of boxes) box.checked = ['ja', 'ar'].includes(box.value);
    await page.saveTranslation();
    expect((await loadSettings(area)).translation.favorites).toEqual([
      'ar',
      'ja',
    ]);
    expect(groupValues('translation-target', 0)).toEqual(['ar', 'ja']);
    expect(groupValues('translation-source', 0)).toEqual(['ar', 'ja']);
    for (const box of boxes) box.checked = true;
    await page.saveTranslation();
    expect(text('translation-message')).toContain('12');
    expect((await loadSettings(area)).translation.favorites).toEqual([
      'ar',
      'ja',
    ]);
    expect(favorites().filter((box) => box.checked)).toHaveLength(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('each language keeps its own variant', async () => {
    const page = await openPage();
    const select = (id: string) => $<HTMLSelectElement>(id);
    select('translation-target').value = 'pt';
    await page.saveTranslation();
    expect(
      [...select('translation-variant').options].map((o) => o.value),
    ).toEqual(['pt_br', 'pt_pt']);
    select('translation-variant').value = 'pt_pt';
    await page.saveTranslation();
    select('translation-target').value = 'ar';
    await page.saveTranslation();
    expect(select('translation-variant').value).toBe('msa');
    select('translation-variant').value = 'egyptian';
    await page.saveTranslation();
    select('translation-target').value = 'ja';
    await page.saveTranslation();
    expect($('translation-variant-row').hidden).toBe(true);
    select('translation-target').value = 'pt';
    await page.saveTranslation();
    expect(select('translation-variant').value).toBe('pt_pt');
    expect((await loadSettings(area)).translation).toMatchObject({
      target: 'pt',
      variants: { ar: 'egyptian', pt: 'pt_pt' },
      arabicVariant: 'egyptian',
    });
  });

  it('English page: English names, sorted in English', async () => {
    document.body.innerHTML = body;
    const page = new SettingsPage(document, { area, confirm, locale: 'en' });
    await page.init();
    expect(favorites()[0]!.parentElement!.textContent).toBe('Amharic — አማርኛ');
    const labels = [
      ...$<HTMLSelectElement>('translation-target')
        .querySelectorAll('optgroup')[1]!
        .querySelectorAll('option'),
    ].map((option) => option.textContent);
    expect(labels).toContain('Japanese — 日本語');
    expect(
      [
        ...$<HTMLSelectElement>('translation-target').querySelectorAll(
          'optgroup',
        ),
      ].map((group) => group.label),
    ).toEqual(['Your languages', 'All languages']);
  });
});

describe('V6.1 real-time correction', () => {
  async function openWith(
    deps: Partial<ConstructorParameters<typeof SettingsPage>[1]>,
  ) {
    document.body.innerHTML = body;
    const page = new SettingsPage(document, { area, confirm, ...deps });
    await page.init();
    return page;
  }
  const flip = (id: string, on: boolean) => {
    $<HTMLInputElement>(id).checked = on;
  };

  it('is off by default and needs site access first', async () => {
    const enableRealtime = vi.fn(() => Promise.resolve(false));
    const page = await openWith({ enableRealtime });
    expect($<HTMLInputElement>('realtime-enabled').checked).toBe(false);
    expect($<HTMLInputElement>('realtime-api').checked).toBe(false);
    flip('realtime-enabled', true);
    await page.saveRealtime();
    const settings = await loadSettings(area);
    expect(settings.triggers.realtime).toBe(false);
    expect($<HTMLInputElement>('realtime-enabled').checked).toBe(false);
    expect(text('realtime-message')).toContain('pas été accordé');
  });

  it('API checking: the warning must be confirmed, then consent is saved', async () => {
    const confirmRealtimeApi = vi.fn<
      (question: string, action: string) => Promise<boolean>
    >(() => Promise.resolve(false));
    const page = await openWith({
      enableRealtime: () => Promise.resolve(true),
      confirmRealtimeApi,
    });
    flip('realtime-enabled', true);
    await page.saveRealtime();
    expect((await loadSettings(area)).triggers.realtime).toBe(true);

    flip('realtime-api', true);
    await page.saveRealtimeApi();
    expect(confirmRealtimeApi).toHaveBeenCalledTimes(1);
    expect(confirmRealtimeApi.mock.calls[0]![0]).toContain('phrase par phrase');
    // Declined: nothing is consented, the box goes back off.
    expect((await loadSettings(area)).realtime).toMatchObject({
      engine: 'auto',
      apiConsent: false,
    });
    expect($<HTMLInputElement>('realtime-api').checked).toBe(false);

    confirmRealtimeApi.mockResolvedValueOnce(true);
    flip('realtime-api', true);
    await page.saveRealtimeApi();
    expect((await loadSettings(area)).realtime).toMatchObject({
      engine: 'api',
      apiConsent: true,
    });

    flip('realtime-api', false);
    await page.saveRealtimeApi();
    expect((await loadSettings(area)).realtime).toMatchObject({
      engine: 'auto',
      apiConsent: false,
    });
  });

  it('API checking cannot be turned on while the feature is off', async () => {
    const confirmRealtimeApi = vi.fn(() => Promise.resolve(true));
    const page = await openWith({ confirmRealtimeApi });
    flip('realtime-api', true);
    await page.saveRealtimeApi();
    expect(confirmRealtimeApi).not.toHaveBeenCalled();
    expect((await loadSettings(area)).realtime.apiConsent).toBe(false);
  });

  it('turning the feature off also withdraws the sending consent', async () => {
    const disableRealtime = vi.fn(() => Promise.resolve());
    const page = await openWith({
      enableRealtime: () => Promise.resolve(true),
      confirmRealtimeApi: () => Promise.resolve(true),
      disableRealtime,
    });
    flip('realtime-enabled', true);
    await page.saveRealtime();
    flip('realtime-api', true);
    await page.saveRealtimeApi();
    flip('realtime-enabled', false);
    await page.saveRealtime();
    const settings = await loadSettings(area);
    expect(settings.triggers.realtime).toBe(false);
    expect(settings.realtime).toMatchObject({
      engine: 'auto',
      apiConsent: false,
    });
    expect(disableRealtime).toHaveBeenCalledTimes(1);
    expect($<HTMLInputElement>('realtime-api').checked).toBe(false);
  });

  it('shows the local engine state as the browser reports it', async () => {
    await openWith({ localStatus: () => Promise.resolve('unavailable') });
    await vi.waitFor(() =>
      expect(text('realtime-local-status')).toBe(
        'non disponible sur ce navigateur',
      ),
    );
    await openWith({ localStatus: () => Promise.resolve('ready') });
    await vi.waitFor(() => expect(text('realtime-local-status')).toBe('prêt'));
    await openWith({});
    await vi.waitFor(() =>
      expect(text('realtime-local-status')).toBe('inconnu'),
    );
  });

  it('disabled sites: hostnames only, unique, saved', async () => {
    const page = await openWith({});
    $<HTMLTextAreaElement>('realtime-sites').value =
      'Mail.Example.com\nhttp://bad/path\nmail.example.com, docs.test\n\n';
    await page.saveSites();
    expect((await loadSettings(area)).realtime.disabledSites).toEqual([
      'mail.example.com',
      'docs.test',
    ]);
    expect(text('realtime-sites-message')).toContain('2 site(s)');
    expect($<HTMLTextAreaElement>('realtime-sites').value).toBe(
      'mail.example.com\ndocs.test',
    );
  });

  it('dictionary: add, refuse bad words, remove, export', async () => {
    const download = vi.fn();
    const page = await openWith({ download });
    const input = $<HTMLInputElement>('realtime-word');
    input.value = 'Correctly';
    await page.addWord();
    input.value = 'two words';
    await page.addWord();
    expect(text('realtime-dict-message')).toContain('un seul mot');
    input.value = 'Lyon';
    await page.addWord();
    expect(
      [...document.querySelectorAll('#realtime-dict-list li span')].map(
        (n) => n.textContent,
      ),
    ).toEqual(['Correctly', 'Lyon']);
    await page.exportWords();
    expect(download).toHaveBeenCalledWith(
      'correctly-dictionary.txt',
      'Correctly\nLyon\n',
    );
    await page.removeWord('Correctly');
    expect(
      [...document.querySelectorAll('#realtime-dict-list li span')].map(
        (n) => n.textContent,
      ),
    ).toEqual(['Lyon']);
    expect(area.data.get('correctly.v5.dictionary')).toEqual({
      words: ['Lyon'],
    });
  });
});

describe('V7.1 image consent', () => {
  it('the reset button is hidden until consent is given, then withdraws it', async () => {
    const page = await openPage();
    expect($<HTMLButtonElement>('image-consent-reset').hidden).toBe(true);
    expect(text('image-consent-state')).toMatch(/pas encore autorisé/);
    area.data.set(STORAGE_KEYS.settings, {
      ...(area.data.get(STORAGE_KEYS.settings) as object),
      ocr: { consent: true },
    });
    await page.reload();
    expect($<HTMLButtonElement>('image-consent-reset').hidden).toBe(false);
    expect($<HTMLButtonElement>('image-consent-reset').disabled).toBe(false);
    $<HTMLButtonElement>('image-consent-reset').click();
    await vi.waitFor(async () => {
      expect((await loadSettings(area)).ocr.consent).toBe(false);
    });
    expect($<HTMLButtonElement>('image-consent-reset').hidden).toBe(true);
    expect(text('image-consent-message')).toMatch(/redemandera/);
  });
});
