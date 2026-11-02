// 5.13: wording of the settings page in English and French. Dynamic texts
// (status messages, confirmations, rows) live here; the static page text is
// in the `html` section, applied by localizePage() through data-i18n keys.
import type { KeyAction, BindingProblem } from '../shared/keybindings';
import type { Locale } from '../shared/locale';
import type { ProviderErrorCode } from '../shared/providers';
import type { ShortcutErrorCode } from '../shared/shortcuts';
import type { RangeError } from '../shared/stats';
import type { CloudDomainStatus, CloudErrorCode } from '../shared/cloud';
import { HTML_EN, HTML_FR, type HtmlKey } from './messages-html';

type Params = Record<string, string | number>;

export interface OptionsMessages {
  html: Record<HtmlKey, string>;
  documentTitle: string;
  // ---- general
  autoDetect: string;
  consentOn: string;
  consentOff: string;
  triggersSaved: string;
  sameLanguages: string;
  translationSaved: string;
  /** 5.16: more favorite languages than the menus show first. */
  tooManyFavorites: (max: number) => string;
  keepOneStyle: string;
  rewriteSaved: string;
  handleNoAccess: string;
  handleOn: string;
  handleOff: string;
  selectionNoAccess: string;
  selectionOn: string;
  selectionOff: string;
  realtimeNoAccess: string;
  realtimeOn: string;
  realtimeOff: string;
  realtimeKeyNone: string;
  realtimeKeyPress: string;
  realtimeKeySaved: (combo: string) => string;
  realtimeKeyRemoved: string;
  realtimeKeyDuplicate: (combo: string) => string;
  realtimeApiWarning: string;
  realtimeApiConfirm: string;
  realtimeApiOn: string;
  realtimeApiOff: string;
  realtimeNeedsSwitch: string;
  realtimeStatus: Record<
    'ready' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown',
    string
  >;
  realtimeSitesSaved: (count: number) => string;
  dictAdded: (word: string) => string;
  dictInvalid: string;
  dictFull: string;
  dictEmpty: string;
  dictRemove: (word: string) => string;
  dictRemoved: (word: string) => string;
  dictExported: string;
  languageSaved: (name: string) => string;
  // ---- providers
  providersDamaged: string;
  keysDropped: (count: number) => string;
  showKey: string;
  hideKey: string;
  showKeyLabel: string;
  hideKeyLabel: string;
  addKeyTitle: string;
  saveKey: string;
  keepKeyPlaceholder: string;
  editKeyTitle: (label: string) => string;
  saveChanges: string;
  keySaved: string;
  confirmReplaceKey: (label: string) => string;
  nothingChanged: string;
  keyReplaced: string;
  changesSaved: string;
  confirmDisable: (label: string, actions: string) => string;
  toggled: (label: string, enabled: boolean) => string;
  deleteImpact: (actions: string) => string;
  confirmDelete: (label: string, impact: string) => string;
  deleted: (label: string) => string;
  keyAccepted: (label: string, provider: string, models: number) => string;
  keyRefused: (label: string, message: string) => string;
  routeSaved: (slot: string) => string;
  defaultRemoved: string;
  routeDefault: (slot: string) => string;
  confirmTest: (slot: string) => string;
  tokensReported: (input: string, output: string) => string;
  modelAnswered: (
    provider: string,
    model: string,
    sample: string,
    at: string,
  ) => string;
  viaDefault: string;
  noDefaultRoute: string;
  needsDefault: string;
  keyGone: (via: string) => string;
  keyBlocked: (via: string, label: string) => string;
  modelNotValid: (via: string, provider: string) => string;
  // V7.1 text from an image
  noVision: (via: string) => string;
  imageConsentState: (on: boolean) => string;
  imageConsentReset: string;
  invalidModelId: string;
  chooseModel: string;
  notProviderModel: (provider: string) => string;
  notListed: string;
  unreviewed: (notListed: string) => string;
  createKeyIn: (site: string) => string;
  enabled: string;
  disabled: string;
  notChecked: string;
  acceptedOn: (at: string, models: number) => string;
  checkFailedOn: (at: string, message: string) => string;
  usedBy: (actions: string) => string;
  unused: string;
  checking: string;
  check: string;
  checkLabel: (label: string) => string;
  edit: string;
  editLabel: (label: string) => string;
  enable: string;
  disable: string;
  toggleLabel: (enable: boolean, label: string) => string;
  remove: string;
  removeLabel: (label: string) => string;
  apiKey: string;
  none: string;
  useDefault: string;
  disabledSuffix: string;
  deletedKeyOption: string;
  model: string;
  reviewed: string;
  save: string;
  saveRouteLabel: (slot: string) => string;
  testing: string;
  test: string;
  testLabel: (slot: string) => string;
  cancel: string;
  cancelRouteLabel: (slot: string) => string;
  providerError: (code: ProviderErrorCode, params: Params) => string;
  modelNote: (modelId: string, fallback: string) => string;
  // ---- limits
  totalScope: string;
  keyScope: (label: string, provider: string) => string;
  deletedKey: string;
  scopeHelp: Partial<Record<string, string>>;
  state: Record<
    'unavailable' | 'repair' | 'clock' | 'paused' | 'active',
    string
  >;
  usageUnavailableLong: string;
  limitName: (period: string, title: string) => string;
  capOn: (name: string) => string;
  capMax: (name: string) => string;
  aiRequests: string;
  usageUnavailable: string;
  inProgress: (count: string) => string;
  resets: (at: string) => string;
  offTracking: (used: string, progress: string, reset: string) => string;
  capState: Record<'over' | 'reached' | 'near' | 'available', string>;
  barLabel: (
    period: string,
    title: string,
    percent: number,
    used: string,
    max: string,
  ) => string;
  usageLine: (
    state: string,
    used: string,
    max: string,
    over: boolean,
    remaining: string,
    progress: string,
    reset: string,
  ) => string;
  theKey: (label: string) => string;
  aDeletedKey: string;
  dismiss: string;
  dismissLabel: (text: string) => string;
  deletedKeyLower: string;
  todayRow: (r: {
    action: string;
    who: string;
    model: string;
    attempts: number;
    completed: number;
    failed: number;
    unknown: number;
    input: number;
    output: number;
  }) => string;
  lostAnswers: (count: number) => string;
  trackingSince: (since: string) => string;
  unattributed: (count: number) => string;
  wholeNumber: (max: string) => string;
  alreadyUsed: (used: string) => string;
  belowUsed: (used: string) => string;
  unknownZone: string;
  keepTotal: string;
  confirmZone: (zone: string) => string;
  limitsSaved: string;
  limitsConflict: string;
  limitsInvalid: string;
  paused: string;
  resumed: string;
  pauseConflict: string;
  confirmRepair: string;
  repaired: string;
  confirmClock: (now: string) => string;
  clockConfirmed: string;
  // ---- statistics
  loading: string;
  chooseDates: string;
  statsUnavailable: string;
  statsReady: string;
  statsNone: string;
  deletedKeyShort: (suffix: string) => string;
  rangeLine: (from: string, to: string, zone: string) => string;
  allActions: string;
  allProviders: string;
  allModels: string;
  allKeys: string;
  coverageStart: (date: string) => string;
  coverageDeleted: (date: string) => string;
  coverageRetention: string;
  coverageClock: string;
  costNone: string;
  costNote: string;
  costComplete: (value: string, count: string) => [string, string];
  costPartial: (
    value: string,
    priced: string,
    total: string,
    missing: string,
  ) => [string, string];
  costUnknown: (missing: string) => [string, string];
  missingTokens: (count: string) => string;
  missingPrice: (count: string) => string;
  notAvailable: string;
  requestsDetail: (inProgress: string) => string;
  successDetail: (
    tasks: string,
    failed: string,
    lost: string,
    waiting: string,
  ) => string;
  appliedDetail: (undone: string) => string;
  tokensValue: (input: string, output: string) => string;
  unknownLower: string;
  notReported: string;
  zeroTokens: string;
  tokensDetail: (
    input: string,
    output: string,
    total: string,
    partial: boolean,
  ) => string;
  noRequest: string;
  dayBar: (date: string, count: number) => string;
  chartLabel: (from: string, to: string, total: number, max: number) => string;
  noData: string;
  ofTotal: (part: string, total: string) => string;
  unknownCost: string;
  coverage: Record<'complete' | 'unknown', string>;
  partialCoverage: (priced: string, total: string) => string;
  appliedByTask: (list: string) => string;
  allRequests: string;
  fromDate: (date: string) => string;
  priceSource: (official: boolean, label: string, checked: string) => string;
  completeCoverage: string;
  exported: (name: string) => string;
  enteredByMe: string;
  priceErrors: Record<
    'provider' | 'model' | 'input' | 'output' | 'cached' | 'date' | 'label',
    string
  >;
  confirmPrice: (from: string) => string;
  priceAdded: (model: string, from: string) => string;
  priceInvalid: string;
  chooseDate: string;
  confirmDeleteStats: (before: string) => string;
  statsDeleted: (count: string) => string;
  rangeError: (code: RangeError, max?: number) => string;
  // ---- text shortcuts
  shortcutsDamaged: string;
  v4Found: (count: number) => string;
  shortcutsNoAccess: string;
  shortcutsOn: string;
  shortcutsOff: string;
  shortcutUpdated: string;
  shortcutSaved: (trigger: string) => string;
  addShortcut: string;
  shortcutToggled: (trigger: string, enabled: boolean) => string;
  confirmDeleteShortcut: (trigger: string) => string;
  shortcutDeleted: (trigger: string) => string;
  backupDone: string;
  fileUnreadable: string;
  nothingModified: string;
  importSummary: (p: {
    total: number;
    added: number;
    identical: number;
    conflicts: number;
    policy: string;
    removed: number;
  }) => string;
  invalidImport: string;
  confirmReplaceAll: (count: number, removed: number) => string;
  /** Action button of the replace-all confirmation. */
  replaceAllAction: string;
  importDone: (
    added: number,
    replaced: number | null,
    removed: number,
  ) => string;
  tags: Record<'off' | 'protected' | 'replacementProtected', string>;
  shortcutError: (code: ShortcutErrorCode, params: Params) => string;
  // ---- keyboard shortcuts
  commands: Record<string, string>;
  keyAction: Record<KeyAction, string>;
  notSet: string;
  keysNoAccess: string;
  keysOn: string;
  keysOff: string;
  pressFor: (action: string) => string;
  keyCleared: (action: string) => string;
  noChange: string;
  keyUnusable: string;
  keyTaken: (combo: string, action: string) => string;
  bindingSaved: (combo: string, action: string, enabled: boolean) => string;
  pressCombination: string;
  noneBound: string;
  cancelRecord: string;
  modify: string;
  define: string;
  recordLabel: (verb: string, action: string) => string;
  clear: string;
  clearLabel: (action: string) => string;
  sameAsBrowser: (shortcut: string) => string;
  clashWith: (shortcut: string, action: string) => string;
  bindingProblem: (problem: BindingProblem, combo: string) => string;
  // ---- account backup (5.17)
  account: AccountMessages;
}

