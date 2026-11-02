// V5.8 durable usage ledger in the extension's own IndexedDB (extension
// origin: content scripts and web pages cannot open it). Every decision that
// matters — admit, mark sent, release, settle, save limits — is ONE readwrite
// transaction over all the stores it touches, so it either fully happens or
// not at all, whichever extension context (worker, settings tabs) runs it.
// Nothing here ever holds a key, a prompt, the user's text or a response.
import { PROFILE_ID, isModelId, isProviderId, type ProviderId } from './models';
import {
  CLOCK_TOLERANCE_MS,
  FALLBACK_TIMEZONE,
  PERIODS,
  QUOTA_TASKS,
  alertLevels,
  capFor,
  crossing,
  defaultPolicy,
  detectTimeZone,
  isCount,
  parsePolicy,
  scopesFor,
  windowsAt,
  type CalendarWindow,
  type Level,
  type Period,
  type QuotaNote,
  type QuotaPolicy,
  type QuotaTask,
  type Scope,
  type ScopeKind,
} from './quota';
import { parsePriceEntry, type PriceEntry } from './prices';
import { ROUTE_KEY, type DailyUsageRecord } from './settings';
import { loadSettings, loadUsage, type StorageArea } from './storage';

export const QUOTA_DB = 'correctly-v5-quota';
/** Settings tabs listen here to refresh after any committed change. */
export const QUOTA_CHANNEL = 'correctly.v5.quota';
// v2 (V5.9): operations indexed by send time, Apply/Undo events, prices.
const DB_VERSION = 2;
const POLICY = 'policy';
const META = 'meta';
const COUNTERS = 'counters';
const OPERATIONS = 'operations';
const ALERTS = 'alerts';
const EVENTS = 'events';
const PRICES = 'prices';
const ALL = [POLICY, META, COUNTERS, OPERATIONS, ALERTS, EVENTS, PRICES];
export const MIGRATION_ID = 'v5.8-quota-1';
/** Finished operations (and edit events) kept for Statistics: 400 days. */
export const OPERATION_RETENTION_MS = 400 * 86_400_000;
const ALERT_RETENTION_MS = 40 * 86_400_000;

/** [kind, id, period, timezone, window start]: no text, no key. */
export type CounterKey = [ScopeKind, string, Period, string, number];

export interface Counter {
  kind: ScopeKind;
  id: string;
  period: Period;
  timezone: string;
  start: number;
  end: number;
  label: string;
  /** Possibly sent: never given back. */
  counted: number;
  /** Admitted, not sent yet. */
  reserved: number;
  completed: number;
  failed: number;
  unknown: number;
  inputTokens: number;
  outputTokens: number;
}

export type OperationState =
  | 'reserved'
  | 'dispatching'
  | 'completed'
  | 'failed-after-send'
  | 'unknown'
  | 'cancelled-before-send';

export interface Operation {
  id: string;
  /** The worker instance that admitted it (recovery skips the live one). */
  bootId: string;
  task: QuotaTask;
  provider: ProviderId;
  credentialId: string;
  revision: number;
  modelId: string;
  state: OperationState;
  createdAt: number;
  dispatchAt: number | null;
  settledAt: number | null;
  policyRevision: number;
  keys: CounterKey[];
  inputTokens: number | null;
  outputTokens: number | null;
  /** V5.9 (absent on V5.8 records = unknown): cached part of inputTokens. */
  cachedInputTokens?: number | null;
  /** V5.9: tab and frame that asked (to accept its Apply/Undo events only). */
  originTabId?: number | null;
  originFrameId?: number | null;
}

/** V5.9: an AI edit confirmed by the page (after the text really changed). */
export type EditAction = 'applied' | 'undone';
export interface EditEvent {
  /** `${operationId}|${action}`: one of each per request at most. */
  id: string;
  operationId: string;
  action: EditAction;
  task: QuotaTask;
  provider: ProviderId;
  credentialId: string;
  modelId: string;
  at: number;
}

/** What Statistics reads for one period (metadata only). */
export interface History {
  timezone: string | null;
  /** Sent (or possibly sent) requests whose send time is in the period. */
  operations: Operation[];
  events: EditEvent[];
  prices: PriceEntry[];
  inProgress: number;
  migration: Migration | null;
  /** History before this instant was deleted by the owner. */
  deletedBefore: number | null;
  clockBack: boolean;
}

export interface AlertRecord {
  id: string;
  kind: ScopeKind;
  scopeId: string;
  period: Period;
  timezone: string;
  start: number;
  end: number;
  level: Level;
  used: number;
  max: number;
  createdAt: number;
  delivered: boolean;
  dismissed: boolean;
}

export interface Blocker {
  scope: Scope;
  period: Period;
  used: number;
  reserved: number;
  max: number;
  resetAt: number;
  timezone: string;
}

export type DenyReason =
  | 'cap-exhausted'
  | 'ai-paused'
  | 'invalid-policy'
  | 'clock-anomaly'
  | 'operation-duplicate';

export type Admission =
  | { allowed: true }
  | { allowed: false; reason: DenyReason; blocking: Blocker[] };

export type Dispatch =
  | { allowed: true; notice: QuotaNote | null }
  | { allowed: false; reason: DenyReason; blocking: Blocker[] };

export interface OperationDraft {
  id: string;
  bootId: string;
  task: QuotaTask;
  provider: ProviderId;
  credentialId: string;
  revision: number;
  modelId: string;
  originTabId?: number | null;
  originFrameId?: number | null;
}

