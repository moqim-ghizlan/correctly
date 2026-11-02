// V5.8 usage limits: the pure part (policy schema, calendar windows,
// thresholds, user-facing wording). Shared by the worker, the options page
// and the content script; storage lives in quota-store.ts.
//
// Counting rule: ONE generation request = one attempt, whatever the number of
// styles or languages in it. Only generation requests are limited; key checks
// (model lists) and local text shortcuts never are. These are local request
// limits for this browser profile, not a billing cap.
import {
  PROFILE_ID,
  PROVIDERS,
  PROVIDER_IDS,
  SLOT_LABELS,
  TASKS,
  isProviderId,
  type ProviderId,
  type TaskKind,
} from './models';

export const PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type Period = (typeof PERIODS)[number];
/** Stable task IDs (V5.7's): `test` = a confirmed connection test. */
export type QuotaTask = TaskKind | 'test';
export const QUOTA_TASKS: readonly QuotaTask[] = [...TASKS, 'test'];
export type ScopeKind = 'global' | 'task' | 'provider' | 'credential';
export interface Scope {
  kind: ScopeKind;
  id: string;
}

export interface Cap {
  enabled: boolean;
  /** Kept while disabled, so re-enabling restores it. */
  max: number;
}
export type PeriodCaps = Record<Period, Cap>;
export type Level = 80 | 95 | 100;

export const CAP_MIN = 1;
export const CAP_MAX = 1_000_000;
export const MAX_CREDENTIAL_CAPS = 64;
/** A clock moving back more than this blocks requests until confirmed. */
export const CLOCK_TOLERANCE_MS = 5 * 60_000;
export const FALLBACK_TIMEZONE = 'UTC';

export interface QuotaPolicy {
  schemaVersion: 1;
  /** +1 on every save; a save based on an older revision is refused. */
  revision: number;
  /** IANA zone of the calendar windows (never inferred from language or IP). */
  timezone: string;
  /** No AI request at all; text shortcuts keep working. */
  pauseAll: boolean;
  /** At least one global cap is always enabled: no unlimited paid path. */
  global: PeriodCaps;
  tasks: Record<TaskKind, PeriodCaps>;
  providers: Record<ProviderId, PeriodCaps>;
  /** Optional caps per key profile (stable profile ID, never a label or key). */
  credentials: Record<string, PeriodCaps>;
  /** 100 % always blocks and is always shown. */
  alerts: { at80: boolean; at95: boolean };
  updatedAt: number;
}

export const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};
export const TASK_LABELS: Record<QuotaTask, string> = {
  correction: SLOT_LABELS.correction,
  rewrite: SLOT_LABELS.rewrite,
  translation: SLOT_LABELS.translation,
  translateRewrite: SLOT_LABELS.translateRewrite,
  summary: SLOT_LABELS.summary,
  realtime: SLOT_LABELS.realtime,
  test: 'Test',
};

const cap = (max: number, enabled = false): Cap => ({ enabled, max });

/**
 * First policy: the V5.1–V5.7 daily limit becomes the global daily cap (20
 * on a fresh install); every other cap is off but already tracked.
 */
export function defaultPolicy(
  timezone: string,
  dailyLimit = 20,
  now = Date.now(),
): QuotaPolicy {
  const clamp = (value: number) =>
    Math.min(CAP_MAX, Math.max(CAP_MIN, Math.trunc(value)));
  const daily = clamp(dailyLimit);
  const periodCaps = (): PeriodCaps => ({
    daily: cap(daily),
    weekly: cap(clamp(daily * 7)),
    monthly: cap(clamp(daily * 30)),
  });
  return {
    schemaVersion: 1,
    revision: 1,
    timezone,
    pauseAll: false,
    global: { ...periodCaps(), daily: cap(daily, true) },
    tasks: {
      ...(Object.fromEntries(
        TASKS.map((task) => [task, periodCaps()]),
      ) as Record<TaskKind, PeriodCaps>),
      realtime: {
        ...periodCaps(),
        daily: cap(REALTIME_DAILY_DEFAULT),
      },
    },
    providers: Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, periodCaps()]),
    ) as Record<ProviderId, PeriodCaps>,
    credentials: {},
    alerts: { at80: true, at95: true },
    updatedAt: now,
  };
}

// ---------------------------------------------------------------- validation

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).sort().join() === [...keys].sort().join();

export const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isCapValue = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= CAP_MIN &&
  value <= CAP_MAX;

