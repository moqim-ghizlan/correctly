// 5.17 "Compte" page. This page only reads the session's e-mail and the
// backup status; the Firebase tokens, the passphrase and every network call
// stay in the worker, reached by messages. The passphrase is never stored or
// shown here, and the inputs are emptied after each attempt.
import {
  CLOUD_BACKUP_NOW,
  CLOUD_DELETE_ACCOUNT,
  CLOUD_DOMAIN,
  CLOUD_PASSPHRASE,
  CLOUD_PREFS_KEY,
  CLOUD_RESTORE,
  CLOUD_SESSION_KEY,
  CLOUD_SIGN_IN,
  CLOUD_SIGN_OUT,
  CLOUD_STATE_KEY,
  normalizeCloudPrefs,
  normalizeCloudSession,
  normalizeCloudState,
  type CloudErrorCode,
  type CloudPrefs,
  type CloudReply,
  type CloudRequest,
  type CloudState,
} from '../shared/cloud';
import type { Locale } from '../shared/locale';
import type { StorageArea } from '../shared/storage';
import { SYNC_DOMAINS, type SyncDomain } from '../shared/sync';
import { OPTIONS, type AccountMessages } from './messages';
import type { Tone } from './settings-ui';

export interface AccountDeps {
  area: StorageArea;
  /** chrome.runtime.sendMessage to the worker. */
  send: (message: CloudRequest) => Promise<unknown>;
  confirm: (question: string, action: string) => Promise<boolean>;
  /** False when the build has no Firebase configuration. */
  configured: boolean;
  locale?: Locale;
}

/** The worker's reply, rebuilt field by field (anything else = offline). */
function toReply(value: unknown): CloudReply {
  const data =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  if (data.ok === true) return { ok: true };
  return {
    ok: false,
    code:
      typeof data.code === 'string' && data.code in OPTIONS.en.account.error
        ? (data.code as CloudErrorCode)
        : 'CLOUD_OFFLINE',
  };
}

export class AccountSection {
  private email: string | null = null;
  private prefs: CloudPrefs = normalizeCloudPrefs(undefined);
  private state: CloudState = normalizeCloudState(undefined);
  private busy = false;
  /** Locked, but the user chose a new passphrase instead of unlocking. */
  private replacing = false;
  private readonly m: AccountMessages;
  private readonly locale: Locale;