export interface AccountMessages {
  status: Record<CloudDomainStatus, string>;
  syncedAt: (time: string) => string;
  error: Record<CloudErrorCode, string>;
  notConfigured: string;
  signedOut: string;
  signedInAs: (email: string) => string;
  signedIn: string;
  signedOutDone: string;
  backedUp: string;
  restored: string;
  replaced: string;
  confirmRestore: string;
  restoreAction: string;
  passSet: string;
  passChange: string;
  passUnlock: string;
  passReplace: string;
  passMismatch: string;
  passSaved: string;
  unlocked: string;
  passNeedsAccount: string;
  confirmReplace: string;
  replaceAction: string;
  confirmDelete: string;
  deleteAction: string;
  deleted: string;
}

// ===================================================================== EN

const EN_PROVIDER_ERRORS: Record<ProviderErrorCode, (p: Params) => string> = {
  labelRequired: () => 'Give this key a name.',
  labelTooLong: (p) => `Use at most ${p.max} characters for the name.`,
  labelControl: () => 'The name must not contain control characters.',
  keyRequired: () => 'Paste an API key before saving.',
  keySpaces: () => 'The key must not contain spaces or line breaks.',
  keyChars: () => 'The key contains characters an API key never has.',
  keyLength: (p) =>
    `An API key has ${p.min}–${p.max} characters; check what you pasted.`,
  looksGoogle: () =>
    'This looks like a Google key. Choose Google Gemini as the provider.',
  looksOpenai: () =>
    'This looks like an OpenAI key. Choose OpenAI as the provider.',
  storeDamaged: () =>
    'Saved AI provider settings are damaged and were left untouched.',
  saveUnverified: () => 'Saving could not be verified. Reload and retry.',
  changedElsewhere: () =>
    'This key was changed or deleted in another window. The list was reloaded.',
  labelExists: (p) => `A key named "${p.label}" already exists.`,
  chooseProvider: () => 'Choose Google Gemini or OpenAI.',
  tooManyKeys: (p) => `You already have ${p.max} keys. Delete one first.`,
  chooseKey: () => 'Choose a saved key.',
  keyDisabled: (p) => `"${p.label}" is disabled. Enable it first.`,
  modelInvalid: () =>
    'Enter a model ID such as gemini-3.1-flash-lite (lowercase letters, digits, ".", "-", "_").',
  modelMismatch: (p) =>
    `This model belongs to another provider; "${p.label}" is a ${p.provider} key.`,
};

const EN_SHORTCUT_ERRORS: Record<ShortcutErrorCode, (p: Params) => string> = {
  invalid: () => 'Invalid shortcut.',
  triggerFormat: () =>
    'Shortcut: 1–32 letters, digits, "_" or "-", without spaces or punctuation.',
  replacementLength: (p) =>
    `Replacement: 1–${Number(p.max).toLocaleString('en')} characters of plain text.`,
  invalidList: () => 'Invalid shortcut list.',
  tooMany: (p) => `At most ${p.max} shortcuts.`,
  duplicate: (p) => `Duplicate shortcut: ${p.trigger}`,
  damaged: () =>
    'Saved shortcuts are damaged and were left untouched. Export what you can.',
  saveUnverified: () => 'Saving could not be verified. Reload and retry.',
  full: (p) => `You already have ${p.max} shortcuts. Delete one first.`,
  exists: (p) => `"${p.trigger}" already exists.`,
  changedElsewhere: () =>
    'This shortcut was changed or deleted in another window. The list was reloaded.',
  fileTooLarge: () => 'This file is too large to be a shortcut backup.',
  notJson: () => 'This file is not valid JSON.',
  notBackup: () =>
    'This is not a Correctly shortcut backup (unknown format or version).',
  importExceeds: (p) =>
    `This import would exceed ${p.max} shortcuts. Nothing was changed.`,
  previewStale: () =>
    'Shortcuts changed since the preview. Choose the file again to review.',
};

