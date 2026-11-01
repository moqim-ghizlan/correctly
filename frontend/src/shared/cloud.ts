import { SYNC_DOMAINS, isSyncDomain, type SyncDomain } from './sync';

// Shared vocabulary of the V5.17 account backup. Codes only, never text from
// Google or Firebase: the UI translates them.

export type CloudErrorCode =
  | 'CLOUD_NOT_CONFIGURED'
  | 'CLOUD_SIGNIN_CANCELLED'
  | 'CLOUD_SIGNIN_FAILED'
  | 'CLOUD_SESSION_EXPIRED'
  | 'CLOUD_OFFLINE'
  | 'CLOUD_CONFLICT'
  | 'CLOUD_TOO_LARGE'
  | 'CLOUD_DENIED'
  | 'CLOUD_WRONG_PASSPHRASE'
  | 'CLOUD_NOT_SIGNED_IN'
  | 'CLOUD_WEAK_PASSPHRASE'
  | 'CLOUD_LOCAL_DAMAGED'
  | 'CLOUD_REMOTE_DAMAGED';

export const CLOUD_ERROR_CODES: readonly CloudErrorCode[] = [
  'CLOUD_NOT_CONFIGURED',
  'CLOUD_SIGNIN_CANCELLED',
  'CLOUD_SIGNIN_FAILED',
  'CLOUD_SESSION_EXPIRED',
  'CLOUD_OFFLINE',
  'CLOUD_CONFLICT',
  'CLOUD_TOO_LARGE',
  'CLOUD_DENIED',
  'CLOUD_WRONG_PASSPHRASE',
  'CLOUD_NOT_SIGNED_IN',
  'CLOUD_WEAK_PASSPHRASE',
  'CLOUD_LOCAL_DAMAGED',
  'CLOUD_REMOTE_DAMAGED',
];
const isCode = (value: unknown): value is CloudErrorCode =>
  (CLOUD_ERROR_CODES as readonly unknown[]).includes(value);

export class CloudError extends Error {
  constructor(readonly code: CloudErrorCode) {
    super(code);
    this.name = 'CloudError';
  }
}

/** Firebase ID tokens last one hour; refresh when this close to expiry. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Mirrors `request.resource.data.payload.size()` in the Firestore rules. */
export const MAX_PAYLOAD_CHARS = 200_000;

