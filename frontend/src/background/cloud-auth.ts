import {
  CloudError,
  REFRESH_MARGIN_MS,
  type CloudSession,
} from '../shared/cloud';
import type { CloudConfig } from '../shared/cloud-config';
import { object, requestJson, type CallOptions } from './transport';

// Google sign-in for Chrome and Brave without the Firebase SDK: Google's own
// OAuth window (`launchWebAuthFlow`) gives an ID token, Identity Toolkit
// exchanges it for a Firebase session, Secure Token refreshes it. Only the
// worker calls this; tokens never leave it and are never logged.

type Net = Pick<CallOptions, 'fetchImpl' | 'timeoutMs'>;

const OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const IDP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp';
const DELETE_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:delete';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function buildAuthUrl(
  config: CloudConfig,
  redirectUri: string,
  nonce: string,
): string {
  const params = new URLSearchParams({
    client_id: config.oauthClientId,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  });
  return `${OAUTH_URL}?${params.toString()}`;
}

export const newNonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Pulls the ID token out of the redirect URL and checks what the browser can
 * check (nonce, audience, expiry). Firebase verifies the signature itself.
 */
export function readIdToken(
  responseUrl: string,
  config: CloudConfig,
  nonce: string,
  now: number,
): string {
  const hash = responseUrl.split('#')[1] ?? '';
  const idToken = new URLSearchParams(hash).get('id_token');
  if (!idToken) throw new CloudError('CLOUD_SIGNIN_FAILED');
  const claims = jwtPayload(idToken);
  const exp = claims?.exp;
  if (
    !claims ||
    claims.nonce !== nonce ||
    claims.aud !== config.oauthClientId ||
    typeof exp !== 'number' ||
    exp * 1000 <= now
  ) {
    throw new CloudError('CLOUD_SIGNIN_FAILED');
  }
  return idToken;
}

export interface SignInDeps extends Net {
  /** `chrome.identity.launchWebAuthFlow` (rejects when the user cancels). */
  launch: (url: string) => Promise<string | undefined>;
  redirectUri: string;
  now?: () => number;
  nonce?: () => string;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

function sessionFrom(
  json: unknown,
  now: number,
  previous?: { uid: string; email: string },
): CloudSession | null {
  const body = object(json);
  if (!body) return null;
  const idToken = text(body.idToken) ?? text(body.id_token);
  const refreshToken = text(body.refreshToken) ?? text(body.refresh_token);
  const uid = text(body.localId) ?? text(body.user_id) ?? previous?.uid;
  const email = text(body.email) ?? previous?.email;
  const seconds = Number(body.expiresIn ?? body.expires_in);
  if (
    !idToken ||
    !refreshToken ||
    !uid ||
    !email ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }
  return { uid, email, refreshToken, idToken, expiresAt: now + seconds * 1000 };
}

export async function signIn(
  config: CloudConfig,
  deps: SignInDeps,
): Promise<CloudSession> {
  const now = deps.now ?? Date.now;
  const nonce = (deps.nonce ?? newNonce)();
  let responseUrl: string | undefined;
  try {
    responseUrl = await deps.launch(
      buildAuthUrl(config, deps.redirectUri, nonce),
    );
  } catch {
    throw new CloudError('CLOUD_SIGNIN_CANCELLED');
  }
  if (!responseUrl) throw new CloudError('CLOUD_SIGNIN_CANCELLED');
  const idToken = readIdToken(responseUrl, config, nonce, now());

  const reply = await requestJson(
    `${IDP_URL}?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
        requestUri: deps.redirectUri,
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    },
    deps,
  );
  if (!reply.ok) throw new CloudError('CLOUD_OFFLINE');
  const session = reply.status === 200 ? sessionFrom(reply.json, now()) : null;
  if (!session) throw new CloudError('CLOUD_SIGNIN_FAILED');
  return session;
}

export async function refreshSession(
  config: CloudConfig,
  session: CloudSession,
  net: Net & { now?: () => number } = {},
): Promise<CloudSession> {
  const now = net.now ?? Date.now;
  const reply = await requestJson(
    `${REFRESH_URL}?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      }).toString(),
    },
    net,
  );
  if (!reply.ok) throw new CloudError('CLOUD_OFFLINE');
  if (reply.status >= 500 || reply.status === 429) {
    throw new CloudError('CLOUD_OFFLINE');
  }
  const next =
    reply.status === 200 ? sessionFrom(reply.json, now(), session) : null;
  if (!next || next.uid !== session.uid) {
    throw new CloudError('CLOUD_SESSION_EXPIRED');
  }
  return next;
}

/** Returns the session unchanged while its token is still fresh. */
export async function freshSession(
  config: CloudConfig,
  session: CloudSession,
  net: Net & { now?: () => number } = {},
): Promise<CloudSession> {
  const now = net.now ?? Date.now;
  return session.expiresAt - now() > REFRESH_MARGIN_MS
    ? session
    : refreshSession(config, session, net);
}

/** Deletes the Firebase account itself (cloud documents go first). */
export async function deleteAccount(
  config: CloudConfig,
  session: CloudSession,
  net: Net = {},
): Promise<void> {
  const reply = await requestJson(
    `${DELETE_URL}?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ idToken: session.idToken }),
    },
    net,
  );
  if (!reply.ok || reply.status >= 500) throw new CloudError('CLOUD_OFFLINE');
  if (reply.status === 200) return;
  throw new CloudError(
    reply.status === 400 || reply.status === 401
      ? 'CLOUD_SESSION_EXPIRED'
      : 'CLOUD_DENIED',
  );
}