const EN: OptionsMessages = {
  html: HTML_EN,
  documentTitle: 'Settings — Correctly',
  autoDetect: 'Auto-detect',
  consentOn: 'Sending allowed. Select text on a page, then open Correctly.',
  consentOff: 'Sending off. No selected text will be sent.',
  triggersSaved: 'Entry points saved.',
  sameLanguages: 'Source and target are the same. The previous choice is kept.',
  translationSaved: 'Translation defaults saved.',
  tooManyFavorites: (max) =>
    `At most ${max} favorite languages. The previous choice is kept.`,
  keepOneStyle: 'Keep at least one default style. The previous choice is kept.',
  rewriteSaved: 'Rewrite settings saved.',
  handleNoAccess:
    'Site access was not granted, so the Correctly handle stays off.',
  handleOn: 'Correctly handle on. Reload already open pages to see it.',
  handleOff: 'Correctly handle off. Site access removed.',
  selectionNoAccess:
    'Site access was not granted, so the translate button stays off.',
  selectionOn:
    'Translate button on. Reload already open pages, then select some text.',
  selectionOff: 'Translate button off.',
  realtimeNoAccess:
    'Site access was not granted, so real-time correction stays off.',
  realtimeOn:
    'Real-time correction on. Reload already open pages, then type in a field.',
  realtimeOff: 'Real-time correction off. Reload open pages to stop it there.',
  realtimeKeyNone: 'None',
  realtimeKeyPress: 'Press the new combination… (Esc to cancel)',
  realtimeKeySaved: (combo) =>
    `Shortcut saved: ${combo}. Reload open pages to use it there.`,
  realtimeKeyRemoved: 'Shortcut removed. Reload open pages.',
  realtimeKeyDuplicate: (combo) =>
    `${combo} is already used by the other real-time shortcut.`,
  realtimeApiWarning:
    'Everything you type in checked fields will be sent, sentence by sentence, to your AI provider, and each check counts as a request on your key. Passwords, payment and code fields are never checked. Turn this on?',
  realtimeApiConfirm: 'Send what I type',
  realtimeApiOn:
    'API checking on. Choose its key and model in AI providers if the default is not right.',
  realtimeApiOff: 'API checking off. Nothing is sent while you type.',
  realtimeNeedsSwitch: 'Turn on real-time correction first.',
  realtimeStatus: {
    ready: 'ready',
    downloadable: 'model not downloaded yet (it downloads on first use)',
    downloading: 'downloading…',
    unavailable: 'not available on this browser',
    unknown: 'unknown',
  },
  realtimeSitesSaved: (count) =>
    count ? `${count} disabled site(s) saved.` : 'No disabled site.',
  dictAdded: (word) => `“${word}” added.`,
  dictInvalid: 'Enter one word of 64 characters at most.',
  dictFull: 'The dictionary is full (2,000 words).',
  dictEmpty: 'No word yet. Add some here or from a suggestion card.',
  dictRemove: (word) => `Remove “${word}”`,
  dictRemoved: (word) => `“${word}” removed.`,
  dictExported: 'Dictionary exported.',
  languageSaved: (name) =>
    `Interface language: ${name}. Reload already open pages to use it there.`,
  providersDamaged:
    'Saved AI provider settings are damaged. They were left untouched; no AI request can be sent.',
  keysDropped: (count) =>
    `${count} saved key(s) were invalid and are ignored. Add them again if needed.`,
  showKey: 'Show',
  hideKey: 'Hide',
  showKeyLabel: 'Show the API key being typed',
  hideKeyLabel: 'Hide the API key being typed',
  addKeyTitle: 'Add an API key',
  saveKey: 'Save key',
  keepKeyPlaceholder: 'Leave empty to keep the saved key',
  editKeyTitle: (label) => `Edit “${label}”`,
  saveChanges: 'Save changes',
  keySaved:
    'Key saved. Nothing was sent. Use “Check” to verify it, then choose it below for your actions.',
  confirmReplaceKey: (label) =>
    `Replace the saved key of “${label}”? The old key is removed from Correctly and earlier checks no longer apply.`,
  nothingChanged: 'Nothing changed.',
  keyReplaced: 'Key replaced. Nothing was sent; check it again.',
  changesSaved: 'Changes saved.',
  confirmDisable: (label, actions) =>
    `Disable “${label}”? ${actions} will stop working until you enable it or choose another key — no other key is used automatically.`,
  toggled: (label, enabled) =>
    `“${label}” ${enabled ? 'enabled' : 'disabled'}.`,
  deleteImpact: (actions) =>
    ` ${actions} will stop working until you choose another key — no other key is used automatically.`,
  confirmDelete: (label, impact) =>
    `Delete “${label}” and remove its key from this browser profile?${impact} A request already sent may still be billed.`,
  deleted: (label) => `“${label}” deleted.`,
  keyAccepted: (label, provider, models) =>
    `“${label}” accepted by ${provider}: ${models} text model(s) listed. This proves access, not that a model will answer.`,
  keyRefused: (label, message) => `“${label}”: ${message}`,
  routeSaved: (slot) =>
    `${slot} saved. Requests already running keep their route; the next one uses this.`,
  defaultRemoved:
    'Default route removed. Actions set to “Use the default route” are now blocked.',
  routeDefault: (slot) => `${slot} now uses the default route.`,
  confirmTest: (slot) =>
    `Send one tiny test prompt (“Reply with OK only.”, no page text) through the saved ${slot} route? It counts as one request in your usage limits and may be billed by the provider.`,
  tokensReported: (input, output) =>
    ` Tokens reported: ${input} in / ${output} out.`,
  modelAnswered: (provider, model, sample, at) =>
    `Model answered — ${provider} • ${model} replied “${sample}” on ${at}.`,
  viaDefault: ' (default)',
  noDefaultRoute:
    'No default route: actions set to “Use the default route” are blocked.',
  needsDefault: 'Needs configuration: no default route is set.',
  keyGone: (via) =>
    `Needs configuration${via}: the chosen key was deleted. No other key is used.`,
  keyBlocked: (via, label) =>
    `Blocked${via}: “${label}” is disabled. No other key is used.`,
  modelNotValid: (via, provider) =>
    `Needs configuration${via}: the saved model is not valid for ${provider}.`,
  noVision: (via) =>
    `Needs another model${via}: this model cannot read images. Choose a vision-capable model; no other model is used.`,
  imageConsentState: (on) =>
    on
      ? 'Sending an image of a selected area is allowed.'
      : 'Sending an image of a selected area is not allowed yet; Correctly asks the first time you use Capture text.',
  imageConsentReset: 'Image consent withdrawn. Correctly will ask again.',
  invalidModelId: 'Not a valid model ID.',
  chooseModel: 'Choose or type a model ID.',
  notProviderModel: (provider) => `This is not a ${provider} model.`,
  notListed: ' It was not in this key’s last model list.',
  unreviewed: (notListed) =>
    `Not reviewed by Correctly: it must support structured JSON output. Every answer is still checked strictly; if the model cannot comply the request fails — nothing else is tried.${notListed}`,
  createKeyIn: (site) => `Create a key in ${site}`,
  enabled: 'Enabled',
  disabled: 'Disabled',
  notChecked: 'Not checked',
  acceptedOn: (at, models) => `Accepted on ${at} (${models} models)`,
  checkFailedOn: (at, message) => `Check failed on ${at}: ${message}`,
  usedBy: (actions) => `Used by: ${actions}`,
  unused: 'Not used by any action',
  checking: 'Checking…',
  check: 'Check',
  checkLabel: (label) => `Check the key “${label}” (free, sends no text)`,
  edit: 'Edit',
  editLabel: (label) => `Rename or replace the key “${label}”`,
  enable: 'Enable',
  disable: 'Disable',
  toggleLabel: (enable, label) => `${enable ? 'Enable' : 'Disable'} “${label}”`,
  remove: 'Delete',
  removeLabel: (label) => `Delete “${label}”`,
  apiKey: 'API key',
  none: '— None —',
  useDefault: 'Use the default route',
  disabledSuffix: ' — disabled',
  deletedKeyOption: '(deleted key — choose another)',
  model: 'Model',
  reviewed: 'reviewed',
  save: 'Save',
  saveRouteLabel: (slot) => `Save the ${slot} route`,
  testing: 'Testing…',
  test: 'Test (may be billed)',
  testLabel: (slot) =>
    `Send one tiny test prompt through the saved ${slot} route; may be billed`,
  cancel: 'Cancel',
  cancelRouteLabel: (slot) => `Discard changes to ${slot}`,
  providerError: (code, params) => EN_PROVIDER_ERRORS[code](params),
  modelNote: (_id, fallback) => fallback,
  totalScope: 'Total (all actions, providers and keys)',
  keyScope: (label, provider) => `Key “${label}” (${provider})`,
  deletedKey: 'Deleted key',
  scopeHelp: {
    'global:all':
      'Every AI request counts here, whatever the action, provider, key or model. Switching keys or providers never frees requests. At least one total limit stays on.',
    'task:rewrite':
      'One rewrite counts as one request, even when it returns several styles.',
    'task:translateRewrite':
      'Translate & rewrite counts once, in its own category (not as a translation plus a rewrite).',
    'task:ocr':
      'One screen-area capture counts as one request in its own category (never as another action). Capturing is refused once a limit you turn on here is reached.',
    'task:summary':
      'A summary counts once, in its own category, even when it is written in another language (never as a translation too).',
  },
  state: {
    unavailable: 'Unavailable',
    repair: 'Needs repair',
    clock: 'Clock check needed',
    paused: 'AI paused',
    active: 'Active',
  },
  usageUnavailableLong:
    'Usage temporarily unavailable: Correctly cannot read its usage records, so no AI request is sent. Reload this page; if it persists, restart the browser.',
  limitName: (period, title) => `${period} limit — ${title}`,
  capOn: (name) => `${name}: on`,
  capMax: (name) => `${name}: maximum AI requests`,
  aiRequests: 'AI requests',
  usageUnavailable: 'Usage temporarily unavailable.',
  inProgress: (count) => `, ${count} in progress`,
  resets: (at) => `Resets ${at}.`,
  offTracking: (used, progress, reset) =>
    `Off (still tracking usage): ${used} used${progress}. ${reset}`,
  capState: {
    over: 'Over limit',
    reached: 'Limit reached',
    near: 'Approaching limit',
    available: 'Available',
  },
  barLabel: (period, title, percent, used, max) =>
    `${period} ${title} usage: ${percent} percent, ${used} of ${max}`,
  usageLine: (state, used, max, over, remaining, progress, reset) =>
    `${state} — used ${used} / ${max}${over ? ' (over limit)' : ''}, ${remaining} remaining now${progress}. ${reset}`,
  theKey: (label) => `key “${label}”`,
  aDeletedKey: 'a deleted key',
  dismiss: 'Dismiss',
  dismissLabel: (text) => `Dismiss: ${text}`,
  deletedKeyLower: 'deleted key',
  todayRow: (r) =>
    `${r.action} → ${r.who} • ${r.model}: ${r.attempts} request(s), ${r.completed} answered, ${r.failed} failed, ${r.unknown} unknown · ${r.input} in / ${r.output} out tokens`,
  lostAnswers: (count) =>
    `${count} request(s) were sent but their answer was lost: they may be billed.`,
  trackingSince: (since) =>
    `Usage is counted since ${since}: earlier days of this week and month are unknown (previous versions kept only one day).`,
  unattributed: (count) =>
    `${count} request(s) made today before V5.7 count in the total only (their action and key are unknown).`,
  wholeNumber: (max) =>
    `Enter a whole number from 1 to ${max} (for example 5,000).`,
  alreadyUsed: (used) =>
    `Already ${used} used in this period: new requests it covers are blocked once saved.`,
  belowUsed: (used) =>
    `Below what is already used (${used}): new requests it covers are blocked once saved.`,
  unknownZone: 'Unknown time zone. Use an IANA name such as Europe/Paris.',
  keepTotal:
    'Keep at least one total limit on (daily, weekly or monthly). To stop all AI requests, use Pause instead.',
  confirmZone: (zone) =>
    `Use the time zone ${zone} for days, weeks and months? Today's, this week's and this month's counts carry over: nothing is reset.`,
  limitsSaved: 'Limits saved. They apply to the next request.',
  limitsConflict:
    'Limits were changed in another tab or window, so nothing was saved. Use “Reload saved limits” to review them (your edits here are then discarded).',
  limitsInvalid: 'These limits are not valid. Nothing was saved.',
  paused: 'All AI requests are paused. Text shortcuts keep working.',
  resumed: 'AI requests are allowed again (within your limits).',
  pauseConflict:
    'Limits were changed in another tab or window. Nothing was saved; the page was reloaded.',
  confirmRepair:
    'Restore safe default limits? Your recorded usage is kept; only the limit settings are replaced.',
  repaired: 'Safe default limits restored. Usage was kept.',
  confirmClock: (now) =>
    `Is your computer's date and time correct now (${now})? AI requests resume. Usage already recorded is kept.`,
  clockConfirmed: 'Clock confirmed. AI requests can resume.',
  loading: 'Loading…',
  chooseDates: 'Choose dates',
  statsUnavailable:
    'Statistics temporarily unavailable: the local records cannot be read. Your usage limits are not affected.',
  statsReady: 'Ready',
  statsNone: 'No requests',
  deletedKeyShort: (suffix) => `Deleted key (…${suffix})`,
  rangeLine: (from, to, zone) =>
    `${from} → ${to} (${zone}). Requests are placed on the day they were sent.`,
  allActions: 'All actions',
  allProviders: 'All providers',
  allModels: 'All models',
  allKeys: 'All API keys',
  coverageStart: (date) =>
    `Detailed statistics start on ${date} (Correctly V5.8). Earlier requests are counted only in the usage limits, not here.`,
  coverageDeleted: (date) =>
    `Statistics before ${date} were deleted on request. Usage limits still count those requests.`,
  coverageRetention:
    'Requests older than 400 days are no longer kept: that part of the period is incomplete.',
  coverageClock:
    "Your computer's clock moved back: times may be unreliable until it is confirmed in Usage limits.",
  costNone: 'No request was sent in this period.',
  costNote:
    'Local estimate from provider-reported tokens and the price references shown in Correctly; not an invoice.',
  costComplete: (value, count) => [
    `${value} (estimate)`,
    `All ${count} request(s) priced. ${EN.costNote}`,
  ],
  costPartial: (value, priced, total, missing) => [
    `${value} (partial)`,
    `Partial estimate for ${priced} of ${total} requests; the cost of the others is unknown (${missing}). ${EN.costNote}`,
  ],
  costUnknown: (missing) => [
    'Unavailable',
    `No request of this period can be priced (${missing}). Unknown is not $0.00.`,
  ],
  missingTokens: (count) => `${count} without token counts`,
  missingPrice: (count) => `${count} without a price reference`,
  notAvailable: 'Not available.',
  requestsDetail: (inProgress) =>
    `Sent or possibly sent, as counted by the usage limits; several styles in one request count once.${inProgress ? ` ${inProgress} in progress now.` : ''}`,
  successDetail: (tasks, failed, lost, waiting) =>
    `Valid results, not necessarily applied${tasks ? ` (${tasks})` : ''}. Failed: ${failed}; answer lost: ${lost}${waiting ? `; waiting: ${waiting}` : ''}.`,
  appliedDetail: (undone) =>
    `Edits Correctly applied to your text (Copy is not counted). Undos recorded by Correctly: ${undone}. Recorded since Correctly V5.9.`,
  tokensValue: (input, output) => `${input} in / ${output} out`,
  unknownLower: 'unknown',
  notReported: 'Not reported',
  zeroTokens: '0 in / 0 out',
  tokensDetail: (input, output, total, partial) =>
    `Reported by the provider for ${input} of ${total} requests (input) and ${output} of ${total} (output).${partial ? ' Partial: the others have no token counts.' : ''}`,
  noRequest: 'No request in this period.',
  dayBar: (date, count) => `${date}: ${count} request(s)`,
  chartLabel: (from, to, total, max) =>
    `Requests per day from ${from} to ${to}: ${total} in total, at most ${max} on one day. The same values are in the table below.`,
  noData: 'No data.',
  ofTotal: (part, total) => `${part} of ${total}`,
  unknownCost: 'Unknown',
  coverage: { complete: 'Complete', unknown: 'Unknown' },
  partialCoverage: (priced, total) => `Partial (${priced} of ${total})`,
  appliedByTask: (list) => `Applied edits by action — ${list}.`,
  allRequests: 'All requests',
  fromDate: (date) => `From ${date}`,
  priceSource: (official, label, checked) =>
    `${official ? 'Official list price' : 'Your entry'}: ${label} (checked ${checked})`,
  completeCoverage: 'Complete for this period.',
  exported: (name) => `Exported ${name} (no text, no key).`,
  enteredByMe: 'Entered by me',
  priceErrors: {
    provider: 'Choose a provider.',
    model: 'Enter the exact model ID (for example gemini-3.1-flash-lite).',
    input: 'Input price: a number of dollars such as 0.25 (up to 6 decimals).',
    output:
      'Output price: a number of dollars such as 1.50 (up to 6 decimals).',
    cached: 'Cached input price: a number of dollars, or leave it empty.',
    date: 'Choose the date from which this price applies.',
    label: 'Keep the source label under 120 characters.',
  },
  confirmPrice: (from) =>
    `Apply this price to requests sent from ${from}? Their estimate will change (older prices are kept as history).`,
  priceAdded: (model, from) =>
    `Price reference added for ${model} from ${from}.`,
  priceInvalid: 'This price reference is not valid. Nothing was saved.',
  chooseDate: 'Choose a date.',
  confirmDeleteStats: (before) =>
    `Delete the local statistics of requests sent before ${before}? This deletes Correctly's records of those requests and of the edits applied. It does NOT delete your API keys, your usage limits or what they already counted (limits stay enforced), nor anything at Google or OpenAI. This cannot be undone.`,
  statsDeleted: (count) =>
    `Deleted ${count} request record(s). Usage limits are unchanged.`,
  rangeError: (code, max) =>
    code === 'missing'
      ? 'Choose a start and an end date.'
      : code === 'order'
        ? 'The end date is before the start date.'
        : `Choose at most ${max} days.`,
  shortcutsDamaged:
    'Saved shortcuts are damaged. They were left untouched; nothing can be changed until they are repaired.',
  v4Found: (count) =>
    `Your ${count} V4 shortcut(s) were found and are shown below. They are saved in the new format at your next change; the old copy is kept.`,
  shortcutsNoAccess:
    'Site access was not granted, so shortcuts are not expanded.',
  shortcutsOn: 'Shortcuts on. Reload already open pages to use them.',
  shortcutsOff: 'Shortcuts off. Typing is never changed.',
  shortcutUpdated: 'Shortcut updated.',
  shortcutSaved: (trigger) => `Shortcut "${trigger}" saved.`,
  addShortcut: 'Add shortcut',
  shortcutToggled: (trigger, enabled) =>
    `"${trigger}" ${enabled ? 'enabled' : 'disabled'}.`,
  confirmDeleteShortcut: (trigger) => `Delete the shortcut "${trigger}"?`,
  shortcutDeleted: (trigger) => `"${trigger}" deleted.`,
  backupDone:
    'Backup downloaded. It contains your replacement texts (possibly private) but never your API key.',
  fileUnreadable: 'The file could not be read.',
  nothingModified: 'Nothing was changed.',
  importSummary: (p) =>
    `${p.total} shortcut(s) in the file: ${p.added} new, ${p.identical} identical, ${p.conflicts} different from yours` +
    (p.policy === 'skip' && p.conflicts ? ' (kept as they are)' : '') +
    (p.policy === 'overwrite' && p.conflicts ? ' (replaced by the file)' : '') +
    (p.removed ? `; ${p.removed} of yours will be DELETED` : '') +
    '.',
  invalidImport: 'Invalid import.',
  confirmReplaceAll: (count, removed) =>
    `Replace ALL your shortcuts with the ${count} from the file? ${removed} current shortcut(s) will be deleted. Export a backup first if unsure.`,
  replaceAllAction: 'Replace all',
  importDone: (added, replaced, removed) =>
    `Import done: ${added} added` +
    (replaced === null ? '' : `, ${replaced} replaced`) +
    (removed ? `, ${removed} removed` : '') +
    '.',
  tags: {
    off: 'off',
    protected: 'AI-protected',
    replacementProtected: 'replacement protected',
  },
  shortcutError: (code, params) => EN_SHORTCUT_ERRORS[code](params),
  commands: {
    _execute_action: 'Toolbar button',
    'open-correctly': 'Open Correctly',
    'correct-selection': 'Correct the selection',
    'rewrite-selection': 'Rewrite the selection',
    'translate-selection': 'Translate the selection',
  },
  keyAction: {
    open: 'Open Correctly',
    correct: 'Correct the selection',
    rewrite: 'Rewrite the selection',
    translate: 'Translate the selection',
    capture: 'Capture text from a screen area',
  },
  notSet: 'not set',
  keysNoAccess: 'Site access was not granted, so Correctly shortcuts stay off.',
  keysOn: 'Correctly shortcuts on. Reload already open pages to use them.',
  keysOff: 'Correctly shortcuts off.',
  pressFor: (action) =>
    `Press the combination for “${action}” (Escape to cancel).`,
  keyCleared: (action) => `Shortcut of “${action}” cleared.`,
  noChange: 'No change.',
  keyUnusable: 'This key cannot be used.',
  keyTaken: (combo, action) => `${combo} is already used for “${action}”.`,
  bindingSaved: (combo, action, enabled) =>
    `${combo} saved for “${action}”.${enabled ? ' Reload already open pages.' : ' Turn on Correctly shortcuts above to use it.'}`,
  pressCombination: 'Press a combination…',
  noneBound: 'none',
  cancelRecord: 'Cancel',
  modify: 'Change',
  define: 'Set',
  recordLabel: (verb, action) => `${verb} the shortcut of “${action}”`,
  clear: 'Clear',
  clearLabel: (action) => `Clear the shortcut of “${action}”`,
  sameAsBrowser: (shortcut) =>
    `Same as the browser shortcut (${shortcut}): not needed here.`,
  clashWith: (shortcut, action) =>
    `Careful: ${shortcut} is also the browser shortcut of “${action}”.`,
  bindingProblem: (problem, combo) =>
    problem === 'key'
      ? 'This key cannot be used.'
      : problem === 'modifier'
        ? 'Add Ctrl, Alt or Meta (except for F1 to F12): otherwise the key could no longer be typed.'
        : problem === 'altSpace'
          ? 'Alt+Space is reserved by the system.'
          : `${combo} is used by the browser or text editing: choose another combination.`,
  account: {
    status: {
      off: 'Off.',
      synced: 'Backed up.',
      pending: 'Waiting…',
      locked:
        'Backed-up keys are available: enter the passphrase below to unlock them.',
      needsPassphrase:
        'Choose a passphrase below to encrypt and back up your keys.',
      error: 'Not backed up.',
    },
    syncedAt: (time) => `Backed up at ${time}.`,
    error: {
      CLOUD_NOT_CONFIGURED: 'Account backup is not configured in this build.',
      CLOUD_SIGNIN_CANCELLED: 'Sign-in cancelled.',
      CLOUD_SIGNIN_FAILED: 'Sign-in failed. Nothing was changed.',
      CLOUD_SESSION_EXPIRED: 'Your session expired: sign in again.',
      CLOUD_OFFLINE:
        'Cannot reach the service. Your data is safe here; it will be retried at the next change.',
      CLOUD_CONFLICT:
        'Another computer changed this at the same time: try again.',
      CLOUD_TOO_LARGE:
        'Too large to back up: nothing was sent and nothing was cut. Shorten or remove some text shortcuts.',
      CLOUD_DENIED: 'The service refused the request. Nothing was changed.',
      CLOUD_WRONG_PASSPHRASE: 'Wrong passphrase: nothing was changed.',
      CLOUD_NOT_SIGNED_IN: 'Sign in first.',
      CLOUD_WEAK_PASSPHRASE: 'Use at least 8 characters.',
      CLOUD_LOCAL_DAMAGED:
        'This computer’s data is damaged: it is neither sent nor replaced.',
      CLOUD_REMOTE_DAMAGED:
        'The backed-up data cannot be read: nothing was applied.',
    },
    notConfigured: 'Account backup is not configured in this build.',
    signedOut: 'Not signed in. Everything stays on this computer.',
    signedInAs: (email) => `Signed in as ${email}.`,
    signedIn: 'Signed in. Your data is being backed up.',
    signedOutDone: 'Signed out. This computer keeps all its data.',
    backedUp: 'Backup done.',
    restored: 'Restored from your account.',
    replaced:
      'This computer’s previous version was replaced by the one in your account (a copy is kept).',
    confirmRestore:
      'Replace this computer’s data with the version in your account? The current version is kept in a safety copy.',
    restoreAction: 'Restore',
    passSet: 'Encrypt and back up my keys',
    passChange: 'Change the passphrase',
    passUnlock: 'Unlock the backed-up keys',
    passReplace: 'Use a new passphrase instead…',
    passMismatch: 'The two passphrases differ.',
    passSaved:
      'Passphrase saved: your keys are encrypted and backed up. Enter the same passphrase once on your other computers.',
    unlocked: 'Keys unlocked: they are now on this computer.',
    passNeedsAccount: 'Sign in and tick “API keys and routes” above first.',
    confirmReplace:
      'The keys in your account will be replaced by this computer’s, encrypted with the new passphrase. Your other computers will need it. Continue?',
    replaceAction: 'Replace',
    confirmDelete:
      'Delete all your Correctly data in the cloud and your account? This cannot be undone. This computer keeps all its data.',
    deleteAction: 'Delete',
    deleted: 'Account and cloud data deleted.',
  },
};

