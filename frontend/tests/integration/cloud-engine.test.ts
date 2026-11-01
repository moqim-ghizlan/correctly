import { describe, expect, it, vi } from 'vitest';
import { CloudEngine, type CloudArea } from '../../src/background/cloud';
import {
  CLOUD_BACKUP_NOW,
  CLOUD_DELETE_ACCOUNT,
  CLOUD_DOMAIN,
  CLOUD_PASSPHRASE,
  CLOUD_RESTORE,
  CLOUD_SECRET_KEY,
  CLOUD_SESSION_KEY,
  CLOUD_SIGN_IN,
  CLOUD_SIGN_OUT,
  CLOUD_STATE_KEY,
  CLOUD_BASE_KEY,
  type CloudSession,
  isCloudRequest,
  normalizeCloudState,
} from '../../src/shared/cloud';
import type { CloudConfig } from '../../src/shared/cloud-config';
import { PROVIDERS_KEY, SECRETS_KEY } from '../../src/shared/providers';
import { SHORTCUTS_KEY, type ShortcutRecord } from '../../src/shared/shortcuts';
import { STORAGE_KEYS } from '../../src/shared/storage';
import {
  FAKE_KEY,
  FastFakeStorage,
  GEMINI_ID,
  jsonResponse,
  profile,
  seedProviders,
} from '../helpers/fake-storage';

const CONFIG: CloudConfig = {
  apiKey: `AIza${'a'.repeat(35)}`,
  projectId: 'correctly-test1',
  oauthClientId: '123-abc.apps.googleusercontent.com',
};
const REDIRECT = 'https://abc.chromiumapp.org/';
const NOW = 1_800_000_000_000;

class Local extends FastFakeStorage implements CloudArea {
  remove(keys: string[]): Promise<void> {
    for (const key of keys) this.data.delete(key);
    return Promise.resolve();
  }
}

/** A tiny Firestore + Identity Toolkit, with the real precondition rules. */
class Cloud {
  docs = new Map<string, { fields: Record<string, unknown>; time: number }>();
  requests: string[] = [];
  accountDeleted = false;
  clock = 0;
  failWith: Response | null = null;
  /** Called before a PATCH is applied (to simulate a concurrent write). */
  beforePatch: (() => void) | null = null;

  fetch = vi.fn<typeof fetch>((input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = init?.method ?? 'GET';
    this.requests.push(`${method} ${url.split('?')[0]!}`);
    if (this.failWith) return Promise.resolve(this.failWith);
    if (url.includes('accounts:delete')) {
      this.accountDeleted = true;
      return Promise.resolve(jsonResponse(200, {}));
    }
    if (url.includes('accounts:signInWithIdp')) {
      return Promise.resolve(
        jsonResponse(200, {
          idToken: 'fb-id',
          refreshToken: 'fb-refresh',
          expiresIn: '3600',
          localId: 'u1',
          email: 'me@example.com',
        }),
      );
    }
    const path = /\/documents\/(users\/[^/?]+\/data\/[a-z]+)/.exec(url)?.[1];
    if (!path) return Promise.resolve(jsonResponse(404, {}));
    const current = this.docs.get(path);
    const wire = (doc: { fields: Record<string, unknown>; time: number }) => ({
      name: path,
      fields: doc.fields,
      updateTime: `T${doc.time}`,
    });
    if (method === 'GET')
      return Promise.resolve(
        current
          ? jsonResponse(200, wire(current))
          : jsonResponse(404, { error: { status: 'NOT_FOUND' } }),
      );
    if (method === 'DELETE') {
      this.docs.delete(path);
      return Promise.resolve(jsonResponse(200, {}));
    }
    this.beforePatch?.();
    const now = this.docs.get(path);
    const query = new URL(url).searchParams;
    if (query.get('currentDocument.exists') === 'false' && now)
      return Promise.resolve(
        jsonResponse(409, { error: { status: 'ALREADY_EXISTS' } }),
      );
    const expected = query.get('currentDocument.updateTime');
    if (expected && (!now || `T${now.time}` !== expected))
      return Promise.resolve(
        jsonResponse(400, { error: { status: 'FAILED_PRECONDITION' } }),
      );
    const body = JSON.parse(init?.body as string) as {
      fields: Record<string, unknown>;
    };
    const doc = { fields: body.fields, time: ++this.clock };
    this.docs.set(path, doc);
    return Promise.resolve(jsonResponse(200, wire(doc)));
  });

