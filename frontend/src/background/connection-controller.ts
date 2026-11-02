import type {
  ConnectionResult,
  CorrectionResult,
  FailureResult,
  KeyCheckResult,
  TokenUsage,
} from '../shared/contracts';
import type {
  CandidatesResult,
  Formality,
  RewriteResult,
  RewriteStyleId,
} from '../shared/rewrite';
import type { SummaryOptions, SummaryResult } from '../shared/summary';
import {
  translationKeys,
  type TranslateTextRequest,
  type TranslationKey,
} from '../shared/translate';
import {
  CorrectlyError,
  errorMessage,
  isRetryable,
  type ErrorCode,
} from '../shared/errors';
import type { ProviderId } from '../shared/models';
import { shield, type Shield } from '../shared/protection';
import type { CheckTextResult } from '../shared/realtime';
import {
  CHECKS_KEY,
  loadProviders,
  migrateLegacyKey,
  parseChecks,
  resolveRoute,
  sameRoute,
  type RouteSlot,
  type RouteSnapshot,
  type TaskKind,
} from '../shared/providers';
import type { Candidate } from '../shared/rewrite';
import type { QuotaNote } from '../shared/quota';
import {
  QuotaStore,
  blockedNote,
  browserQuotaStore,
  legacySeed,
  type Admission,
  type OperationDraft,
} from '../shared/quota-store';
import { loadShortcuts } from '../shared/shortcuts';
import { loadSettings, type StorageArea } from '../shared/storage';
import {
  CORRECTION_TIMEOUT_MS,
  correctionTask,
  parseCorrection,
  splitEdges,
} from './correction';
import { geminiAdapter, sanitizeSample, smokeTask } from './gemini-client';
import { openaiAdapter } from './openai-client';
import { REALTIME_TIMEOUT_MS, parseRealtime, realtimeTask } from './realtime';
import { REWRITE_TIMEOUT_MS, parseRewrite, rewriteTask } from './rewrite';
import { SUMMARY_TIMEOUT_MS, parseSummary, summaryTask } from './summary';
import { parseTranslation, translationTask } from './translate';
import {
  REQUEST_TIMEOUT_MS,
  type Generation,
  type ProviderAdapter,
  type TaskRequest,
} from './transport';

/** completed = parsed answer; failed = provider answered with an error or an unusable body; unknown = sent, answer lost. */
export type Outcome = {
  state: 'completed' | 'failed' | 'unknown';
  usage?: TokenUsage;
};

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
};

export interface ControllerDeps {
  area: StorageArea;
  /** V5.8 usage limits (IndexedDB). */
  quota?: QuotaStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  /** Local date of the V5.7 usage record imported once by V5.8. */
  today?: () => string;
  isOnline?: () => boolean;
  /** Tests only: deterministic placeholder namespace. */
  placeholderTag?: () => string;
  /** Tests only: deterministic operation IDs. */
  operationId?: () => string;
}

const failure = (
  code: ErrorCode,
  httpStatus?: number,
  quota?: QuotaNote | null,
): FailureResult => ({
  ok: false,
  code,
  message: errorMessage(code),
  retryable: isRetryable(code),
  ...(httpStatus === undefined ? {} : { httpStatus }),
  ...(quota ? { quota } : {}),
});

type Ready = {
  ok: true;
  route: RouteSnapshot;
  key: string;
  operationId: string;
  /** A usage warning this request crossed (returned with its result). */
  notice: QuotaNote | null;
};

const withNotice = (start: Ready): { notice?: QuotaNote } =>
  start.notice ? { notice: start.notice } : {};

/** The tab and frame a page request came from (V5.9 edit events). */
export interface Origin {
  tabId: number;
  frameId: number;
}

/**
 * Handles TEST_CONNECTION, TEST_KEY, CORRECT_TEXT, REWRITE_TEXT,
 * TRANSLATE_TEXT, SUMMARIZE_TEXT and CHECK_TEXT. Requests run one at a time; each generation is bound to
 * one frozen route (profile, key revision, model), admitted by every
 * applicable usage limit and marked sent in IndexedDB before the network is
 * touched, sent once and never retried or rerouted to another key, model or
 * provider.
 */