  constructor(
    private readonly doc: Document,
    private readonly deps: AccountDeps,
  ) {
    this.locale = deps.locale ?? 'fr';
    this.m = OPTIONS[this.locale].account;
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private say(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  async init(): Promise<void> {
    for (const domain of SYNC_DOMAINS)
      this.el<HTMLInputElement>(`account-${domain}`).addEventListener(
        'change',
        () => void this.setDomain(domain),
      );
    this.el('account-signin').addEventListener(
      'click',
      () =>
        void this.run(
          { type: CLOUD_SIGN_IN },
          'account-message',
          this.m.signedIn,
        ),
    );
    this.el('account-backup').addEventListener(
      'click',
      () =>
        void this.run(
          { type: CLOUD_BACKUP_NOW },
          'account-message',
          this.m.backedUp,
        ),
    );
    this.el('account-restore').addEventListener(
      'click',
      () => void this.restore(),
    );
    this.el('account-signout').addEventListener(
      'click',
      () =>
        void this.run(
          { type: CLOUD_SIGN_OUT },
          'account-message',
          this.m.signedOutDone,
        ),
    );
    this.el('account-delete').addEventListener(
      'click',
      () => void this.deleteAccount(),
    );
    this.el('account-pass-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.passphrase();
    });
    this.el('account-pass-replace').addEventListener('click', () => {
      this.replacing = true;
      this.render();
      this.el('account-pass').focus();
    });
    await this.reload();
    // Opening the settings retries a backup that failed (offline, expired).
    if (this.email && this.deps.configured)
      void this.deps.send({ type: CLOUD_BACKUP_NOW }).catch(() => undefined);
  }

  onStorageChanged(keys: string[]): void {
    if (
      [CLOUD_SESSION_KEY, CLOUD_PREFS_KEY, CLOUD_STATE_KEY].some((k) =>
        keys.includes(k),
      )
    )
      void this.reload();
  }

  async reload(): Promise<void> {
    try {
      const data = await this.deps.area.get([
        CLOUD_SESSION_KEY,
        CLOUD_PREFS_KEY,
        CLOUD_STATE_KEY,
      ]);
      this.email =
        normalizeCloudSession(data[CLOUD_SESSION_KEY])?.email ?? null;
      this.prefs = normalizeCloudPrefs(data[CLOUD_PREFS_KEY]);
      this.state = normalizeCloudState(data[CLOUD_STATE_KEY]);
    } catch {
      this.say('account-message', this.m.error.CLOUD_OFFLINE, 'error');
    }
    this.render();
  }

  private async request(message: CloudRequest): Promise<CloudReply> {
    try {
      return toReply(await this.deps.send(message));
    } catch {
      return { ok: false, code: 'CLOUD_OFFLINE' };
    }
  }

  private async run(
    message: CloudRequest,
    target: string,
    success: string,
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.render();
    const reply = await this.request(message);
    this.busy = false;
    if (reply.ok) this.say(target, success, 'ok');
    else this.say(target, this.m.error[reply.code], 'error');
    await this.reload();
    return reply.ok;
  }

  private async setDomain(domain: SyncDomain): Promise<void> {
    const enabled = this.el<HTMLInputElement>(`account-${domain}`).checked;
    await this.run(
      { type: CLOUD_DOMAIN, domain, enabled },
      'account-message',
      this.m.backedUp,
    );
  }

  private async restore(): Promise<void> {
    if (!(await this.deps.confirm(this.m.confirmRestore, this.m.restoreAction)))
      return;
    await this.run({ type: CLOUD_RESTORE }, 'account-message', this.m.restored);
  }

  private async deleteAccount(): Promise<void> {
    if (!(await this.deps.confirm(this.m.confirmDelete, this.m.deleteAction)))
      return;
    await this.run(
      { type: CLOUD_DELETE_ACCOUNT },
      'account-delete-message',
      this.m.deleted,
    );
  }

  private async passphrase(): Promise<void> {
    const first = this.el<HTMLInputElement>('account-pass');
    const second = this.el<HTMLInputElement>('account-pass2');
    const locked = this.state.keys.status === 'locked';
    const mode = locked && !this.replacing ? 'unlock' : 'replace';
    const passphrase = first.value;
    const confirmation = second.value;
    first.value = '';
    second.value = '';
    this.replacing = false;
    // Unlocking checks against the backed-up keys; a new one is typed twice.
    if (mode === 'replace' && passphrase !== confirmation) {
      this.say('account-pass-message', this.m.passMismatch, 'error');
      this.render();
      return;
    }
    if (
      locked &&
      mode === 'replace' &&
      !(await this.deps.confirm(this.m.confirmReplace, this.m.replaceAction))
    ) {
      this.render();
      return;
    }
    await this.run(
      { type: CLOUD_PASSPHRASE, passphrase, mode },
      'account-pass-message',
      mode === 'unlock' ? this.m.unlocked : this.m.passSaved,
    );
  }

  private statusText(domain: SyncDomain): string {
    const item = this.state[domain];
    if (!this.email || !this.prefs.domains[domain]) return this.m.status.off;
    if (item.status === 'error' && item.code) return this.m.error[item.code];
    const base =
      item.status === 'synced' && item.syncedAt
        ? this.m.syncedAt(
            new Date(item.syncedAt).toLocaleTimeString(this.locale, {
              hour: '2-digit',
              minute: '2-digit',
            }),
          )
        : this.m.status[item.status];
    return item.replaced ? `${base} ${this.m.replaced}` : base;
  }

  render(): void {
    const { configured } = this.deps;
    const signedIn = configured && this.email !== null;
    const idle = !this.busy;
    this.say(
      'account-state',
      !configured
        ? this.m.notConfigured
        : this.email
          ? this.m.signedInAs(this.email)
          : this.m.signedOut,
    );
    this.el<HTMLButtonElement>('account-signin').disabled =
      !configured || signedIn || !idle;
    this.el('account-signin').hidden = signedIn;
    for (const id of [
      'account-backup',
      'account-restore',
      'account-signout',
      'account-delete',
    ]) {
      this.el<HTMLButtonElement>(id).disabled = !signedIn || !idle;
      this.el(id).hidden = !signedIn;
    }
    for (const domain of SYNC_DOMAINS) {
      const box = this.el<HTMLInputElement>(`account-${domain}`);
      box.checked = this.prefs.domains[domain];
      box.disabled = !signedIn || !idle;
      const item = this.state[domain];
      const active = signedIn && this.prefs.domains[domain];
      const status = this.el(`account-status-${domain}`);
      status.textContent = this.statusText(domain);
      status.dataset.tone =
        active && item.status === 'error'
          ? 'error'
          : active && item.status === 'synced'
            ? 'ok'
            : 'neutral';
    }

    // Passphrase form: unlock (keys backed up elsewhere) or set a new one.
    const keysOn = signedIn && this.prefs.domains.keys;
    const locked =
      keysOn && this.state.keys.status === 'locked' && !this.replacing;
    const hasSecret =
      keysOn &&
      this.state.keys.status !== 'locked' &&
      this.state.keys.status !== 'needsPassphrase' &&
      this.state.keys.status !== 'off';
    for (const id of ['account-pass', 'account-pass2'])
      this.el<HTMLInputElement>(id).disabled = !keysOn || !idle;
    this.el('account-pass2-row').hidden = locked;
    const submit = this.el<HTMLButtonElement>('account-pass-submit');
    submit.textContent = locked
      ? this.m.passUnlock
      : hasSecret
        ? this.m.passChange
        : this.m.passSet;
    submit.disabled = !keysOn || !idle;
    const replace = this.el<HTMLButtonElement>('account-pass-replace');
    replace.textContent = this.m.passReplace;
    replace.hidden = !locked;
    replace.disabled = !idle;
    const hint = this.el('account-pass-message');
    if (!keysOn && !hint.dataset.tone?.match(/ok|error/))
      this.say('account-pass-message', this.m.passNeedsAccount);
    else if (keysOn && hint.textContent === this.m.passNeedsAccount)
      this.say('account-pass-message', '');
  }
}