  stored(domain: string) {
    const doc = this.docs.get(`users/u1/data/${domain}`);
    const payload = doc?.fields.payload as { stringValue: string } | undefined;
    return payload?.stringValue;
  }
}

const SESSION: CloudSession = {
  uid: 'u1',
  email: 'me@example.com',
  refreshToken: 'r1',
  idToken: 'i1',
  expiresAt: NOW + 3_600_000,
};

const shortcut = (id: string, trigger: string, replacement = 'text') =>
  ({
    id,
    trigger,
    replacement,
    enabled: true,
    protectTriggerInAi: true,
    protectReplacementInAi: false,
  }) satisfies ShortcutRecord;

const putShortcuts = (area: Local, list: ShortcutRecord[], revision = 1) =>
  area.data.set(SHORTCUTS_KEY, {
    schemaVersion: 2,
    revision,
    enabled: false,
    shortcuts: list,
  });
const shortcutsOf = (area: Local) =>
  (area.data.get(SHORTCUTS_KEY) as { shortcuts: ShortcutRecord[] })?.shortcuts;

function computer(cloud: Cloud, signedIn = true) {
  const local = new Local();
  if (signedIn) local.data.set(CLOUD_SESSION_KEY, SESSION);
  const engine = new CloudEngine({
    local,
    config: CONFIG,
    redirectUri: REDIRECT,
    fetchImpl: cloud.fetch,
    now: () => NOW,
    iterations: 1000,
    debounceMs: 5,
    launch: () => Promise.resolve(undefined),
  });
  return { local, engine };
}

const state = (area: Local) =>
  normalizeCloudState(area.data.get(CLOUD_STATE_KEY));

describe('not signed in or not configured (F1)', () => {
  it('makes no request at all', async () => {
    const cloud = new Cloud();
    const { engine } = computer(cloud, false);
    await engine.reconcile();
    await engine.handle({ type: CLOUD_BACKUP_NOW });
    expect(cloud.fetch).not.toHaveBeenCalled();

    const local = new Local();
    local.data.set(CLOUD_SESSION_KEY, SESSION);
    const unconfigured = new CloudEngine({
      local,
      config: null,
      redirectUri: REDIRECT,
      fetchImpl: cloud.fetch,
      launch: () => Promise.resolve(undefined),
    });
    await unconfigured.reconcile();
    expect(await unconfigured.handle({ type: CLOUD_SIGN_IN })).toEqual({
      ok: false,
      code: 'CLOUD_NOT_CONFIGURED',
    });
    expect(cloud.fetch).not.toHaveBeenCalled();
  });
});

describe('sign-in', () => {
  it('stores the session, then restores what the cloud holds', async () => {
    const cloud = new Cloud();
    const first = computer(cloud);
    putShortcuts(first.local, [shortcut('a-1', 'hello')]);
    await first.engine.reconcile();
    expect(cloud.stored('shortcuts')).toContain('hello');

    const local = new Local();
    const engine = new CloudEngine({
      local,
      config: CONFIG,
      redirectUri: REDIRECT,
      fetchImpl: cloud.fetch,
      now: () => NOW,
      launch: (url) => {
        const nonce = new URL(url).searchParams.get('nonce')!;
        const part = (v: unknown) => btoa(JSON.stringify(v)).replace(/=+$/, '');
        const token = `${part({ alg: 'x' })}.${part({
          nonce,
          aud: CONFIG.oauthClientId,
          exp: NOW / 1000 + 3600,
        })}.s`;
        return Promise.resolve(`${REDIRECT}#id_token=${token}`);
      },
    });
    expect(await engine.handle({ type: CLOUD_SIGN_IN })).toEqual({ ok: true });
    expect((local.data.get(CLOUD_SESSION_KEY) as CloudSession).email).toBe(
      'me@example.com',
    );
    expect(shortcutsOf(local)).toEqual([shortcut('a-1', 'hello')]);
  });
});