export interface Settlement {
  state: 'completed' | 'failed-after-send' | 'unknown';
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

/** What the V5.1–V5.7 storage held, read before the one-time import. */
export interface LegacySeed {
  timezone: string;
  dailyLimit: number;
  /** Today's V5.7 usage record (null when it is from another day or empty). */
  usage: DailyUsageRecord | null;
}

/** Reads the V5.1–V5.7 daily limit and today's count (never the network). */
export async function legacySeed(
  area: StorageArea,
  today?: string,
): Promise<LegacySeed> {
  const [settings, usage] = await Promise.all([
    loadSettings(area),
    loadUsage(area, today),
  ]);
  return {
    timezone: detectTimeZone() ?? FALLBACK_TIMEZONE,
    dailyLimit: settings.safety.dailyTestAttemptLimit,
    usage: usage.testAttempts > 0 ? usage : null,
  };
}

export interface Migration {
  id: string;
  at: number;
  /** Start of the day the import counted: earlier usage is unknown. */
  trackingSince: number;
  importedAttempts: number;
  unattributed: number;
}

export interface UsageCell {
  counted: number;
  reserved: number;
}

export interface RouteRow {
  task: QuotaTask;
  provider: ProviderId;
  credentialId: string;
  modelId: string;
  attempts: number;
  completed: number;
  failed: number;
  unknown: number;
  inputTokens: number;
  outputTokens: number;
}

export interface QuotaSnapshot {
  /** damaged = the stored limits are unreadable: no request is allowed. */
  status: 'ok' | 'missing' | 'damaged';
  policy: QuotaPolicy | null;
  windows: Record<Period, CalendarWindow> | null;
  /** `${kind}:${id}|${period}` of the current windows. */
  usage: Record<string, UsageCell>;
  inProgress: number;
  clockBack: boolean;
  alerts: AlertRecord[];
  today: RouteRow[];
  migration: Migration | null;
}

/** The store of this extension context, announcing its writes to the others. */
export function browserQuotaStore(): QuotaStore {
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel(QUOTA_CHANNEL)
      : null;
  return new QuotaStore(globalThis.indexedDB, {
    notify: () => {
      try {
        channel?.postMessage('changed');
      } catch {
        // Settings tabs also refresh every minute.
      }
    },
  });
}

export class QuotaStoreError extends Error {
  constructor(readonly reason: 'unavailable' | 'blocked' | 'inconsistent') {
    super(reason);
    this.name = 'QuotaStoreError';
  }
}

export const usageKey = (scope: Scope, period: Period) =>
  `${scope.kind}:${scope.id}|${period}`;

const counterKey = (scope: Scope, window: CalendarWindow): CounterKey => [
  scope.kind,
  scope.id,
  window.period,
  window.timezone,
  window.start,
];

const emptyCounter = (scope: Scope, window: CalendarWindow): Counter => ({
  kind: scope.kind,
  id: scope.id,
  period: window.period,
  timezone: window.timezone,
  start: window.start,
  end: window.end,
  label: window.label,
  counted: 0,
  reserved: 0,
  completed: 0,
  failed: 0,
  unknown: 0,
  inputTokens: 0,
  outputTokens: 0,
});

const COUNTER_FIELDS = [
  'counted',
  'reserved',
  'completed',
  'failed',
  'unknown',
  'inputTokens',
  'outputTokens',
] as const;

/** A corrupt counter must block, never read as zero. */
function checkCounter(value: unknown): Counter | undefined {
  if (value === undefined) return undefined;
  const data = value as Record<string, unknown> | null;
  if (
    !data ||
    typeof data !== 'object' ||
    !COUNTER_FIELDS.every((field) => isCount(data[field])) ||
    !isCount(data.start) ||
    !isCount(data.end)
  )
    throw new QuotaStoreError('inconsistent');
  return data as unknown as Counter;
}

const SENT_STATES: readonly OperationState[] = [
  'dispatching',
  'completed',
  'failed-after-send',
  'unknown',
];
const isSent = (state: OperationState) => SENT_STATES.includes(state);

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
  });

export interface QuotaStoreDeps {
  /** Called after each committed write (settings pages refresh). */
  notify?: () => void;
}

/**
 * The one authority over usage limits. All public methods are atomic. Any
 * storage failure throws (callers then send nothing).
 */
export class QuotaStore {
  private opening: Promise<IDBDatabase> | null = null;
  private seeded = false;

  constructor(
    private readonly factory: IDBFactory | undefined,
    private readonly deps: QuotaStoreDeps = {},
    private readonly name = QUOTA_DB,
  ) {}

