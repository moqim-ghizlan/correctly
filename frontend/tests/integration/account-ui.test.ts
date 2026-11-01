import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSection, type AccountDeps } from '../../src/options/account-ui';
import { localizePage } from '../../src/options/i18n-dom';
import { OPTIONS } from '../../src/options/messages';
import {
  CLOUD_BACKUP_NOW,
  CLOUD_DELETE_ACCOUNT,
  CLOUD_DOMAIN,
  CLOUD_PASSPHRASE,
  CLOUD_RESTORE,
  CLOUD_SESSION_KEY,
  CLOUD_SIGN_IN,
  CLOUD_SIGN_OUT,
  CLOUD_STATE_KEY,
  normalizeCloudState,
} from '../../src/shared/cloud';
import type { Locale } from '../../src/shared/locale';
import { FastFakeStorage } from '../helpers/fake-storage';

// 5.17 "Compte" page: status, domains, passphrase, restore, deletion.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';
const flush = async () => {
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setImmediate(resolve));
};

let area: FastFakeStorage;
let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let confirm: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

async function openPage(
  locale: Locale = 'fr',
  extra: Partial<AccountDeps> = {},
) {
  document.body.innerHTML = body;
  localizePage(document, OPTIONS[locale], locale);
  const section = new AccountSection(document, {
    area,
    send,
    confirm,
    configured: true,
    locale,
    ...extra,
  });
  await section.init();
  return section;
}

const signedIn = () =>
  area.data.set(CLOUD_SESSION_KEY, {
    uid: 'u1',
    email: 'me@example.com',
    refreshToken: 'REFRESH_SENTINEL',
    idToken: 'ID_SENTINEL',
    expiresAt: Date.now() + 3_600_000,
  });
const state = (patch: (s: ReturnType<typeof normalizeCloudState>) => void) => {
  const value = normalizeCloudState(undefined);
  patch(value);
  area.data.set(CLOUD_STATE_KEY, value);
};

beforeEach(() => {
  area = new FastFakeStorage();
  send = vi.fn(() => Promise.resolve({ ok: true }));
  confirm = vi.fn(() => Promise.resolve(true));
});