describe('backup and restore', () => {
  it('backs a change up after the quiet time, one write per domain (F4)', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    putShortcuts(local, [shortcut('a-1', 'hello')]);
    engine.onLocalChanged([SHORTCUTS_KEY]);
    engine.onLocalChanged([SHORTCUTS_KEY]);
    expect(cloud.fetch).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(cloud.stored('shortcuts')).toBeDefined());
    await engine.idle();
    const writes = cloud.requests.filter((r) => r.startsWith('PATCH'));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(cloud.stored('shortcuts')!)).toEqual({
      shortcuts: [shortcut('a-1', 'hello')],
    });
  });

  it('ignores storage changes that are not a backed-up domain', async () => {
    const cloud = new Cloud();
    const { engine } = computer(cloud);
    engine.onLocalChanged(['correctly.v5.stats']);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cloud.fetch).not.toHaveBeenCalled();
  });

  it('an empty fresh computer never overwrites the cloud', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    putShortcuts(one.local, [shortcut('a-1', 'hello')]);
    await one.engine.reconcile();
    const two = computer(cloud);
    await two.engine.reconcile();
    expect(shortcutsOf(two.local)).toEqual([shortcut('a-1', 'hello')]);
    expect(
      (JSON.parse(cloud.stored('shortcuts')!) as { shortcuts: unknown[] })
        .shortcuts,
    ).toHaveLength(1);
  });

  it('two computers editing different shortcuts keep both', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    putShortcuts(one.local, [shortcut('a-1', 'hello')]);
    await one.engine.reconcile();
    const two = computer(cloud);
    await two.engine.reconcile();

    putShortcuts(
      one.local,
      [shortcut('a-1', 'hello'), shortcut('b-1', 'one')],
      2,
    );
    putShortcuts(
      two.local,
      [shortcut('a-1', 'hello'), shortcut('c-1', 'two')],
      2,
    );
    await one.engine.reconcile(['shortcuts']);
    await two.engine.reconcile(['shortcuts']);
    await one.engine.reconcile();
    const triggers = (area: Local) =>
      shortcutsOf(area)
        .map((s) => s.trigger)
        .sort();
    expect(triggers(two.local)).toEqual(['hello', 'one', 'two']);
    expect(triggers(one.local)).toEqual(['hello', 'one', 'two']);
  });

  it('retries once after a lost race, then reports it (F7)', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    putShortcuts(one.local, [shortcut('a-1', 'hello')]);
    await one.engine.reconcile();

    const other = computer(cloud);
    await other.engine.reconcile();
    putShortcuts(
      other.local,
      [shortcut('a-1', 'hello'), shortcut('o-1', 'other')],
      2,
    );

    putShortcuts(
      one.local,
      [shortcut('a-1', 'hello'), shortcut('m-1', 'mine')],
      2,
    );
    let raced = false;
    cloud.beforePatch = () => {
      if (raced) return;
      raced = true;
      void other.engine.reconcile(['shortcuts']);
    };
    await one.engine.reconcile(['shortcuts']);
    await other.engine.idle();
    await one.engine.reconcile();
    expect(
      shortcutsOf(one.local)
        .map((s) => s.trigger)
        .sort(),
    ).toEqual(['hello', 'mine', 'other']);
  });

  it('restore applies the cloud version and keeps the replaced one', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    putShortcuts(one.local, [shortcut('a-1', 'hello')]);
    await one.engine.reconcile();
    const two = computer(cloud);
    putShortcuts(two.local, [shortcut('z-1', 'local')]);
    expect(await two.engine.handle({ type: CLOUD_RESTORE })).toEqual({
      ok: true,
    });
    expect(shortcutsOf(two.local)).toEqual([shortcut('a-1', 'hello')]);
    expect(state(two.local).shortcuts.replaced).toBe(true);
  });

  it('a corrupt or oversized cloud document is never applied (F6)', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    putShortcuts(one.local, [shortcut('a-1', 'hello')]);
    await one.engine.reconcile();
    const doc = cloud.docs.get('users/u1/data/shortcuts')!;
    doc.fields.payload = { stringValue: '{"shortcuts":"nope"}' };
    doc.time++;

    const two = computer(cloud);
    putShortcuts(two.local, [shortcut('z-1', 'local')]);
    await two.engine.reconcile();
    expect(shortcutsOf(two.local)).toEqual([shortcut('z-1', 'local')]);
    expect(state(two.local).shortcuts).toMatchObject({
      status: 'error',
      code: 'CLOUD_REMOTE_DAMAGED',
    });
  });

  it('settings never include the handle or consent, and apply back', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    one.local.data.set(STORAGE_KEYS.settings, {
      schemaVersion: 1,
      ui: { language: 'fr' },
      triggers: { keyboard: false, smartButton: true },
      correction: { consent: true },
    });
    await one.engine.reconcile();
    const payload = cloud.stored('settings')!;
    expect(payload).not.toContain('smartButton');
    expect(payload).not.toContain('consent');
    expect(payload).toContain('"language":"fr"');
  });

  it('turning a domain off stops its backup', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    putShortcuts(local, [shortcut('a-1', 'hello')]);
    await engine.handle({
      type: CLOUD_DOMAIN,
      domain: 'shortcuts',
      enabled: false,
    });
    expect(cloud.stored('shortcuts')).toBeUndefined();
    expect(state(local).shortcuts.status).toBe('off');
  });
});