  private db(): Promise<IDBDatabase> {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) {
        reject(new QuotaStoreError('unavailable'));
        return;
      }
      let req: IDBOpenDBRequest;
      try {
        req = this.factory.open(this.name, DB_VERSION);
      } catch {
        reject(new QuotaStoreError('unavailable'));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(POLICY)) db.createObjectStore(POLICY);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        if (!db.objectStoreNames.contains(COUNTERS))
          db.createObjectStore(COUNTERS, {
            keyPath: ['kind', 'id', 'period', 'timezone', 'start'],
          });
        if (!db.objectStoreNames.contains(OPERATIONS)) {
          const operations = db.createObjectStore(OPERATIONS, {
            keyPath: 'id',
          });
          operations.createIndex('state', 'state');
          operations.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(ALERTS))
          db.createObjectStore(ALERTS, { keyPath: 'id' });
        // v1 → v2: additions only; V5.8 records are kept as they are.
        const operations = req.transaction!.objectStore(OPERATIONS);
        if (!operations.indexNames.contains('dispatchAt'))
          operations.createIndex('dispatchAt', 'dispatchAt');
        if (!db.objectStoreNames.contains(EVENTS))
          db.createObjectStore(EVENTS, { keyPath: 'id' }).createIndex(
            'at',
            'at',
          );
        if (!db.objectStoreNames.contains(PRICES))
          db.createObjectStore(PRICES, { keyPath: 'id' });
      };
      // Another extension page holds an older version open: fail closed.
      req.onblocked = () => reject(new QuotaStoreError('blocked'));
      req.onerror = () => reject(new QuotaStoreError('unavailable'));
      req.onsuccess = () => {
        const db = req.result;
        // A newer version wants to open: let it, reopen lazily later.
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        db.onclose = () => {
          this.opening = null;
        };
        resolve(db);
      };
    });
    const opening = this.opening;
    opening.catch(() => {
      if (this.opening === opening) this.opening = null;
    });
    return opening;
  }

  /**
   * Runs `body` in one transaction. Only IndexedDB requests may be awaited
   * inside (anything else would let the transaction auto-commit early).
   */
  private async run<T>(
    stores: string[],
    mode: IDBTransactionMode,
    body: (tx: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    const db = await this.db();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode, { durability: 'strict' });
    } catch {
      this.opening = null;
      throw new QuotaStoreError('unavailable');
    }
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new QuotaStoreError('unavailable'));
    });
    let result: T;
    try {
      result = await body(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished or aborted.
      }
      await finished.catch(() => undefined);
      throw error instanceof QuotaStoreError
        ? error
        : new QuotaStoreError('unavailable');
    }
    await finished;
    if (mode === 'readwrite') {
      try {
        this.deps.notify?.();
      } catch {
        // Committed already; a missed refresh is harmless.
      }
    }
    return result;
  }

  // ------------------------------------------------------------- migration

  /**
   * Creates the limits on first use, importing today's V5.1–V5.7 usage, in
   * one transaction (idempotent: a second context finds the policy and
   * stops). An import marker without a policy is inconsistent: blocked.
   */
  async ensureReady(
    loadSeed: () => Promise<LegacySeed>,
    now: number,
  ): Promise<void> {
    if (this.seeded) return;
    const existing = await this.run(
      [POLICY, META],
      'readonly',
      async (tx): Promise<unknown[]> => [
        await request<unknown>(tx.objectStore(POLICY).get('active')),
        await request<unknown>(tx.objectStore(META).get('migration')),
      ],
    );
    if (existing[0] === undefined && existing[1] !== undefined)
      throw new QuotaStoreError('inconsistent');
    if (existing[0] === undefined) {
      const seed = await loadSeed();
      await this.run([POLICY, META, COUNTERS], 'readwrite', async (tx) => {
        if ((await request(tx.objectStore(POLICY).get('active'))) !== undefined)
          return;
        if (
          (await request(tx.objectStore(META).get('migration'))) !== undefined
        )
          throw new QuotaStoreError('inconsistent');
        await this.importLegacy(tx, seed, now);
      });
    }
    this.seeded = true;
  }

  private async importLegacy(
    tx: IDBTransaction,
    seed: LegacySeed,
    now: number,
  ) {
    const policy = defaultPolicy(seed.timezone, seed.dailyLimit, now);
    const windows = windowsAt(now, seed.timezone);
    const totals = new Map<
      string,
      { scope: Scope; values: Partial<Counter> }
    >();
    const add = (scope: Scope, values: Partial<Counter>) => {
      const key = `${scope.kind}:${scope.id}`;
      const entry = totals.get(key) ?? { scope, values: {} };
      for (const field of COUNTER_FIELDS)
        entry.values[field] = (entry.values[field] ?? 0) + (values[field] ?? 0);
      totals.set(key, entry);
    };
    const usage = seed.usage;
    let attributed = 0;
    if (usage && usage.testAttempts > 0) {
      add(
        { kind: 'global', id: 'all' },
        {
          counted: usage.testAttempts,
          completed: usage.completed,
          failed: usage.failed,
          unknown: usage.unknown + Object.keys(usage.pending).length,
          inputTokens: usage.inputTokensObserved,
          outputTokens: usage.outputTokensObserved,
        },
      );
      for (const [key, item] of Object.entries(usage.routes)) {
        if (!ROUTE_KEY.test(key) || !item.attempts) continue;
        const [provider, credentialId = '', , , task] = key.split('|');
        if (!isProviderId(provider)) continue;
        attributed += item.attempts;
        const values = {
          counted: item.attempts,
          completed: item.completed,
          failed: item.failed,
          unknown: item.unknown,
          inputTokens: item.inputTokens,
          outputTokens: item.outputTokens,
        };
        for (const scope of scopesFor({
          task: task as QuotaTask,
          provider,
          credentialId,
        }).slice(1))
          add(scope, values);
      }
    }
    const counters = tx.objectStore(COUNTERS);
    for (const { scope, values } of totals.values())
      for (const period of PERIODS)
        await request(
          counters.put({
            ...emptyCounter(scope, windows[period]),
            ...values,
            reserved: 0,
          }),
        );
    const migration: Migration = {
      id: MIGRATION_ID,
      at: now,
      trackingSince: windows.daily.start,
      importedAttempts: usage?.testAttempts ?? 0,
      unattributed: Math.max(0, (usage?.testAttempts ?? 0) - attributed),
    };
    await request(tx.objectStore(POLICY).put(policy, 'active'));
    await request(tx.objectStore(META).put(migration, 'migration'));
    await request(tx.objectStore(META).put({ lastSeen: now }, 'clock'));
  }

  // ------------------------------------------------------------- admission

  private async readPolicy(tx: IDBTransaction) {
    return parsePolicy(await request(tx.objectStore(POLICY).get('active')));
  }

  /** Moves the clock high-water mark; true when the clock went back. */
  private async clockBack(tx: IDBTransaction, now: number): Promise<boolean> {
    const meta = tx.objectStore(META);
    const clock = (await request(meta.get('clock'))) as
      { lastSeen?: unknown } | undefined;
    const lastSeen = isCount(clock?.lastSeen) ? clock.lastSeen : 0;
    if (now < lastSeen - CLOCK_TOLERANCE_MS) return true;
    if (now > lastSeen) await request(meta.put({ lastSeen: now }, 'clock'));
    return false;
  }

  /**
   * Checks every enabled cap that applies (global, task, provider, key; day,
   * week, month) and, if all allow it, reserves one attempt in all twelve
   * tracked counters — limited or not — plus the operation record.
   */
  admit(draft: OperationDraft, now: number): Promise<Admission> {
    return this.run(
      [POLICY, META, COUNTERS, OPERATIONS],
      'readwrite',
      async (tx): Promise<Admission> => {
        const policy = await this.readPolicy(tx);
        if (!policy)
          return { allowed: false, reason: 'invalid-policy', blocking: [] };
        if (await this.clockBack(tx, now))
          return { allowed: false, reason: 'clock-anomaly', blocking: [] };
        if (policy.pauseAll)
          return { allowed: false, reason: 'ai-paused', blocking: [] };
        const operations = tx.objectStore(OPERATIONS);
        if ((await request(operations.get(draft.id))) !== undefined)
          return {
            allowed: false,
            reason: 'operation-duplicate',
            blocking: [],
          };
        const cells = await this.cells(tx, policy, draft, now);
        const blocking = cells.flatMap((cell) =>
          cell.cap?.enabled &&
          cell.counter.counted + cell.counter.reserved >= cell.cap.max
            ? [blocker(cell)]
            : [],
        );
        if (blocking.length)
          return {
            allowed: false,
            reason: 'cap-exhausted',
            blocking: sort(blocking),
          };
        const counters = tx.objectStore(COUNTERS);
        for (const cell of cells)
          await request(
            counters.put({
              ...cell.counter,
              reserved: cell.counter.reserved + 1,
            }),
          );
        const operation: Operation = {
          ...draft,
          state: 'reserved',
          createdAt: now,
          dispatchAt: null,
          settledAt: null,
          policyRevision: policy.revision,
          keys: cells.map((cell) => cell.key),
          inputTokens: null,
          outputTokens: null,
          cachedInputTokens: null,
          originTabId: draft.originTabId ?? null,
          originFrameId: draft.originFrameId ?? null,
        };
        await request(operations.put(operation));
        return { allowed: true };
      },
    );
  }

  /** The twelve counters of one route at `now` (missing ones start at zero). */
  private async cells(
    tx: IDBTransaction,
    policy: QuotaPolicy,
    route: Pick<OperationDraft, 'task' | 'provider' | 'credentialId'>,
    now: number,
  ) {
    const windows = windowsAt(now, policy.timezone);
    const counters = tx.objectStore(COUNTERS);
    const wanted = scopesFor(route).flatMap((scope) =>
      PERIODS.map((period) => ({ scope, period, window: windows[period] })),
    );
    const found = await Promise.all(
      wanted.map(({ scope, window }) =>
        request(counters.get(counterKey(scope, window))),
      ),
    );
    return wanted.map(({ scope, period, window }, index) => ({
      scope,
      period,
      window,
      key: counterKey(scope, window),
      cap: capFor(policy, scope, period),
      counter: checkCounter(found[index]) ?? emptyCounter(scope, window),
    }));
  }

  /**
   * The last step before the network: re-checks pause, clock and the limits
   * as saved NOW, moves the reservation into the current windows if a day,
   * week or month started meanwhile, then counts the attempt for good. Only
   * after this commit may the provider be called. Threshold alerts are
   * recorded in the same transaction.
   */
  dispatch(id: string, now: number): Promise<Dispatch> {
    return this.run(
      [POLICY, META, COUNTERS, OPERATIONS, ALERTS],
      'readwrite',
      async (tx): Promise<Dispatch> => {
        const operations = tx.objectStore(OPERATIONS);
        const operation = (await request(operations.get(id))) as
          Operation | undefined;
        if (!operation || operation.state !== 'reserved')
          return {
            allowed: false,
            reason: 'operation-duplicate',
            blocking: [],
          };
        const policy = await this.readPolicy(tx);
        const refuse = async (reason: DenyReason, blocking: Blocker[] = []) => {
          await this.unreserve(tx, operation, now);
          return { allowed: false as const, reason, blocking };
        };
        if (!policy) return refuse('invalid-policy');
        if (await this.clockBack(tx, now)) return refuse('clock-anomaly');
        if (policy.pauseAll) return refuse('ai-paused');
        const counters = tx.objectStore(COUNTERS);
        const cells = await this.cells(tx, policy, operation, now);
        const own = new Set(operation.keys.map((key) => JSON.stringify(key)));
        // This operation's own reservation does not block itself.
        const others = (cell: (typeof cells)[number]) =>
          cell.counter.reserved - (own.has(JSON.stringify(cell.key)) ? 1 : 0);
        const blocking = cells.flatMap((cell) =>
          cell.cap?.enabled &&
          cell.counter.counted + others(cell) >= cell.cap.max
            ? [blocker(cell)]
            : [],
        );
        if (blocking.length) return refuse('cap-exhausted', sort(blocking));
        // Old windows (rollover): give their reservation back first.
        const current = new Set(cells.map((cell) => JSON.stringify(cell.key)));
        for (const key of operation.keys)
          if (!current.has(JSON.stringify(key))) {
            const old = checkCounter(await request(counters.get(key)));
            if (old)
              await request(
                counters.put({
                  ...old,
                  reserved: Math.max(0, old.reserved - 1),
                }),
              );
          }
        const levels = alertLevels(policy);
        const alerts: AlertRecord[] = [];
        for (const cell of cells) {
          const before = cell.counter.counted;
          await request(
            counters.put({
              ...cell.counter,
              counted: before + 1,
              reserved: Math.max(0, others(cell)),
            }),
          );
          const level =
            cell.cap?.enabled &&
            crossing(before, before + 1, cell.cap.max, levels);
          if (cell.cap && level)
            alerts.push({
              id: alertId(cell.key, level),
              kind: cell.scope.kind,
              scopeId: cell.scope.id,
              period: cell.period,
              timezone: cell.window.timezone,
              start: cell.window.start,
              end: cell.window.end,
              level,
              used: before + 1,
              max: cell.cap.max,
              createdAt: now,
              delivered: false,
              dismissed: false,
            });
        }
        const store = tx.objectStore(ALERTS);
        const fresh: AlertRecord[] = [];
        for (const alert of alerts)
          if ((await request(store.get(alert.id))) === undefined) {
            await request(store.put(alert));
            fresh.push(alert);
          }
        await request(
          operations.put({
            ...operation,
            state: 'dispatching',
            dispatchAt: now,
            policyRevision: policy.revision,
            keys: cells.map((cell) => cell.key),
          }),
        );
        const top = pickAlert(fresh);
        return {
          allowed: true,
          notice: top ? noteFor(top, operation, false) : null,
        };
      },
    );
  }

  private async unreserve(
    tx: IDBTransaction,
    operation: Operation,
    now: number,
  ) {
    const counters = tx.objectStore(COUNTERS);
    for (const key of operation.keys) {
      const counter = checkCounter(await request(counters.get(key)));
      if (counter)
        await request(
          counters.put({
            ...counter,
            reserved: Math.max(0, counter.reserved - 1),
          }),
        );
    }
    await request(
      tx.objectStore(OPERATIONS).put({
        ...operation,
        state: 'cancelled-before-send',
        settledAt: now,
      }),
    );
  }

  /** Nothing was sent: gives the reservation back, exactly once. */
  release(id: string, now: number): Promise<void> {
    return this.run([COUNTERS, OPERATIONS], 'readwrite', async (tx) => {
      const operation = (await request(tx.objectStore(OPERATIONS).get(id))) as
        Operation | undefined;
      if (operation?.state === 'reserved')
        await this.unreserve(tx, operation, now);
    });
  }

  /** Records how a sent attempt ended. Never changes what was counted. */
  settle(id: string, outcome: Settlement, now: number): Promise<void> {
    return this.run([COUNTERS, OPERATIONS], 'readwrite', async (tx) => {
      const operations = tx.objectStore(OPERATIONS);
      const operation = (await request(operations.get(id))) as
        Operation | undefined;
      // Settled already (duplicate callback) or recovered as unknown.
      if (operation?.state !== 'dispatching') return;
      const tokens = (value: number | undefined) =>
        isCount(value) ? value : null;
      const input = tokens(outcome.inputTokens),
        output = tokens(outcome.outputTokens),
        cached = tokens(outcome.cachedInputTokens);
      await this.addOutcome(tx, operation.keys, outcome.state, input, output);
      await request(
        operations.put({
          ...operation,
          state: outcome.state,
          settledAt: now,
          inputTokens: input,
          outputTokens: output,
          cachedInputTokens:
            cached !== null && input !== null && cached <= input
              ? cached
              : null,
        }),
      );
    });
  }

  private async addOutcome(
    tx: IDBTransaction,
    keys: CounterKey[],
    state: Settlement['state'],
    input: number | null,
    output: number | null,
  ) {
    const counters = tx.objectStore(COUNTERS);
    const field =
      state === 'completed'
        ? 'completed'
        : state === 'unknown'
          ? 'unknown'
          : 'failed';
    for (const key of keys) {
      const counter = checkCounter(await request(counters.get(key)));
      if (!counter) continue;
      await request(
        counters.put({
          ...counter,
          [field]: counter[field] + 1,
          inputTokens: counter.inputTokens + (input ?? 0),
          outputTokens: counter.outputTokens + (output ?? 0),
        }),
      );
    }
  }

  /**
   * At worker start. Operations left by a stopped worker are never replayed:
   * a reservation that was never marked sent is given back; one marked sent
   * stays counted as "unknown" (it may have been billed). Old finished
   * operations and alerts are pruned; counters are kept.
   */
  recover(bootId: string, now: number): Promise<void> {
    return this.run(
      [COUNTERS, OPERATIONS, ALERTS, EVENTS],
      'readwrite',
      async (tx) => {
        const operations = tx.objectStore(OPERATIONS);
        const stale = (
          (await request(operations.getAll())) as Operation[]
        ).filter(
          (operation) =>
            operation.bootId !== bootId &&
            (operation.state === 'reserved' ||
              operation.state === 'dispatching'),
        );
        for (const operation of stale)
          if (operation.state === 'reserved')
            await this.unreserve(tx, operation, now);
          else {
            await this.addOutcome(tx, operation.keys, 'unknown', null, null);
            await request(
              operations.put({
                ...operation,
                state: 'unknown',
                settledAt: now,
              }),
            );
          }
        const old = (await request(
          operations
            .index('createdAt')
            .getAll(IDBKeyRange.upperBound(now - OPERATION_RETENTION_MS)),
        )) as Operation[];
        for (const operation of old)
          if (
            operation.state !== 'reserved' &&
            operation.state !== 'dispatching'
          )
            await request(operations.delete(operation.id));
        const alerts = tx.objectStore(ALERTS);
        for (const alert of (await request(alerts.getAll())) as AlertRecord[])
          if (alert.end < now - ALERT_RETENTION_MS)
            await request(alerts.delete(alert.id));
        const events = tx.objectStore(EVENTS);
        for (const key of await request(
          events
            .index('at')
            .getAllKeys(IDBKeyRange.upperBound(now - OPERATION_RETENTION_MS)),
        ))
          await request(events.delete(key));
      },
    );
  }

  // ------------------------------------------------------ statistics (V5.9)

  /** The usage limits' time zone (null when the limits are unreadable). */
  timezone(): Promise<string | null> {
    return this.run([POLICY], 'readonly', async (tx) => {
      return (await this.readPolicy(tx))?.timezone ?? null;
    });
  }

  /**
   * Everything Statistics needs for [start, end): read-only, metadata only.
   * Requests are placed by their send time (the instant they were counted).
   */
  history(start: number, end: number, now: number): Promise<History> {
    return this.run(ALL, 'readonly', async (tx) => {
      const policy = await this.readPolicy(tx);
      const meta = tx.objectStore(META);
      const operations = tx.objectStore(OPERATIONS);
      const range = IDBKeyRange.bound(start, end, false, true);
      const sent = (
        (await request(
          operations.index('dispatchAt').getAll(range),
        )) as Operation[]
      ).filter((operation) => isSent(operation.state));
      const events = (await request(
        tx.objectStore(EVENTS).index('at').getAll(range),
      )) as EditEvent[];
      const prices = (
        (await request(tx.objectStore(PRICES).getAll())) as unknown[]
      ).flatMap((item) => parsePriceEntry(item) ?? []);
      const inProgress =
        (await request(operations.index('state').count('reserved'))) +
        (await request(operations.index('state').count('dispatching')));
      const deleted = (await request(meta.get('statsDeleted'))) as
        { before?: unknown } | undefined;
      const clock = (await request(meta.get('clock'))) as
        { lastSeen?: unknown } | undefined;
      const lastSeen = isCount(clock?.lastSeen) ? clock.lastSeen : 0;
      return {
        timezone: policy?.timezone ?? null,
        operations: sent,
        events,
        prices,
        inProgress,
        migration:
          ((await request(meta.get('migration'))) as Migration | undefined) ??
          null,
        deletedBefore: isCount(deleted?.before) ? deleted.before : null,
        clockBack: now < lastSeen - CLOCK_TOLERANCE_MS,
      };
    });
  }

  /**
   * An Apply or Undo the page confirmed. Accepted only for a completed
   * request of that same tab and frame, once per action; an Undo needs its
   * Apply. Nothing about the text is stored.
   */
  recordEdit(
    edit: {
      operationId: string;
      action: EditAction;
      tabId: number;
      frameId: number;
    },
    now: number,
  ): Promise<boolean> {
    return this.run([OPERATIONS, EVENTS], 'readwrite', async (tx) => {
      const operation = (await request(
        tx.objectStore(OPERATIONS).get(edit.operationId),
      )) as Operation | undefined;
      if (
        !operation ||
        operation.state !== 'completed' ||
        operation.task === 'test' ||
        operation.originTabId !== edit.tabId ||
        operation.originFrameId !== edit.frameId
      )
        return false;
      const events = tx.objectStore(EVENTS);
      const id = `${operation.id}|${edit.action}`;
      if ((await request(events.get(id))) !== undefined) return false;
      if (
        edit.action === 'undone' &&
        (await request(events.get(`${operation.id}|applied`))) === undefined
      )
        return false;
      const event: EditEvent = {
        id,
        operationId: operation.id,
        action: edit.action,
        task: operation.task,
        provider: operation.provider,
        credentialId: operation.credentialId,
        modelId: operation.modelId,
        at: now,
      };
      await request(events.put(event));
      return true;
    });
  }

  /** Adds a price reference (entries are never edited in place). */
  addPrice(entry: PriceEntry): Promise<'saved' | 'invalid' | 'exists'> {
    return this.run([PRICES], 'readwrite', async (tx) => {
      const valid = parsePriceEntry(entry);
      if (!valid || valid.source !== 'owner') return 'invalid';
      const store = tx.objectStore(PRICES);
      if ((await request(store.get(valid.id))) !== undefined) return 'exists';
      await request(store.put(valid));
      return 'saved';
    });
  }

  /**
   * Deletes Statistics history sent before `before`: finished requests and
   * edit events only. Usage-limit counters, alerts and requests still in
   * progress are kept, so every limit stays enforced.
   */
  deleteHistory(before: number, now: number): Promise<number> {
    return this.run([META, OPERATIONS, EVENTS], 'readwrite', async (tx) => {
      const operations = tx.objectStore(OPERATIONS);
      let deleted = 0;
      for (const operation of (await request(
        operations
          .index('dispatchAt')
          .getAll(IDBKeyRange.upperBound(before, true)),
      )) as Operation[])
        if (
          operation.state !== 'reserved' &&
          operation.state !== 'dispatching'
        ) {
          await request(operations.delete(operation.id));
          deleted += 1;
        }
      const events = tx.objectStore(EVENTS);
      for (const key of await request(
        events.index('at').getAllKeys(IDBKeyRange.upperBound(before, true)),
      ))
        await request(events.delete(key));
      const meta = tx.objectStore(META);
      const previous = (await request(meta.get('statsDeleted'))) as
        { before?: unknown } | undefined;
      await request(
        meta.put(
          {
            before: Math.max(
              before,
              isCount(previous?.before) ? previous.before : 0,
            ),
            at: now,
          },
          'statsDeleted',
        ),
      );
      return deleted;
    });
  }

  // -------------------------------------------------------- settings page

  /** Read-only view for the settings page (current windows only). */
  snapshot(
    now: number,
    credentialIds: readonly string[],
  ): Promise<QuotaSnapshot> {
    return this.run(ALL, 'readonly', async (tx) => {
      const raw: unknown = await request(tx.objectStore(POLICY).get('active'));
      const policy = parsePolicy(raw);
      const migration =
        ((await request(tx.objectStore(META).get('migration'))) as
          Migration | undefined) ?? null;
      const clock = (await request(tx.objectStore(META).get('clock'))) as
        { lastSeen?: unknown } | undefined;
      const empty: QuotaSnapshot = {
        status: raw === undefined ? 'missing' : 'damaged',
        policy: null,
        windows: null,
        usage: {},
        inProgress: 0,
        clockBack: false,
        alerts: [],
        today: [],
        migration,
      };
      if (!policy) return empty;
      const windows = windowsAt(now, policy.timezone);
      const ids = new Set([
        ...credentialIds.filter((id) => PROFILE_ID.test(id)),
        ...Object.keys(policy.credentials),
      ]);
      const scopes: Scope[] = [
        { kind: 'global', id: 'all' },
        ...QUOTA_TASKS.map((id) => ({ kind: 'task' as const, id })),
        ...(['gemini', 'openai'] as const).map((id) => ({
          kind: 'provider' as const,
          id,
        })),
        ...[...ids].map((id) => ({ kind: 'credential' as const, id })),
      ];
      const counters = tx.objectStore(COUNTERS);
      const usage: Record<string, UsageCell> = {};
      for (const scope of scopes)
        for (const period of PERIODS) {
          const counter = checkCounter(
            await request(counters.get(counterKey(scope, windows[period]))),
          );
          usage[usageKey(scope, period)] = {
            counted: counter?.counted ?? 0,
            reserved: counter?.reserved ?? 0,
          };
        }
      const operations = tx.objectStore(OPERATIONS);
      const inProgress =
        (await request(operations.index('state').count('reserved'))) +
        (await request(operations.index('state').count('dispatching')));
      const todays = (await request(
        operations
          .index('createdAt')
          .getAll(
            IDBKeyRange.bound(
              windows.daily.start,
              windows.daily.end,
              false,
              true,
            ),
          ),
      )) as Operation[];
      const alerts = (
        (await request(tx.objectStore(ALERTS).getAll())) as AlertRecord[]
      ).filter(
        (alert) =>
          !alert.dismissed &&
          alert.timezone === policy.timezone &&
          alert.start <= now &&
          now < alert.end &&
          // An alert belongs to the limit it was raised for: once that limit
          // is changed or turned off, the old "20 / 20" must not linger.
          sameLimit(policy, alert),
      );
      const lastSeen = isCount(clock?.lastSeen) ? clock.lastSeen : 0;
      return {
        status: 'ok',
        policy,
        windows,
        usage,
        inProgress,
        clockBack: now < lastSeen - CLOCK_TOLERANCE_MS,
        alerts: alerts.sort(
          (a, b) => b.level - a.level || b.createdAt - a.createdAt,
        ),
        today: routeRows(todays),
        migration,
      };
    });
  }

  /**
   * Saves limits only if nobody saved since `expectedRevision` (another
   * settings tab): no silent overwrite. `null` = repair of missing/damaged
   * limits. Usage is never reset; a time-zone change carries the current
   * windows' counts over (conservatively) instead of starting from zero.
   */
  savePolicy(
    next: QuotaPolicy,
    expectedRevision: number | null,
    now: number,
  ): Promise<'saved' | 'conflict' | 'invalid'> {
    return this.run([POLICY, COUNTERS], 'readwrite', async (tx) => {
      const store = tx.objectStore(POLICY);
      const raw: unknown = await request(store.get('active'));
      const current = parsePolicy(raw);
      if (
        expectedRevision === null
          ? current !== null
          : current?.revision !== expectedRevision
      )
        return 'conflict';
      const saved = parsePolicy({
        ...next,
        schemaVersion: 1,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: now,
      });
      if (!saved) return 'invalid';
      if (current && current.timezone !== saved.timezone)
        await this.carryOver(tx, current.timezone, saved.timezone, now);
      await request(store.put(saved, 'active'));
      return 'saved';
    });
  }

  private async carryOver(
    tx: IDBTransaction,
    from: string,
    to: string,
    now: number,
  ) {
    const counters = tx.objectStore(COUNTERS);
    const windows = windowsAt(now, to);
    const all = (await request(counters.getAll())) as unknown[];
    for (const item of all) {
      const old = checkCounter(item);
      if (!old || old.timezone !== from || old.start > now || now >= old.end)
        continue;
      const scope = { kind: old.kind, id: old.id };
      const window = windows[old.period];
      const target =
        checkCounter(await request(counters.get(counterKey(scope, window)))) ??
        emptyCounter(scope, window);
      await request(
        counters.put({
          ...target,
          counted: Math.max(target.counted, old.counted),
        }),
      );
    }
  }

  /** The owner confirms the clock is right after it moved back. */
  confirmClock(now: number): Promise<void> {
    return this.run([META], 'readwrite', async (tx) => {
      await request(tx.objectStore(META).put({ lastSeen: now }, 'clock'));
    });
  }

  /** Hides a warning. It never frees a request. */
  dismissAlert(id: string): Promise<void> {
    return this.run([ALERTS], 'readwrite', async (tx) => {
      const store = tx.objectStore(ALERTS);
      const alert = (await request(store.get(id))) as AlertRecord | undefined;
      if (alert) await request(store.put({ ...alert, dismissed: true }));
    });
  }
}