// ===================================================================== FR

const FR_PROVIDER_ERRORS: Record<ProviderErrorCode, (p: Params) => string> = {
  labelRequired: () => 'Donnez un nom à cette clé.',
  labelTooLong: (p) => `Le nom fait au plus ${p.max} caractères.`,
  labelControl: () => 'Le nom ne doit pas contenir de caractères de contrôle.',
  keyRequired: () => 'Collez une clé API avant d’enregistrer.',
  keySpaces: () => 'La clé ne doit contenir ni espaces ni retours à la ligne.',
  keyChars: () => 'La clé contient des caractères qu’une clé API n’a jamais.',
  keyLength: (p) =>
    `Une clé API fait ${p.min} à ${p.max} caractères ; vérifiez ce que vous avez collé.`,
  looksGoogle: () =>
    'Cela ressemble à une clé Google : choisissez Google Gemini comme fournisseur.',
  looksOpenai: () =>
    'Cela ressemble à une clé OpenAI : choisissez OpenAI comme fournisseur.',
  storeDamaged: () =>
    'Les réglages des fournisseurs IA enregistrés sont endommagés ; ils n’ont pas été modifiés.',
  saveUnverified: () =>
    'L’enregistrement n’a pas pu être vérifié. Rechargez et réessayez.',
  changedElsewhere: () =>
    'Cette clé a été modifiée ou supprimée dans une autre fenêtre. La liste a été rechargée.',
  labelExists: (p) => `Une clé nommée « ${p.label} » existe déjà.`,
  chooseProvider: () => 'Choisissez Google Gemini ou OpenAI.',
  tooManyKeys: (p) => `Vous avez déjà ${p.max} clés. Supprimez-en une d’abord.`,
  chooseKey: () => 'Choisissez une clé enregistrée.',
  keyDisabled: (p) => `« ${p.label} » est désactivée. Activez-la d’abord.`,
  modelInvalid: () =>
    'Saisissez un identifiant de modèle comme gemini-3.1-flash-lite (minuscules, chiffres, « . », « - », « _ »).',
  modelMismatch: (p) =>
    `Ce modèle appartient à un autre fournisseur ; « ${p.label} » est une clé ${p.provider}.`,
};

