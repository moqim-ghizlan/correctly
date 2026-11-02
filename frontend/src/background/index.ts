import {
  CORRECT_COMMAND,
  OPEN_COMMAND,
  OPEN_LIMITS,
  OPEN_MODAL,
  OPEN_SETTINGS,
  isAiEditRequest,
  isHandlePositionRequest,
  isOpenTranslationRequest,
  PAGE_CONFIG,
  REWRITE_COMMAND,
  TRANSLATE_COMMAND,
  isCorrectTextRequest,
  isTestConnectionRequest,
  isTestKeyRequest,
  type ConnectionResult,
} from '../shared/contracts';
import { errorMessage, isRetryable } from '../shared/errors';
import {
  PROVIDERS_KEY,
  SECRETS_KEY,
  loadProviders,
  migrateLegacyKey,
  resolveRoute,
  type TaskKind,
} from '../shared/providers';
import { DEFAULT_FORMALITY, isRewriteTextRequest } from '../shared/rewrite';
import { SHORTCUTS_KEY, loadShortcuts } from '../shared/shortcuts';
import {
  KEYBINDINGS_KEY,
  isKeyCommandRequest,
  loadKeybindings,
} from '../shared/keybindings';
import { resolveLocale, type Locale } from '../shared/locale';
import { addWord, loadDictionary } from '../shared/dictionary';
import { isAddWordRequest, isCheckTextRequest } from '../shared/realtime';
import { isSummarizeTextRequest } from '../shared/summary';
import { isExtractTextRequest, isImageConsentRequest } from '../shared/ocr';
import { captureArea, chromeCaptureDeps } from './capture';
import { isCloudRequest } from '../shared/cloud';
import { isTranslateTextRequest } from '../shared/translate';
import {
  browserStorage,
  loadHandle,
  loadSettings,
  saveSettings,
  saveHandle,
  STORAGE_KEYS,
  type StorageArea,
} from '../shared/storage';
import { ConnectionController } from './connection-controller';
import { CloudEngine, type CloudArea } from './cloud';

// No logging here on purpose: nothing in this worker should ever print a
// key, a request, the user's text or a provider response.

/** Built separately as classic scripts (see vite.content.config.ts). */
export const CONTENT_SCRIPT = 'content.js';
export const SMART_SCRIPT = 'smart.js';
export const SMART_SCRIPT_ID = 'correctly-smart-button';
export const MENU_PARENT = 'correctly';
export const MENU_CORRECT = 'correctly-correct-selection';
export const MENU_REWRITE = 'correctly-rewrite-selection';
export const MENU_TRANSLATE = 'correctly-translate-selection';
export const MENU_TRANSLATE_REWRITE = 'correctly-translate-rewrite-selection';
const ALL_SITES = ['<all_urls>'];
/** 5.13: context menu titles in the interface language. */
const MENU_TITLES: Record<
  Locale,
  Record<'correct' | 'rewrite' | 'translate' | 'translateRewrite', string>
> = {
  en: {
    correct: 'Correct selected text',
    rewrite: 'Rewrite selected text…',
    translate: 'Translate selected text…',
    translateRewrite: 'Translate & rewrite…',
  },
  fr: {
    correct: 'Corriger le texte sélectionné',
    rewrite: 'Reformuler le texte sélectionné…',
    translate: 'Traduire le texte sélectionné…',
    translateRewrite: 'Traduire et reformuler…',
  },
};

/** "Manage limits" opens this fixed extension page, nothing else. */
export const LIMITS_PAGE = 'src/options/options.html#usage-limits';

/** Only pages bundled in this extension may talk to the worker. */
export function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== runtimeId) return false;
  const url = typeof sender.url === 'string' ? sender.url : '';
  return url.startsWith(extensionOrigin);
}

/**
 * Our injected content script, in a tab's top frame. Web pages cannot message
 * this extension at all (no externally_connectable), so sender.id is ours.
 */
export function isContentScriptSender(
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
): boolean {
  return (
    sender.id === runtimeId &&
    typeof sender.tab?.id === 'number' &&
    typeof sender.frameId === 'number'
  );
}