export interface CloudSession {
  uid: string;
  email: string;
  refreshToken: string;
  idToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export const CLOUD_SESSION_KEY = 'correctly.v5.cloudSession';
export const CLOUD_PREFS_KEY = 'correctly.v5.cloudPrefs';
export const CLOUD_STATE_KEY = 'correctly.v5.cloudState';

export const CLOUD_BASE_KEY = 'correctly.v5.cloudBase';
export const CLOUD_BACKUP_KEY = 'correctly.v5.cloudBackup';
export const CLOUD_SECRET_KEY = 'correctly.v5.cloudSecret';

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length < 8192;

/** Every read of the stored session passes through here. */
export function normalizeCloudSession(value: unknown): CloudSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { uid, email, refreshToken, idToken, expiresAt } = raw;
  if (
    !nonEmpty(uid) ||
    !nonEmpty(email) ||
    !nonEmpty(refreshToken) ||
    !nonEmpty(idToken) ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  ) {
    return null;
  }
  return { uid, email, refreshToken, idToken, expiresAt };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

// ---- prefs, state and base (untrusted reads) --------------------------------

/** Each domain is backed up unless the user turned it off on this computer. */
export interface CloudPrefs {
  schemaVersion: 1;
  domains: Record<SyncDomain, boolean>;
}

export function normalizeCloudPrefs(value: unknown): CloudPrefs {
  const domains = record(record(value).domains);
  return {
    schemaVersion: 1,
    domains: Object.fromEntries(
      SYNC_DOMAINS.map((d) => [d, domains[d] !== false]),
    ) as Record<SyncDomain, boolean>,
  };
}

export type CloudDomainStatus =
  'off' | 'synced' | 'pending' | 'locked' | 'needsPassphrase' | 'error';
const STATUSES: readonly CloudDomainStatus[] = [
  'off',
  'synced',
  'pending',
  'locked',
  'needsPassphrase',
  'error',
];

export interface CloudDomainState {
  status: CloudDomainStatus;
  /** Last time this domain matched the cloud (ms), 0 = never. */
  syncedAt: number;
  code: CloudErrorCode | null;
  /** A merge replaced this computer's version (kept in the backup slot). */
  replaced: boolean;
}

export type CloudState = Record<SyncDomain, CloudDomainState>;

export function normalizeCloudState(value: unknown): CloudState {
  const data = record(value);
  return Object.fromEntries(
    SYNC_DOMAINS.map((d) => {
      const item = record(data[d]);
      return [
        d,
        {
          status: STATUSES.includes(item.status as CloudDomainStatus)
            ? (item.status as CloudDomainStatus)
            : 'off',
          syncedAt: count(item.syncedAt),
          code: isCode(item.code) ? item.code : null,
          replaced: item.replaced === true,
        },
      ];
    }),
  ) as CloudState;
}

/** What this computer and the cloud last agreed on, per domain. */
export interface CloudBaseEntry {
  rev: string;
  updateTime: string;
  /** SHA-256 of the canonical payload. */
  contentHash: string;
  /** The payload itself, for the per-shortcut three-way merge only. */
  payload: unknown;
}
export type CloudBase = Partial<Record<SyncDomain, CloudBaseEntry>>;

export function normalizeCloudBase(value: unknown): CloudBase {
  const data = record(value);
  const base: CloudBase = {};
  for (const d of SYNC_DOMAINS) {
    const item = record(data[d]);
    if (
      typeof item.rev === 'string' &&
      /^[0-9a-f]{16}$/.test(item.rev) &&
      typeof item.updateTime === 'string' &&
      item.updateTime.length < 64 &&
      typeof item.contentHash === 'string' &&
      /^[0-9a-f]{64}$/.test(item.contentHash)
    )
      base[d] = {
        rev: item.rev,
        updateTime: item.updateTime,
        contentHash: item.contentHash,
        payload: d === 'shortcuts' ? (item.payload ?? null) : null,
      };
  }
  return base;
}

// ---- messages from the settings page to the worker --------------------------

export const CLOUD_SIGN_IN = 'correctly.v5.cloudSignIn';
export const CLOUD_SIGN_OUT = 'correctly.v5.cloudSignOut';
export const CLOUD_BACKUP_NOW = 'correctly.v5.cloudBackupNow';
export const CLOUD_RESTORE = 'correctly.v5.cloudRestore';
export const CLOUD_DELETE_ACCOUNT = 'correctly.v5.cloudDeleteAccount';
export const CLOUD_PASSPHRASE = 'correctly.v5.cloudPassphrase';
export const CLOUD_DOMAIN = 'correctly.v5.cloudDomain';

export type CloudRequest =
  | { type: typeof CLOUD_SIGN_IN }
  | { type: typeof CLOUD_SIGN_OUT }
  | { type: typeof CLOUD_BACKUP_NOW }
  | { type: typeof CLOUD_RESTORE }
  | { type: typeof CLOUD_DELETE_ACCOUNT }
  /**
   * `unlock`: open the keys already in the cloud. `replace`: a new passphrase
   * that re-encrypts this computer's keys for the cloud.
   */
  | {
      type: typeof CLOUD_PASSPHRASE;
      passphrase: string;
      mode: 'unlock' | 'replace';
    }
  | { type: typeof CLOUD_DOMAIN; domain: SyncDomain; enabled: boolean };

export type CloudReply = { ok: true } | { ok: false; code: CloudErrorCode };

const exactKeys = (data: Record<string, unknown>, keys: string) =>
  Object.keys(data).sort().join() === keys;

/** Exact shapes only (no extra field). */
export function isCloudRequest(value: unknown): value is CloudRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  switch (data.type) {
    case CLOUD_SIGN_IN:
    case CLOUD_SIGN_OUT:
    case CLOUD_BACKUP_NOW:
    case CLOUD_RESTORE:
    case CLOUD_DELETE_ACCOUNT:
      return exactKeys(data, 'type');
    case CLOUD_PASSPHRASE:
      return (
        exactKeys(data, 'mode,passphrase,type') &&
        typeof data.passphrase === 'string' &&
        data.passphrase.length <= 1024 &&
        (data.mode === 'unlock' || data.mode === 'replace')
      );
    case CLOUD_DOMAIN:
      return (
        exactKeys(data, 'domain,enabled,type') &&
        isSyncDomain(data.domain) &&
        typeof data.enabled === 'boolean'
      );
    default:
      return false;
  }
}
