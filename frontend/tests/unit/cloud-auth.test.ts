import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthUrl,
  deleteAccount,
  freshSession,
  readIdToken,
  refreshSession,
  signIn,
} from '../../src/background/cloud-auth';
import { CloudError, type CloudSession } from '../../src/shared/cloud';
import { cloudConfig, type CloudConfig } from '../../src/shared/cloud-config';
import { jsonResponse } from '../helpers/fake-storage';

const CONFIG: CloudConfig = {
  apiKey: `AIza${'a'.repeat(35)}`,
  projectId: 'correctly-test1',
  oauthClientId: '123-abc.apps.googleusercontent.com',
};
const REDIRECT = 'https://abc.chromiumapp.org/';
const NOW = 1_800_000_000_000;
const NONCE = 'nonce-1';

const b64 = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const idToken = (claims: Record<string, unknown> = {}) =>
  `${b64({ alg: 'RS256' })}.${b64({
    nonce: NONCE,
    aud: CONFIG.oauthClientId,
    exp: NOW / 1000 + 3600,
    ...claims,
  })}.sig`;
const redirect = (token: string) => `${REDIRECT}#id_token=${token}&x=1`;

const SESSION: CloudSession = {
  uid: 'u1',
  email: 'me@example.com',
  refreshToken: 'r1',
  idToken: 'i1',
  expiresAt: NOW + 3_600_000,
};
const idpOk = {
  idToken: 'fb-id',
  refreshToken: 'fb-refresh',
  expiresIn: '3600',
  localId: 'u1',
  email: 'me@example.com',
};

const deps = (
  launched: string | undefined | Error,
  fetchImpl: typeof fetch,
) => ({
  launch: vi.fn(() =>
    launched instanceof Error
      ? Promise.reject(launched)
      : Promise.resolve(launched),
  ),
  redirectUri: REDIRECT,
  now: () => NOW,
  nonce: () => NONCE,
  fetchImpl,
});
const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof CloudError ? error.code : 'other'),
  );

describe('configuration', () => {
  it('is null when a value is missing or malformed', () => {
    expect(cloudConfig(CONFIG)).toEqual(CONFIG);
    expect(cloudConfig({ ...CONFIG, apiKey: '' })).toBeNull();
    expect(cloudConfig({ ...CONFIG, projectId: 'X' })).toBeNull();
    expect(cloudConfig({ ...CONFIG, oauthClientId: 'GOCSPX-nope' })).toBeNull();
  });

  it('ships a valid public configuration', () => {
    expect(cloudConfig()).not.toBeNull();
  });
});

describe('sign-in', () => {
  it('builds the Google OAuth URL with the nonce and no secret', () => {
    const url = new URL(buildAuthUrl(CONFIG, REDIRECT, NONCE));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('id_token');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('nonce')).toBe(NONCE);
    expect(url.searchParams.get('client_id')).toBe(CONFIG.oauthClientId);
    expect(url.search).not.toContain('secret');
  });

  it('exchanges the Google token for a Firebase session (F2)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, idpOk)),
    );
    const session = await signIn(CONFIG, deps(redirect(idToken()), fetchImpl));
    expect(session).toEqual({
      uid: 'u1',
      email: 'me@example.com',
      refreshToken: 'fb-refresh',
      idToken: 'fb-id',
      expiresAt: NOW + 3_600_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('identitytoolkit.googleapis.com');
    expect(init.credentials).toBe('omit');
  });

  it.each([
    ['wrong nonce', idToken({ nonce: 'other' })],
    ['wrong audience', idToken({ aud: 'x.apps.googleusercontent.com' })],
    ['expired token', idToken({ exp: NOW / 1000 - 1 })],
    ['not a token', 'garbage'],
  ])('refuses %s and stores nothing', async (_name, token) => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await code(signIn(CONFIG, deps(redirect(token), fetchImpl)))).toBe(
      'CLOUD_SIGNIN_FAILED',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a cancelled window without any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(
      await code(signIn(CONFIG, deps(new Error('closed'), fetchImpl))),
    ).toBe('CLOUD_SIGNIN_CANCELLED');
    expect(await code(signIn(CONFIG, deps(undefined, fetchImpl)))).toBe(
      'CLOUD_SIGNIN_CANCELLED',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a rejected exchange and a network failure to codes', async () => {
    const rejected = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(400, { error: { message: 'secret text' } })),
    );
    expect(
      await code(signIn(CONFIG, deps(redirect(idToken()), rejected))),
    ).toBe('CLOUD_SIGNIN_FAILED');
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('x')));
    expect(await code(signIn(CONFIG, deps(redirect(idToken()), down)))).toBe(
      'CLOUD_OFFLINE',
    );
  });

  it('read the token only from the fragment', () => {
    expect(() =>
      readIdToken(`${REDIRECT}?id_token=${idToken()}`, CONFIG, NONCE, NOW),
    ).toThrow(CloudError);
  });
});

describe('refresh', () => {
  const refreshOk = {
    id_token: 'new-id',
    refresh_token: 'new-refresh',
    expires_in: '3600',
    user_id: 'u1',
  };

  it('keeps a fresh session and refreshes one near expiry (F3)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, refreshOk)),
    );
    const net = { fetchImpl, now: () => NOW };
    expect(await freshSession(CONFIG, SESSION, net)).toBe(SESSION);
    expect(fetchImpl).not.toHaveBeenCalled();

    const old = { ...SESSION, expiresAt: NOW + 60_000 };
    const next = await freshSession(CONFIG, old, net);
    expect(next).toMatchObject({
      idToken: 'new-id',
      refreshToken: 'new-refresh',
      email: 'me@example.com',
      expiresAt: NOW + 3_600_000,
    });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('securetoken.googleapis.com');
  });

  it('turns a refused refresh into CLOUD_SESSION_EXPIRED', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(400, { error: { message: 'TOKEN_EXPIRED' } }),
      ),
    );
    expect(await code(refreshSession(CONFIG, SESSION, { fetchImpl }))).toBe(
      'CLOUD_SESSION_EXPIRED',
    );
  });

  it('refuses a refresh that answers for another account', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, { ...refreshOk, user_id: 'u2' })),
    );
    expect(await code(refreshSession(CONFIG, SESSION, { fetchImpl }))).toBe(
      'CLOUD_SESSION_EXPIRED',
    );
  });

  it('treats a server error as temporary, not as sign-out', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(503, {})),
    );
    expect(await code(refreshSession(CONFIG, SESSION, { fetchImpl }))).toBe(
      'CLOUD_OFFLINE',
    );
  });
});

describe('account deletion', () => {
  it('posts the ID token to accounts:delete', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(200, {})),
    );
    await deleteAccount(CONFIG, SESSION, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('accounts:delete');
    expect(init.body).toBe(JSON.stringify({ idToken: 'i1' }));
  });

  it('reports a refused deletion', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(400, {})),
    );
    expect(await code(deleteAccount(CONFIG, SESSION, { fetchImpl }))).toBe(
      'CLOUD_SESSION_EXPIRED',
    );
  });
});