/** Tab and frame of a content-script sender (checked by the caller). */
const origin = (sender: chrome.runtime.MessageSender) => ({
  tabId: sender.tab?.id ?? -1,
  frameId: sender.frameId ?? -1,
});

export type Trigger =
  'toolbar' | 'keyboard' | 'contextMenu' | 'smartButton' | 'selectionButton';

/** 5.15: open the window on Translation with this text (translate button). */
export interface OpenWith {
  text: string;
  generate: boolean;
  capture?: boolean;
}
type Action = 'correct' | 'rewrite' | 'translate' | 'translateRewrite';
/** V5.11: 'open' shows the modal (four tabs since V5.12) (handle, Ctrl+M, toolbar icon). */
type Request = Action | 'open' | 'capture';
type Intent = Request | 'unreachable' | 'rewriteOff';

const MENU_ACTIONS: Record<string, Action> = {
  [MENU_CORRECT]: 'correct',
  [MENU_REWRITE]: 'rewrite',
  [MENU_TRANSLATE]: 'translate',
  [MENU_TRANSLATE_REWRITE]: 'translateRewrite',
};
const COMMAND_ACTIONS: Record<string, Action> = {
  [CORRECT_COMMAND]: 'correct',
  [REWRITE_COMMAND]: 'rewrite',
  [TRANSLATE_COMMAND]: 'translate',
};
const ACTION_TASKS: Record<Action, TaskKind> = {
  correct: 'correction',
  rewrite: 'rewrite',
  translate: 'translation',
  translateRewrite: 'translateRewrite',
};

/**
 * True when this action's saved route is usable now (no network). The modal
 * needs at least one of its four actions.
 */
async function routeReady(
  area: StorageArea,
  action: Request,
): Promise<boolean> {
  await migrateLegacyKey(area).catch(() => undefined);
  const { store, secrets, damaged } = await loadProviders(area);
  const tasks: TaskKind[] =
    action === 'open'
      ? ['correction', 'rewrite', 'translation', 'summary']
      : action === 'capture'
        ? ['ocr']
        : [ACTION_TASKS[action]];
  return (
    !damaged && tasks.some((task) => resolveRoute(store, secrets, task).ok)
  );
}

/**
 * Loads content.js into one frame, then runs it with the intent and the
 * picker defaults (style IDs, language preferences and whether rewrite is
 * on; never the key).
 */
async function inject(
  tabId: number,
  frameIds: number[] | undefined,
  intent: Intent,
  styles: string[] = [],
  translation: unknown = null,
  rewriteEnabled = true,
  locale: Locale = 'en',
  formality: number = DEFAULT_FORMALITY,
  openWith: OpenWith | null = null,
): Promise<void> {
  const target = frameIds ? { tabId, frameIds } : { tabId };
  await chrome.scripting.executeScript({ target, files: [CONTENT_SCRIPT] });
  await chrome.scripting.executeScript({
    target,
    func: (
      intent: string,
      styles: string[],
      translation: unknown,
      rewriteEnabled: boolean,
      locale: string,
      formality: number,
      openWith: OpenWith | null,
    ) => {
      (
        globalThis as {
          correctlyRun?: (
            intent: string,
            styles: string[],
            translation: unknown,
            rewriteEnabled: boolean,
            locale: string,
            formality: number,
            openWith: OpenWith | null,
          ) => void;
        }
      ).correctlyRun?.(
        intent,
        styles,
        translation,
        rewriteEnabled,
        locale,
        formality,
        openWith,
      );
    },
    args: [
      intent,
      styles,
      translation,
      rewriteEnabled,
      locale,
      formality,
      openWith,
    ],
  });
}

/**
 * The one path used by every trigger: inject content.js into the frame the
 * user acted in (activeTab is granted by the gesture, or site access by the
 * smart button) and run correction or open a picker. A disabled trigger
 * does nothing. Without consent or a usable route for that action (no
 * other key or provider is ever tried), or on pages Chrome does not let
 * extensions script (chrome://, Web Store, PDF viewer), the settings open.
 */
