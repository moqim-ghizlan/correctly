// The four backed-up domains of V5.17 (the 5.14 formats): read this
// computer's version as a canonical payload, write a validated payload back,
// parse an untrusted one. No network, no log.
import { CloudError } from '../shared/cloud';
import { loadKeybindings, saveKeybindings } from '../shared/keybindings';
import { PROVIDERS_KEY, SECRETS_KEY, loadProviders } from '../shared/providers';
import { SHORTCUTS_KEY, loadShortcuts } from '../shared/shortcuts';
import {
  loadSettings,
  saveSettings,
  type StorageArea,
} from '../shared/storage';
import {
  canonicalJson,
  isDefaultSettings,
  mergeSettings,
  parseSyncedKeybindings,
  parseSyncedKeys,
  parseSyncedSettings,
  parseSyncedShortcuts,
  pickSettings,
  sha256,
  type SyncDomain,
} from '../shared/sync';

export interface DomainPayload {
  payload: unknown;
  contentHash: string;
  /** Nothing to offer (an empty list, default settings, no key). */
  empty: boolean;
}

export const hashOf = (payload: unknown) => sha256(canonicalJson(payload));

/** Same lock names as the settings page's write paths (Web Locks). */
export function withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? (locks.request(name, task) as Promise<T>) : task();
}

/** Untrusted payload (from the cloud or a backup slot) → normalized. */
export async function parseDomain(
  domain: SyncDomain,
  data: unknown,
): Promise<{ payload: unknown; empty: boolean } | null> {
  switch (domain) {
    case 'shortcuts': {
      const payload = parseSyncedShortcuts(data);
      return payload ? { payload, empty: !payload.shortcuts.length } : null;
    }
    case 'settings': {
      const payload = parseSyncedSettings(data);
      return payload ? { payload, empty: isDefaultSettings(payload) } : null;
    }
    case 'keybindings': {
      const payload = parseSyncedKeybindings(data);
      return payload
        ? { payload, empty: !Object.keys(payload.bindings).length }
        : null;
    }
    case 'keys': {
      const payload = await parseSyncedKeys(data);
      return payload
        ? { payload, empty: !payload.store.profiles.length }
        : null;
    }
  }
}

/** null = this computer's data is damaged (never read as "empty"). */
export async function readLocalDomain(
  area: StorageArea,
  domain: SyncDomain,
): Promise<DomainPayload | null> {
  let raw: unknown;
  if (domain === 'shortcuts') {
    const loaded = await loadShortcuts(area);
    if (loaded.damaged) return null;
    raw = { shortcuts: loaded.store.shortcuts };
  } else if (domain === 'settings') {
    raw = pickSettings(await loadSettings(area));
  } else if (domain === 'keybindings') {
    raw = { bindings: (await loadKeybindings(area)).bindings };
  } else {
    const loaded = await loadProviders(area);
    if (loaded.damaged) return null;
    raw = { store: loaded.store, secrets: loaded.secrets };
  }
  const parsed = await parseDomain(domain, raw);
  return parsed
    ? { ...parsed, contentHash: await hashOf(parsed.payload) }
    : null;
}

/** Writes a validated payload into storage.local, keeping local-only fields. */
export async function applyLocalDomain(
  area: StorageArea,
  domain: SyncDomain,
  payload: unknown,
): Promise<void> {
  if (domain === 'shortcuts') {
    const { shortcuts } = payload as { shortcuts: unknown[] };
    await withLock(SHORTCUTS_KEY, async () => {
      const latest = await loadShortcuts(area);
      if (latest.damaged) throw new CloudError('CLOUD_LOCAL_DAMAGED');
      await area.set({
        [SHORTCUTS_KEY]: {
          schemaVersion: 2,
          revision: latest.store.revision + 1,
          enabled: latest.store.enabled,
          shortcuts,
        },
      });
    });
  } else if (domain === 'settings') {
    const synced = parseSyncedSettings(payload);
    if (!synced) throw new CloudError('CLOUD_REMOTE_DAMAGED');
    await saveSettings(area, mergeSettings(await loadSettings(area), synced));
  } else if (domain === 'keybindings') {
    const local = await loadKeybindings(area);
    await saveKeybindings(area, {
      ...local,
      bindings: (payload as { bindings: typeof local.bindings }).bindings,
    });
  } else {
    const keys = await parseSyncedKeys(payload);
    if (!keys) throw new CloudError('CLOUD_REMOTE_DAMAGED');
    await withLock(PROVIDERS_KEY, async () => {
      const latest = await loadProviders(area);
      if (latest.damaged) throw new CloudError('CLOUD_LOCAL_DAMAGED');
      await area.set({
        [PROVIDERS_KEY]: { ...keys.store, revision: latest.store.revision + 1 },
        [SECRETS_KEY]: keys.secrets,
      });
    });
  }
}