const FR_SHORTCUT_ERRORS: Record<ShortcutErrorCode, (p: Params) => string> = {
  invalid: () => 'Raccourci invalide.',
  triggerFormat: () =>
    'Raccourci : 1 à 32 lettres, chiffres, « _ » ou « - », sans espaces ni ponctuation.',
  replacementLength: (p) =>
    `Remplacement : 1 à ${Number(p.max).toLocaleString('fr-FR')} caractères de texte brut.`,
  invalidList: () => 'Liste de raccourcis invalide.',
  tooMany: (p) => `Au plus ${p.max} raccourcis.`,
  duplicate: (p) => `Raccourci en double : ${p.trigger}`,
  damaged: () =>
    'Les raccourcis enregistrés sont endommagés ; ils n’ont pas été modifiés. Exportez ce que vous pouvez.',
  saveUnverified: () =>
    'L’enregistrement n’a pas pu être vérifié. Rechargez et réessayez.',
  full: (p) => `Vous avez déjà ${p.max} raccourcis. Supprimez-en un d’abord.`,
  exists: (p) => `« ${p.trigger} » existe déjà.`,
  changedElsewhere: () =>
    'Ce raccourci a été modifié ou supprimé dans une autre fenêtre. La liste a été rechargée.',
  fileTooLarge: () =>
    'Ce fichier est trop gros pour être une sauvegarde de raccourcis.',
  notJson: () => 'Ce fichier n’est pas un JSON valide.',
  notBackup: () =>
    'Ce n’est pas une sauvegarde de raccourcis Correctly (format ou version inconnus).',
  importExceeds: (p) =>
    `Cet import dépasserait ${p.max} raccourcis. Rien n’a été modifié.`,
  previewStale: () =>
    'Les raccourcis ont changé depuis l’aperçu. Choisissez à nouveau le fichier.',
};

const FR_MODEL_NOTES: Record<string, string> = {
  'gemini-3.1-flash-lite':
    'Prix par token le plus bas de la liste (défaut V5.1).',
  'gemini-3.5-flash-lite':
    'Modèle Flash-Lite plus récent ; prix affiché légèrement plus élevé.',
  'gpt-5.6-luna':
    'Documenté pour les usages sensibles au coût ; envoyé avec raisonnement « none ».',
  'gpt-6-luna':
    'Documenté pour les gros volumes ; envoyé avec raisonnement « none ».',
  'gpt-5-nano':
    'Petit modèle plus ancien ; envoyé avec raisonnement « minimal ».',
};