export async function correctInTab(
  tab: chrome.tabs.Tab | undefined,
  area: StorageArea,
  trigger: Trigger,
  frameId = 0,
  requested: Request = 'correct',
  openWith: OpenWith | null = null,
): Promise<void> {
  let tabId: number | undefined;
  // The capture shortcut opens the window and starts the area picker there.
  let intent: Intent = requested === 'capture' ? 'open' : requested;
  if (requested === 'capture')
    openWith = { text: '', generate: false, capture: true };
  let styles: string[] = [];
  let translation: unknown = null;
  let rewriteEnabled = true;
  let formality: number = DEFAULT_FORMALITY;
  let locale: Locale = resolveLocale('auto');
  try {
    const settings = await loadSettings(area);
    locale = resolveLocale(settings.ui.language);
    if (trigger !== 'toolbar' && !settings.triggers[trigger]) return;
    if (intent === 'rewrite' && !settings.rewrite.enabled)
      intent = 'rewriteOff';
    rewriteEnabled = settings.rewrite.enabled;
    if (intent !== 'correct') {
      // Translate & rewrite reuses the same default styles as Rewrite.
      styles = settings.rewrite.defaultStyles;
      formality = settings.rewrite.formality;
      translation = settings.translation;
    }
    if (
      settings.correction.consent &&
      (intent === 'rewriteOff' || (await routeReady(area, requested)))
    )
      tabId = tab?.id;
  } catch {
    // Fall through to the settings page.
  }
  if (typeof tabId !== 'number') return chrome.runtime.openOptionsPage();
  try {
    return await inject(
      tabId,
      [frameId],
      intent,
      styles,
      translation,
      rewriteEnabled,
      locale,
      formality,
      intent === 'open' ? openWith : null,
    );
  } catch {
    if (frameId === 0) return chrome.runtime.openOptionsPage();
  }
  // A frame embedded from another site is outside activeTab: say so in the
  // top frame instead of correcting anything there.
  try {
    await inject(tabId, undefined, 'unreachable', [], null, true, locale);
  } catch {
    await chrome.runtime.openOptionsPage();
  }
}

/** Exactly `{ type }` with this type: the data-free page requests. */
const isBare = (value: unknown, type: string): boolean =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).join() === 'type' &&
  (value as { type?: unknown }).type === type;

/** Idempotent: exactly one parent and its items after any install/update. */
export async function installMenu(area: StorageArea): Promise<void> {
  const settings = await loadSettings(area);
  const titles = MENU_TITLES[resolveLocale(settings.ui.language)];
  await chrome.contextMenus.removeAll();
  const ignore = () => void chrome.runtime.lastError;
  chrome.contextMenus.create(
    {
      id: MENU_PARENT,
      title: 'Correctly',
      contexts: ['editable'],
      visible: settings.triggers.contextMenu,
    },
    ignore,
  );
  chrome.contextMenus.create(
    {
      id: MENU_CORRECT,
      parentId: MENU_PARENT,
      title: titles.correct,
      contexts: ['editable'],
    },
    ignore,
  );
  chrome.contextMenus.create(
    {
      id: MENU_REWRITE,
      parentId: MENU_PARENT,
      title: titles.rewrite,
      contexts: ['editable'],
      visible: settings.rewrite.enabled,
    },
    ignore,
  );
  for (const [id, title] of [
    [MENU_TRANSLATE, titles.translate],
    [MENU_TRANSLATE_REWRITE, titles.translateRewrite],
  ] as const)
    chrome.contextMenus.create(
      { id, parentId: MENU_PARENT, title, contexts: ['editable'] },
      ignore,
    );
}

/**
 * What the opt-in page script may do: show the smart button, and expand which
 * shortcuts (enabled ones only, when expansion is on). Never the settings.
 */
