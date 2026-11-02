import { cloudConfig } from '../shared/cloud-config';
import { SELECTION_BUTTON_OFF, SMART_BUTTON_OFF } from '../shared/contracts';
import { loadKeybindings } from '../shared/keybindings';
import { QUOTA_CHANNEL, browserQuotaStore } from '../shared/quota-store';
import { loadShortcuts } from '../shared/shortcuts';
import { browserStorage, loadSettings } from '../shared/storage';
import { LocalEngine } from '../content/local-engine';
import { confirmDialog } from './dialog';
import { KeyboardSection } from './keyboard-ui';
import { LimitsSection } from './limits-ui';
import { resolveLocale, type Locale } from '../shared/locale';
import { localizePage } from './i18n-dom';
import { OPTIONS } from './messages';
import { installNav } from './nav';
import { StatsSection } from './stats-ui';
import { ProvidersSection } from './providers-ui';
import { SettingsPage } from './settings-ui';
import { ShortcutsSection } from './shortcuts-ui';
import { AccountSection } from './account-ui';

// One page of the settings at a time (sidebar + URL hash).
installNav(document, window);
const version = document.getElementById('app-version');
if (version) version.textContent = chrome.runtime.getManifest().version;

const area = browserStorage();
const ALL_SITES = { origins: ['<all_urls>'] };
/**
 * All-sites access stays while the right-edge handle, the translate button,
 * text shortcuts or Correctly's own keyboard shortcuts need it.
 */
const releaseSiteAccess = async () => {
  const [settings, shortcuts, keys] = await Promise.all([
    loadSettings(area),
    loadShortcuts(area),
    loadKeybindings(area),
  ]);
  if (
    !settings.triggers.smartButton &&
    !settings.triggers.selectionButton &&
    !settings.triggers.realtime &&
    !shortcuts.store.enabled &&
    !keys.enabled
  )
    await chrome.permissions.remove(ALL_SITES);
};

/** 5.13: everything below is shown in the interface language. */
function start(locale: Locale): void {
  localizePage(document, OPTIONS[locale], locale);
  const page = new SettingsPage(document, {
    locale,
    area,
    confirm: (question) => window.confirm(question),
    openShortcuts: () =>
      void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }),
    // The worker (re)registers or unregisters the script when the setting
    // changes; this page only handles the permission and open tabs.
    enableSmartButton: () => chrome.permissions.request(ALL_SITES),
    // The whole page re-renders in the new language.
    onLanguageChanged: () => window.location.reload(),
    enableSelectionButton: () => chrome.permissions.request(ALL_SITES),
    localStatus: () => new LocalEngine(globalThis, locale).status(),
    download: (filename, text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: filename,
      });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    enableRealtime: () => chrome.permissions.request(ALL_SITES),
    disableRealtime: releaseSiteAccess,
    confirmRealtimeApi: (question, action) =>
      confirmDialog(document, {
        question,
        confirm: action,
        cancel: OPTIONS[locale].cancel,
      }),
    disableSelectionButton: async () => {
      for (const tab of await chrome.tabs.query({}))
        if (typeof tab.id === 'number')
          void chrome.tabs
            .sendMessage(tab.id, { type: SELECTION_BUTTON_OFF })
            .catch(() => undefined);
      await releaseSiteAccess();
    },
    disableSmartButton: async () => {
      for (const tab of await chrome.tabs.query({}))
        if (typeof tab.id === 'number')
          void chrome.tabs
            .sendMessage(tab.id, { type: SMART_BUTTON_OFF })
            .catch(() => undefined);
      await releaseSiteAccess();
    },
  });

  // Messages carry a route slot or profile ID, never a key.
  const providers = new ProvidersSection(document, {
    locale,
    area,
    confirm: (question) => window.confirm(question),
    send: (message) => chrome.runtime.sendMessage(message),
  });

  const shortcuts = new ShortcutsSection(document, {
    locale,
    area,
    confirm: (question, action) =>
      confirmDialog(document, {
        question,
        confirm: action,
        cancel: OPTIONS[locale].cancel,
      }),
    requestSiteAccess: () => chrome.permissions.request(ALL_SITES),
    hasSiteAccess: () => chrome.permissions.contains(ALL_SITES),
    releaseSiteAccess,
    download: (filename, text) => {
      const url = URL.createObjectURL(
        new Blob([text], { type: 'application/json' }),
      );
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: filename,
      });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  // Browser command shortcuts (read-only) and Correctly's own in-page keys.
  const keyboard = new KeyboardSection(document, {
    locale,
    area,
    getCommands: async () =>
      (await chrome.commands.getAll()).map((command) => ({
        name: command.name ?? '',
        shortcut: command.shortcut ?? '',
        description: command.description,
      })),
    requestSiteAccess: () => chrome.permissions.request(ALL_SITES),
    hasSiteAccess: () => chrome.permissions.contains(ALL_SITES),
    releaseSiteAccess,
  });
  // Back from chrome://extensions/shortcuts: show the new combinations.
  window.addEventListener('focus', () => void keyboard.refreshCommands());

  // 5.17: the account page reads status; the worker does the network work.
  const account = new AccountSection(document, {
    locale,
    area,
    configured: cloudConfig() !== null,
    send: (message) => chrome.runtime.sendMessage(message),
    confirm: (question, action) =>
      confirmDialog(document, {
        question,
        confirm: action,
        cancel: OPTIONS[locale].cancel,
      }),
  });

  const quota = browserQuotaStore();
  const limits = new LimitsSection(document, {
    locale,
    area,
    quota,
    confirm: (question) => window.confirm(question),
    timeZones: () => {
      try {
        return Intl.supportedValuesOf('timeZone');
      } catch {
        return [];
      }
    },
  });

  const download = (filename: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: filename,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const stats = new StatsSection(document, {
    locale,
    area,
    quota,
    confirm: (question) => window.confirm(question),
    download,
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    page.onStorageChanged(Object.keys(changes));
    providers.onStorageChanged(Object.keys(changes));
    shortcuts.onStorageChanged(Object.keys(changes));
    keyboard.onStorageChanged(Object.keys(changes));
    limits.onStorageChanged(Object.keys(changes));
    account.onStorageChanged(Object.keys(changes));
  });

  // Usage changes come from the worker or another settings tab (IndexedDB).
  if (typeof BroadcastChannel === 'function')
    new BroadcastChannel(QUOTA_CHANNEL).addEventListener('message', () => {
      void limits.refresh();
      void stats.refresh();
    });

  // Never leave a revealed key on screen when the tab is hidden or left.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') providers.hideKey();
  });
  window.addEventListener('pagehide', () => providers.hideKey(true));

  // Day/week/month rollover and requests in progress: re-read the local usage
  // records (no network access).
  setInterval(() => {
    void limits.refresh();
    void stats.refresh();
  }, 60_000);

  void page.init();
  void providers.init();
  void shortcuts.init();
  void keyboard.init();
  void account.init();
  void limits.init();
  void stats.init();
}

void loadSettings(area)
  .then((settings) => resolveLocale(settings.ui.language))
  .catch(() => resolveLocale('auto'))
  .then(start);
