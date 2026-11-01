// V5.17: the account backup engine, in the service worker. Reads storage.local
// (the source of truth) and this account's Firestore documents, decides per
// domain, and writes either side. It is the only reader of the Firebase
// tokens and the only writer of the `cloud*` keys. Every run is serialized;
// nothing important is queued in memory, so a stopped worker loses nothing:
// the next run compares again. Not signed in or not configured = no request.
import {
  CLOUD_BACKUP_KEY,
  CLOUD_BASE_KEY,
  CLOUD_BACKUP_NOW,
  CLOUD_DELETE_ACCOUNT,
  CLOUD_DOMAIN,
  CLOUD_PASSPHRASE,
  CLOUD_PREFS_KEY,
  CLOUD_RESTORE,
  CLOUD_SECRET_KEY,
  CLOUD_SESSION_KEY,
  CLOUD_SIGN_IN,
  CLOUD_SIGN_OUT,
  CLOUD_STATE_KEY,
  CloudError,
  normalizeCloudBase,
  normalizeCloudPrefs,
  normalizeCloudSession,
  normalizeCloudState,
  type CloudBase,
  type CloudDomainState,
  type CloudErrorCode,
  type CloudReply,
  type CloudRequest,
  type CloudSession,
  type CloudState,
} from '../shared/cloud';
import { cloudConfig, type CloudConfig } from '../shared/cloud-config';
import type { StorageArea } from '../shared/storage';
import {
  DOMAIN_LOCAL_KEYS,
  KDF_ITERATIONS,
  MIN_PASSPHRASE,
  SYNC_DOMAINS,
  canonicalJson,
  decryptText,
  deriveSecret,
  encryptText,
  mergeShortcuts,
  newRev,
  normalizeSyncSecret,
  parseEnvelope,
  parseSyncedShortcuts,
  type SyncDomain,
  type SyncSecret,
} from '../shared/sync';
import { deleteAccount, freshSession, signIn } from './cloud-auth';
import {
  applyLocalDomain,
  hashOf,
  parseDomain,
  readLocalDomain,
  type DomainPayload,
} from './domains';
import { deleteDoc, readDoc, writeDoc, type CloudDoc } from './firestore';
import type { CallOptions } from './transport';

/** chrome.storage.local (the engine also removes keys on sign-out). */
export interface CloudArea extends StorageArea {
  remove(keys: string[]): Promise<void>;
}

export interface CloudEngineDeps {
  local: CloudArea;
  /** `chrome.identity.launchWebAuthFlow` (rejects when the user cancels). */
  launch: (url: string) => Promise<string | undefined>;
  redirectUri: string;
  /** Defaults to the shipped public configuration. */
  config?: CloudConfig | null;
  fetchImpl?: CallOptions['fetchImpl'];
  timeoutMs?: number;
  now?: () => number;
  /** PBKDF2 iterations for a new passphrase (lowered in tests only). */
  iterations?: number;
  /** Quiet time after a local change before it is backed up. */
  debounceMs?: number;
}

type Outcome = Pick<CloudDomainState, 'status' | 'code'>;
type Mode = 'merge' | 'restore';

type Remote =
  | { kind: 'missing' }
  | { kind: 'damaged' }
  | { kind: 'locked' }
  | {
      kind: 'ok';
      doc: CloudDoc;
      payload: unknown;
      contentHash: string;
      empty: boolean;
    };

const LOCAL_KEYS = SYNC_DOMAINS.flatMap((d) => DOMAIN_LOCAL_KEYS[d]);

const codeOf = (error: unknown): CloudErrorCode =>
  error instanceof CloudError ? error.code : 'CLOUD_OFFLINE';

interface Context {
  config: CloudConfig;
  session: CloudSession;
  prefs: ReturnType<typeof normalizeCloudPrefs>;
  state: CloudState;
  base: CloudBase;
  backup: Record<string, unknown>;
  secret: SyncSecret | null;
  replaced: Set<SyncDomain>;
  mode: Mode;
}