export async function pageConfig(area: StorageArea) {
  const [settings, loaded, handle, keys, dictionary] = await Promise.all([
    loadSettings(area),
    loadShortcuts(area),
    loadHandle(area),
    loadKeybindings(area),
    loadDictionary(area),
  ]);
  const { store } = loaded;
  return {
    // 5.13: the handle's labels follow the interface language.
    locale: resolveLocale(settings.ui.language),
    smartButton: settings.triggers.smartButton,
    // 5.15: the translate button on selected text, and the bubble's defaults.
    selectionButton: settings.triggers.selectionButton,
    // V6.1: real-time correction; the API engine only with its consent
    // (the worker refuses every check without it anyway).
    realtime: settings.triggers.realtime,
    realtimeEngine:
      settings.realtime.engine === 'api' && !settings.realtime.apiConsent
        ? 'auto'
        : settings.realtime.engine,
    realtimeDisabledSites: settings.realtime.disabledSites,
    realtimeReplaceKey: settings.realtime.replaceKey,
    realtimeReplaceAllKey: settings.realtime.replaceAllKey,
    dictionary: dictionary.words,
    translation: {
      target: settings.translation.target,
      variants: settings.translation.variants,
      favorites: settings.translation.favorites,
    },
    handleY: handle.yRatio,
    // Correctly's own keyboard shortcuts: only when on (and keyboard allowed).
    keybindings:
      keys.enabled && settings.triggers.keyboard ? keys.bindings : {},
    shortcuts:
      store.enabled && !loaded.damaged
        ? store.shortcuts
            .filter((s) => s.enabled)
            .map(({ trigger, replacement }) => ({ trigger, replacement }))
        : [],
  };
}

/** Keeps the opt-in page script registered across updates. */
export async function syncSmartScript(area: StorageArea): Promise<void> {
  const [settings, loaded, keys] = await Promise.all([
    loadSettings(area),
    loadShortcuts(area),
    loadKeybindings(area),
  ]);
  const granted = await chrome.permissions.contains({ origins: ALL_SITES });
  await chrome.scripting
    .unregisterContentScripts({ ids: [SMART_SCRIPT_ID] })
    .catch(() => undefined);
  const keysOn = keys.enabled && Object.keys(keys.bindings).length > 0;
  if (
    (settings.triggers.smartButton ||
      settings.triggers.selectionButton ||
      settings.triggers.realtime ||
      loaded.store.enabled ||
      keysOn) &&
    granted
  )
    await chrome.scripting.registerContentScripts([
      {
        id: SMART_SCRIPT_ID,
        matches: ALL_SITES,
        js: [SMART_SCRIPT],
        runAt: 'document_idle',
      },
    ]);
}

/**
 * After an install, update or reload the page script is not injected into
 * tabs that were already open: do it now, so their handle is not orphaned.
 * Only where the all-sites permission is granted and the script is wanted.
 */
async function injectSmartScriptIntoOpenTabs(): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [SMART_SCRIPT_ID],
  });
  if (registered.length === 0) return;
  const tabs = await chrome.tabs.query({ url: ALL_SITES });
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: [SMART_SCRIPT],
      })
      .catch(() => undefined);
  }
}

/**
 * V7.1: the separate consent to send an image of the selected area. The page
 * never writes storage: "grant" is done here, after the window's dialog.
 */
async function imageConsent(
  area: StorageArea,
  action: 'status' | 'grant',
): Promise<{ consent: boolean }> {
  const settings = await loadSettings(area);
  if (action === 'grant' && !settings.ocr.consent) {
    await saveSettings(area, { ...settings, ocr: { consent: true } });
    return { consent: true };
  }
  return { consent: settings.ocr.consent };
}

/** Dictionary writes from pages are serialized (read-modify-write). */
let dictionaryQueue: Promise<void> = Promise.resolve();