function parseCap(value: unknown): Cap | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['enabled', 'max']))
    return null;
  return typeof value.enabled === 'boolean' && isCapValue(value.max)
    ? { enabled: value.enabled, max: value.max }
    : null;
}

function parsePeriodCaps(value: unknown): PeriodCaps | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, [...PERIODS])) return null;
  const daily = parseCap(value.daily),
    weekly = parseCap(value.weekly),
    monthly = parseCap(value.monthly);
  return daily && weekly && monthly ? { daily, weekly, monthly } : null;
}

function parseCapMap<K extends string>(
  value: unknown,
  keys: readonly K[],
): Record<K, PeriodCaps> | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, [...keys])) return null;
  const out = {} as Record<K, PeriodCaps>;
  for (const key of keys) {
    const caps = parsePeriodCaps(value[key]);
    if (!caps) return null;
    out[key] = caps;
  }
  return out;
}

/**
 * V5.12 migration: a V5.8–V5.11 policy has no Summary caps. They are added
 * off (summaries are still counted by every other applicable cap), with the
 * global maxima as the values offered when the user turns one on. Every
 * other cap and counter is kept as stored.
 */
function withSummaryCaps(tasks: unknown, global: PeriodCaps | null): unknown {
  if (!global || !isPlainRecord(tasks) || 'summary' in tasks) return tasks;
  return {
    ...tasks,
    summary: {
      daily: cap(global.daily.max),
      weekly: cap(global.weekly.max),
      monthly: cap(global.monthly.max),
    },
  };
}

/**
 * Real-time checks: the daily cap offered (and switched on by the settings
 * page when the feature is enabled, V6.1); off until then.
 */
export const REALTIME_DAILY_DEFAULT = 500;

/**
 * V6.1 migration: a V5.8–V5.17 policy has no Real-time caps. They are added
 * with the daily cap REALTIME_DAILY_DEFAULT offered, off (the feature is off by default
 * anyway); every other cap and counter is kept as stored.
 */
function withRealtimeCaps(tasks: unknown, global: PeriodCaps | null): unknown {
  if (!global || !isPlainRecord(tasks) || 'realtime' in tasks) return tasks;
  return {
    ...tasks,
    realtime: {
      daily: cap(REALTIME_DAILY_DEFAULT),
      weekly: cap(global.weekly.max),
      monthly: cap(global.monthly.max),
    },
  };
}

/** Is `value` an IANA time zone this browser knows? */
export function isTimeZone(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)
  )
    return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The browser's zone, or null when it cannot be determined. */
export function detectTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export const hasGlobalCap = (policy: Pick<QuotaPolicy, 'global'>) =>
  PERIODS.some((period) => policy.global[period].enabled);

/**
 * Strict: anything unexpected returns null and the caller fails closed (no
 * request) instead of guessing a default.
 */
export function parsePolicy(value: unknown): QuotaPolicy | null {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'revision',
      'timezone',
      'pauseAll',
      'global',
      'tasks',
      'providers',
      'credentials',
      'alerts',
      'updatedAt',
    ]) ||
    value.schemaVersion !== 1 ||
    !isCount(value.revision) ||
    value.revision < 1 ||
    !isTimeZone(value.timezone) ||
    typeof value.pauseAll !== 'boolean' ||
    !isCount(value.updatedAt)
  )
    return null;
  const global = parsePeriodCaps(value.global);
  const tasks = parseCapMap(
    withRealtimeCaps(withSummaryCaps(value.tasks, global), global),
    TASKS,
  );
  const providers = parseCapMap(value.providers, PROVIDER_IDS);
  const ids = isPlainRecord(value.credentials)
    ? Object.keys(value.credentials)
    : null;
  if (
    !global ||
    !tasks ||
    !providers ||
    !ids ||
    ids.length > MAX_CREDENTIAL_CAPS ||
    !ids.every((id) => PROFILE_ID.test(id))
  )
    return null;
  const credentials = parseCapMap(value.credentials, ids);
  const alerts = value.alerts;
  if (
    !credentials ||
    !isPlainRecord(alerts) ||
    !hasExactKeys(alerts, ['at80', 'at95']) ||
    typeof alerts.at80 !== 'boolean' ||
    typeof alerts.at95 !== 'boolean' ||
    !hasGlobalCap({ global })
  )
    return null;
  return {
    schemaVersion: 1,
    revision: value.revision,
    timezone: value.timezone,
    pauseAll: value.pauseAll,
    global,
    tasks,
    providers,
    credentials,
    alerts: { at80: alerts.at80, at95: alerts.at95 },
    updatedAt: value.updatedAt,
  };
}