const blocker = (cell: {
  scope: Scope;
  period: Period;
  window: CalendarWindow;
  counter: Counter;
  cap: { max: number } | null;
}): Blocker => ({
  scope: cell.scope,
  period: cell.period,
  used: cell.counter.counted,
  reserved: cell.counter.reserved,
  max: cell.cap?.max ?? 0,
  resetAt: cell.window.end,
  timezone: cell.window.timezone,
});

/** The limit that frees up last comes first: it is what the owner waits for. */
const sort = (blocking: Blocker[]) =>
  blocking.sort((a, b) => b.resetAt - a.resetAt);

const sameLimit = (policy: QuotaPolicy, alert: AlertRecord): boolean => {
  const cap = capFor(
    policy,
    { kind: alert.kind, id: alert.scopeId },
    alert.period,
  );
  return !!cap?.enabled && cap.max === alert.max;
};
const alertId = (key: CounterKey, level: Level) => `${key.join('|')}|${level}`;

/** One notice per request: the highest level, then the tightest cap. */
function pickAlert(alerts: AlertRecord[]): AlertRecord | null {
  return (
    [...alerts].sort(
      (a, b) =>
        b.level - a.level || a.max - a.used - (b.max - b.used) || b.end - a.end,
    )[0] ?? null
  );
}