export function registerServiceWorker(
  area: StorageArea = browserStorage(),
  controller = new ConnectionController({ area }),
): void {
  const extensionOrigin = chrome.runtime.getURL('');
  // Keys are in storage.local, which Chrome exposes to content scripts by
  // default. Ours never read it (they ask the worker via PAGE_CONFIG), so
  // the whole area is restricted to extension pages and this worker.
  void chrome.storage.local
    .setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch(() => undefined);
  // 5.17: optional Google-account backup. Signed out (the default), the
  // engine makes no request at all; the session lives in storage.local.
  const cloud = new CloudEngine({
    local: area as CloudArea,
    launch: (url) =>
      chrome.identity.launchWebAuthFlow({ url, interactive: true }),
    redirectUri: chrome.identity.getRedirectURL(),
  });
  void cloud.reconcile().catch(() => undefined);
  void migrateLegacyKey(area).catch(() => undefined);
  // Usage limits: created/imported once, then requests a stopped worker left
  // behind are settled. Retried before the next request if this fails.
  void controller.reconcile().catch(() => undefined);

  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    let task: Promise<unknown>;
    const trusted = isTrustedSender(sender, chrome.runtime.id, extensionOrigin);
    if (trusted && isTestConnectionRequest(message))
      task = controller.testConnection(message.slot);
    else if (trusted && isTestKeyRequest(message))
      task = controller.testKey(message.credentialId);
    else if (trusted && isCloudRequest(message)) task = cloud.handle(message);
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isCorrectTextRequest(message)
    )
      task = controller.correct(message.text, origin(sender));
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isRewriteTextRequest(message)
    )
      task = controller.rewrite(
        message.text,
        message.styleIds,
        origin(sender),
        message.formality,
      );
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isTranslateTextRequest(message)
    )
      task = controller.translate(message, origin(sender));
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isSummarizeTextRequest(message)
    )
      task = controller.summarize(
        {
          text: message.text,
          target: message.target,
          variant: message.variant,
          length: message.length,
          format: message.format,
        },
        origin(sender),
      );
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isCheckTextRequest(message)
    )
      task = controller.check(
        { text: message.text, context: message.context },
        origin(sender),
      );
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isExtractTextRequest(message)
    )
      // V7.1: the rectangle is in the viewport of the frame that drew it, so
      // only the top frame of the tab is accepted. Only the sender's own tab
      // is captured, and only if it is the one in front (see captureArea).
      task =
        sender.frameId === 0
          ? controller.extractText(
              () =>
                captureArea(
                  sender.tab?.id ?? -1,
                  message.rect,
                  message.viewport,
                  chromeCaptureDeps(),
                ),
              origin(sender),
            )
          : Promise.resolve({
              ok: false,
              code: 'CAPTURE_FAILED',
              message: errorMessage('CAPTURE_FAILED'),
              retryable: isRetryable('CAPTURE_FAILED'),
            });
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isImageConsentRequest(message)
    )
      task = imageConsent(area, message.action);
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isAddWordRequest(message)
    ) {
      // Local dictionary only; the word is stored as typed (bounded).
      // One at a time, so two quick additions never overwrite each other.
      dictionaryQueue = dictionaryQueue
        .then(() => addWord(area, message.word))
        .then(
          () => undefined,
          () => undefined,
        );
      return false;
    } else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isAiEditRequest(message)
    ) {
      // Statistics only: checked against the request's own tab and frame.
      void controller
        .recordEdit(message.operationId, message.action, origin(sender))
        .catch(() => undefined);
      return false;
    } else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isBare(message, PAGE_CONFIG)
    )
      task = pageConfig(area);
    else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isBare(message, OPEN_LIMITS)
    ) {
      void chrome.tabs
        .create({ url: chrome.runtime.getURL(LIMITS_PAGE) })
        .catch(() => undefined);
      return false;
    } else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isBare(message, OPEN_SETTINGS)
    ) {
      // The modal's gear: the existing options page, nothing else.
      void chrome.runtime.openOptionsPage().catch(() => undefined);
      return false;
    } else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isKeyCommandRequest(message)
    ) {
      // One of Correctly's own shortcuts, pressed in that frame: the same
      // path as the browser command (keyboard trigger, consent, route).
      void correctInTab(
        sender.tab,
        area,
        'keyboard',
        sender.frameId,
        message.action,
      ).catch(() => undefined);
      return false;
    } else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isOpenTranslationRequest(message)
    ) {
      // 5.15 translate button: the window on Translation with this text
      // (the same path as the handle: setting, consent, route, frame).
      void correctInTab(
        sender.tab,
        area,
        'selectionButton',
        sender.frameId,
        'open',
        { text: message.text, generate: message.generate },
      ).catch(() => undefined);
      return false;
    } else if (
      isContentScriptSender(sender, chrome.runtime.id) &&
      isHandlePositionRequest(message)
    ) {
      // Only a bounded number is stored; this worker is its only writer.
      void saveHandle(area, {
        schemaVersion: 1,
        yRatio: message.yRatio,
      }).catch(() => undefined);
      return false;
    } else {
      // Right-edge handle → open the modal in that frame; nothing is replied.
      if (
        isContentScriptSender(sender, chrome.runtime.id) &&
        isBare(message, OPEN_MODAL)
      )
        void correctInTab(
          sender.tab,
          area,
          'smartButton',
          sender.frameId,
          'open',
        ).catch(() => undefined);
      return false;
    }
    void task
      .catch((): ConnectionResult => ({
        ok: false,
        code: 'UNKNOWN_ERROR',
        message: errorMessage('UNKNOWN_ERROR'),
        retryable: isRetryable('UNKNOWN_ERROR'),
      }))
      .then(reply);
    return true;
  });

  // V5.11: the toolbar icon and Ctrl+M open the in-page modal (no popup).
  chrome.action.onClicked.addListener((tab) => {
    void correctInTab(tab, area, 'toolbar', 0, 'open').catch(() => undefined);
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === OPEN_COMMAND) {
      void correctInTab(tab, area, 'keyboard', 0, 'open').catch(
        () => undefined,
      );
      return;
    }
    const action = COMMAND_ACTIONS[command];
    if (action)
      void correctInTab(tab, area, 'keyboard', 0, action).catch(
        () => undefined,
      );
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const action = MENU_ACTIONS[String(info.menuItemId)];
    if (action)
      void correctInTab(
        tab,
        area,
        'contextMenu',
        info.frameId ?? 0,
        action,
      ).catch(() => undefined);
  });
  chrome.runtime.onInstalled.addListener(() => {
    void migrateLegacyKey(area).catch(() => undefined);
    void installMenu(area).catch(() => undefined);
    void syncSmartScript(area)
      .then(injectSmartScriptIntoOpenTabs)
      .catch(() => undefined);
  });
  chrome.runtime.onStartup?.addListener(() => {
    void cloud.reconcile().catch(() => undefined);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // 5.17: back this computer's edits up after a quiet time.
    if (areaName === 'local') cloud.onLocalChanged(Object.keys(changes));
    if (
      areaName === 'local' &&
      (PROVIDERS_KEY in changes || SECRETS_KEY in changes)
    )
      void controller.onProvidersChanged().catch(() => undefined);
    if (
      areaName !== 'local' ||
      !(
        STORAGE_KEYS.settings in changes ||
        SHORTCUTS_KEY in changes ||
        KEYBINDINGS_KEY in changes
      )
    )
      return;
    void loadSettings(area)
      .then((settings) => {
        // 5.13: titles follow the interface language too.
        const titles = MENU_TITLES[resolveLocale(settings.ui.language)];
        return Promise.all([
          chrome.contextMenus.update(MENU_PARENT, {
            visible: settings.triggers.contextMenu,
          }),
          chrome.contextMenus.update(MENU_CORRECT, { title: titles.correct }),
          chrome.contextMenus.update(MENU_REWRITE, {
            visible: settings.rewrite.enabled,
            title: titles.rewrite,
          }),
          chrome.contextMenus.update(MENU_TRANSLATE, {
            title: titles.translate,
          }),
          chrome.contextMenus.update(MENU_TRANSLATE_REWRITE, {
            title: titles.translateRewrite,
          }),
        ]);
      })
      .catch(() => undefined);
    void syncSmartScript(area).catch(() => undefined);
  });
}