/**
 * A typed maximum: digits, optionally grouped by thousands ("5,000",
 * "5 000"). Decimals, signs, exponents, blanks and out-of-range values are
 * refused (never read as 5, 0 or "unlimited").
 */
export function parseCapInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^(\d+|\d{1,3}([, \u00a0\u202f]\d{3})+)$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(/[, \u00a0\u202f]/g, ''));
  return isCapValue(value) ? value : null;
}

// ------------------------------------------------------------------- scopes

/** Every attempt is tracked in these four scopes, limited or not. */
export function scopesFor(route: {
  task: QuotaTask;
  provider: ProviderId;
  credentialId: string;
}): Scope[] {
  return [
    { kind: 'global', id: 'all' },
    { kind: 'task', id: route.task },
    { kind: 'provider', id: route.provider },
    { kind: 'credential', id: route.credentialId },
  ];
}

/** The cap that applies to this scope and period, or null (no such cap). */
export function capFor(
  policy: QuotaPolicy,
  scope: Scope,
  period: Period,
): Cap | null {
  switch (scope.kind) {
    case 'global':
      return policy.global[period];
    case 'task':
      return scope.id === 'test'
        ? null
        : (policy.tasks[scope.id as TaskKind]?.[period] ?? null);
    case 'provider':
      return isProviderId(scope.id) ? policy.providers[scope.id][period] : null;
    case 'credential':
      return Object.hasOwn(policy.credentials, scope.id)
        ? (policy.credentials[scope.id]?.[period] ?? null)
        : null;
  }
}

// ----------------------------------------------------------------- calendar

export interface CalendarWindow {
  period: Period;
  timezone: string;
  /** Local calendar date the window starts on (YYYY-MM-DD). */
  label: string;
  /** Inclusive start, exclusive end (UTC epoch ms). */
  start: number;
  end: number;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatter = (timezone: string) => {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      calendar: 'gregory',
      numberingSystem: 'latn',
    });
    dateFormatters.set(timezone, formatter);
  }
  return formatter;
};

type Civil = { year: number; month: number; day: number };

/** The local calendar date of an instant in `timezone`. */
export function civilDate(ms: number, timezone: string): Civil {
  const parts = dateFormatter(timezone).formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

const civilKey = ({ year, month, day }: Civil) =>
  year * 10_000 + month * 100 + day;

/** Normalizes overflowing days/months (e.g. day 32 → next month). */
const civil = (year: number, month: number, day: number): Civil => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const pad = (value: number, size = 2) => String(value).padStart(size, '0');
const civilLabel = ({ year, month, day }: Civil) =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

const startCache = new Map<string, number>();

/**
 * First instant whose local date is `date` in `timezone`: computed by search,
 * never as "previous midnight + 24 h", so 23- and 25-hour DST days, half-hour
 * offsets and zones whose day starts at 01:00 are exact.
 */
export function startOfDay(date: Civil, timezone: string): number {
  const cacheKey = `${timezone}|${civilLabel(date)}`;
  const cached = startCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const target = civilKey(date);
  const midnightUtc = Date.UTC(date.year, date.month - 1, date.day);
  // UTC offsets lie within −12 h … +14 h: the boundary is in this range.
  let low = (midnightUtc - 15 * 3_600_000) / 1000;
  let high = (midnightUtc + 15 * 3_600_000) / 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (civilKey(civilDate(middle * 1000, timezone)) >= target) high = middle;
    else low = middle;
  }
  const start = high * 1000;
  if (startCache.size > 512) startCache.clear();
  startCache.set(cacheKey, start);
  return start;
}

/** The day, ISO week (Monday 00:00) and calendar month containing `now`. */
export function windowsAt(
  now: number,
  timezone: string,
): Record<Period, CalendarWindow> {
  const today = civilDate(now, timezone);
  const { year, month, day } = today;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const monday = civil(year, month, day - ((weekday + 6) % 7));
  const make = (period: Period, first: Civil, next: Civil) => ({
    period,
    timezone,
    label: civilLabel(first),
    start: startOfDay(first, timezone),
    end: startOfDay(next, timezone),
  });
  return {
    daily: make('daily', today, civil(year, month, day + 1)),
    weekly: make(
      'weekly',
      monday,
      civil(monday.year, monday.month, monday.day + 7),
    ),
    monthly: make('monthly', civil(year, month, 1), civil(year, month + 1, 1)),
  };
}

// --------------------------------------------------------------- thresholds