describe('API keys (F5)', () => {
  const seedKeys = (area: Local) =>
    seedProviders(
      area,
      [profile(GEMINI_ID, 'gemini')],
      {
        default: { credentialId: GEMINI_ID, modelId: 'gemini-3.1-flash-lite' },
      },
      { [GEMINI_ID]: FAKE_KEY },
    );

  it('waits for a passphrase, then stores ciphertext only', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    seedKeys(local);
    await engine.reconcile();
    expect(cloud.stored('keys')).toBeUndefined();
    expect(state(local).keys.status).toBe('needsPassphrase');

    expect(
      await engine.handle({
        type: CLOUD_PASSPHRASE,
        passphrase: 'short',
        mode: 'replace',
      }),
    ).toEqual({ ok: false, code: 'CLOUD_WEAK_PASSPHRASE' });
    expect(
      await engine.handle({
        type: CLOUD_PASSPHRASE,
        passphrase: 'correct horse battery',
        mode: 'replace',
      }),
    ).toEqual({ ok: true });
    const wire = cloud.stored('keys')!;
    expect(wire).not.toContain(FAKE_KEY);
    expect(wire).toContain('PBKDF2-SHA-256');
    expect(JSON.stringify(cloud.requests)).not.toContain(FAKE_KEY);
  });

  it('a second computer needs the same passphrase to get the keys back', async () => {
    const cloud = new Cloud();
    const one = computer(cloud);
    seedKeys(one.local);
    await one.engine.handle({
      type: CLOUD_PASSPHRASE,
      passphrase: 'correct horse battery',
      mode: 'replace',
    });

    const two = computer(cloud);
    await two.engine.reconcile();
    expect(state(two.local).keys.status).toBe('locked');
    expect(two.local.data.has(PROVIDERS_KEY)).toBe(false);
    expect(
      await two.engine.handle({
        type: CLOUD_PASSPHRASE,
        passphrase: 'wrong passphrase!',
        mode: 'unlock',
      }),
    ).toEqual({ ok: false, code: 'CLOUD_WRONG_PASSPHRASE' });
    expect(
      await two.engine.handle({
        type: CLOUD_PASSPHRASE,
        passphrase: 'correct horse battery',
        mode: 'unlock',
      }),
    ).toEqual({ ok: true });
    const secrets = two.local.data.get(SECRETS_KEY) as {
      secrets: Record<string, { key: string }>;
    };
    expect(secrets.secrets[GEMINI_ID]?.key).toBe(FAKE_KEY);
  });
});