export class CloudEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = new Set<SyncDomain>();

  constructor(private readonly deps: CloudEngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  private get config(): CloudConfig | null {
    return this.deps.config === undefined ? cloudConfig() : this.deps.config;
  }

  private get net() {
    return { fetchImpl: this.deps.fetchImpl, timeoutMs: this.deps.timeoutMs };
  }

  /** One run at a time; a failed run never blocks the next. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Resolves once every queued run has finished. */
  async idle(): Promise<void> {
    let current: Promise<unknown>;
    do {
      current = this.queue;
      await current;
    } while (current !== this.queue);
  }

  // ---- triggers -------------------------------------------------------------

  /** storage.local changed: back the touched domains up after a quiet time. */
  onLocalChanged(keys: string[]): void {
    if (!keys.some((key) => LOCAL_KEYS.includes(key))) return;
    for (const domain of SYNC_DOMAINS)
      if (DOMAIN_LOCAL_KEYS[domain].some((key) => keys.includes(key)))
        this.pending.add(domain);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const edited = [...this.pending];
      this.pending.clear();
      void this.reconcile(edited).catch(() => undefined);
    }, this.deps.debounceMs ?? 3000);
  }

  /** `edited`: domains changed on this computer just now (they win ties). */
  reconcile(edited: SyncDomain[] = []): Promise<void> {
    return this.serial(() => this.run(edited, 'merge'));
  }

  async handle(request: CloudRequest): Promise<CloudReply> {
    try {
      switch (request.type) {
        case CLOUD_SIGN_IN:
          await this.serial(() => this.signIn());
          break;
        case CLOUD_SIGN_OUT:
          await this.serial(() => this.clearLocal());
          break;
        case CLOUD_BACKUP_NOW:
          await this.serial(() => this.run([...SYNC_DOMAINS], 'merge'));
          break;
        case CLOUD_RESTORE:
          await this.serial(() => this.run([], 'restore'));
          break;
        case CLOUD_DELETE_ACCOUNT:
          await this.serial(() => this.deleteAccount());
          break;
        case CLOUD_PASSPHRASE:
          await this.serial(() =>
            this.passphrase(request.passphrase, request.mode),
          );
          break;
        case CLOUD_DOMAIN:
          await this.serial(() =>
            this.setDomain(request.domain, request.enabled),
          );
          break;
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, code: codeOf(error) };
    }
  }

  // ---- stored state ---------------------------------------------------------

  private async readLocal<T>(key: string, normalize: (value: unknown) => T) {
    return normalize((await this.deps.local.get([key]))[key]);
  }

  private session(): Promise<CloudSession | null> {
    return this.readLocal(CLOUD_SESSION_KEY, normalizeCloudSession);
  }

  private secret(): Promise<SyncSecret | null> {
    return this.readLocal(CLOUD_SECRET_KEY, normalizeSyncSecret);
  }

  /** A fresh session (refreshed and stored when near expiry), or throws. */
  private async liveSession(config: CloudConfig): Promise<CloudSession> {
    const stored = await this.session();
    if (!stored) throw new CloudError('CLOUD_NOT_SIGNED_IN');
    const session = await freshSession(config, stored, {
      ...this.net,
      now: this.now,
    });
    if (session !== stored)
      await this.deps.local.set({ [CLOUD_SESSION_KEY]: session });
    return session;
  }

  private async context(
    config: CloudConfig,
    session: CloudSession,
    mode: Mode,
  ): Promise<Context> {
    const data = await this.deps.local.get([
      CLOUD_PREFS_KEY,
      CLOUD_STATE_KEY,
      CLOUD_BASE_KEY,
      CLOUD_BACKUP_KEY,
    ]);
    const backup = data[CLOUD_BACKUP_KEY];
    return {
      config,
      session,
      prefs: normalizeCloudPrefs(data[CLOUD_PREFS_KEY]),
      state: normalizeCloudState(data[CLOUD_STATE_KEY]),
      base: normalizeCloudBase(data[CLOUD_BASE_KEY]),
      backup:
        backup && typeof backup === 'object' && !Array.isArray(backup)
          ? { ...(backup as Record<string, unknown>) }
          : {},
      secret: await this.secret(),
      replaced: new Set(),
      mode,
    };
  }

  private save(ctx: Context): Promise<void> {
    return this.deps.local.set({
      [CLOUD_STATE_KEY]: ctx.state,
      [CLOUD_BASE_KEY]: ctx.base,
      [CLOUD_BACKUP_KEY]: ctx.backup,
    });
  }

  // ---- one run --------------------------------------------------------------

  private async run(edited: SyncDomain[], mode: Mode): Promise<void> {
    const config = this.config;
    if (!config) return;
    if (!(await this.session())) return;
    let session: CloudSession;
    try {
      session = await this.liveSession(config);
    } catch (error) {
      await this.failAll(codeOf(error));
      throw error;
    }
    const ctx = await this.context(config, session, mode);
    let failure: CloudError | null = null;
    for (const domain of SYNC_DOMAINS) {
      const previous = ctx.state[domain];
      if (!ctx.prefs.domains[domain]) {
        // Turned off: the next activation starts over.
        delete ctx.base[domain];
        ctx.state[domain] = { ...previous, status: 'off', code: null };
        continue;
      }
      let next: Outcome;
      try {
        next = await this.attempt(ctx, domain, edited.includes(domain));
      } catch (error) {
        next = { status: 'error', code: codeOf(error) };
        if (error instanceof CloudError && !failure) failure = error;
      }
      ctx.state[domain] = {
        status: next.status,
        code: next.code,
        syncedAt: next.status === 'synced' ? this.now() : previous.syncedAt,
        replaced: ctx.replaced.has(domain) || previous.replaced,
      };
    }
    await this.save(ctx);
    // A manual request reports the first failure; automatic runs only show it.
    if (failure && mode === 'restore') throw failure;
  }

  /** A lost race is retried once from a fresh read, then reported. */
  private async attempt(
    ctx: Context,
    domain: SyncDomain,
    editedHere: boolean,
  ): Promise<Outcome> {
    try {
      return await this.step(ctx, domain, editedHere);
    } catch (error) {
      if (!(error instanceof CloudError) || error.code !== 'CLOUD_CONFLICT')
        throw error;
      return this.step(ctx, domain, editedHere);
    }
  }

  private async failAll(code: CloudErrorCode): Promise<void> {
    const state = await this.readLocal(CLOUD_STATE_KEY, normalizeCloudState);
    const prefs = await this.readLocal(CLOUD_PREFS_KEY, normalizeCloudPrefs);
    for (const domain of SYNC_DOMAINS)
      if (prefs.domains[domain])
        state[domain] = { ...state[domain], status: 'error', code };
    await this.deps.local.set({ [CLOUD_STATE_KEY]: state });
  }

  // ---- one domain -----------------------------------------------------------

  private async decode(
    domain: SyncDomain,
    doc: CloudDoc,
    secret: SyncSecret | null,
  ): Promise<Remote> {
    if (doc.schema !== 1) return { kind: 'damaged' };
    let text: string | null = doc.payload;
    if (domain === 'keys') {
      const envelope = parseEnvelope(doc.payload);
      if (!envelope) return { kind: 'damaged' };
      text = secret ? await decryptText(secret, envelope) : null;
      if (text === null) return { kind: 'locked' };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { kind: 'damaged' };
    }
    const parsed = await parseDomain(domain, data);
    if (!parsed) return { kind: 'damaged' };
    return {
      kind: 'ok',
      doc,
      payload: parsed.payload,
      contentHash: await hashOf(parsed.payload),
      empty: parsed.empty,
    };
  }

  private async push(
    ctx: Context,
    domain: SyncDomain,
    local: Pick<DomainPayload, 'payload' | 'contentHash'>,
    expected: string | null,
  ): Promise<Outcome> {
    let wire = canonicalJson(local.payload);
    if (domain === 'keys') {
      if (!ctx.secret) throw new CloudError('CLOUD_NOT_SIGNED_IN');
      wire = await encryptText(ctx.secret, wire);
    }
    const rev = newRev();
    const doc = await writeDoc(
      ctx.config,
      ctx.session,
      domain,
      { rev, updatedAt: this.now(), payload: wire },
      expected,
      this.net,
    );
    this.agree(ctx, domain, doc, local.contentHash, local.payload);
    return { status: 'synced', code: null };
  }

  private agree(
    ctx: Context,
    domain: SyncDomain,
    doc: CloudDoc,
    contentHash: string,
    payload: unknown,
  ) {
    ctx.base[domain] = {
      rev: doc.rev,
      updateTime: doc.updateTime,
      contentHash,
      payload: domain === 'shortcuts' ? payload : null,
    };
  }

  private backupLocal(ctx: Context, domain: SyncDomain, local: DomainPayload) {
    ctx.backup[domain] = { savedAt: this.now(), payload: local.payload };
    ctx.replaced.add(domain);
  }

  private async step(
    ctx: Context,
    domain: SyncDomain,
    editedHere: boolean,
  ): Promise<Outcome> {
    const done: Outcome = { status: 'synced', code: null };
    const local = await readLocalDomain(this.deps.local, domain);
    if (!local) return { status: 'error', code: 'CLOUD_LOCAL_DAMAGED' };
    const doc = await readDoc(ctx.config, ctx.session, domain, this.net);
    if (domain === 'keys' && !ctx.secret) {
      return { status: doc ? 'locked' : 'needsPassphrase', code: null };
    }
    const remote: Remote = doc
      ? await this.decode(domain, doc, ctx.secret)
      : { kind: 'missing' };
    if (remote.kind === 'damaged')
      return { status: 'error', code: 'CLOUD_REMOTE_DAMAGED' };
    if (remote.kind === 'locked') return { status: 'locked', code: null };
    const base = ctx.base[domain];
    if (remote.kind === 'missing') {
      // An empty computer has nothing to offer: no empty list that would
      // read as deletions on another computer.
      if (ctx.mode === 'restore' || (!base && local.empty)) return done;
      return this.push(ctx, domain, local, null);
    }
    if (local.contentHash === remote.contentHash) {
      this.agree(ctx, domain, remote.doc, remote.contentHash, remote.payload);
      return done;
    }
    const take = async () => {
      if (!local.empty) this.backupLocal(ctx, domain, local);
      await applyLocalDomain(this.deps.local, domain, remote.payload);
      this.agree(ctx, domain, remote.doc, remote.contentHash, remote.payload);
      return done;
    };
    if (ctx.mode === 'restore') return take();
    const localChanged = !base || local.contentHash !== base.contentHash;
    const remoteChanged = !base || remote.doc.rev !== base.rev;
    if (!remoteChanged)
      return this.push(ctx, domain, local, remote.doc.updateTime);
    if ((base && !localChanged) || local.empty) {
      await applyLocalDomain(this.deps.local, domain, remote.payload);
      this.agree(ctx, domain, remote.doc, remote.contentHash, remote.payload);
      return done;
    }
    if (!base && remote.empty)
      return this.push(ctx, domain, local, remote.doc.updateTime);
    // Both sides changed. An edit made here just now wins; otherwise the
    // cloud version does (the replaced one stays in the backup slot).
    if (domain === 'shortcuts') {
      const baseList = parseSyncedShortcuts(base?.payload)?.shortcuts ?? [];
      const merged = mergeShortcuts(
        baseList,
        (local.payload as { shortcuts: [] }).shortcuts,
        (remote.payload as { shortcuts: [] }).shortcuts,
        editedHere,
      );
      if (merged.localLost) this.backupLocal(ctx, domain, local);
      const payload = { shortcuts: merged.shortcuts };
      const contentHash = await hashOf(payload);
      await applyLocalDomain(this.deps.local, domain, payload);
      if (contentHash === remote.contentHash) {
        this.agree(ctx, domain, remote.doc, contentHash, payload);
        return done;
      }
      return this.push(
        ctx,
        domain,
        { payload, contentHash },
        remote.doc.updateTime,
      );
    }
    if (editedHere) return this.push(ctx, domain, local, remote.doc.updateTime);
    return take();
  }

  // ---- user requests --------------------------------------------------------

  private async signIn(): Promise<void> {
    const config = this.config;
    if (!config) throw new CloudError('CLOUD_NOT_CONFIGURED');
    const previous = await this.session();
    const session = await signIn(config, {
      launch: this.deps.launch,
      redirectUri: this.deps.redirectUri,
      now: this.now,
      ...this.net,
    });
    // Another account: nothing agreed with the previous one carries over.
    if (previous && previous.uid !== session.uid) await this.clearLocal();
    await this.deps.local.set({ [CLOUD_SESSION_KEY]: session });
    await this.run([], 'merge');
  }

  /** Removes this account's traces from this computer; user data stays. */
  private async clearLocal(): Promise<void> {
    await this.deps.local.remove([
      CLOUD_SESSION_KEY,
      CLOUD_STATE_KEY,
      CLOUD_BASE_KEY,
      CLOUD_BACKUP_KEY,
      CLOUD_SECRET_KEY,
    ]);
  }

  private async deleteAccount(): Promise<void> {
    const config = this.config;
    if (!config) throw new CloudError('CLOUD_NOT_CONFIGURED');
    const session = await this.liveSession(config);
    for (const domain of SYNC_DOMAINS)
      await deleteDoc(config, session, domain, this.net);
    await deleteAccount(config, session, this.net);
    await this.clearLocal();
  }

  private async setDomain(domain: SyncDomain, enabled: boolean): Promise<void> {
    const prefs = await this.readLocal(CLOUD_PREFS_KEY, normalizeCloudPrefs);
    prefs.domains[domain] = enabled;
    await this.deps.local.set({ [CLOUD_PREFS_KEY]: prefs });
    await this.run([], 'merge');
  }

  private async passphrase(passphrase: string, mode: 'unlock' | 'replace') {
    if ([...passphrase].length < MIN_PASSPHRASE)
      throw new CloudError('CLOUD_WEAK_PASSPHRASE');
    const config = this.config;
    if (!config) throw new CloudError('CLOUD_NOT_CONFIGURED');
    const session = await this.liveSession(config);
    const doc = await readDoc(config, session, 'keys', this.net);
    if (mode === 'unlock' && doc) {
      const envelope = parseEnvelope(doc.payload);
      if (!envelope) throw new CloudError('CLOUD_REMOTE_DAMAGED');
      const secret = await deriveSecret(
        passphrase,
        envelope.kdf.salt,
        envelope.kdf.iterations,
      );
      if ((await decryptText(secret, envelope)) === null)
        throw new CloudError('CLOUD_WRONG_PASSPHRASE');
      await this.deps.local.set({ [CLOUD_SECRET_KEY]: secret });
      await this.run([], 'merge');
      return;
    }
    // A new passphrase (new salt): this computer's keys are encrypted with it
    // and replace the ones in the cloud.
    const secret = await deriveSecret(
      passphrase,
      undefined,
      this.deps.iterations ?? KDF_ITERATIONS,
    );
    const local = await readLocalDomain(this.deps.local, 'keys');
    if (!local) throw new CloudError('CLOUD_LOCAL_DAMAGED');
    const ctx = await this.context(config, session, 'merge');
    ctx.secret = secret;
    await this.push(ctx, 'keys', local, doc ? doc.updateTime : null);
    ctx.state.keys = {
      ...ctx.state.keys,
      status: 'synced',
      code: null,
      syncedAt: this.now(),
    };
    await this.deps.local.set({ [CLOUD_SECRET_KEY]: secret });
    await this.save(ctx);
    await this.run([], 'merge');
  }
}