export const reached = (used: number, max: number, level: Level) =>
  used * 100 >= max * level;

/** The highest level crossed by going from `before` to `after`, if any. */
export function crossing(
  before: number,
  after: number,
  max: number,
  levels: readonly Level[],
): Level | null {
  for (const level of [100, 95, 80] as const)
    if (
      levels.includes(level) &&
      !reached(before, max, level) &&
      reached(after, max, level)
    )
      return level;
  return null;
}

export const alertLevels = (policy: QuotaPolicy): Level[] => [
  ...(policy.alerts.at80 ? [80 as const] : []),
  ...(policy.alerts.at95 ? [95 as const] : []),
  100,
];

// -------------------------------------------- notes shown next to a request

/**
 * What the worker may tell a page about limits: fixed labels and numbers,
 * never a key label, a key or any text.
 */
export interface QuotaNote {
  level: Level;
  /** true: this request was refused before anything was sent. */
  blocked: boolean;
  scope: ScopeKind;
  /** Set for task scopes. */
  task: QuotaTask | null;
  /** Set for provider scopes. */
  provider: ProviderId | null;
  period: Period;
  used: number;
  max: number;
  resetAt: number;
  timezone: string;
}

const LEVELS: readonly number[] = [80, 95, 100];
const SCOPE_KINDS: readonly string[] = [
  'global',
  'task',
  'provider',
  'credential',
];

/** Strict shape check (the note crosses the message boundary). */
export function toQuotaNote(value: unknown): QuotaNote | null {
  if (!isPlainRecord(value)) return null;
  const v = value;
  if (
    !LEVELS.includes(v.level as number) ||
    typeof v.blocked !== 'boolean' ||
    !SCOPE_KINDS.includes(v.scope as string) ||
    !(PERIODS as readonly unknown[]).includes(v.period) ||
    !isCount(v.used) ||
    !isCapValue(v.max) ||
    !isCount(v.resetAt) ||
    !isTimeZone(v.timezone)
  )
    return null;
  const task =
    v.scope === 'task' && (QUOTA_TASKS as readonly unknown[]).includes(v.task)
      ? (v.task as QuotaTask)
      : null;
  const provider =
    v.scope === 'provider' && isProviderId(v.provider) ? v.provider : null;
  if ((v.scope === 'task') !== (task !== null)) return null;
  if ((v.scope === 'provider') !== (provider !== null)) return null;
  return {
    level: v.level as Level,
    blocked: v.blocked,
    scope: v.scope as ScopeKind,
    task,
    provider,
    period: v.period as Period,
    used: v.used,
    max: v.max,
    resetAt: v.resetAt,
    timezone: v.timezone,
  };
}

export const formatCount = (value: number) => value.toLocaleString('en-US');

/** "Mon 19 Oct, 00:00 (Europe/Paris)" — the real instant, DST included. */
export function formatReset(resetAt: number, timezone: string): string {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(resetAt));
  return `${text} (${timezone})`;
}

/** "daily correction request limit", "weekly request limit for this API key"… */
export function limitName(
  note: Pick<QuotaNote, 'scope' | 'task' | 'provider' | 'period'>,
  credentialLabel = 'this API key',
): string {
  const period = PERIOD_LABELS[note.period].toLowerCase();
  switch (note.scope) {
    case 'global':
      return `${period} total AI request limit`;
    case 'task':
      return `${period} ${TASK_LABELS[note.task ?? 'test'].toLowerCase()} request limit`;
    case 'provider':
      return `${period} ${note.provider ? PROVIDERS[note.provider].label : 'provider'} request limit`;
    case 'credential':
      return `${period} request limit for ${credentialLabel}`;
  }
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** One sentence, plain text only (callers use textContent). */
export function describeNote(
  note: QuotaNote,
  credentialLabel?: string,
): string {
  const name = limitName(note, credentialLabel);
  const counts = `(${formatCount(note.used)} / ${formatCount(note.max)})`;
  const reset = `Resets ${formatReset(note.resetAt, note.timezone)}.`;
  if (note.blocked)
    return `${capitalize(name)} reached ${counts}. No request was sent. ${reset}`;
  if (note.level === 100)
    return `${capitalize(name)} reached ${counts}. Further requests it covers are blocked until it resets. ${reset}`;
  const left = Math.max(0, note.max - note.used);
  return `Correctly: ${note.level}% of your ${name} used ${counts}. ${note.level === 95 ? 'Only ' : ''}${formatCount(left)} remain. ${reset}`;
}
