import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_EDIT,
  CORRECT_TEXT,
  HANDLE_POSITION,
  OPEN_LIMITS,
  OPEN_MODAL,
  OPEN_SETTINGS,
  OPEN_TRANSLATION,
  PAGE_CONFIG,
  REWRITE_TEXT,
  TEST_CONNECTION,
  TEST_KEY,
  SUMMARIZE_TEXT,
  TRANSLATE_TEXT,
} from '../../src/shared/contracts';
import { PROVIDERS_KEY, SECRETS_KEY } from '../../src/shared/providers';
import { QuotaStore } from '../../src/shared/quota-store';
import {
  DEFAULT_REPLACE_ALL_KEY,
  DEFAULT_REPLACE_KEY,
  normalizeSettings,
} from '../../src/shared/settings';
import { saveSettings, STORAGE_KEYS } from '../../src/shared/storage';
import {
  DEFAULT_TRANSLATION,
  normalizeTranslation,
} from '../../src/shared/translate';
import {
  FakeStorage,
  FAKE_KEY,
  GEMINI_ID,
  OPENAI_ID,
  OPENAI_KEY,
  geminiOk,
  jsonResponse,
  openaiOk,
  profile,
  seedProviders,
} from '../helpers/fake-storage';

/** V5.9: replies carry an opaque request ID. */
const ANY_ID: unknown = expect.any(String);

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (response: unknown) => void,
) => boolean | undefined;

const ID = 'correctlyextensionid';
const ORIGIN = `chrome-extension://${ID}/`;
const optionsSender: chrome.runtime.MessageSender = {
  id: ID,
  url: ORIGIN + 'src/options/options.html',
  origin: ORIGIN.slice(0, -1),
  tab: { id: 3, url: ORIGIN + 'src/options/options.html' } as chrome.tabs.Tab,
};

