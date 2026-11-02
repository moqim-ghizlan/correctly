// V5.7 API-key profiles and per-action routes. Nothing here touches the
// network. Secrets live under their own storage key, read only by the worker
// (to call a provider) and by the settings page's write path; they are never
// rendered, messaged, exported or logged.
import { isErrorCode, type ErrorCode } from './errors';
import {
  PROFILE_ID,
  ROUTE_SLOTS,
  isModelId,
  isProviderId,
  modelStatus,
  type ProviderId,
  type RouteSlot,
} from './models';

export {
  PROFILE_ID,
  ROUTE_SLOTS,
  SLOT_LABELS,
  TASKS,
  isRouteSlot,
  type RouteSlot,
  type TaskKind,
} from './models';
import { normalizeSettings } from './settings';
import { STORAGE_KEYS, type StorageArea } from './storage';

/** Public profile metadata and routes (written by the settings page). */
export const PROVIDERS_KEY = 'correctly.v5.providers';
/** Raw API keys (written by the settings page and the V5.1 migration). */
export const SECRETS_KEY = 'correctly.v5.secrets';
/** Key checks and model lists (written by the worker only). */
export const CHECKS_KEY = 'correctly.v5.keyChecks';

export const MAX_PROFILES = 20;
export const MAX_LABEL = 40;
const MIN_KEY = 20;
const MAX_KEY = 300;

export interface ProviderProfile {
  id: string;
  provider: ProviderId;
  label: string;
  enabled: boolean;
  /** Bumped when the key is replaced: ties checks and usage to one key. */
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface Route {
  credentialId: string;
  modelId: string;
}

export interface ProviderStore {
  schemaVersion: 1;
  revision: number;
  profiles: ProviderProfile[];
  /**
   * `default` null = no route. A task slot null = "use default"; a task slot
   * that names a deleted/disabled profile blocks that task (never inherits).
   */
  routes: Record<RouteSlot, Route | null>;
}

interface SecretRecord {
  provider: ProviderId;
  revision: number;
  key: string;
}

export interface SecretStore {
  schemaVersion: 1;
  secrets: Record<string, SecretRecord>;
}

/** 5.13: stable codes; the settings page words them in its language. */
export type ProviderErrorCode =
  | 'labelRequired'
  | 'labelTooLong'
  | 'labelControl'
  | 'keyRequired'
  | 'keySpaces'
  | 'keyChars'
  | 'keyLength'
  | 'looksGoogle'
  | 'looksOpenai'
  | 'storeDamaged'
  | 'saveUnverified'
  | 'changedElsewhere'
  | 'labelExists'
  | 'chooseProvider'
  | 'tooManyKeys'
  | 'chooseKey'
  | 'keyDisabled'
  | 'modelInvalid'
  | 'modelMismatch';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'ProviderError';
  }
}

const emptyRoutes = (): Record<RouteSlot, Route | null> => ({
  default: null,
  correction: null,
  rewrite: null,
  translation: null,
  translateRewrite: null,
  summary: null,
  realtime: null,
});

export const emptyProviders = (): ProviderStore => ({
  schemaVersion: 1,
  revision: 0,
  profiles: [],
  routes: emptyRoutes(),
});

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const iso = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export const canonicalLabel = (label: string) =>
  label.normalize('NFC').trim().toLowerCase();

export function validateLabel(input: unknown): string {
  const label = typeof input === 'string' ? input.trim() : '';
  if (!label) throw new ProviderError('labelRequired');
  if ([...label].length > MAX_LABEL)
    throw new ProviderError('labelTooLong', { max: MAX_LABEL });
  if (CONTROL.test(label)) throw new ProviderError('labelControl');
  return label;
}

/**
 * Structural check only; validity is proven by the provider. Edge spaces are
 * trimmed (the form says so); the key itself is never echoed in a message.
 */
