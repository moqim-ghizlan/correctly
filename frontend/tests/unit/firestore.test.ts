import { describe, expect, it, vi } from 'vitest';
import {
  deleteDoc,
  parseDoc,
  readDoc,
  writeDoc,
} from '../../src/background/firestore';
import {
  CloudError,
  MAX_PAYLOAD_CHARS,
  type CloudSession,
} from '../../src/shared/cloud';
import type { CloudConfig } from '../../src/shared/cloud-config';
import { jsonResponse } from '../helpers/fake-storage';

const CONFIG: CloudConfig = {
  apiKey: `AIza${'a'.repeat(35)}`,
  projectId: 'correctly-test1',
  oauthClientId: '123-abc.apps.googleusercontent.com',
};
const SESSION: CloudSession = {
  uid: 'u1',
  email: 'me@example.com',
  refreshToken: 'r1',
  idToken: 'i1',
  expiresAt: 0,
};
const doc = (payload = '{"a":1}', updateTime = 'T1') => ({
  name: 'x',
  updateTime,
  fields: {
    schema: { integerValue: '1' },
    rev: { stringValue: 'rev1' },
    updatedAt: { integerValue: '42' },
    payload: { stringValue: payload },
  },
});
const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(status, body)));
const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof CloudError ? error.code : 'other'),
  );

describe('read', () => {
  it('reads one document of the signed-in user with the bearer token', async () => {
    const fetchImpl = reply(200, doc());
    const result = await readDoc(CONFIG, SESSION, 'shortcuts', { fetchImpl });
    expect(result).toEqual({
      schema: 1,
      rev: 'rev1',
      updatedAt: 42,
      payload: '{"a":1}',
      updateTime: 'T1',
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://firestore.googleapis.com/v1/projects/correctly-test1/databases/(default)/documents/users/u1/data/shortcuts',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer i1',
    );
  });

  it('returns null for a missing document', async () => {
    const fetchImpl = reply(404, { error: { status: 'NOT_FOUND' } });
    expect(await readDoc(CONFIG, SESSION, 'keys', { fetchImpl })).toBeNull();
  });

  it('refuses corrupt or oversized documents (F6)', async () => {
    expect(parseDoc({ fields: {} })).toBeNull();
    expect(parseDoc(doc('x'.repeat(MAX_PAYLOAD_CHARS + 1)))).toBeNull();
    expect(
      await code(
        readDoc(CONFIG, SESSION, 'keys', { fetchImpl: reply(200, {}) }),
      ),
    ).toBe('CLOUD_DENIED');
  });

  it('maps statuses to codes', async () => {
    const run = (status: number) =>
      code(readDoc(CONFIG, SESSION, 'keys', { fetchImpl: reply(status, {}) }));
    expect(await run(401)).toBe('CLOUD_SESSION_EXPIRED');
    expect(await run(403)).toBe('CLOUD_DENIED');
    expect(await run(503)).toBe('CLOUD_OFFLINE');
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('x')));
    expect(
      await code(readDoc(CONFIG, SESSION, 'keys', { fetchImpl: down })),
    ).toBe('CLOUD_OFFLINE');
  });
});

describe('write', () => {
  const value = { rev: 'rev2', updatedAt: 7, payload: '{"b":2}' };

  it('patches with the updateTime precondition and exactly the four fields', async () => {
    const fetchImpl = reply(200, doc('{"b":2}', 'T2'));
    const written = await writeDoc(CONFIG, SESSION, 'settings', value, 'T1', {
      fetchImpl,
    });
    expect(written.updateTime).toBe('T2');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(url).toContain('?currentDocument.updateTime=T1');
    const body = JSON.parse(init.body as string) as {
      fields: Record<string, unknown>;
    };
    expect(Object.keys(body.fields).sort()).toEqual([
      'payload',
      'rev',
      'schema',
      'updatedAt',
    ]);
  });

  it('requires the document to be absent on a first write', async () => {
    const fetchImpl = reply(200, doc());
    await writeDoc(CONFIG, SESSION, 'settings', value, null, { fetchImpl });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('?currentDocument.exists=false');
  });

  it('reports a lost race as a conflict (F7)', async () => {
    const fetchImpl = reply(400, { error: { status: 'FAILED_PRECONDITION' } });
    expect(
      await code(
        writeDoc(CONFIG, SESSION, 'settings', value, 'T1', { fetchImpl }),
      ),
    ).toBe('CLOUD_CONFLICT');
  });

  it('refuses an oversized payload before any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const big = { ...value, payload: 'x'.repeat(MAX_PAYLOAD_CHARS + 1) };
    expect(
      await code(writeDoc(CONFIG, SESSION, 'keys', big, null, { fetchImpl })),
    ).toBe('CLOUD_TOO_LARGE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('deletes one document and tolerates an absent one (F8)', async () => {
    const ok = reply(200, {});
    await deleteDoc(CONFIG, SESSION, 'keys', { fetchImpl: ok });
    expect((ok.mock.calls[0] as [string, RequestInit])[1].method).toBe(
      'DELETE',
    );
    await deleteDoc(CONFIG, SESSION, 'keys', { fetchImpl: reply(404, {}) });
    expect(
      await code(
        deleteDoc(CONFIG, SESSION, 'keys', { fetchImpl: reply(403, {}) }),
      ),
    ).toBe('CLOUD_DENIED');
  });
});