let listener: Listener;
let actionClick: (tab: chrome.tabs.Tab) => void;
let area: FakeStorage;
const fetcher = vi.fn<typeof fetch>();
const openOptionsPage = vi.fn(() => Promise.resolve());
const createTab = vi.fn(() => Promise.resolve({}));
const executeScript = vi.fn<(injection: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const menus = {
  create: vi.fn(),
  removeAll: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
};
const registerContentScripts = vi.fn(() => Promise.resolve());
const unregisterContentScripts = vi.fn(() => Promise.resolve());
let granted = false;
let onCommand: (command: string, tab?: chrome.tabs.Tab) => void;
let onMenuClick: (
  info: Partial<chrome.contextMenus.OnClickData>,
  tab?: chrome.tabs.Tab,
) => void;
let onInstalled: () => void;
let onStorageChanged: (changes: object, areaName: string) => void;
const listen = <T>(set: (callback: T) => void) => ({ addListener: set });
/** Every trigger = load content.js in a frame, then run it with an intent. */
const expectInjected = (frameIds: number[] | undefined, intent: unknown[]) => {
  const target = frameIds ? { tabId: 7, frameIds } : { tabId: 7 };
  const calls = executeScript.mock.calls.map((call) => call[0]) as {
    target: unknown;
    files?: unknown;
    args?: unknown;
  }[];
  const load = calls.findIndex(
    (call) =>
      JSON.stringify(call.target) === JSON.stringify(target) && call.files,
  );
  expect(calls[load]).toEqual({ target, files: ['content.js'] });
  expect(calls[load + 1]?.target).toEqual(target);
  // [intent, styles] (and the translation prefs when a test passes them).
  expect((calls[load + 1]?.args as unknown[]).slice(0, intent.length)).toEqual(
    intent,
  );
};
const contentSender: chrome.runtime.MessageSender = {
  id: ID,
  url: 'https://mail.example/compose',
  frameId: 0,
  tab: { id: 7 } as chrome.tabs.Tab,
};
const configure = (consent: boolean, triggers: object = {}) =>
  saveSettings(
    area,
    normalizeSettings({
      gemini: { apiKey: FAKE_KEY },
      correction: { consent },
      triggers,
    }),
  );
const correctionReply = (hasErrors: boolean, correctedText: string) =>
  jsonResponse(200, geminiOk(JSON.stringify({ hasErrors, correctedText })));
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
const setAccessLevel = vi.fn(() => Promise.resolve());

beforeEach(async () => {
  vi.resetModules();
  area = new FakeStorage();
  granted = false;
  fetcher.mockResolvedValue(jsonResponse(200, geminiOk()));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('chrome', {
    runtime: {
      id: ID,
      getURL: (path: string) => ORIGIN + path,
      onMessage: {
        addListener: (callback: Listener) => {
          listener = callback;
        },
      },
      openOptionsPage,
      onInstalled: listen((callback: () => void) => (onInstalled = callback)),
      lastError: undefined,
    },
    commands: {
      onCommand: listen((callback: typeof onCommand) => (onCommand = callback)),
    },
    tabs: { create: createTab },
    contextMenus: {
      ...menus,
      onClicked: listen(
        (callback: typeof onMenuClick) => (onMenuClick = callback),
      ),
    },
    permissions: { contains: () => Promise.resolve(granted) },
    action: {
      onClicked: {
        addListener: (callback: (tab: chrome.tabs.Tab) => void) => {
          actionClick = callback;
        },
      },
    },
    scripting: {
      executeScript,
      registerContentScripts,
      unregisterContentScripts,
    },
    identity: {
      getRedirectURL: () => `https://${ID}.chromiumapp.org/`,
      launchWebAuthFlow: () => Promise.reject(new Error('no window in tests')),
    },
    storage: {
      local: Object.assign(area, { setAccessLevel }),
      onChanged: listen(
        (callback: typeof onStorageChanged) => (onStorageChanged = callback),
      ),
    },
  });
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    consoleSpies.push(vi.spyOn(console, method));
  // The real entry point, exactly as bundled into service-worker.js.
  await import('../../src/background/service-worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleSpies.length = 0;
});

const send = (message: unknown, sender = optionsSender) =>
  new Promise<{ handled: boolean | undefined; reply?: unknown }>((resolve) => {
    const handled = listener(message, sender, (reply) =>
      resolve({ handled, reply }),
    );
    if (!handled) resolve({ handled });
  });

it('answers TEST_CONNECTION from the options page through the real worker', async () => {
  await saveSettings(area, normalizeSettings({ gemini: { apiKey: FAKE_KEY } }));
  const { handled, reply } = await send({
    type: TEST_CONNECTION,
    slot: 'default',
  });
  expect(handled).toBe(true);
  expect(reply).toMatchObject({ ok: true, provider: 'gemini', sample: 'OK' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const init = fetcher.mock.calls[0]![1]!;
  expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
    FAKE_KEY,
  );
  // The key goes only into the outgoing header, never back to the UI or logs.
  expect(JSON.stringify(reply)).not.toContain(FAKE_KEY);
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
});

it('S10: unknown actions and malformed payloads are ignored without network', async () => {
  await saveSettings(area, normalizeSettings({ gemini: { apiKey: FAKE_KEY } }));
  for (const message of [
    { type: 'check', text: 'hello' },
    { type: 'health' },
    { type: TEST_CONNECTION },
    { type: TEST_CONNECTION, slot: 'default', apiKey: 'x' },
    { type: TEST_CONNECTION, slot: '../../evil' },
    { type: TEST_KEY, credentialId: '../x' },
    { type: TEST_KEY },
    { type: 'correctly.v5.getApiKey' },
    { type: TEST_CONNECTION, apiKey: 'x' },
    { type: TEST_CONNECTION, modelId: '../../evil' },
    { type: TEST_CONNECTION, url: 'https://evil.example' },
    [TEST_CONNECTION],
    TEST_CONNECTION,
    null,
    undefined,
  ]) {
    const { handled, reply } = await send(message);
    expect(handled).toBe(false);
    expect(reply).toBeUndefined();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('S11: forged senders get nothing back, and no key', async () => {
  await saveSettings(area, normalizeSettings({ gemini: { apiKey: FAKE_KEY } }));
  for (const sender of [
    { ...optionsSender, id: 'another-extension' },
    {
      id: ID,
      url: 'https://evil.example/page',
      tab: { id: 9 } as chrome.tabs.Tab,
    },
    { id: ID },
    { id: ID, url: 'chrome-extension://otherid/src/options/options.html' },
  ]) {
    const { handled, reply } = await send(
      { type: TEST_CONNECTION, slot: 'default' },
      sender,
    );
    expect(handled).toBe(false);
    expect(reply).toBeUndefined();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('no fetch happens on worker startup', () => {
  expect(fetcher).not.toHaveBeenCalled();
});

describe('toolbar button', () => {
  it('opens the settings page while no key is saved', async () => {
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('opens the settings page until correction consent is given', async () => {
    await configure(false);
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('V5.11 T02: opens the in-page modal in the clicked tab only, without network', async () => {
    await configure(true);
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['open', ['professional']]);
    expect(openOptionsPage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to the settings on pages that cannot be scripted', async () => {
    await configure(true);
    executeScript.mockRejectedValueOnce(new Error('Cannot access chrome://'));
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
  });
});

describe('CORRECT_TEXT', () => {
  it('A02: one Gemini call, the text only as a user part, no key in the reply', async () => {
    await configure(true);
    fetcher.mockResolvedValueOnce(
      correctionReply(true, 'Je suis allé à Lyon hier.'),
    );
    const { handled, reply } = await send(
      { type: CORRECT_TEXT, text: ' Je suis aller a Lyon hier.\n' },
      contentSender,
    );
    expect(handled).toBe(true);
    expect(reply).toEqual({
      ok: true,
      operationId: ANY_ID,
      hasErrors: true,
      correctedText: ' Je suis allé à Lyon hier.\n',
      suspicious: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string) as {
      contents: unknown;
    };
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Je suis aller a Lyon hier.' }] },
    ]);
    expect(JSON.stringify(reply)).not.toContain(FAKE_KEY);
    expect(area.dump()).not.toContain('Lyon');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('refuses without consent, and from forged senders or shapes, without network', async () => {
    await configure(false);
    const { reply } = await send(
      { type: CORRECT_TEXT, text: 'Bonjour' },
      contentSender,
    );
    expect(reply).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED' });
    await configure(true);
    for (const [message, sender] of [
      [
        { type: CORRECT_TEXT, text: 'x' },
        { ...contentSender, id: 'other' },
      ],
      [
        { type: CORRECT_TEXT, text: 'x' },
        { ...contentSender, frameId: undefined },
      ],
      [{ type: CORRECT_TEXT, text: 'x' }, { id: ID }],
      [{ type: CORRECT_TEXT, text: '   ' }, contentSender],
      [{ type: CORRECT_TEXT, text: 'é'.repeat(2001) }, contentSender],
      [{ type: CORRECT_TEXT, text: 'x', model: 'evil' }, contentSender],
      [{ type: CORRECT_TEXT, text: 42 }, contentSender],
      [{ type: TEST_CONNECTION, slot: 'default' }, contentSender],
      // KEY-22: a content script can never check, read or change a key.
      [{ type: TEST_KEY, credentialId: GEMINI_ID }, contentSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.3 keyboard shortcut', () => {
  it('K01: the command injects into the active tab, like the toolbar', async () => {
    await configure(true);
    onCommand('correct-selection', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['correct', []]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('K07/K10: unknown commands and a disabled shortcut do nothing', async () => {
    await configure(true, { keyboard: false });
    onCommand('correct-selection', { id: 7 } as chrome.tabs.Tab);
    onCommand('_execute_action', { id: 7 } as chrome.tabs.Tab);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled();
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('K09: no tab (browser page) opens the settings', async () => {
    await configure(true);
    onCommand('correct-selection', undefined);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
  });
});

describe('V5.11 unified modal entry points', () => {
  it('T01: Ctrl+M (open-correctly) opens the modal like the toolbar icon, no network', async () => {
    await configure(true);
    onCommand('open-correctly', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['open', ['professional']]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('Ctrl+M respects the keyboard setting; no tab opens the settings', async () => {
    await configure(true, { keyboard: false });
    onCommand('open-correctly', { id: 7 } as chrome.tabs.Tab);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled();
    await configure(true);
    onCommand('open-correctly', undefined);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
  });

  it('H04: the handle opens the modal in its own frame, only when enabled and from our script', async () => {
    await configure(true);
    await send({ type: OPEN_MODAL }, { ...contentSender, frameId: 2 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled(); // handle setting is off
    await configure(true, { smartButton: true });
    const { handled } = await send(
      { type: OPEN_MODAL },
      { ...contentSender, frameId: 2 },
    );
    expect(handled).toBe(false); // no reply channel kept open
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([2], ['open', ['professional']]);
    await send({ type: OPEN_MODAL, text: 'x' }, contentSender);
    await send({ type: OPEN_MODAL }, { ...contentSender, id: 'other' });
    await send({ type: OPEN_MODAL }, optionsSender);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('5.15: the translate button opens the window on Translation, only when enabled', async () => {
    const message = {
      type: OPEN_TRANSLATION,
      text: 'Bonjour à tous',
      generate: true,
    };
    await configure(true);
    await send(message, { ...contentSender, frameId: 3 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled(); // button setting is off
    await configure(true, { selectionButton: true });
    const { handled } = await send(message, { ...contentSender, frameId: 3 });
    expect(handled).toBe(false);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([3], ['open', ['professional']]);
    const args = (executeScript.mock.calls[1]![0] as { args: unknown[] }).args;
    expect(args[6]).toEqual({ text: 'Bonjour à tous', generate: true });
    // Wrong shapes, other senders: nothing.
    for (const bad of [
      { type: OPEN_TRANSLATION, text: 'x' },
      { type: OPEN_TRANSLATION, text: '  ', generate: true },
      { type: OPEN_TRANSLATION, text: 'x', generate: 'yes' },
      { ...message, extra: 1 },
    ])
      await send(bad, contentSender);
    await send(message, optionsSender);
    await send(message, { ...contentSender, id: 'other' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes "rewrite off" to the modal instead of opening a picker', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        rewrite: { enabled: false },
      }),
    );
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    const args = (executeScript.mock.calls[1]?.[0] as { args: unknown[] }).args;
    expect(args[0]).toBe('open');
    expect(args[3]).toBe(false);
  });

  it('M05: the gear opens the existing options page, from our content script only', async () => {
    expect((await send({ type: OPEN_SETTINGS }, contentSender)).handled).toBe(
      false,
    );
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
    await send({ type: OPEN_SETTINGS }, { ...contentSender, id: 'other' });
    await send({ type: OPEN_SETTINGS, url: 'https://x.test' }, contentSender);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(createTab).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('H09: a dragged position is stored (bounded) and returned by PAGE_CONFIG', async () => {
    await configure(true, { smartButton: true });
    await send({ type: HANDLE_POSITION, yRatio: 0.25 }, contentSender);
    await vi.waitFor(() =>
      expect(area.data.get(STORAGE_KEYS.handle)).toEqual({
        schemaVersion: 1,
        yRatio: 0.25,
      }),
    );
    for (const [message, sender] of [
      [{ type: HANDLE_POSITION, yRatio: 2 }, contentSender],
      [{ type: HANDLE_POSITION, yRatio: Number.NaN }, contentSender],
      [{ type: HANDLE_POSITION, yRatio: '0.9' }, contentSender],
      [{ type: HANDLE_POSITION, yRatio: 0.9, x: 1 }, contentSender],
      [
        { type: HANDLE_POSITION, yRatio: 0.9 },
        { ...contentSender, id: 'x' },
      ],
      [{ type: HANDLE_POSITION, yRatio: 0.9 }, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][])
      await send(message, sender);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(area.data.get(STORAGE_KEYS.handle)).toEqual({
      schemaVersion: 1,
      yRatio: 0.25,
    });
    const { reply } = await send({ type: PAGE_CONFIG }, contentSender);
    expect(reply).toMatchObject({ smartButton: true, handleY: 0.25 });
    // A corrupt stored value falls back to the centre.
    area.data.set(STORAGE_KEYS.handle, { yRatio: 'top' });
    expect(
      (await send({ type: PAGE_CONFIG }, contentSender)).reply,
    ).toMatchObject({ handleY: 0.5 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.3 context menu', () => {
  it('M07: install/update registers exactly one parent and its items, idempotently', async () => {
    for (let i = 0; i < 2; i++) onInstalled();
    await vi.waitFor(() => expect(menus.create).toHaveBeenCalledTimes(10));
    expect(menus.removeAll).toHaveBeenCalledTimes(2);
    const ids = menus.create.mock.calls.map(
      (call) => (call as unknown as [{ id: string }])[0].id,
    );
    expect(ids).toEqual([
      ...[1, 2].flatMap(() => [
        'correctly',
        'correctly-correct-selection',
        'correctly-rewrite-selection',
        'correctly-translate-selection',
        'correctly-translate-rewrite-selection',
      ]),
    ]);
    expect((menus.create.mock.calls[0] as unknown[])[0]).toMatchObject({
      contexts: ['editable'],
      visible: true,
    });
  });

  it('M01/M05: a click injects into the frame that was right-clicked', async () => {
    await configure(true);
    onMenuClick({ menuItemId: 'correctly-correct-selection', frameId: 4 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([4], ['correct', []]);
  });

  it('M05: an unreachable cross-site frame gets a notice in the top frame, nothing else', async () => {
    await configure(true);
    executeScript.mockRejectedValueOnce(new Error('Cannot access frame'));
    onMenuClick({ menuItemId: 'correctly-correct-selection', frameId: 4 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(3));
    expectInjected(undefined, ['unreachable', []]);
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('M09: a disabled menu or another item does nothing, and the menu is hidden', async () => {
    await configure(true, { contextMenu: false });
    onMenuClick({ menuItemId: 'correctly-correct-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    onMenuClick({ menuItemId: 'other', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(menus.update).toHaveBeenCalledWith('correctly', {
        visible: false,
      }),
    );
    expect(executeScript).not.toHaveBeenCalled();
  });
});

describe('V5.3 smart button registration', () => {
  it('registers smart.js only when enabled AND site access is granted', async () => {
    await configure(true, { smartButton: true });
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() => expect(unregisterContentScripts).toHaveBeenCalled());
    expect(registerContentScripts).not.toHaveBeenCalled();
    granted = true;
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(registerContentScripts).toHaveBeenCalledWith([
        {
          id: 'correctly-smart-button',
          matches: ['<all_urls>'],
          js: ['smart.js'],
          runAt: 'document_idle',
        },
      ]),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Correctly keyboard shortcuts (in pages)', () => {
  const binding = {
    ctrl: true,
    alt: false,
    shift: true,
    meta: false,
    code: 'KeyK',
    label: 'K',
  };

  it('KEY_COMMAND from our page script runs that action in its frame, no network', async () => {
    await configure(true);
    await send(
      { type: 'correctly.v5.keyCommand', action: 'open' },
      { ...contentSender, frameId: 2 },
    );
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([2], ['open', ['professional']]);
    executeScript.mockClear();
    await send(
      { type: 'correctly.v5.keyCommand', action: 'correct' },
      contentSender,
    );
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['correct']);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forged senders, bad shapes and the keyboard switch off do nothing', async () => {
    await configure(true, { keyboard: false });
    await send(
      { type: 'correctly.v5.keyCommand', action: 'open' },
      contentSender,
    );
    for (const [message, sender] of [
      [{ type: 'correctly.v5.keyCommand', action: 'drop' }, contentSender],
      [
        { type: 'correctly.v5.keyCommand', action: 'open', x: 1 },
        contentSender,
      ],
      [{ type: 'correctly.v5.keyCommand', action: 'open' }, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][])
      await send(message, sender);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled();
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('PAGE_CONFIG gives the bindings only when they are on; they keep smart.js registered', async () => {
    await configure(true);
    area.data.set('correctly.v5.keybindings', {
      enabled: false,
      bindings: { open: binding },
    });
    expect(
      (await send({ type: PAGE_CONFIG }, contentSender)).reply,
    ).toMatchObject({ keybindings: {} });
    area.data.set('correctly.v5.keybindings', {
      enabled: true,
      bindings: { open: binding },
    });
    expect(
      (await send({ type: PAGE_CONFIG }, contentSender)).reply,
    ).toMatchObject({ keybindings: { open: binding } });
    granted = true;
    onStorageChanged({ 'correctly.v5.keybindings': {} }, 'local');
    await vi.waitFor(() =>
      expect(registerContentScripts).toHaveBeenCalledWith([
        expect.objectContaining({ js: ['smart.js'] }),
      ]),
    );
  });
});

describe('5.13 interface language', () => {
  it('passes the chosen language to the page and titles the menu in it', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        ui: { language: 'fr' },
      }),
    );
    onCommand('open-correctly', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    const call = executeScript.mock.calls[1]![0] as { args: unknown[] };
    expect(call.args[0]).toBe('open');
    expect(call.args[4]).toBe('fr');
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(menus.update).toHaveBeenCalledWith('correctly-correct-selection', {
        title: 'Corriger le texte sélectionné',
      }),
    );
    const config = await send({ type: PAGE_CONFIG }, contentSender);
    expect(config.reply).toMatchObject({ locale: 'fr' });
  });

  it('"auto" follows the browser language (English here)', async () => {
    await configure(true);
    onCommand('open-correctly', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    const call = executeScript.mock.calls[1]![0] as { args: unknown[] };
    expect(call.args[4]).toBe('en');
  });
});

describe('V5.4 rewrite', () => {
  const rewriteReply = (candidates: { styleId: string; text: string }[]) =>
    jsonResponse(200, geminiOk(JSON.stringify({ candidates })));

  it('three styles → exactly ONE Gemini call, candidates in requested order', async () => {
    await configure(true);
    fetcher.mockResolvedValueOnce(
      rewriteReply([
        { styleId: 'concise', text: "Can't attend tomorrow." },
        { styleId: 'formal', text: 'I am unable to attend tomorrow.' },
        { styleId: 'friendly', text: "Sorry, I can't make it tomorrow!" },
      ]),
    );
    const { handled, reply } = await send(
      {
        type: REWRITE_TEXT,
        text: "I can't attend the meeting tomorrow.",
        styleIds: ['formal', 'friendly', 'concise'],
      },
      contentSender,
    );
    expect(handled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reply).toMatchObject({
      ok: true,
      missing: [],
      candidates: [
        { styleId: 'formal' },
        { styleId: 'friendly' },
        { styleId: 'concise' },
      ],
    });
    expect(area.dump()).not.toContain('attend');
  });

  it('unknown, duplicated or too many styles and forged senders are refused without network', async () => {
    await configure(true);
    for (const [message, sender] of [
      [{ type: REWRITE_TEXT, text: 'x', styleIds: [] }, contentSender],
      [{ type: REWRITE_TEXT, text: 'x', styleIds: ['evil'] }, contentSender],
      [
        { type: REWRITE_TEXT, text: 'x', styleIds: ['formal', 'formal'] },
        contentSender,
      ],
      [{ type: REWRITE_TEXT, text: 'x', styleIds: 'formal' }, contentSender],
      [
        { type: REWRITE_TEXT, text: 'x', styleIds: ['formal'], model: 'm' },
        contentSender,
      ],
      [{ type: REWRITE_TEXT, text: 'x', styleIds: ['formal'] }, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('menu and shortcut open the picker with the saved default styles, no network', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        rewrite: { defaultStyles: ['friendly', 'concise'] },
      }),
    );
    onMenuClick({ menuItemId: 'correctly-rewrite-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['rewrite', ['friendly', 'concise']]);
    executeScript.mockClear();
    onCommand('rewrite-selection', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['rewrite', ['friendly', 'concise']]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rewrite turned off → a notice instead of the picker, and the item is hidden', async () => {
    await configure(true);
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        rewrite: { enabled: false },
      }),
    );
    onMenuClick({ menuItemId: 'correctly-rewrite-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['rewriteOff', ['professional']]);
    onStorageChanged({ [STORAGE_KEYS.settings]: {} }, 'local');
    await vi.waitFor(() =>
      expect(menus.update).toHaveBeenCalledWith(
        'correctly-rewrite-selection',
        expect.objectContaining({ visible: false }),
      ),
    );
  });

  it('V5.11: the removed V5.3 smart-button messages do nothing anymore', async () => {
    await configure(true, { smartButton: true });
    for (const type of [
      'correctly.v5.openRewrite',
      'correctly.v5.openTranslate',
    ])
      expect((await send({ type }, contentSender)).handled).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(executeScript).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.5 translation', () => {
  const PREFS = { source: 'auto', target: 'ar', arabicVariant: 'syrian' };
  // A 5.15 preference, read back with its Arabic variant (5.16 shape).
  const SAVED = normalizeTranslation(PREFS);
  const configureTranslation = (triggers: object = {}) =>
    saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        rewrite: { defaultStyles: ['friendly'] },
        translation: PREFS,
        triggers,
      }),
    );

  it('TRANSLATE_TEXT → exactly one Gemini call with the dialect in the instruction', async () => {
    await configureTranslation();
    fetcher.mockResolvedValueOnce(
      jsonResponse(
        200,
        geminiOk(
          JSON.stringify({
            status: 'translated',
            candidates: [{ styleId: 'neutral', text: 'مرحبا، كيفك؟' }],
          }),
        ),
      ),
    );
    const { handled, reply } = await send(
      {
        type: TRANSLATE_TEXT,
        text: 'Salut, ça va ?',
        source: 'auto',
        target: 'ar',
        variant: 'syrian',
        styleIds: [],
      },
      contentSender,
    );
    expect(handled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reply).toMatchObject({
      ok: true,
      candidates: [{ styleId: 'neutral', text: 'مرحبا، كيفك؟' }],
    });
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string) as {
      systemInstruction: { parts: { text: string }[] };
    };
    expect(body.systemInstruction.parts[0]!.text).toMatch(/Syrian colloquial/);
    expect(area.dump()).not.toContain('Salut');
  });

  it('B14/H03: invalid combinations and forged senders never reach the network', async () => {
    await configureTranslation();
    const base = {
      type: TRANSLATE_TEXT,
      text: 'x',
      source: 'auto',
      target: 'ar',
      variant: 'syrian',
      styleIds: [],
    };
    for (const [message, sender] of [
      [{ ...base, target: 'auto' }, contentSender],
      [{ ...base, target: 'fr' }, contentSender],
      [{ ...base, variant: 'pt_br' }, contentSender],
      [{ ...base, styleIds: ['evil'] }, contentSender],
      [{ ...base, tabId: 9 }, contentSender],
      [base, { ...contentSender, id: 'other' }],
      [base, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('F01: menu items, command and smart button open the picker with the saved prefs, no network', async () => {
    await configureTranslation({ smartButton: true });
    onMenuClick({ menuItemId: 'correctly-translate-selection', frameId: 0 }, {
      id: 7,
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['translate', ['friendly'], SAVED]);
    executeScript.mockClear();
    onMenuClick(
      { menuItemId: 'correctly-translate-rewrite-selection', frameId: 0 },
      { id: 7 } as chrome.tabs.Tab,
    );
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['translateRewrite', ['friendly'], SAVED]);
    executeScript.mockClear();
    onCommand('translate-selection', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([0], ['translate', ['friendly'], SAVED]);
    executeScript.mockClear();
    await send({ type: OPEN_MODAL }, { ...contentSender, frameId: 3 });
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expectInjected([3], ['open', ['friendly'], SAVED, true]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.12 summary', () => {
  const base = {
    type: SUMMARIZE_TEXT,
    text: 'Le budget de 12 millions financera trois écoles.',
    target: 'ar',
    variant: 'syrian',
    length: 'short',
    format: 'key_points',
  };
  const configureSummary = () =>
    saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
      }),
    );

  it('SUMMARIZE_TEXT → exactly one call, Syrian Arabic asked directly', async () => {
    await configureSummary();
    fetcher.mockResolvedValueOnce(
      jsonResponse(
        200,
        geminiOk(
          JSON.stringify({
            status: 'summarized',
            points: ['ميزانية 12 مليون لتلات مدارس'],
          }),
        ),
      ),
    );
    const { handled, reply } = await send(base, contentSender);
    expect(handled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reply).toMatchObject({
      ok: true,
      unsummarizable: false,
      text: '• ميزانية 12 مليون لتلات مدارس',
      operationId: ANY_ID,
    });
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string) as {
      systemInstruction: { parts: { text: string }[] };
    };
    expect(body.systemInstruction.parts[0]!.text).toMatch(/Syrian colloquial/);
    expect(body.systemInstruction.parts[0]!.text).not.toContain('budget');
    expect(area.dump()).not.toContain('budget');
  });

  it('invalid options and forged senders never reach the network', async () => {
    await configureSummary();
    for (const [message, sender] of [
      [{ ...base, variant: null }, contentSender],
      [{ ...base, target: 'en' }, contentSender],
      [{ ...base, length: 'huge' }, contentSender],
      [{ ...base, format: 'html' }, contentSender],
      [{ ...base, modelId: 'gemini-x' }, contentSender],
      [{ ...base, text: 'a'.repeat(12001) }, contentSender],
      [base, { ...contentSender, id: 'other' }],
      [base, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('a Summary-only route is enough to open the modal; nothing is sent', async () => {
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: true } }),
    );
    seedProviders(area, [profile(GEMINI_ID, 'gemini')], {
      summary: { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' },
    });
    onCommand('open-correctly', { id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    expect(openOptionsPage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.6 text shortcuts', () => {
  const store = (enabled: boolean) => ({
    schemaVersion: 2,
    revision: 1,
    enabled,
    shortcuts: [
      {
        id: 'a',
        trigger: 'bjr',
        replacement: 'Bonjour',
        enabled: true,
        protectTriggerInAi: true,
        protectReplacementInAi: false,
      },
      {
        id: 'b',
        trigger: 'off',
        replacement: 'disabled one',
        enabled: false,
        protectTriggerInAi: true,
        protectReplacementInAi: false,
      },
    ],
  });

  it('PAGE_CONFIG gives the page only enabled pairs, never settings or the key', async () => {
    await configure(true, { smartButton: true });
    area.data.set('correctly.v5.shortcuts', store(true));
    const { handled, reply } = await send({ type: PAGE_CONFIG }, contentSender);
    expect(handled).toBe(true);
    expect(reply).toEqual({
      locale: 'en',
      smartButton: true,
      selectionButton: false,
      realtime: false,
      realtimeEngine: 'auto',
      realtimeDisabledSites: [],
      realtimeTiming: 'live',
      realtimeReplaceKey: DEFAULT_REPLACE_KEY,
      realtimeReplaceAllKey: DEFAULT_REPLACE_ALL_KEY,
      dictionary: [],
      translation: {
        target: 'en',
        variants: DEFAULT_TRANSLATION.variants,
        favorites: DEFAULT_TRANSLATION.favorites,
      },
      handleY: 0.5,
      keybindings: {},
      shortcuts: [{ trigger: 'bjr', replacement: 'Bonjour' }],
    });
    expect(JSON.stringify(reply)).not.toContain(FAKE_KEY);
    area.data.set('correctly.v5.shortcuts', store(false));
    expect(
      (await send({ type: PAGE_CONFIG }, contentSender)).reply,
    ).toMatchObject({
      shortcuts: [],
    });
    for (const [message, sender] of [
      [{ type: PAGE_CONFIG }, optionsSender],
      [{ type: PAGE_CONFIG }, { ...contentSender, id: 'other' }],
      [{ type: PAGE_CONFIG, all: true }, contentSender],
    ] as [unknown, chrome.runtime.MessageSender][])
      expect((await send(message, sender)).handled).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('the page script is registered for shortcuts alone (smart button off) once access is granted', async () => {
    await configure(true);
    area.data.set('correctly.v5.shortcuts', store(true));
    granted = true;
    onStorageChanged({ 'correctly.v5.shortcuts': {} }, 'local');
    await vi.waitFor(() => expect(registerContentScripts).toHaveBeenCalled());
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('V5.7 providers and routes', () => {
  it('KEY-29: storage.local is restricted to trusted extension contexts at startup', () => {
    expect(setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });

  it('MIG-02/MIG-07: a V5.1 key is migrated once at startup, without network', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY, modelId: 'gemini-3.5-flash-lite' },
      }),
    );
    onInstalled();
    await vi.waitFor(() =>
      expect(
        (area.data.get(PROVIDERS_KEY) as { profiles: unknown[] } | undefined)
          ?.profiles,
      ).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(
        (
          area.data.get(STORAGE_KEYS.settings) as {
            gemini: { apiKey: unknown };
          }
        ).gemini.apiKey,
      ).toBeNull(),
    );
    const store = area.data.get(PROVIDERS_KEY) as {
      profiles: { id: string; label: string }[];
      routes: { default: unknown };
    };
    expect(store.profiles[0]!.label).toBe('Gemini — Migrated');
    expect(store.routes.default).toEqual({
      credentialId: store.profiles[0]!.id,
      modelId: 'gemini-3.5-flash-lite',
    });
    expect(area.dump().match(new RegExp(FAKE_KEY, 'g'))).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('RT-05/RT-06: correction goes to its OpenAI route only; Gemini sees nothing', async () => {
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: true } }),
    );
    seedProviders(
      area,
      [profile(GEMINI_ID, 'gemini'), profile(OPENAI_ID, 'openai')],
      {
        default: { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' },
        correction: { credentialId: OPENAI_ID, modelId: 'gpt-5.6-luna' },
      },
    );
    fetcher.mockResolvedValueOnce(
      jsonResponse(
        200,
        openaiOk(
          JSON.stringify({ hasErrors: true, correctedText: 'Fixed text' }),
        ),
      ),
    );
    const { reply } = await send(
      { type: CORRECT_TEXT, text: 'Fixd text' },
      contentSender,
    );
    expect(reply).toEqual({
      ok: true,
      operationId: ANY_ID,
      hasErrors: true,
      correctedText: 'Fixed text',
      suspicious: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((init!.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${OPENAI_KEY}`,
    );
    expect(init!.body as string).not.toContain(OPENAI_KEY);
    expect(JSON.stringify(reply)).not.toContain(OPENAI_KEY);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('RT-11/INV-08: a disabled route is blocked; the other key is never used', async () => {
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: true } }),
    );
    seedProviders(
      area,
      [
        profile(GEMINI_ID, 'gemini', { enabled: false }),
        profile('gemini-backup-1', 'gemini'),
      ],
      {
        default: { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' },
      },
    );
    const { reply } = await send(
      { type: CORRECT_TEXT, text: 'Fixd text' },
      contentSender,
    );
    expect(reply).toMatchObject({ ok: false, code: 'PROFILE_DISABLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('Scenario A: without a usable route the toolbar opens the settings, injects nothing', async () => {
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: true } }),
    );
    actionClick({ id: 7 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalledTimes(1));
    expect(executeScript).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('KEY-21: PAGE_CONFIG never carries a key, a profile or a route', async () => {
    seedProviders(area, [profile(OPENAI_ID, 'openai')], {
      default: { credentialId: OPENAI_ID, modelId: 'gpt-5-nano' },
    });
    const { reply } = await send({ type: PAGE_CONFIG }, contentSender);
    const textReply = JSON.stringify(reply);
    for (const secret of [OPENAI_KEY, FAKE_KEY, OPENAI_ID, 'gpt-5-nano'])
      expect(textReply).not.toContain(secret);
  });

  it('TEST_KEY from the settings page lists models with the profile key (GET, free)', async () => {
    seedProviders(area, [profile(OPENAI_ID, 'openai')], {});
    fetcher.mockResolvedValueOnce(
      jsonResponse(200, {
        object: 'list',
        data: [{ id: 'gpt-5-nano' }, { id: 'text-embedding-3-small' }],
      }),
    );
    const { reply } = await send({ type: TEST_KEY, credentialId: OPENAI_ID });
    expect(reply).toEqual({ ok: true, models: 1 });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init!.method).toBe('GET');
    expect(JSON.stringify(reply)).not.toContain(OPENAI_KEY);
  });

  it('deleting the key of a running request stops it locally (no other key is tried)', async () => {
    await saveSettings(
      area,
      normalizeSettings({ correction: { consent: true } }),
    );
    seedProviders(area, [profile(OPENAI_ID, 'openai')], {
      default: { credentialId: OPENAI_ID, modelId: 'gpt-5-nano' },
    });
    fetcher.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
          // The user deletes the profile in the settings page meanwhile.
          area.data.set(PROVIDERS_KEY, {
            schemaVersion: 1,
            revision: 2,
            profiles: [],
            routes: {
              default: { credentialId: OPENAI_ID, modelId: 'gpt-5-nano' },
            },
          });
          area.data.set(SECRETS_KEY, { schemaVersion: 1, secrets: {} });
          onStorageChanged({ [PROVIDERS_KEY]: {}, [SECRETS_KEY]: {} }, 'local');
        }),
    );
    const { reply } = await send(
      { type: CORRECT_TEXT, text: 'Fixd text' },
      contentSender,
    );
    expect(reply).toMatchObject({ ok: false, code: 'ROUTE_CHANGED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('V5.8 usage limits', () => {
  const limit = (dailyTestAttemptLimit: number) =>
    saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
        safety: { dailyTestAttemptLimit },
      }),
    );

  it('INV-01/INV-02/RACE-025: at the cap a page gets a sanitized refusal and nothing is sent', async () => {
    await limit(1);
    fetcher.mockResolvedValueOnce(correctionReply(false, 'Bonjour.'));
    const first = await send(
      { type: CORRECT_TEXT, text: 'Bonjour.' },
      contentSender,
    );
    expect(first.reply).toMatchObject({
      ok: true,
      notice: { level: 100, scope: 'global', used: 1, max: 1 },
    });
    // A new tab or frame of the same browser profile shares the same ledger.
    const second = await send(
      { type: CORRECT_TEXT, text: 'Bonjour.' },
      { ...contentSender, tab: { id: 8 } as chrome.tabs.Tab },
    );
    expect(second.reply).toMatchObject({
      ok: false,
      code: 'QUOTA_EXCEEDED',
      quota: {
        blocked: true,
        scope: 'global',
        period: 'daily',
        used: 1,
        max: 1,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second.reply)).not.toMatch(/SENTINEL|Bonjour/);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('INV-07/POL-027/T06: with AI paused, text shortcuts still reach the page; generations are refused', async () => {
    await limit(20);
    area.data.set('correctly.v5.shortcuts', {
      schemaVersion: 2,
      revision: 1,
      enabled: true,
      shortcuts: [
        {
          id: 'a',
          trigger: 'bjr',
          replacement: 'Bonjour',
          enabled: true,
          protectTriggerInAi: true,
          protectReplacementInAi: false,
        },
      ],
    });
    // The worker created the limits at startup; pause them as the page does.
    const quota = new QuotaStore(globalThis.indexedDB);
    await vi.waitFor(async () =>
      expect((await quota.snapshot(Date.now(), [])).policy).not.toBeNull(),
    );
    const { policy } = await quota.snapshot(Date.now(), []);
    await quota.savePolicy(
      { ...policy!, pauseAll: true },
      policy!.revision,
      Date.now(),
    );
    const config = await send({ type: PAGE_CONFIG }, contentSender);
    expect(config.reply).toMatchObject({
      shortcuts: [{ trigger: 'bjr', replacement: 'Bonjour' }],
    });
    const refused = await send(
      { type: CORRECT_TEXT, text: 'bjr' },
      contentSender,
    );
    expect(refused.reply).toMatchObject({ ok: false, code: 'AI_PAUSED' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (await quota.snapshot(Date.now(), [])).usage['global:all|daily'],
    ).toEqual({
      counted: 0,
      reserved: 0,
    });
  });

  it('UX-014/NOTE-018: "Manage limits" opens only the fixed settings section, from our content script only', async () => {
    const { handled } = await send({ type: OPEN_LIMITS }, contentSender);
    expect(handled).toBe(false);
    expect(createTab).toHaveBeenCalledExactlyOnceWith({
      url: ORIGIN + 'src/options/options.html#usage-limits',
    });
    for (const [message, sender] of [
      [{ type: OPEN_LIMITS, url: 'https://evil.example' }, contentSender],
      [{ type: OPEN_LIMITS }, { ...contentSender, id: 'other' }],
      [{ type: OPEN_LIMITS }, { id: ID }],
    ] as [unknown, chrome.runtime.MessageSender][])
      await send(message, sender);
    expect(createTab).toHaveBeenCalledTimes(1);
  });

  it('SEC-001/002/003/012: pages cannot raise limits, reset usage or pick a key', async () => {
    await limit(1);
    for (const message of [
      { type: 'correctly.v5.setQuota', max: 1_000_000 },
      { type: 'correctly.v5.resetUsage' },
      { type: CORRECT_TEXT, text: 'x', remaining: 99 },
      { type: CORRECT_TEXT, text: 'x', credentialId: OPENAI_ID },
      { type: CORRECT_TEXT, text: 'x', operationId: 'operation-1' },
      { type: CORRECT_TEXT, text: 'x', quota: { max: 1_000_000 } },
    ]) {
      const { handled, reply } = await send(message, contentSender);
      expect(handled).toBe(false);
      expect(reply).toBeUndefined();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('V5.10 SEC-005/006/007: a content script cannot run settings-only actions, read a key, fetch a URL or reset usage', async () => {
    await limit(1);
    const stored = area.dump();
    for (const message of [
      { type: TEST_CONNECTION, slot: 'default' },
      { type: TEST_KEY, credentialId: OPENAI_ID },
      { type: 'correctly.v5.getApiKey' },
      { type: 'correctly.v5.getSecret', credentialId: OPENAI_ID },
      { type: 'correctly.v5.fetchUrl', url: 'https://evil.example/' },
      { type: 'correctly.v5.resetQuota' },
      { type: 'correctly.v5.writeStorage', key: 'x', value: 1 },
    ]) {
      const { handled, reply } = await send(message, contentSender);
      expect(handled).toBe(false);
      expect(reply).toBeUndefined();
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(area.dump()).toBe(stored);
  });
});

describe('V5.9 statistics', () => {
  it('AP/SEC: an Apply from the requesting frame is recorded once; forged ones are ignored', async () => {
    await saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        correction: { consent: true },
      }),
    );
    fetcher.mockResolvedValueOnce(correctionReply(true, 'Bonjour.'));
    const { reply } = await send(
      { type: CORRECT_TEXT, text: 'Bonjour' },
      contentSender,
    );
    const operationId = (reply as { operationId: string }).operationId;
    expect(operationId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    const quota = new QuotaStore(globalThis.indexedDB);
    const events = async () =>
      (await quota.history(0, Date.now() + 60_000, Date.now())).events;
    for (const [message, sender] of [
      [
        { type: AI_EDIT, operationId, action: 'applied' },
        { ...contentSender, tab: { id: 99 } as chrome.tabs.Tab },
      ],
      [
        { type: AI_EDIT, operationId, action: 'applied' },
        { ...contentSender, frameId: 4 },
      ],
      [{ type: AI_EDIT, operationId, action: 'applied' }, optionsSender],
      [
        { type: AI_EDIT, operationId, action: 'applied', count: 5 },
        contentSender,
      ],
      [
        { type: AI_EDIT, operationId: '../x', action: 'applied' },
        contentSender,
      ],
      [{ type: AI_EDIT, operationId, action: 'copied' }, contentSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      const { handled } = await send(message, sender);
      expect(handled).toBe(false);
    }
    await vi.waitFor(async () => expect(await events()).toEqual([]));
    for (let i = 0; i < 3; i++)
      expect(
        (
          await send(
            { type: AI_EDIT, operationId, action: 'applied' },
            contentSender,
          )
        ).handled,
      ).toBe(false);
    await vi.waitFor(async () =>
      expect((await events()).map((e) => e.action)).toEqual(['applied']),
    );
    // INV-19: recording an edit never contacts a provider.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await events())).not.toMatch(/Bonjour|SENTINEL/);
  });
});

describe('5.17 account backup', () => {
  it('answers a cloud request from the settings page only, and signed out sends nothing', async () => {
    const request = { type: 'correctly.v5.cloudBackupNow' };
    const { handled, reply } = await send(request);
    expect(handled).toBe(true);
    // Not signed in: nothing to back up, and no request to Google/Firebase.
    expect(reply).toEqual({ ok: true });
    expect(fetcher).not.toHaveBeenCalled();
    for (const [message, sender] of [
      [request, contentSender],
      [{ ...request, extra: 1 }, optionsSender],
      [{ type: 'correctly.v5.cloudSignIn', extra: 1 }, optionsSender],
    ] as [unknown, chrome.runtime.MessageSender][]) {
      expect((await send(message, sender)).handled).toBe(false);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('a stored session never reaches a page: PAGE_CONFIG has no token', async () => {
    area.data.set('correctly.v5.cloudSession', {
      uid: 'u1',
      email: 'me@example.com',
      refreshToken: 'REFRESH_SENTINEL',
      idToken: 'ID_SENTINEL',
      expiresAt: Date.now() + 3_600_000,
    });
    const { reply } = await send({ type: PAGE_CONFIG }, contentSender);
    expect(reply).toBeDefined();
    expect(JSON.stringify(reply)).not.toMatch(/SENTINEL|me@example\.com/);
  });
});

describe('V6.1 real-time messages', () => {
  // Earlier tests may leave queued one-shot answers behind.
  beforeEach(() => {
    fetcher.mockReset();
  });
  const checkMessage = {
    type: 'correctly.v5.checkText',
    text: 'Les chat mange.',
    context: '',
  };
  const enableApi = () =>
    saveSettings(
      area,
      normalizeSettings({
        gemini: { apiKey: FAKE_KEY },
        triggers: { realtime: true },
        realtime: { engine: 'api', apiConsent: true },
      }),
    );

  it('CHECK_TEXT: only the page script of this extension, only with consent', async () => {
    await saveSettings(
      area,
      normalizeSettings({ gemini: { apiKey: FAKE_KEY } }),
    );
    const refused = await send(checkMessage, contentSender);
    expect(refused.reply).toMatchObject({
      ok: false,
      code: 'CONSENT_REQUIRED',
    });
    await enableApi();
    // Not from the options page or any other sender: ignored, no network.
    await send(checkMessage, optionsSender);
    const gemini = () =>
      fetcher.mock.calls.filter(([url]) =>
        (url as string).includes('generativelanguage'),
      );
    expect(gemini()).toHaveLength(0);
    const answer = jsonResponse(
      200,
      geminiOk(
        JSON.stringify({
          issues: [
            { original: 'chat', suggestions: ['chats'], kind: 'grammar' },
          ],
        }),
      ),
    );
    fetcher.mockImplementation((url) =>
      (url as string).includes('generativelanguage')
        ? Promise.resolve(answer)
        : Promise.reject(new Error('unexpected host')),
    );
    const { reply } = await send(checkMessage, contentSender);
    expect(reply).toMatchObject({
      ok: true,
      issues: [{ start: 4, end: 8, original: 'chat' }],
    });
    expect(gemini()).toHaveLength(1);
  });

  it('CHECK_TEXT: a malformed payload never reaches the network', async () => {
    await enableApi();
    for (const message of [
      { ...checkMessage, extra: 1 },
      { type: checkMessage.type, text: checkMessage.text },
      { ...checkMessage, text: '' },
      { ...checkMessage, text: 'a'.repeat(1001) },
    ])
      await send(message, contentSender);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ADD_WORD: the page script adds a word; others and bad words are ignored', async () => {
    const add = (word: unknown, sender = contentSender) =>
      send({ type: 'correctly.v5.addWord', word }, sender);
    await add('Correctly');
    await add('correctly');
    await add('two words' + String.fromCharCode(10) + 'line');
    await add('x'.repeat(65));
    await add(5);
    await add('Intruder', optionsSender);
    await vi.waitFor(() =>
      expect(area.data.get('correctly.v5.dictionary')).toEqual({
        words: ['Correctly'],
      }),
    );
  });

  it('PAGE_CONFIG gives the page the engine, skipped sites and the dictionary', async () => {
    area.data.set('correctly.v5.dictionary', { words: ['Correctly', 'Lyon'] });
    await saveSettings(
      area,
      normalizeSettings({
        triggers: { realtime: true },
        realtime: {
          engine: 'api',
          apiConsent: false,
          disabledSites: ['mail.example.com'],
        },
      }),
    );
    const { reply } = await send({ type: PAGE_CONFIG }, contentSender);
    expect(reply).toMatchObject({
      realtime: true,
      // No consent: the API engine is never offered to the page.
      realtimeEngine: 'auto',
      realtimeDisabledSites: ['mail.example.com'],
      realtimeTiming: 'live',
      dictionary: ['Correctly', 'Lyon'],
    });
  });
});