export class ConnectionController {
  private readonly quota: QuotaStore;
  /** This worker instance: recovery never touches its own requests. */
  private readonly bootId = crypto.randomUUID();
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;
  private readonly isOnline: () => boolean;
  /** The one request in flight (requests are serialized). */
  private active: { route: RouteSnapshot; abort: AbortController } | null =
    null;
  private checks: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ControllerDeps) {
    this.quota = deps.quota ?? browserQuotaStore();
    this.now = deps.now ?? (() => new Date());
    this.isOnline = deps.isOnline ?? (() => navigator.onLine !== false);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T | FailureResult> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run.catch((error: unknown) =>
      failure(error instanceof CorrectlyError ? error.code : 'UNKNOWN_ERROR'),
    );
  }

  /**
   * Usage limits ready: created on first use from the V5.1–V5.7 daily limit
   * and today's count, then requests a stopped worker left behind are
   * settled (never replayed). Until this succeeds no request is sent; a
   * failure is retried on the next request.
   */
  reconcile(): Promise<void> {
    this.ready ??= (async () => {
      const at = this.now().getTime();
      await this.quota.ensureReady(
        () => legacySeed(this.deps.area, this.deps.today?.()),
        at,
      );
      await this.quota.recover(this.bootId, at);
    })();
    const ready = this.ready;
    ready.catch(() => {
      if (this.ready === ready) this.ready = null;
    });
    return ready;
  }

  /** A refusal by the usage limits: nothing is reserved or sent. */
  private static denied(
    admission: Extract<Admission, { allowed: false }>,
    draft: OperationDraft,
  ): FailureResult {
    switch (admission.reason) {
      case 'cap-exhausted':
        return failure(
          'QUOTA_EXCEEDED',
          undefined,
          blockedNote(admission.blocking, draft),
        );
      case 'ai-paused':
        return failure('AI_PAUSED');
      case 'clock-anomaly':
        return failure('CLOCK_CHANGED');
      default:
        return failure('QUOTA_UNAVAILABLE');
    }
  }

  /**
   * Profiles changed: a request whose key was deleted or replaced is stopped
   * locally (it may already have reached the provider). Disabling a key only
   * affects later requests.
   */
  async onProvidersChanged(): Promise<void> {
    const active = this.active;
    if (!active) return;
    const { store, secrets } = await loadProviders(this.deps.area);
    const profile = store.profiles.find(
      (p) => p.id === active.route.credentialId,
    );
    const secret = secrets.secrets[active.route.credentialId];
    if (
      !profile ||
      profile.revision !== active.route.revision ||
      secret?.revision !== active.route.revision
    )
      active.abort.abort();
  }

  /** One tiny, possibly billed generation through the route saved for `slot`. */
  testConnection(slot: RouteSlot): Promise<ConnectionResult> {
    return this.enqueue(() => this.runTest(slot));
  }

  /** Free key check: lists models; never counted as a generation. */
  testKey(credentialId: string): Promise<KeyCheckResult> {
    return this.enqueue(() => this.runKeyCheck(credentialId));
  }

  /** One request that both detects and corrects errors in `text`. */
  correct(text: string, origin?: Origin): Promise<CorrectionResult> {
    return this.enqueue(() => this.runCorrection(text, origin));
  }

  /** One request returning one rewrite per requested style. */
  rewrite(
    text: string,
    styleIds: readonly RewriteStyleId[],
    origin?: Origin,
    formality?: Formality,
  ): Promise<RewriteResult> {
    return this.enqueue(() =>
      this.runRewrite(text, styleIds, origin, formality),
    );
  }

  /** One request: detection, translation and any styles together. */
  translate(
    request: TranslateTextRequest,
    origin?: Origin,
  ): Promise<CandidatesResult<TranslationKey>> {
    return this.enqueue(() => this.runTranslate(request, origin));
  }

  /**
   * V5.12: ONE request that detects the language, summarizes and writes the
   * summary in the target language (never a second translation call).
   */
  summarize(
    request: SummaryOptions & { text: string },
    origin?: Origin,
  ): Promise<SummaryResult> {
    return this.enqueue(() => this.runSummary(request, origin));
  }

  /**
   * V6.1: ONE short request checking one sentence (plus the previous one as
   * context) while the user types. Needs the feature on, the API engine and
   * the typing consent; never retried, own route/limits/statistics.
   */
  check(
    request: { text: string; context: string },
    origin?: Origin,
  ): Promise<CheckTextResult> {
    return this.enqueue(() => this.runCheck(request, origin));
  }

  /** V5.9: an Apply/Undo the page confirmed (statistics only; never a request). */
  recordEdit(
    operationId: string,
    action: 'applied' | 'undone',
    origin: Origin,
  ): Promise<boolean> {
    return this.quota
      .recordEdit({ operationId, action, ...origin }, this.now().getTime())
      .catch(() => false);
  }

  private async resolve(slot: RouteSlot) {
    const loaded = await loadProviders(this.deps.area);
    if (loaded.damaged)
      return { ok: false as const, code: 'STORAGE_ERROR' as const };
    return resolveRoute(loaded.store, loaded.secrets, slot);
  }

  /**
   * Guards that must not consume an attempt (consent, route, network), the
   * atomic admission by every applicable usage limit, a check that the
   * route did not change meanwhile, then the "sent" mark (re-checking the
   * limits as saved now). Any refusal sends nothing.
   */
  private async begin(
    slot: RouteSlot,
    task: TaskKind | 'test',
    needsConsent: boolean,
    origin?: Origin,
  ): Promise<Ready | FailureResult> {
    // A V5.1 key is moved to a profile first (local only, idempotent).
    await migrateLegacyKey(this.deps.area).catch(() => undefined);
    const settings = await loadSettings(this.deps.area);
    if (needsConsent && !settings.correction.consent)
      return failure('CONSENT_REQUIRED');
    const resolved = await this.resolve(slot);
    if (!resolved.ok) return failure(resolved.code);
    if (!this.isOnline()) return failure('NETWORK_ERROR');
    const draft: OperationDraft = {
      id: (this.deps.operationId ?? (() => crypto.randomUUID()))(),
      bootId: this.bootId,
      task,
      provider: resolved.route.provider,
      credentialId: resolved.route.credentialId,
      revision: resolved.route.revision,
      modelId: resolved.route.modelId,
      originTabId: origin?.tabId ?? null,
      originFrameId: origin?.frameId ?? null,
    };
    const at = () => this.now().getTime();
    let admission: Admission;
    try {
      await this.reconcile();
      admission = await this.quota.admit(draft, at());
    } catch {
      return failure('QUOTA_UNAVAILABLE');
    }
    if (!admission.allowed)
      return ConnectionController.denied(admission, draft);
    const release = () =>
      this.quota.release(draft.id, at()).catch(() => undefined);
    const again = await this.resolve(slot).catch(() => null);
    if (!again?.ok || !sameRoute(again.route, resolved.route)) {
      await release();
      return failure(again && !again.ok ? again.code : 'ROUTE_CHANGED');
    }
    let sent: Awaited<ReturnType<QuotaStore['dispatch']>>;
    try {
      sent = await this.quota.dispatch(draft.id, at());
    } catch {
      // Not committed: the attempt is still only reserved.
      await release();
      return failure('QUOTA_UNAVAILABLE');
    }
    if (!sent.allowed) return ConnectionController.denied(sent, draft);
    return {
      ok: true,
      route: resolved.route,
      key: resolved.key,
      operationId: draft.id,
      notice: sent.notice,
    };
  }

  /** Exactly ONE call to the adapter of the frozen route. */
  private async dispatch(
    start: Ready,
    task: TaskRequest,
    timeoutMs: number,
  ): Promise<Generation> {
    const abort = new AbortController();
    this.active = { route: start.route, abort };
    try {
      return await ADAPTERS[start.route.provider].generate(
        {
          key: start.key,
          modelId: start.route.modelId,
          fetchImpl: this.deps.fetchImpl,
          timeoutMs: this.deps.timeoutMs ?? timeoutMs,
          signal: abort.signal,
        },
        task,
      );
    } catch {
      return { ok: false, code: 'RESPONSE_LOST', answered: false };
    } finally {
      this.active = null;
    }
  }

  /** A failure after the "sent" mark without any answer may still be billed. */
  private static sentFailure(
    reply: Extract<Generation, { ok: false }>,
  ): ErrorCode {
    return !reply.answered && reply.code === 'NETWORK_ERROR'
      ? 'RESPONSE_LOST'
      : reply.code;
  }

  /** The attempt stays counted whatever happened; only its outcome is added. */
  private settle(start: Ready, outcome: Outcome): Promise<void> {
    return this.quota
      .settle(
        start.operationId,
        {
          state:
            outcome.state === 'failed' ? 'failed-after-send' : outcome.state,
          inputTokens: outcome.usage?.inputTokens,
          outputTokens: outcome.usage?.outputTokens,
          cachedInputTokens: outcome.usage?.cachedInputTokens,
        },
        this.now().getTime(),
      )
      .catch(() => undefined);
  }

  private async runTest(slot: RouteSlot): Promise<ConnectionResult> {
    const start = await this.begin(slot, 'test', false);
    if (!start.ok) return start;
    const reply = await this.dispatch(start, smokeTask(), REQUEST_TIMEOUT_MS);
    const sample = reply.ok ? sanitizeSample(reply.text, start.key) : '';
    await this.settle(start, {
      state: sample
        ? 'completed'
        : reply.ok || reply.answered
          ? 'failed'
          : 'unknown',
      usage: reply.ok ? reply.usage : undefined,
    });
    // Sent and counted: a crossed warning is shown even when it failed.
    if (!reply.ok)
      return {
        ...failure(ConnectionController.sentFailure(reply), reply.httpStatus),
        ...withNotice(start),
      };
    if (!sample)
      return { ...failure('INVALID_RESPONSE'), ...withNotice(start) };
    return {
      ok: true,
      provider: start.route.provider,
      model: start.route.modelId,
      checkedAt: this.now().toISOString(),
      sample,
      ...(reply.usage ? { usage: reply.usage } : {}),
      ...withNotice(start),
    };
  }

  private async runKeyCheck(credentialId: string): Promise<KeyCheckResult> {
    await migrateLegacyKey(this.deps.area).catch(() => undefined);
    const { store, secrets } = await loadProviders(this.deps.area);
    const profile = store.profiles.find((p) => p.id === credentialId);
    const secret = secrets.secrets[credentialId];
    if (!profile || !secret || secret.revision !== profile.revision)
      return failure('ROUTE_BROKEN');
    if (!this.isOnline()) return failure('NETWORK_ERROR');
    let reply;
    try {
      reply = await ADAPTERS[profile.provider].listModels({
        key: secret.key,
        fetchImpl: this.deps.fetchImpl,
        timeoutMs: this.deps.timeoutMs,
      });
    } catch {
      reply = { ok: false as const, code: 'UNKNOWN_ERROR' as const };
    }
    await this.recordCheck(credentialId, profile.revision, reply).catch(
      () => undefined,
    );
    return reply.ok
      ? { ok: true, models: reply.models.length }
      : failure(reply.code, reply.httpStatus);
  }

  /** The worker is the only writer of key checks; writes are serialized. */
  private recordCheck(
    id: string,
    revision: number,
    reply: { ok: true; models: string[] } | { ok: false; code: ErrorCode },
  ): Promise<void> {
    const run = async () => {
      const { area } = this.deps;
      const checks = parseChecks((await area.get([CHECKS_KEY]))[CHECKS_KEY]);
      // Drop checks of deleted profiles and of replaced keys.
      const { store } = await loadProviders(area);
      const kept = Object.fromEntries(
        Object.entries(checks).filter(([key, check]) =>
          store.profiles.some(
            (p) => p.id === key && p.revision === check.revision,
          ),
        ),
      );
      if (!store.profiles.some((p) => p.id === id && p.revision === revision))
        return;
      kept[id] = {
        revision,
        checkedAt: this.now().toISOString(),
        ok: reply.ok,
        errorCode: reply.ok ? null : reply.code,
        // A failed check keeps the last known list (shown as not verified).
        models: reply.ok ? reply.models : (checks[id]?.models ?? []),
      };
      await area.set({ [CHECKS_KEY]: { schemaVersion: 1, profiles: kept } });
    };
    const next = this.checks.then(run, run);
    this.checks = next.catch(() => undefined);
    return next;
  }

  /**
   * The shared text path for every provider: consent, route and quota
   * checks, exactly ONE call, strict parsing, usage settled once. Edge
   * whitespace never reaches the model and is put back by the caller.
   */
  private async generate<T>(
    core: string,
    slot: TaskKind,
    task: TaskRequest,
    timeoutMs: number,
    parse: (raw: string) => T | null,
    origin?: Origin,
    needsConsent = true,
  ): Promise<
    | {
        ok: true;
        parsed: T;
        notice: { notice?: QuotaNote; operationId: string };
      }
    | FailureResult
  > {
    if (!core) return failure('UNKNOWN_ERROR');
    const start = await this.begin(slot, slot, needsConsent, origin);
    if (!start.ok) return start;
    const reply = await this.dispatch(start, task, timeoutMs);
    const parsed = reply.ok ? parse(reply.text) : null;
    await this.settle(start, {
      state:
        parsed !== null
          ? 'completed'
          : reply.ok || reply.answered
            ? 'failed'
            : 'unknown',
      usage: reply.ok ? reply.usage : undefined,
    });
    // Sent and counted: a crossed warning is shown even when it failed.
    if (!reply.ok)
      return {
        ...failure(ConnectionController.sentFailure(reply), reply.httpStatus),
        ...withNotice(start),
      };
    if (parsed === null)
      return { ...failure('INVALID_RESPONSE'), ...withNotice(start) };
    return {
      ok: true,
      parsed,
      notice: { ...withNotice(start), operationId: start.operationId },
    };
  }

  /**
   * V5.6: masks protected shortcut text in the request copy only, for every
   * provider. Uses the dictionary as it is now; the map lives for this one
   * request.
   */
  private async protect(core: string): Promise<Shield> {
    const loaded = await loadShortcuts(this.deps.area).catch(() => null);
    return shield(
      core,
      loaded && !loaded.damaged ? loaded.store.shortcuts : [],
      this.deps.placeholderTag,
    );
  }

  /** Restores each candidate; ones that lost or altered a placeholder become missing. */
  private static restoreAll<K extends string>(
    parsed: { candidates: Candidate<K>[]; missing: K[] },
    guard: Shield,
  ): { candidates: Candidate<K>[]; missing: K[] } | null {
    const candidates: Candidate<K>[] = [];
    const missing = [...parsed.missing];
    for (const candidate of parsed.candidates) {
      const text = guard.restore(candidate.text);
      if (text === null) missing.push(candidate.styleId);
      else candidates.push({ ...candidate, text });
    }
    return candidates.length ? { candidates, missing } : null;
  }

  private async runCorrection(
    text: string,
    origin?: Origin,
  ): Promise<CorrectionResult> {
    const [lead, core, trail] = splitEdges(text);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      'correction',
      correctionTask(guard.text, guard.note),
      CORRECTION_TIMEOUT_MS,
      (raw) => {
        const parsed = parseCorrection(raw, guard.text);
        if (!parsed?.hasErrors) return parsed;
        const restored = guard.restore(parsed.correctedText);
        return restored === null
          ? null
          : { ...parsed, correctedText: restored };
      },
      origin,
    );
    if (!result.ok) return result;
    const { parsed, notice } = result;
    return parsed.hasErrors
      ? {
          ok: true,
          hasErrors: true,
          correctedText: lead + parsed.correctedText + trail,
          suspicious: parsed.suspicious,
          ...notice,
        }
      : { ok: true, hasErrors: false, ...notice };
  }

  private async runRewrite(
    text: string,
    styleIds: readonly RewriteStyleId[],
    origin?: Origin,
    formality?: Formality,
  ): Promise<RewriteResult> {
    const [lead, core, trail] = splitEdges(text);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      'rewrite',
      rewriteTask(guard.text, styleIds, guard.note, formality),
      REWRITE_TIMEOUT_MS,
      (raw) => {
        const parsed = parseRewrite(raw, guard.text, styleIds);
        return parsed && ConnectionController.restoreAll(parsed, guard);
      },
      origin,
    );
    if (!result.ok) return result;
    return {
      ok: true,
      candidates: result.parsed.candidates.map((candidate) => ({
        ...candidate,
        text: lead + candidate.text + trail,
      })),
      missing: result.parsed.missing,
      ...result.notice,
    };
  }

  private async runTranslate(
    { text, ...options }: TranslateTextRequest,
    origin?: Origin,
  ): Promise<CandidatesResult<TranslationKey>> {
    const [lead, core, trail] = splitEdges(text);
    const keys = translationKeys(options.styleIds);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      // Translate & rewrite has its own route (it may inherit the default).
      options.styleIds.length ? 'translateRewrite' : 'translation',
      translationTask(guard.text, options, guard.note),
      REWRITE_TIMEOUT_MS,
      (raw) => {
        const parsed = parseTranslation(raw, guard.text, keys);
        if (!parsed || parsed.sameLanguage) return parsed;
        const restored = ConnectionController.restoreAll(parsed, guard);
        return restored && { sameLanguage: false as const, ...restored };
      },
      origin,
    );
    if (!result.ok) return result;
    const { parsed, notice } = result;
    if (parsed.sameLanguage)
      return {
        ok: true,
        candidates: [],
        missing: [],
        sameLanguage: true,
        ...notice,
      };
    return {
      ok: true,
      candidates: parsed.candidates.map((candidate) => ({
        ...candidate,
        text: lead + candidate.text + trail,
      })),
      missing: parsed.missing,
      ...notice,
    };
  }

  private async runSummary(
    { text, ...options }: SummaryOptions & { text: string },
    origin?: Origin,
  ): Promise<SummaryResult> {
    const [, core] = splitEdges(text);
    const guard = await this.protect(core);
    const result = await this.generate(
      core,
      'summary',
      summaryTask(guard.text, options, guard.noteSome),
      SUMMARY_TIMEOUT_MS,
      (raw) => {
        const parsed = parseSummary(raw, guard.text, options);
        if (!parsed || parsed.unsummarizable) return parsed;
        const restored = guard.restoreSome(parsed.text);
        return restored === null ? null : { ...parsed, text: restored };
      },
      origin,
    );
    if (!result.ok) return result;
    const { parsed, notice } = result;
    return parsed.unsummarizable
      ? { ok: true, unsummarizable: true, ...notice }
      : {
          ok: true,
          unsummarizable: false,
          text: parsed.text,
          suspicious: parsed.suspicious,
          ...notice,
        };
  }

  private async runCheck(
    { text, context }: { text: string; context: string },
    origin?: Origin,
  ): Promise<CheckTextResult> {
    // Nothing leaves the PC unless the owner turned the feature on, chose
    // the API engine and accepted the warning (apiConsent).
    const settings = await loadSettings(this.deps.area);
    if (
      !settings.triggers.realtime ||
      settings.realtime.engine !== 'api' ||
      !settings.realtime.apiConsent
    )
      return failure('CONSENT_REQUIRED');
    const result = await this.generate(
      text,
      'realtime',
      realtimeTask(text, context),
      REALTIME_TIMEOUT_MS,
      (raw) => parseRealtime(raw, text),
      origin,
      false,
    );
    if (!result.ok) return result;
    return { ok: true, issues: result.parsed, ...result.notice };
  }
}