const FR: OptionsMessages = {
  html: HTML_FR,
  documentTitle: 'Paramètres — Correctly',
  autoDetect: 'Détection automatique',
  consentOn:
    'Envoi autorisé. Sélectionnez du texte sur une page, puis ouvrez Correctly.',
  consentOff: 'Envoi désactivé. Aucun texte sélectionné ne sera envoyé.',
  triggersSaved: 'Points d’entrée enregistrés.',
  sameLanguages:
    'La langue source et la langue cible sont identiques. Le choix précédent est conservé.',
  translationSaved: 'Langues par défaut enregistrées.',
  tooManyFavorites: (max) =>
    `${max} langues favorites au maximum. Le choix précédent est conservé.`,
  keepOneStyle:
    'Gardez au moins un style par défaut. Le choix précédent est conservé.',
  rewriteSaved: 'Réglages de reformulation enregistrés.',
  handleNoAccess:
    'L’accès aux sites n’a pas été accordé : la poignée Correctly reste désactivée.',
  handleOn:
    'Poignée Correctly activée. Rechargez les pages déjà ouvertes pour la voir.',
  handleOff: 'Poignée Correctly désactivée. Accès aux sites retiré.',
  selectionNoAccess:
    'L’accès aux sites n’a pas été accordé : le bouton de traduction reste désactivé.',
  selectionOn:
    'Bouton de traduction activé. Rechargez les pages déjà ouvertes, puis sélectionnez du texte.',
  selectionOff: 'Bouton de traduction désactivé.',
  realtimeNoAccess:
    'L’accès aux sites n’a pas été accordé : la correction en direct reste désactivée.',
  realtimeOn:
    'Correction en direct activée. Rechargez les pages déjà ouvertes, puis écrivez dans un champ.',
  realtimeOff:
    'Correction en direct désactivée. Rechargez les pages ouvertes pour l’y arrêter.',
  realtimeKeyNone: 'Aucun',
  realtimeKeyPress: 'Appuyez sur la nouvelle combinaison… (Échap pour annuler)',
  realtimeKeySaved: (combo) =>
    `Raccourci enregistré : ${combo}. Rechargez les pages ouvertes pour l’y utiliser.`,
  realtimeKeyRemoved: 'Raccourci retiré. Rechargez les pages ouvertes.',
  realtimeKeyDuplicate: (combo) =>
    `${combo} est déjà utilisé par l’autre raccourci du temps réel.`,
  realtimeApiWarning:
    'Tout ce que vous écrivez dans les champs vérifiés sera envoyé, phrase par phrase, à votre fournisseur IA, et chaque vérification compte comme une requête sur votre clé. Les mots de passe, champs de paiement et de code ne sont jamais vérifiés. Activer ?',
  realtimeApiConfirm: 'Envoyer ce que j’écris',
  realtimeApiOn:
    'Vérification par API activée. Choisissez sa clé et son modèle dans Fournisseurs IA si le choix par défaut ne convient pas.',
  realtimeApiOff:
    'Vérification par API désactivée. Rien n’est envoyé pendant la frappe.',
  realtimeNeedsSwitch: 'Activez d’abord la correction en direct.',
  realtimeStatus: {
    ready: 'prêt',
    downloadable:
      'modèle pas encore téléchargé (il se télécharge au premier usage)',
    downloading: 'téléchargement…',
    unavailable: 'non disponible sur ce navigateur',
    unknown: 'inconnu',
  },
  realtimeSitesSaved: (count) =>
    count
      ? `${count} site(s) désactivé(s) enregistré(s).`
      : 'Aucun site désactivé.',
  dictAdded: (word) => `« ${word} » ajouté.`,
  dictInvalid: 'Saisissez un seul mot de 64 caractères au maximum.',
  dictFull: 'Le dictionnaire est plein (2 000 mots).',
  dictEmpty:
    'Aucun mot pour l’instant. Ajoutez-en ici ou depuis une carte de suggestion.',
  dictRemove: (word) => `Retirer « ${word} »`,
  dictRemoved: (word) => `« ${word} » retiré.`,
  dictExported: 'Dictionnaire exporté.',
  languageSaved: (name) =>
    `Langue de l’interface : ${name}. Rechargez les pages déjà ouvertes pour l’y utiliser.`,
  providersDamaged:
    'Les réglages des fournisseurs IA enregistrés sont endommagés. Ils n’ont pas été modifiés ; aucune requête IA ne peut être envoyée.',
  keysDropped: (count) =>
    `${count} clé(s) enregistrée(s) invalide(s) ignorée(s). Ajoutez-les à nouveau si besoin.`,
  showKey: 'Afficher',
  hideKey: 'Masquer',
  showKeyLabel: 'Afficher la clé API saisie',
  hideKeyLabel: 'Masquer la clé API saisie',
  addKeyTitle: 'Ajouter une clé API',
  saveKey: 'Enregistrer la clé',
  keepKeyPlaceholder: 'Laisser vide pour garder la clé enregistrée',
  editKeyTitle: (label) => `Modifier « ${label} »`,
  saveChanges: 'Enregistrer les modifications',
  keySaved:
    'Clé enregistrée. Rien n’a été envoyé. Utilisez « Vérifier » pour la tester, puis choisissez-la ci-dessous pour vos actions.',
  confirmReplaceKey: (label) =>
    `Remplacer la clé enregistrée de « ${label} » ? L’ancienne clé est supprimée de Correctly et les vérifications précédentes ne s’appliquent plus.`,
  nothingChanged: 'Rien n’a changé.',
  keyReplaced: 'Clé remplacée. Rien n’a été envoyé ; vérifiez-la à nouveau.',
  changesSaved: 'Modifications enregistrées.',
  confirmDisable: (label, actions) =>
    `Désactiver « ${label} » ? ${actions} cessera de fonctionner jusqu’à ce que vous la réactiviez ou choisissiez une autre clé — aucune autre clé n’est utilisée automatiquement.`,
  toggled: (label, enabled) =>
    `« ${label} » ${enabled ? 'activée' : 'désactivée'}.`,
  deleteImpact: (actions) =>
    ` ${actions} cessera de fonctionner jusqu’à ce que vous choisissiez une autre clé — aucune autre clé n’est utilisée automatiquement.`,
  confirmDelete: (label, impact) =>
    `Supprimer « ${label} » et retirer sa clé de ce profil de navigateur ?${impact} Une requête déjà envoyée peut encore être facturée.`,
  deleted: (label) => `« ${label} » supprimée.`,
  keyAccepted: (label, provider, models) =>
    `« ${label} » acceptée par ${provider} : ${models} modèle(s) de texte listé(s). Cela prouve l’accès, pas qu’un modèle répondra.`,
  keyRefused: (label, message) => `« ${label} » : ${message}`,
  routeSaved: (slot) =>
    `${slot} : route enregistrée. Les requêtes déjà en cours gardent leur route ; la suivante utilise celle-ci.`,
  defaultRemoved:
    'Route par défaut supprimée. Les actions réglées sur « Utiliser la route par défaut » sont maintenant bloquées.',
  routeDefault: (slot) => `${slot} utilise maintenant la route par défaut.`,
  confirmTest: (slot) =>
    `Envoyer un tout petit message de test (« Reply with OK only. », aucun texte de page) par la route enregistrée « ${slot} » ? Il compte comme une requête dans vos limites d’usage et peut être facturé par le fournisseur.`,
  tokensReported: (input, output) =>
    ` Tokens déclarés : ${input} en entrée / ${output} en sortie.`,
  modelAnswered: (provider, model, sample, at) =>
    `Le modèle a répondu — ${provider} • ${model} a répondu « ${sample} » le ${at}.`,
  viaDefault: ' (par défaut)',
  noDefaultRoute:
    'Aucune route par défaut : les actions réglées sur « Utiliser la route par défaut » sont bloquées.',
  needsDefault: 'À configurer : aucune route par défaut n’est définie.',
  keyGone: (via) =>
    `À configurer${via} : la clé choisie a été supprimée. Aucune autre clé n’est utilisée.`,
  keyBlocked: (via, label) =>
    `Bloquée${via} : « ${label} » est désactivée. Aucune autre clé n’est utilisée.`,
  modelNotValid: (via, provider) =>
    `À configurer${via} : le modèle enregistré n’est pas valide pour ${provider}.`,
  noVision: (via) =>
    `Autre modèle nécessaire${via} : ce modèle ne sait pas lire les images. Choisissez un modèle qui les lit ; aucun autre modèle n’est utilisé.`,
  imageConsentState: (on) =>
    on
      ? 'L’envoi d’une image de la zone choisie est autorisé.'
      : 'L’envoi d’une image de la zone choisie n’est pas encore autorisé ; Correctly le demande à la première utilisation de « Capturer du texte ».',
  imageConsentReset: 'Consentement image retiré. Correctly le redemandera.',
  invalidModelId: 'Identifiant de modèle invalide.',
  chooseModel: 'Choisissez ou saisissez un identifiant de modèle.',
  notProviderModel: (provider) => `Ce n’est pas un modèle ${provider}.`,
  notListed: ' Il n’était pas dans la dernière liste de modèles de cette clé.',
  unreviewed: (notListed) =>
    `Non vérifié par Correctly : il doit gérer la sortie JSON structurée. Chaque réponse reste contrôlée strictement ; si le modèle ne peut pas suivre, la requête échoue — rien d’autre n’est essayé.${notListed}`,
  createKeyIn: (site) => `Créer une clé dans ${site}`,
  enabled: 'Activée',
  disabled: 'Désactivée',
  notChecked: 'Non vérifiée',
  acceptedOn: (at, models) => `Acceptée le ${at} (${models} modèles)`,
  checkFailedOn: (at, message) =>
    `Échec de la vérification le ${at} : ${message}`,
  usedBy: (actions) => `Utilisée par : ${actions}`,
  unused: 'Utilisée par aucune action',
  checking: 'Vérification…',
  check: 'Vérifier',
  checkLabel: (label) =>
    `Vérifier la clé « ${label} » (gratuit, n’envoie aucun texte)`,
  edit: 'Modifier',
  editLabel: (label) => `Renommer ou remplacer la clé « ${label} »`,
  enable: 'Activer',
  disable: 'Désactiver',
  toggleLabel: (enable, label) =>
    `${enable ? 'Activer' : 'Désactiver'} « ${label} »`,
  remove: 'Supprimer',
  removeLabel: (label) => `Supprimer « ${label} »`,
  apiKey: 'Clé API',
  none: '— Aucune —',
  useDefault: 'Utiliser la route par défaut',
  disabledSuffix: ' — désactivée',
  deletedKeyOption: '(clé supprimée — choisissez-en une autre)',
  model: 'Modèle',
  reviewed: 'vérifié',
  save: 'Enregistrer',
  saveRouteLabel: (slot) => `Enregistrer la route « ${slot} »`,
  testing: 'Test en cours…',
  test: 'Tester (peut être facturé)',
  testLabel: (slot) =>
    `Envoyer un petit message de test par la route « ${slot} » enregistrée ; peut être facturé`,
  cancel: 'Annuler',
  cancelRouteLabel: (slot) => `Annuler les modifications de « ${slot} »`,
  providerError: (code, params) => FR_PROVIDER_ERRORS[code](params),
  modelNote: (id, fallback) => FR_MODEL_NOTES[id] ?? fallback,
  totalScope: 'Total (toutes actions, tous fournisseurs et toutes clés)',
  keyScope: (label, provider) => `Clé « ${label} » (${provider})`,
  deletedKey: 'Clé supprimée',
  scopeHelp: {
    'global:all':
      'Chaque requête IA compte ici, quels que soient l’action, le fournisseur, la clé ou le modèle. Changer de clé ou de fournisseur ne libère jamais de requêtes. Au moins une limite totale reste active.',
    'task:rewrite':
      'Une reformulation compte pour une requête, même si elle renvoie plusieurs styles.',
    'task:translateRewrite':
      'Traduire et reformuler compte une fois, dans sa propre catégorie (pas comme une traduction plus une reformulation).',
    'task:ocr':
      'Une capture d’écran compte pour une requête, dans sa propre catégorie (jamais comme une autre action). La capture est refusée dès qu’une limite activée ici est atteinte.',
    'task:summary':
      'Un résumé compte une fois, dans sa propre catégorie, même écrit dans une autre langue (jamais aussi comme une traduction).',
  },
  state: {
    unavailable: 'Indisponible',
    repair: 'À réparer',
    clock: 'Vérifier l’horloge',
    paused: 'IA en pause',
    active: 'Actives',
  },
  usageUnavailableLong:
    'Usage momentanément indisponible : Correctly ne peut pas lire ses compteurs, donc aucune requête IA n’est envoyée. Rechargez cette page ; si cela persiste, redémarrez le navigateur.',
  limitName: (period, title) => `Limite ${period.toLowerCase()} — ${title}`,
  capOn: (name) => `${name} : activée`,
  capMax: (name) => `${name} : nombre maximal de requêtes IA`,
  aiRequests: 'requêtes IA',
  usageUnavailable: 'Usage momentanément indisponible.',
  inProgress: (count) => `, ${count} en cours`,
  resets: (at) => `Remise à zéro : ${at}.`,
  offTracking: (used, progress, reset) =>
    `Désactivée (usage toujours compté) : ${used} utilisée(s)${progress}. ${reset}`,
  capState: {
    over: 'Limite dépassée',
    reached: 'Limite atteinte',
    near: 'Limite proche',
    available: 'Disponible',
  },
  barLabel: (period, title, percent, used, max) =>
    `Usage ${period.toLowerCase()} — ${title} : ${percent} pour cent, ${used} sur ${max}`,
  usageLine: (state, used, max, over, remaining, progress, reset) =>
    `${state} — ${used} / ${max} utilisée(s)${over ? ' (dépassement)' : ''}, ${remaining} restante(s)${progress}. ${reset}`,
  theKey: (label) => `la clé « ${label} »`,
  aDeletedKey: 'une clé supprimée',
  dismiss: 'Masquer',
  dismissLabel: (text) => `Masquer : ${text}`,
  deletedKeyLower: 'clé supprimée',
  todayRow: (r) =>
    `${r.action} → ${r.who} • ${r.model} : ${r.attempts} requête(s), ${r.completed} réussie(s), ${r.failed} en échec, ${r.unknown} inconnue(s) · tokens ${r.input} en entrée / ${r.output} en sortie`,
  lostAnswers: (count) =>
    `${count} requête(s) envoyée(s) dont la réponse a été perdue : elles peuvent être facturées.`,
  trackingSince: (since) =>
    `L’usage est compté depuis le ${since} : les jours précédents de cette semaine et de ce mois sont inconnus (les versions précédentes ne gardaient qu’un jour).`,
  unattributed: (count) =>
    `${count} requête(s) faite(s) aujourd’hui avant la V5.7 compte(nt) seulement dans le total (action et clé inconnues).`,
  wholeNumber: (max) =>
    `Saisissez un nombre entier de 1 à ${max} (par exemple 5 000).`,
  alreadyUsed: (used) =>
    `Déjà ${used} utilisée(s) sur cette période : les nouvelles requêtes concernées seront bloquées après l’enregistrement.`,
  belowUsed: (used) =>
    `En dessous de ce qui est déjà utilisé (${used}) : les nouvelles requêtes concernées seront bloquées après l’enregistrement.`,
  unknownZone:
    'Fuseau horaire inconnu. Utilisez un nom IANA comme Europe/Paris.',
  keepTotal:
    'Gardez au moins une limite totale active (jour, semaine ou mois). Pour arrêter toutes les requêtes IA, utilisez plutôt la pause.',
  confirmZone: (zone) =>
    `Utiliser le fuseau horaire ${zone} pour les jours, semaines et mois ? Les compteurs du jour, de la semaine et du mois sont conservés : rien n’est remis à zéro.`,
  limitsSaved:
    'Limites enregistrées. Elles s’appliquent dès la prochaine requête.',
  limitsConflict:
    'Les limites ont été modifiées dans un autre onglet ou une autre fenêtre : rien n’a été enregistré. Utilisez « Recharger les limites enregistrées » pour les revoir (vos modifications ici seront alors perdues).',
  limitsInvalid: 'Ces limites ne sont pas valides. Rien n’a été enregistré.',
  paused:
    'Toutes les requêtes IA sont en pause. Les raccourcis texte continuent de fonctionner.',
  resumed: 'Les requêtes IA sont de nouveau autorisées (dans vos limites).',
  pauseConflict:
    'Les limites ont été modifiées dans un autre onglet ou une autre fenêtre. Rien n’a été enregistré ; la page a été rechargée.',
  confirmRepair:
    'Restaurer les limites sûres par défaut ? Votre usage enregistré est conservé ; seuls les réglages des limites sont remplacés.',
  repaired: 'Limites sûres par défaut restaurées. L’usage a été conservé.',
  confirmClock: (now) =>
    `La date et l’heure de votre ordinateur sont-elles correctes maintenant (${now}) ? Les requêtes IA reprennent. L’usage déjà enregistré est conservé.`,
  clockConfirmed: 'Horloge confirmée. Les requêtes IA peuvent reprendre.',
  loading: 'Chargement…',
  chooseDates: 'Choisir les dates',
  statsUnavailable:
    'Statistiques momentanément indisponibles : les enregistrements locaux ne peuvent pas être lus. Vos limites d’usage ne sont pas affectées.',
  statsReady: 'À jour',
  statsNone: 'Aucune requête',
  deletedKeyShort: (suffix) => `Clé supprimée (…${suffix})`,
  rangeLine: (from, to, zone) =>
    `${from} → ${to} (${zone}). Chaque requête est comptée le jour de son envoi.`,
  allActions: 'Toutes les actions',
  allProviders: 'Tous les fournisseurs',
  allModels: 'Tous les modèles',
  allKeys: 'Toutes les clés API',
  coverageStart: (date) =>
    `Les statistiques détaillées commencent le ${date} (Correctly V5.8). Les requêtes antérieures ne sont comptées que dans les limites d’usage, pas ici.`,
  coverageDeleted: (date) =>
    `Les statistiques antérieures au ${date} ont été supprimées à votre demande. Les limites d’usage comptent toujours ces requêtes.`,
  coverageRetention:
    'Les requêtes de plus de 400 jours ne sont plus conservées : cette partie de la période est incomplète.',
  coverageClock:
    'L’horloge de votre ordinateur a reculé : les heures peuvent être fausses tant qu’elle n’est pas confirmée dans Limites d’usage.',
  costNone: 'Aucune requête envoyée sur cette période.',
  costNote:
    'Estimation locale à partir des tokens déclarés par le fournisseur et des prix de référence affichés dans Correctly ; ce n’est pas une facture.',
  costComplete: (value, count) => [
    `${value} (estimation)`,
    `Les ${count} requête(s) ont un prix. ${FR.costNote}`,
  ],
  costPartial: (value, priced, total, missing) => [
    `${value} (partiel)`,
    `Estimation partielle pour ${priced} requête(s) sur ${total} ; le coût des autres est inconnu (${missing}). ${FR.costNote}`,
  ],
  costUnknown: (missing) => [
    'Indisponible',
    `Aucune requête de cette période n’a de prix (${missing}). Inconnu ne veut pas dire $0.00.`,
  ],
  missingTokens: (count) => `${count} sans nombre de tokens`,
  missingPrice: (count) => `${count} sans prix de référence`,
  notAvailable: 'Non disponible.',
  requestsDetail: (inProgress) =>
    `Envoyées ou peut-être envoyées, comme dans les limites d’usage ; plusieurs styles dans une requête comptent une fois.${inProgress ? ` ${inProgress} en cours.` : ''}`,
  successDetail: (tasks, failed, lost, waiting) =>
    `Résultats valides, pas forcément appliqués${tasks ? ` (${tasks})` : ''}. Échecs : ${failed} ; réponses perdues : ${lost}${waiting ? ` ; en attente : ${waiting}` : ''}.`,
  appliedDetail: (undone) =>
    `Modifications appliquées à votre texte par Correctly (Copier n’est pas compté). Annulations enregistrées : ${undone}. Enregistré depuis Correctly V5.9.`,
  tokensValue: (input, output) => `${input} entrée / ${output} sortie`,
  unknownLower: 'inconnu',
  notReported: 'Non déclarés',
  zeroTokens: '0 entrée / 0 sortie',
  tokensDetail: (input, output, total, partial) =>
    `Déclarés par le fournisseur pour ${input} requête(s) sur ${total} (entrée) et ${output} sur ${total} (sortie).${partial ? ' Partiel : les autres n’ont pas de nombre de tokens.' : ''}`,
  noRequest: 'Aucune requête sur cette période.',
  dayBar: (date, count) => `${date} : ${count} requête(s)`,
  chartLabel: (from, to, total, max) =>
    `Requêtes par jour du ${from} au ${to} : ${total} au total, au plus ${max} en un jour. Les mêmes valeurs sont dans le tableau ci-dessous.`,
  noData: 'Aucune donnée.',
  ofTotal: (part, total) => `${part} sur ${total}`,
  unknownCost: 'Inconnu',
  coverage: { complete: 'Complète', unknown: 'Inconnue' },
  partialCoverage: (priced, total) => `Partielle (${priced} sur ${total})`,
  appliedByTask: (list) => `Modifications appliquées par action — ${list}.`,
  allRequests: 'Toutes les requêtes',
  fromDate: (date) => `À partir du ${date}`,
  priceSource: (official, label, checked) =>
    `${official ? 'Prix officiel' : 'Votre saisie'} : ${label} (vérifié le ${checked})`,
  completeCoverage: 'Complet pour cette période.',
  exported: (name) => `${name} exporté (aucun texte, aucune clé).`,
  enteredByMe: 'Saisi par moi',
  priceErrors: {
    provider: 'Choisissez un fournisseur.',
    model:
      'Saisissez l’identifiant exact du modèle (par exemple gemini-3.1-flash-lite).',
    input:
      'Prix d’entrée : un montant en dollars comme 0.25 (jusqu’à 6 décimales).',
    output:
      'Prix de sortie : un montant en dollars comme 1.50 (jusqu’à 6 décimales).',
    cached: 'Prix d’entrée en cache : un montant en dollars, ou laissez vide.',
    date: 'Choisissez la date à partir de laquelle ce prix s’applique.',
    label: 'La source fait au plus 120 caractères.',
  },
  confirmPrice: (from) =>
    `Appliquer ce prix aux requêtes envoyées depuis le ${from} ? Leur estimation changera (les anciens prix restent dans l’historique).`,
  priceAdded: (model, from) =>
    `Prix de référence ajouté pour ${model} à partir du ${from}.`,
  priceInvalid:
    'Ce prix de référence n’est pas valide. Rien n’a été enregistré.',
  chooseDate: 'Choisissez une date.',
  confirmDeleteStats: (before) =>
    `Supprimer les statistiques locales des requêtes envoyées avant le ${before} ? Cela supprime les enregistrements de Correctly pour ces requêtes et les modifications appliquées. Cela ne supprime PAS vos clés API, vos limites d’usage ni ce qu’elles ont déjà compté (les limites restent appliquées), ni rien chez Google ou OpenAI. C’est irréversible.`,
  statsDeleted: (count) =>
    `${count} enregistrement(s) de requête supprimé(s). Les limites d’usage sont inchangées.`,
  rangeError: (code, max) =>
    code === 'missing'
      ? 'Choisissez une date de début et une date de fin.'
      : code === 'order'
        ? 'La date de fin est avant la date de début.'
        : `Choisissez au plus ${max} jours.`,
  shortcutsDamaged:
    'Les raccourcis enregistrés sont endommagés. Ils n’ont pas été modifiés ; rien ne peut être changé tant qu’ils ne sont pas réparés.',
  v4Found: (count) =>
    `Vos ${count} raccourci(s) V4 ont été retrouvé(s) et sont affichés ci-dessous. Ils seront enregistrés au nouveau format à votre prochaine modification ; l’ancienne copie est conservée.`,
  shortcutsNoAccess:
    'L’accès aux sites n’a pas été accordé : les raccourcis ne sont pas développés.',
  shortcutsOn:
    'Raccourcis activés. Rechargez les pages déjà ouvertes pour les utiliser.',
  shortcutsOff: 'Raccourcis désactivés. La saisie n’est jamais modifiée.',
  shortcutUpdated: 'Raccourci mis à jour.',
  shortcutSaved: (trigger) => `Raccourci « ${trigger} » enregistré.`,
  addShortcut: 'Ajouter le raccourci',
  shortcutToggled: (trigger, enabled) =>
    `« ${trigger} » ${enabled ? 'activé' : 'désactivé'}.`,
  confirmDeleteShortcut: (trigger) => `Supprimer le raccourci « ${trigger} » ?`,
  shortcutDeleted: (trigger) => `« ${trigger} » supprimé.`,
  backupDone:
    'Sauvegarde téléchargée. Elle contient vos textes de remplacement (parfois privés) mais jamais votre clé API.',
  fileUnreadable: 'Le fichier n’a pas pu être lu.',
  nothingModified: 'Rien n’a été modifié.',
  importSummary: (p) =>
    `${p.total} raccourci(s) dans le fichier : ${p.added} nouveau(x), ${p.identical} identique(s), ${p.conflicts} différent(s) des vôtres` +
    (p.policy === 'skip' && p.conflicts ? ' (conservés tels quels)' : '') +
    (p.policy === 'overwrite' && p.conflicts
      ? ' (remplacés par le fichier)'
      : '') +
    (p.removed ? ` ; ${p.removed} des vôtres seront SUPPRIMÉS` : '') +
    '.',
  invalidImport: 'Import invalide.',
  confirmReplaceAll: (count, removed) =>
    `Remplacer TOUS vos raccourcis par les ${count} du fichier ? ${removed} raccourci(s) actuel(s) seront supprimé(s). Exportez d’abord une sauvegarde en cas de doute.`,
  replaceAllAction: 'Tout remplacer',
  importDone: (added, replaced, removed) =>
    `Import terminé : ${added} ajouté(s)` +
    (replaced === null ? '' : `, ${replaced} remplacé(s)`) +
    (removed ? `, ${removed} supprimé(s)` : '') +
    '.',
  tags: {
    off: 'désactivé',
    protected: 'protégé de l’IA',
    replacementProtected: 'remplacement protégé',
  },
  shortcutError: (code, params) => FR_SHORTCUT_ERRORS[code](params),
  commands: {
    _execute_action: 'Bouton de la barre d’outils',
    'open-correctly': 'Ouvrir Correctly',
    'correct-selection': 'Corriger la sélection',
    'rewrite-selection': 'Reformuler la sélection',
    'translate-selection': 'Traduire la sélection',
  },
  keyAction: {
    open: 'Ouvrir Correctly',
    correct: 'Corriger la sélection',
    rewrite: 'Reformuler la sélection',
    translate: 'Traduire la sélection',
    capture: 'Capturer du texte d’une zone d’écran',
  },
  notSet: 'non défini',
  keysNoAccess:
    'L’accès aux sites n’a pas été accordé : les raccourcis Correctly restent désactivés.',
  keysOn:
    'Raccourcis Correctly activés. Rechargez les pages déjà ouvertes pour les utiliser.',
  keysOff: 'Raccourcis Correctly désactivés.',
  pressFor: (action) =>
    `Appuyez sur la combinaison pour « ${action} » (Échap pour annuler).`,
  keyCleared: (action) => `Raccourci de « ${action} » effacé.`,
  noChange: 'Aucun changement.',
  keyUnusable: 'Cette touche ne peut pas être utilisée.',
  keyTaken: (combo, action) => `${combo} est déjà utilisé pour « ${action} ».`,
  bindingSaved: (combo, action, enabled) =>
    `${combo} enregistré pour « ${action} ».${enabled ? ' Rechargez les pages déjà ouvertes.' : ' Activez les raccourcis Correctly ci-dessus pour l’utiliser.'}`,
  pressCombination: 'Appuyez sur une combinaison…',
  noneBound: 'aucun',
  cancelRecord: 'Annuler',
  modify: 'Modifier',
  define: 'Définir',
  recordLabel: (verb, action) => `${verb} le raccourci de « ${action} »`,
  clear: 'Effacer',
  clearLabel: (action) => `Effacer le raccourci de « ${action} »`,
  sameAsBrowser: (shortcut) =>
    `Identique au raccourci du navigateur (${shortcut}) : inutile ici.`,
  clashWith: (shortcut, action) =>
    `Attention : ${shortcut} est aussi le raccourci navigateur de « ${action} ».`,
  bindingProblem: (problem, combo) =>
    problem === 'key'
      ? 'Cette touche ne peut pas être utilisée.'
      : problem === 'modifier'
        ? 'Ajoutez Ctrl, Alt ou Meta (sauf pour les touches F1 à F12) : sinon la touche ne pourrait plus être tapée.'
        : problem === 'altSpace'
          ? 'Alt+Espace est réservé au système.'
          : `${combo} est utilisé par le navigateur ou l’édition de texte : choisissez une autre combinaison.`,
  account: {
    status: {
      off: 'Désactivé.',
      synced: 'Sauvegardé.',
      pending: 'En attente…',
      locked:
        'Des clés sauvegardées sont disponibles : saisissez la phrase secrète ci-dessous pour les déverrouiller.',
      needsPassphrase:
        'Choisissez une phrase secrète ci-dessous pour chiffrer et sauvegarder vos clés.',
      error: 'Non sauvegardé.',
    },
    syncedAt: (time) => `Sauvegardé à ${time}.`,
    error: {
      CLOUD_NOT_CONFIGURED:
        'La sauvegarde du compte n’est pas configurée dans cette version.',
      CLOUD_SIGNIN_CANCELLED: 'Connexion annulée.',
      CLOUD_SIGNIN_FAILED: 'La connexion a échoué. Rien n’a été modifié.',
      CLOUD_SESSION_EXPIRED: 'Votre session a expiré : reconnectez-vous.',
      CLOUD_OFFLINE:
        'Le service est injoignable. Vos données sont en sécurité ici ; nouvel essai au prochain changement.',
      CLOUD_CONFLICT:
        'Un autre ordinateur a modifié ceci en même temps : réessayez.',
      CLOUD_TOO_LARGE:
        'Trop volumineux pour être sauvegardé : rien n’a été envoyé ni tronqué. Raccourcissez ou supprimez des raccourcis texte.',
      CLOUD_DENIED: 'Le service a refusé la demande. Rien n’a été modifié.',
      CLOUD_WRONG_PASSPHRASE:
        'Phrase secrète incorrecte : rien n’a été modifié.',
      CLOUD_NOT_SIGNED_IN: 'Connectez-vous d’abord.',
      CLOUD_WEAK_PASSPHRASE: 'Utilisez au moins 8 caractères.',
      CLOUD_LOCAL_DAMAGED:
        'Les données de cet ordinateur sont endommagées : elles ne sont ni envoyées ni remplacées.',
      CLOUD_REMOTE_DAMAGED:
        'Les données sauvegardées sont illisibles : rien n’a été appliqué.',
    },
    notConfigured:
      'La sauvegarde du compte n’est pas configurée dans cette version.',
    signedOut: 'Non connecté. Tout reste sur cet ordinateur.',
    signedInAs: (email) => `Connecté en tant que ${email}.`,
    signedIn: 'Connecté. Vos données sont en cours de sauvegarde.',
    signedOutDone: 'Déconnecté. Cet ordinateur garde toutes ses données.',
    backedUp: 'Sauvegarde terminée.',
    restored: 'Restauré depuis votre compte.',
    replaced:
      'La version précédente de cet ordinateur a été remplacée par celle de votre compte (une copie est conservée).',
    confirmRestore:
      'Remplacer les données de cet ordinateur par la version de votre compte ? La version actuelle est gardée dans une copie de sécurité.',
    restoreAction: 'Restaurer',
    passSet: 'Chiffrer et sauvegarder mes clés',
    passChange: 'Changer la phrase secrète',
    passUnlock: 'Déverrouiller les clés sauvegardées',
    passReplace: 'Utiliser plutôt une nouvelle phrase…',
    passMismatch: 'Les deux phrases secrètes sont différentes.',
    passSaved:
      'Phrase secrète enregistrée : vos clés sont chiffrées et sauvegardées. Saisissez la même phrase une fois sur vos autres ordinateurs.',
    unlocked: 'Clés déverrouillées : elles sont maintenant sur cet ordinateur.',
    passNeedsAccount:
      'Connectez-vous d’abord et cochez « Clés API et routes » ci-dessus.',
    confirmReplace:
      'Les clés de votre compte seront remplacées par celles de cet ordinateur, chiffrées avec la nouvelle phrase. Vos autres ordinateurs en auront besoin. Continuer ?',
    replaceAction: 'Remplacer',
    confirmDelete:
      'Supprimer toutes vos données Correctly dans le cloud et votre compte ? C’est irréversible. Cet ordinateur garde toutes ses données.',
    deleteAction: 'Supprimer',
    deleted: 'Compte et données cloud supprimés.',
  },
};

export const OPTIONS: Record<Locale, OptionsMessages> = { en: EN, fr: FR };