export function noteFor(
  item: {
    kind: ScopeKind;
    scopeId: string;
    period: Period;
    level: Level;
    used: number;
    max: number;
    end: number;
    timezone: string;
  },
  route: { task: QuotaTask; provider: ProviderId },
  blocked: boolean,
): QuotaNote {
  return {
    level: item.level,
    blocked,
    scope: item.kind,
    task: item.kind === 'task' ? route.task : null,
    provider: item.kind === 'provider' ? route.provider : null,
    period: item.period,
    used: item.used,
    max: item.max,
    resetAt: item.end,
    timezone: item.timezone,
  };
}

/** The denial shown next to the request (the binding limit). */
export function blockedNote(
  blocking: Blocker[],
  route: { task: QuotaTask; provider: ProviderId },
): QuotaNote | null {
  const first = blocking[0];
  if (!first) return null;
  return noteFor(
    {
      kind: first.scope.kind,
      scopeId: first.scope.id,
      period: first.period,
      level: 100,
      used: first.used,
      max: first.max,
      end: first.resetAt,
      timezone: first.timezone,
    },
    route,
    true,
  );
}

function routeRows(operations: Operation[]): RouteRow[] {
  const rows = new Map<string, RouteRow>();
  for (const operation of operations) {
    if (!isSent(operation.state) || !isModelId(operation.modelId)) continue;
    const key = [
      operation.task,
      operation.provider,
      operation.credentialId,
      operation.modelId,
    ].join('|');
    const row = rows.get(key) ?? {
      task: operation.task,
      provider: operation.provider,
      credentialId: operation.credentialId,
      modelId: operation.modelId,
      attempts: 0,
      completed: 0,
      failed: 0,
      unknown: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    row.attempts += 1;
    if (operation.state === 'completed') row.completed += 1;
    else if (operation.state === 'failed-after-send') row.failed += 1;
    else if (operation.state === 'unknown') row.unknown += 1;
    row.inputTokens += operation.inputTokens ?? 0;
    row.outputTokens += operation.outputTokens ?? 0;
    rows.set(key, row);
  }
  return [...rows.values()];
}