describe('sign-out and deletion (F8)', () => {
  it('sign-out removes every trace but keeps the user data', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    putShortcuts(local, [shortcut('a-1', 'hello')]);
    await engine.reconcile();
    expect(await engine.handle({ type: CLOUD_SIGN_OUT })).toEqual({ ok: true });
    for (const key of [
      CLOUD_SESSION_KEY,
      CLOUD_STATE_KEY,
      CLOUD_BASE_KEY,
      CLOUD_SECRET_KEY,
    ])
      expect(local.data.has(key)).toBe(false);
    expect(shortcutsOf(local)).toHaveLength(1);
    expect(cloud.stored('shortcuts')).toBeDefined();
  });

  it('deletes the four documents, then the account, then the session', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    putShortcuts(local, [shortcut('a-1', 'hello')]);
    await engine.reconcile();
    expect(await engine.handle({ type: CLOUD_DELETE_ACCOUNT })).toEqual({
      ok: true,
    });
    expect(cloud.docs.size).toBe(0);
    expect(cloud.requests.filter((r) => r.startsWith('DELETE'))).toHaveLength(
      4,
    );
    expect(cloud.accountDeleted).toBe(true);
    expect(local.data.has(CLOUD_SESSION_KEY)).toBe(false);
    expect(shortcutsOf(local)).toHaveLength(1);
  });
});

describe('failures never touch local data', () => {
  it('offline: local work is kept, the code is shown', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    putShortcuts(local, [shortcut('a-1', 'hello')]);
    cloud.fetch.mockImplementation(() => Promise.reject(new TypeError('off')));
    await engine.reconcile();
    expect(shortcutsOf(local)).toHaveLength(1);
    expect(state(local).shortcuts).toMatchObject({
      status: 'error',
      code: 'CLOUD_OFFLINE',
    });
  });

  it('an expired session is reported, data untouched (F3)', async () => {
    const cloud = new Cloud();
    const { local, engine } = computer(cloud);
    local.data.set(CLOUD_SESSION_KEY, { ...SESSION, expiresAt: 0 });
    putShortcuts(local, [shortcut('a-1', 'hello')]);
    cloud.fetch.mockImplementation(() =>
      Promise.resolve(jsonResponse(400, { error: {} })),
    );
    await expect(engine.reconcile()).rejects.toMatchObject({
      code: 'CLOUD_SESSION_EXPIRED',
    });
    expect(shortcutsOf(local)).toHaveLength(1);
    expect(state(local).settings.code).toBe('CLOUD_SESSION_EXPIRED');
  });
});

describe('messages (F9)', () => {
  it('accepts only the exact shapes', () => {
    expect(isCloudRequest({ type: CLOUD_SIGN_IN })).toBe(true);
    expect(isCloudRequest({ type: CLOUD_SIGN_IN, extra: 1 })).toBe(false);
    expect(
      isCloudRequest({ type: CLOUD_PASSPHRASE, passphrase: 'x', mode: 'oops' }),
    ).toBe(false);
    expect(
      isCloudRequest({ type: CLOUD_DOMAIN, domain: 'keys', enabled: true }),
    ).toBe(true);
    expect(
      isCloudRequest({ type: CLOUD_DOMAIN, domain: 'stats', enabled: true }),
    ).toBe(false);
    expect(isCloudRequest(null)).toBe(false);
  });
});