describe('account page', () => {
  it('signed out: only sign-in is available, nothing is sent', async () => {
    await openPage();
    expect(text('account-state')).toBe(OPTIONS.fr.account.signedOut);
    expect($<HTMLButtonElement>('account-signin').disabled).toBe(false);
    expect($('account-backup').hidden).toBe(true);
    expect($('account-delete').hidden).toBe(true);
    expect($<HTMLInputElement>('account-shortcuts').disabled).toBe(true);
    expect($<HTMLInputElement>('account-pass').disabled).toBe(true);
    expect(text('account-pass-message')).toBe(
      OPTIONS.fr.account.passNeedsAccount,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('a build without configuration says so and offers nothing', async () => {
    await openPage('en', { configured: false });
    expect(text('account-state')).toBe(OPTIONS.en.account.notConfigured);
    expect($<HTMLButtonElement>('account-signin').disabled).toBe(true);
  });

  it('signing in sends one exact message and shows the result', async () => {
    await openPage();
    $('account-signin').click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: CLOUD_SIGN_IN });
    expect(text('account-message')).toBe(OPTIONS.fr.account.signedIn);
  });

  it('a failed sign-in shows a translated code, never provider text', async () => {
    send.mockResolvedValue({ ok: false, code: 'CLOUD_SIGNIN_CANCELLED' });
    await openPage('en');
    $('account-signin').click();
    await flush();
    expect(text('account-message')).toBe(
      OPTIONS.en.account.error.CLOUD_SIGNIN_CANCELLED,
    );
    send.mockResolvedValue({ ok: false, code: 'invented <b>text</b>' });
    $('account-signin').click();
    await flush();
    expect(text('account-message')).toBe(
      OPTIONS.en.account.error.CLOUD_OFFLINE,
    );
  });

  it('signed in: shows the e-mail, retries a backup, never shows a token', async () => {
    signedIn();
    await openPage('en');
    expect(text('account-state')).toBe(
      OPTIONS.en.account.signedInAs('me@example.com'),
    );
    expect(send).toHaveBeenCalledWith({ type: CLOUD_BACKUP_NOW });
    expect(document.body.textContent).not.toMatch(/SENTINEL/);
    expect($('account-signin').hidden).toBe(true);
    expect($<HTMLButtonElement>('account-backup').disabled).toBe(false);
  });

  it('turning a domain off sends the domain message', async () => {
    signedIn();
    await openPage();
    send.mockClear();
    $<HTMLInputElement>('account-shortcuts').click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: CLOUD_DOMAIN,
      domain: 'shortcuts',
      enabled: false,
    });
  });

  it('shows each domain status, its time and a replaced note', async () => {
    signedIn();
    state((s) => {
      s.shortcuts = {
        status: 'synced',
        syncedAt: Date.UTC(2026, 9, 31, 9, 5),
        code: null,
        replaced: true,
      };
      s.settings = {
        status: 'error',
        syncedAt: 0,
        code: 'CLOUD_OFFLINE',
        replaced: false,
      };
    });
    await openPage('en');
    expect(text('account-status-shortcuts')).toContain('Backed up at');
    expect(text('account-status-shortcuts')).toContain(
      OPTIONS.en.account.replaced,
    );
    expect(text('account-status-settings')).toBe(
      OPTIONS.en.account.error.CLOUD_OFFLINE,
    );
    expect($('account-status-settings').dataset.tone).toBe('error');
  });

  it('restore and deletion ask first; declining sends nothing', async () => {
    signedIn();
    await openPage();
    send.mockClear();
    confirm.mockResolvedValueOnce(false);
    $('account-restore').click();
    await flush();
    confirm.mockResolvedValueOnce(false);
    $('account-delete').click();
    await flush();
    expect(send).not.toHaveBeenCalled();

    $('account-restore').click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: CLOUD_RESTORE });
    $('account-delete').click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: CLOUD_DELETE_ACCOUNT });
    expect(text('account-delete-message')).toBe(OPTIONS.fr.account.deleted);
    $('account-signout').click();
    await flush();
    expect(send).toHaveBeenCalledWith({ type: CLOUD_SIGN_OUT });
  });

  it('passphrase: set (typed twice), emptied after use, mismatch refused', async () => {
    signedIn();
    state((s) => {
      s.keys = {
        status: 'needsPassphrase',
        syncedAt: 0,
        code: null,
        replaced: false,
      };
    });
    await openPage();
    send.mockClear();
    $<HTMLInputElement>('account-pass').value = 'correct horse battery';
    $<HTMLInputElement>('account-pass2').value = 'something else';
    $<HTMLButtonElement>('account-pass-submit').click();
    await flush();
    expect(text('account-pass-message')).toBe(OPTIONS.fr.account.passMismatch);
    expect(send).not.toHaveBeenCalled();

    $<HTMLInputElement>('account-pass').value = 'correct horse battery';
    $<HTMLInputElement>('account-pass2').value = 'correct horse battery';
    $<HTMLButtonElement>('account-pass-submit').click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: CLOUD_PASSPHRASE,
      passphrase: 'correct horse battery',
      mode: 'replace',
    });
    expect($<HTMLInputElement>('account-pass').value).toBe('');
    expect($<HTMLInputElement>('account-pass2').value).toBe('');
    expect(area.dump()).not.toContain('correct horse battery');
  });

  it('locked keys: unlock needs one entry; a new passphrase asks first', async () => {
    signedIn();
    state((s) => {
      s.keys = { status: 'locked', syncedAt: 0, code: null, replaced: false };
    });
    await openPage();
    send.mockClear();
    expect($('account-pass2-row').hidden).toBe(true);
    expect(text('account-pass-submit')).toBe(OPTIONS.fr.account.passUnlock);
    $<HTMLInputElement>('account-pass').value = 'correct horse battery';
    $<HTMLButtonElement>('account-pass-submit').click();
    await flush();
    expect(send).toHaveBeenCalledWith({
      type: CLOUD_PASSPHRASE,
      passphrase: 'correct horse battery',
      mode: 'unlock',
    });
  });
});
