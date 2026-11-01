import {
  CloudError,
  MAX_PAYLOAD_CHARS,
  type CloudSession,
} from '../shared/cloud';
import type { CloudConfig } from '../shared/cloud-config';
import type { SyncDomain } from '../shared/sync';
import { object, requestJson, type CallOptions } from './transport';

// Firestore REST for `users/{uid}/data/{domain}`: one document per backed-up
// domain. Matches `firebase/firestore.rules` (same fields, same size limit).

type Net = Pick<CallOptions, 'fetchImpl' | 'timeoutMs'>;

export interface CloudDoc {
  schema: number;
  rev: string;
  updatedAt: number;
  payload: string;
  /** Firestore's own revision stamp, used as the write precondition. */
  updateTime: string;
}

const docUrl = (config: CloudConfig, uid: string, domain: SyncDomain) =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId,
  )}/databases/(default)/documents/users/${encodeURIComponent(
    uid,
  )}/data/${domain}`;

const auth = (session: CloudSession) => ({
  Authorization: `Bearer ${session.idToken}`,
  'Content-Type': 'application/json',
});

/** Firestore status strings that mean "someone else wrote first". */
const CONFLICT = new Set(['ABORTED', 'FAILED_PRECONDITION', 'ALREADY_EXISTS']);

function failure(status: number, json: unknown): CloudError {
  const state = object(object(json)?.error)?.status;
  if (typeof state === 'string' && CONFLICT.has(state)) {
    return new CloudError('CLOUD_CONFLICT');
  }
  if (status === 401) return new CloudError('CLOUD_SESSION_EXPIRED');
  if (status === 403 || status === 404) return new CloudError('CLOUD_DENIED');
  if (status === 409 || status === 412) return new CloudError('CLOUD_CONFLICT');
  return new CloudError(
    status >= 500 || status === 429 ? 'CLOUD_OFFLINE' : 'CLOUD_DENIED',
  );
}

function field(fields: Record<string, unknown>, name: string, kind: string) {
  return object(fields[name])?.[kind];
}

export function parseDoc(json: unknown): CloudDoc | null {
  const body = object(json);
  const fields = object(body?.fields);
  if (!body || !fields) return null;
  const schema = Number(field(fields, 'schema', 'integerValue'));
  const updatedAt = Number(field(fields, 'updatedAt', 'integerValue'));
  const rev = field(fields, 'rev', 'stringValue');
  const payload = field(fields, 'payload', 'stringValue');
  const updateTime = body.updateTime;
  if (
    !Number.isSafeInteger(schema) ||
    !Number.isSafeInteger(updatedAt) ||
    typeof rev !== 'string' ||
    typeof payload !== 'string' ||
    payload.length > MAX_PAYLOAD_CHARS ||
    typeof updateTime !== 'string'
  ) {
    return null;
  }
  return { schema, rev, updatedAt, payload, updateTime };
}

/** `null` when the document does not exist yet. A corrupt one is an error. */
export async function readDoc(
  config: CloudConfig,
  session: CloudSession,
  domain: SyncDomain,
  net: Net = {},
): Promise<CloudDoc | null> {
  const reply = await requestJson(
    docUrl(config, session.uid, domain),
    { method: 'GET', headers: auth(session) },
    net,
  );
  if (!reply.ok) throw new CloudError('CLOUD_OFFLINE');
  const state = object(object(reply.json)?.error)?.status;
  if (reply.status === 404 && state === 'NOT_FOUND') return null;
  if (reply.status !== 200) throw failure(reply.status, reply.json);
  const doc = parseDoc(reply.json);
  if (!doc) throw new CloudError('CLOUD_DENIED');
  return doc;
}

/**
 * Writes the whole document. `expected` is the `updateTime` last seen (or
 * null for "must not exist yet"): a mismatch is `CLOUD_CONFLICT`.
 */
export async function writeDoc(
  config: CloudConfig,
  session: CloudSession,
  domain: SyncDomain,
  value: { rev: string; updatedAt: number; payload: string },
  expected: string | null,
  net: Net = {},
): Promise<CloudDoc> {
  if (value.payload.length > MAX_PAYLOAD_CHARS) {
    throw new CloudError('CLOUD_TOO_LARGE');
  }
  const precondition =
    expected === null
      ? 'currentDocument.exists=false'
      : `currentDocument.updateTime=${encodeURIComponent(expected)}`;
  const reply = await requestJson(
    `${docUrl(config, session.uid, domain)}?${precondition}`,
    {
      method: 'PATCH',
      headers: auth(session),
      body: JSON.stringify({
        fields: {
          schema: { integerValue: '1' },
          rev: { stringValue: value.rev },
          updatedAt: { integerValue: String(value.updatedAt) },
          payload: { stringValue: value.payload },
        },
      }),
    },
    net,
  );
  if (!reply.ok) throw new CloudError('CLOUD_OFFLINE');
  if (reply.status !== 200) throw failure(reply.status, reply.json);
  const doc = parseDoc(reply.json);
  if (!doc) throw new CloudError('CLOUD_DENIED');
  return doc;
}

/** Deleting a document that is already gone is a success. */
export async function deleteDoc(
  config: CloudConfig,
  session: CloudSession,
  domain: SyncDomain,
  net: Net = {},
): Promise<void> {
  const reply = await requestJson(
    docUrl(config, session.uid, domain),
    { method: 'DELETE', headers: auth(session) },
    net,
  );
  if (!reply.ok) throw new CloudError('CLOUD_OFFLINE');
  if (reply.status !== 200 && reply.status !== 404) {
    throw failure(reply.status, reply.json);
  }
}