export function validateKey(provider: ProviderId, input: unknown): string {
  const key = typeof input === 'string' ? input.trim() : '';
  if (!key) throw new ProviderError('keyRequired');
  if (/\s/.test(key)) throw new ProviderError('keySpaces');
  // Token characters only (Google and OpenAI keys use far fewer).
  if (!/^[A-Za-z0-9._~+/=:-]+$/.test(key)) throw new ProviderError('keyChars');
  if (key.length < MIN_KEY || key.length > MAX_KEY)
    throw new ProviderError('keyLength', { min: MIN_KEY, max: MAX_KEY });
  if (provider === 'openai' && key.startsWith('AIza'))
    throw new ProviderError('looksGoogle');
  if (provider === 'gemini' && key.startsWith('sk-'))
    throw new ProviderError('looksOpenai');
  return key;
}

function parseProfile(value: unknown): ProviderProfile | null {
  const data = record(value);
  if (!data) return null;
  const revision = count(data.revision);
  const createdAt = iso(data.createdAt);
  const updatedAt = iso(data.updatedAt);
  if (
    typeof data.id !== 'string' ||
    !PROFILE_ID.test(data.id) ||
    !isProviderId(data.provider) ||
    typeof data.enabled !== 'boolean' ||
    revision === null ||
    revision < 1 ||
    !createdAt ||
    !updatedAt
  )
    return null;
  try {
    return {
      id: data.id,
      provider: data.provider,
      label: validateLabel(data.label),
      enabled: data.enabled,
      revision,
      createdAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

/** A malformed route is kept as a blocking route, never as "use default". */
const BROKEN: Route = { credentialId: '', modelId: '' };

function parseRoute(value: unknown): Route | null {
  if (value === null || value === undefined) return null;
  const data = record(value);
  return data &&
    typeof data.credentialId === 'string' &&
    PROFILE_ID.test(data.credentialId) &&
    isModelId(data.modelId)
    ? { credentialId: data.credentialId, modelId: data.modelId }
    : BROKEN;
}

export interface LoadedProviders {
  store: ProviderStore;
  secrets: SecretStore;
  /** The stored value is not a V5.7 store at all: never overwritten. */
  damaged: boolean;
  /** Profile entries that were invalid and are ignored. */
  dropped: number;
}

function parseStore(value: unknown): Omit<LoadedProviders, 'secrets'> {
  if (value === undefined)
    return { store: emptyProviders(), damaged: false, dropped: 0 };
  const data = record(value);
  const revision = count(data?.revision);
  if (
    !data ||
    data.schemaVersion !== 1 ||
    revision === null ||
    !Array.isArray(data.profiles)
  )
    return { store: emptyProviders(), damaged: true, dropped: 0 };
  const ids = new Set<string>();
  const profiles: ProviderProfile[] = [];
  for (const item of data.profiles as unknown[]) {
    const profile = parseProfile(item);
    if (profile && !ids.has(profile.id) && profiles.length < MAX_PROFILES) {
      ids.add(profile.id);
      profiles.push(profile);
    }
  }
  const routes = record(data.routes) ?? {};
  return {
    store: {
      schemaVersion: 1,
      revision,
      profiles,
      routes: Object.fromEntries(
        ROUTE_SLOTS.map((slot) => [slot, parseRoute(routes[slot])]),
      ) as Record<RouteSlot, Route | null>,
    },
    damaged: false,
    dropped: data.profiles.length - profiles.length,
  };
}

function parseSecrets(value: unknown): SecretStore {
  const data = record(record(value)?.secrets) ?? {};
  const secrets: Record<string, SecretRecord> = {};
  for (const [id, raw] of Object.entries(data)) {
    const item = record(raw);
    const revision = count(item?.revision);
    if (
      PROFILE_ID.test(id) &&
      item &&
      isProviderId(item.provider) &&
      revision !== null &&
      typeof item.key === 'string'
    )
      try {
        secrets[id] = {
          provider: item.provider,
          revision,
          key: validateKey(item.provider, item.key),
        };
      } catch {
        // An invalid key is unusable: the profile resolves as broken.
      }
  }
  return { schemaVersion: 1, secrets };
}

export async function loadProviders(
  area: StorageArea,
): Promise<LoadedProviders> {
  const data = await area.get([PROVIDERS_KEY, SECRETS_KEY]);
  return {
    ...parseStore(data[PROVIDERS_KEY]),
    secrets: parseSecrets(data[SECRETS_KEY]),
  };
}

/** Metadata only, for views that must never hold a key. */
export async function loadProfiles(
  area: StorageArea,
): Promise<Omit<LoadedProviders, 'secrets'>> {
  return parseStore((await area.get([PROVIDERS_KEY]))[PROVIDERS_KEY]);
}

// ---- Route resolution (pure) ---------------------------------------------

/** What a request is bound to; holds no key and is safe to show or record. */
export interface RouteSnapshot {
  provider: ProviderId;
  credentialId: string;
  revision: number;
  modelId: string;
}

export type Resolved =
  | { ok: true; route: RouteSnapshot; key: string }
  | { ok: false; code: ErrorCode };

/**
 * Exactly the route configured for this slot: an explicit task route, or the
 * default only when the task is set to "use default". Never another key,
 * model or provider.
 */
export function resolveRoute(
  store: ProviderStore,
  secrets: SecretStore,
  slot: RouteSlot,
): Resolved {
  const route = store.routes[slot] ?? store.routes.default;
  if (!route) return { ok: false, code: 'NOT_CONFIGURED' };
  const profile = store.profiles.find((p) => p.id === route.credentialId);
  if (!profile) return { ok: false, code: 'ROUTE_BROKEN' };
  if (!profile.enabled) return { ok: false, code: 'PROFILE_DISABLED' };
  const secret = secrets.secrets[profile.id];
  if (
    !secret ||
    secret.provider !== profile.provider ||
    secret.revision !== profile.revision
  )
    return { ok: false, code: 'ROUTE_BROKEN' };
  const status = modelStatus(profile.provider, route.modelId);
  if (status === 'invalid' || status === 'mismatch')
    return { ok: false, code: 'MODEL_UNAVAILABLE' };
  return {
    ok: true,
    route: {
      provider: profile.provider,
      credentialId: profile.id,
      revision: profile.revision,
      modelId: route.modelId,
    },
    key: secret.key,
  };
}

export const sameRoute = (a: RouteSnapshot, b: RouteSnapshot) =>
  a.provider === b.provider &&
  a.credentialId === b.credentialId &&
  a.revision === b.revision &&
  a.modelId === b.modelId;

/** Slots that name this profile explicitly (for delete/disable warnings). */
export const slotsUsing = (store: ProviderStore, id: string): RouteSlot[] =>
  ROUTE_SLOTS.filter((slot) => store.routes[slot]?.credentialId === id);

// ---- Writes ----------------------------------------------------------------

interface Pair {
  store: ProviderStore;
  secrets: SecretStore;
}

/**
 * The single write path. Settings pages and the worker's migration share one
 * extension origin: a Web Lock serializes read → change → write → read back,
 * and each change applies to the LATEST data, so independent edits merge.
 * Metadata and secrets are written in one storage call.
 */
export async function mutateProviders(
  area: StorageArea,
  change: (pair: Pair) => Pair,
): Promise<Pair> {
  const run = async (): Promise<Pair> => {
    const latest = await loadProviders(area);
    if (latest.damaged) throw new ProviderError('storeDamaged');
    const changed = change({ store: latest.store, secrets: latest.secrets });
    const ids = new Set(changed.store.profiles.map((p) => p.id));
    const next: Pair = {
      store: { ...changed.store, revision: latest.store.revision + 1 },
      // Secrets of deleted or dropped profiles are removed with them.
      secrets: {
        schemaVersion: 1,
        secrets: Object.fromEntries(
          Object.entries(changed.secrets.secrets).filter(([id]) => ids.has(id)),
        ),
      },
    };
    await area.set({
      [PROVIDERS_KEY]: next.store,
      [SECRETS_KEY]: next.secrets,
    });
    const check = await loadProviders(area);
    if (
      JSON.stringify(check.store) !== JSON.stringify(next.store) ||
      JSON.stringify(check.secrets) !== JSON.stringify(next.secrets)
    )
      throw new ProviderError('saveUnverified');
    return next;
  };
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks) return locks.request(PROVIDERS_KEY, run);
  // No Web Locks: at least serialize the writes made from this context.
  const next = localQueue.then(run, run);
  localQueue = next.catch(() => undefined);
  return next;
}
let localQueue: Promise<unknown> = Promise.resolve();

const newId = () => crypto.randomUUID();

/** Fails if another window changed or deleted this profile since it was shown. */
function current(store: ProviderStore, expected: ProviderProfile) {
  const found = store.profiles.find((p) => p.id === expected.id);
  if (!found || JSON.stringify(found) !== JSON.stringify(expected))
    throw new ProviderError('changedElsewhere');
  return found;
}

function uniqueLabel(store: ProviderStore, label: string, except?: string) {
  if (
    store.profiles.some(
      (p) =>
        p.id !== except && canonicalLabel(p.label) === canonicalLabel(label),
    )
  )
    throw new ProviderError('labelExists', { label });
}

const replaceProfile = (store: ProviderStore, next: ProviderProfile) => ({
  ...store,
  profiles: store.profiles.map((p) => (p.id === next.id ? next : p)),
});

export const addProfile =
  (
    draft: { provider: unknown; label: unknown; key: unknown },
    now = new Date(),
  ) =>
  ({ store, secrets }: Pair): Pair => {
    if (!isProviderId(draft.provider))
      throw new ProviderError('chooseProvider');
    const provider = draft.provider;
    const label = validateLabel(draft.label);
    const key = validateKey(provider, draft.key);
    if (store.profiles.length >= MAX_PROFILES)
      throw new ProviderError('tooManyKeys', { max: MAX_PROFILES });
    uniqueLabel(store, label);
    const at = now.toISOString();
    const profile: ProviderProfile = {
      id: newId(),
      provider,
      label,
      enabled: true,
      revision: 1,
      createdAt: at,
      updatedAt: at,
    };
    return {
      store: { ...store, profiles: [...store.profiles, profile] },
      secrets: {
        schemaVersion: 1,
        secrets: {
          ...secrets.secrets,
          [profile.id]: { provider, revision: 1, key },
        },
      },
    };
  };

/** Metadata only: no key is read or touched. */
export const renameProfile =
  (expected: ProviderProfile, label: unknown, now = new Date()) =>
  ({ store, secrets }: Pair): Pair => {
    const found = current(store, expected);
    const name = validateLabel(label);
    uniqueLabel(store, name, found.id);
    return {
      store: replaceProfile(store, {
        ...found,
        label: name,
        updatedAt: now.toISOString(),
      }),
      secrets,
    };
  };

/** New key, new revision: earlier checks no longer describe this profile. */
export const replaceKey =
  (expected: ProviderProfile, key: unknown, now = new Date()) =>
  ({ store, secrets }: Pair): Pair => {
    const found = current(store, expected);
    const value = validateKey(found.provider, key);
    const revision = found.revision + 1;
    return {
      store: replaceProfile(store, {
        ...found,
        revision,
        updatedAt: now.toISOString(),
      }),
      secrets: {
        schemaVersion: 1,
        secrets: {
          ...secrets.secrets,
          [found.id]: { provider: found.provider, revision, key: value },
        },
      },
    };
  };

export const setProfileEnabled =
  (expected: ProviderProfile, enabled: boolean, now = new Date()) =>
  ({ store, secrets }: Pair): Pair => {
    const found = current(store, expected);
    return {
      store: replaceProfile(store, {
        ...found,
        enabled,
        updatedAt: now.toISOString(),
      }),
      secrets,
    };
  };

/** Routes that named it stay pointed at it and block until reconfigured. */
export const deleteProfile =
  (expected: ProviderProfile) =>
  ({ store, secrets }: Pair): Pair => {
    current(store, expected);
    const rest = { ...secrets.secrets };
    delete rest[expected.id];
    return {
      store: {
        ...store,
        profiles: store.profiles.filter((p) => p.id !== expected.id),
      },
      secrets: { schemaVersion: 1, secrets: rest },
    };
  };

/** `null` = no route (default) or "use default" (a task). */
export const setRoute =
  (slot: RouteSlot, route: Route | null) =>
  ({ store, secrets }: Pair): Pair => {
    if (route) {
      const profile = store.profiles.find((p) => p.id === route.credentialId);
      if (!profile) throw new ProviderError('chooseKey');
      if (!profile.enabled)
        throw new ProviderError('keyDisabled', { label: profile.label });
      const status = modelStatus(profile.provider, route.modelId);
      if (status === 'invalid') throw new ProviderError('modelInvalid');
      if (status === 'mismatch')
        throw new ProviderError('modelMismatch', {
          label: profile.label,
          provider: profile.provider === 'gemini' ? 'Google Gemini' : 'OpenAI',
        });
    }
    return {
      store: {
        ...store,
        routes: {
          ...store.routes,
          [slot]: route && {
            credentialId: route.credentialId,
            modelId: route.modelId,
          },
        },
      },
      secrets,
    };
  };

// ---- V5.1 migration -------------------------------------------------------

export const MIGRATED_LABEL = 'Gemini — Migrated';

/**
 * Moves a V5.1 single Gemini key into a profile (and the default route, if
 * none is set), verifies it, then clears the old field. Idempotent: a key
 * already saved as a profile is never duplicated. No network.
 */
export async function migrateLegacyKey(
  area: StorageArea,
  now = new Date(),
): Promise<void> {
  const raw = (await area.get([STORAGE_KEYS.settings]))[STORAGE_KEYS.settings];
  const legacy = normalizeSettings(raw);
  const key = legacy.gemini.apiKey;
  if (!key) return;
  await mutateProviders(area, ({ store, secrets }) => {
    if (Object.values(secrets.secrets).some((s) => s.key === key))
      return { store, secrets };
    let label = MIGRATED_LABEL;
    for (
      let n = 2;
      store.profiles.some(
        (p) => canonicalLabel(p.label) === canonicalLabel(label),
      );
      n++
    )
      label = `${MIGRATED_LABEL} ${n}`;
    const next = addProfile(
      { provider: 'gemini', label, key },
      now,
    )({ store, secrets });
    const added = next.store.profiles[next.store.profiles.length - 1];
    if (added && !next.store.routes.default)
      next.store.routes = {
        ...next.store.routes,
        default: { credentialId: added.id, modelId: legacy.gemini.modelId },
      };
    return next;
  });
  // Only after the profile is verified on disk: drop the duplicate secret.
  const fresh = (await area.get([STORAGE_KEYS.settings]))[
    STORAGE_KEYS.settings
  ];
  const settings = normalizeSettings(fresh);
  if (settings.gemini.apiKey === key)
    await area.set({
      [STORAGE_KEYS.settings]: {
        ...settings,
        gemini: { ...settings.gemini, apiKey: null },
      },
    });
}

// ---- Key checks (worker-written) -----------------------------------------

export interface KeyCheck {
  revision: number;
  checkedAt: string;
  ok: boolean;
  errorCode: ErrorCode | null;
  models: string[];
}

export const MAX_LISTED_MODELS = 300;

export function parseChecks(value: unknown): Record<string, KeyCheck> {
  const data = record(record(value)?.profiles) ?? {};
  const checks: Record<string, KeyCheck> = {};
  for (const [id, raw] of Object.entries(data)) {
    const item = record(raw);
    const revision = count(item?.revision);
    const checkedAt = iso(item?.checkedAt);
    if (!PROFILE_ID.test(id) || !item || revision === null || !checkedAt)
      continue;
    checks[id] = {
      revision,
      checkedAt,
      ok: item.ok === true,
      errorCode: isErrorCode(item.errorCode) ? item.errorCode : null,
      models: Array.isArray(item.models)
        ? (item.models as unknown[])
            .filter(isModelId)
            .slice(0, MAX_LISTED_MODELS)
        : [],
    };
  }
  return checks;
}
