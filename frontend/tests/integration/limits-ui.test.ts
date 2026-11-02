import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitsSection } from '../../src/options/limits-ui';
import {
  QUOTA_DB,
  QuotaStore,
  legacySeed,
  type OperationDraft,
} from '../../src/shared/quota-store';
import { emptyUsage, normalizeSettings } from '../../src/shared/settings';
import { saveSettings, saveUsage } from '../../src/shared/storage';
import {
  FakeStorage,
  GEMINI_ID,
  OPENAI_ID,
  profile,
  seedProviders,
} from '../helpers/fake-storage';

// V5.8 "Usage limits" section of the settings page, on a real (fake)
// IndexedDB shared with the store the worker would use.

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const NOW = Date.parse('2026-10-15T10:00:00Z');

let area: FakeStorage;
let confirm: ReturnType<typeof vi.fn<(question: string) => boolean>>;
let n = 0;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string) => $(id).textContent?.trim() ?? '';
const store = () => new QuotaStore(globalThis.indexedDB);

async function openPage(quota: QuotaStore = store(), now = NOW) {
  document.body.innerHTML = body;
  const section = new LimitsSection(document, {
    area,
    quota,
    confirm,
    now: () => now,
    timeZones: () => ['Europe/Paris', 'America/New_York'],
  });
  await section.init();
  return section;
}

// The page is in French; tests name periods and actions by their IDs.
const PERIOD = {
  Daily: 'Par jour',
  Weekly: 'Par semaine',
  Monthly: 'Par mois',
} as const;
const LEGEND: Record<string, string> = {
  Rewrite: 'Reformulation',
  Translation: 'Traduction',
  Summary: 'Résumé',
};
/** French thousands separator (narrow no-break space). */
const thousands = (text: string) => text.replace(',', '\u202f');

/** The row of one scope/period: [checkbox, maximum, usage text, progress]. */
function row(legend: string, period: keyof typeof PERIOD) {
  const fieldset = [...document.querySelectorAll('fieldset.limits')].find(
    (node) =>
      node.querySelector('legend')?.textContent === (LEGEND[legend] ?? legend),
  )!;
  const line = [...fieldset.querySelectorAll('.cap-row')].find(
    (node) => node.querySelector('label span')?.textContent === PERIOD[period],
  )!;
  return {
    box: line.querySelector<HTMLInputElement>('input[type=checkbox]')!,
    max: line.querySelector<HTMLInputElement>('input.cap-max')!,
    usage: line.querySelector('.cap-usage')!.textContent ?? '',
    error: line.querySelector('.message')!.textContent ?? '',
    bar: line.querySelector('progress')!,
  };
}
const TOTAL = 'Total (toutes actions, tous fournisseurs et toutes clés)';

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function toggle(box: HTMLInputElement, on: boolean) {
  box.checked = on;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}
const saveDisabled = () => $<HTMLButtonElement>('limits-save').disabled;

async function send(over: Partial<OperationDraft> = {}, quota = store()) {
  const draft: OperationDraft = {
    id: `operation-${++n}`,
    bootId: 'boot-1',
    task: 'correction',
    provider: 'gemini',
    credentialId: GEMINI_ID,
    revision: 1,
    modelId: 'gemini-3.1-flash-lite',
    ...over,
  };
  // The worker creates the limits on its first request, like the page does.
  await quota.ensureReady(() => legacySeed(area), NOW);
  await quota.admit(draft, NOW);
  return quota.dispatch(draft.id, NOW);
}

beforeEach(() => {
  area = new FakeStorage();
  confirm = vi.fn(() => true);
});

describe('first open (UX-001)', () => {
  it('shows the safe initial limits: 20 per day in total, the rest off but tracked', async () => {
    await openPage();
    expect(text('limits-state')).toBe('Actives');
    const total = row(TOTAL, 'Daily');
    expect(total.box.checked).toBe(true);
    expect(total.max.value).toBe('20');
    expect(total.usage).toMatch(
      /^Disponible — 0 \/ 20 utilisée\(s\), 20 restante\(s\)\. Remise à zéro : \S+ \d+ \S+ 00:00 \(.+\)\.$/,
    );
    expect(total.bar.getAttribute('aria-label')).toBe(
      `Usage par jour — ${TOTAL} : 0 pour cent, 0 sur 20`,
    );
    expect(row('Correction', 'Weekly').box.checked).toBe(false);
    expect(row('Correction', 'Weekly').usage).toMatch(
      /^Désactivée \(usage toujours compté\) : 0 utilisée\(s\)\./,
    );
    expect(saveDisabled()).toBe(true);
    expect($<HTMLInputElement>('limits-pause').checked).toBe(false);
    expect(text('limits-timezone')).not.toBe('—');
  });

  it("MIG-002/011: the V5.1–V5.7 daily limit and today's count are taken over, with an honest note", async () => {
    await saveSettings(
      area,
      normalizeSettings({ safety: { dailyTestAttemptLimit: 7 } }),
    );
    await saveUsage(area, {
      ...emptyUsage(new Date().toLocaleDateString('en-CA')),
      testAttempts: 3,
    });
    await openPage(store(), Date.now());
    expect(row(TOTAL, 'Daily').max.value).toBe('7');
    expect(row(TOTAL, 'Daily').usage).toMatch(
      /3 \/ 7 utilisée\(s\), 4 restante\(s\)/,
    );
    expect(text('limits-tracking')).toMatch(
      /L’usage est compté depuis le .*les jours précédents de cette semaine et de ce mois sont inconnus/,
    );
    expect(text('limits-tracking')).toMatch(
      /3 requête\(s\) faite\(s\) aujourd’hui avant la V5\.7 compte\(nt\) seulement dans le total/,
    );
  });
});

describe('editing (UX-002…010, POL-017…021)', () => {
  it('POL-021/UX-002/UX-003: "5,000" is saved as 5000 and shown again after reopening', async () => {
    const section = await openPage();
    type(row(TOTAL, 'Daily').max, '5,000');
    toggle(row('Correction', 'Daily').box, true);
    type(row('Correction', 'Daily').max, '3 000');
    expect(saveDisabled()).toBe(false);
    await section.save();
    expect(text('limits-message')).toMatch(/Limites enregistrées/);
    const { policy } = await store().snapshot(NOW, []);
    expect(policy!.global.daily).toEqual({ enabled: true, max: 5000 });
    expect(policy!.tasks.correction.daily).toEqual({
      enabled: true,
      max: 3000,
    });
    await openPage();
    expect(row(TOTAL, 'Daily').max.value).toBe(thousands('5,000'));
    expect(row('Correction', 'Daily').max.value).toBe(thousands('3,000'));
    expect(saveDisabled()).toBe(true);
  });

  it.each(['', '  ', '0', '-5', '1.5', '1e9', '2000000', 'abc'])(
    'UX-004…008: %j in an enabled limit blocks Save and keeps the saved value',
    async (value) => {
      const section = await openPage();
      type(row(TOTAL, 'Daily').max, value);
      expect(saveDisabled()).toBe(true);
      expect(row(TOTAL, 'Daily').error).toMatch(
        /nombre entier de 1 à 1\u202f000\u202f000/,
      );
      expect(row(TOTAL, 'Daily').max.getAttribute('aria-invalid')).toBe('true');
      await section.save();
      const { policy } = await store().snapshot(NOW, []);
      expect(policy!.global.daily.max).toBe(20);
    },
  );

  it('AT-029: at least one total limit stays on (Pause is the way to stop everything)', async () => {
    await openPage();
    toggle(row(TOTAL, 'Daily').box, false);
    expect(saveDisabled()).toBe(true);
    expect(text('limits-global-error')).toMatch(
      /Gardez au moins une limite totale active/,
    );
    toggle(row(TOTAL, 'Monthly').box, true);
    expect(saveDisabled()).toBe(false);
  });

  it('UX-009/010/POL-008: turning a limit off keeps its value; turning it on shows real usage', async () => {
    for (let i = 0; i < 4; i++) await send({ task: 'rewrite' });
    const section = await openPage();
    expect(row('Rewrite', 'Daily').usage).toMatch(
      /^Désactivée \(usage toujours compté\) : 4 utilisée\(s\)/,
    );
    toggle(row('Rewrite', 'Daily').box, true);
    type(row('Rewrite', 'Daily').max, '4');
    expect(row('Rewrite', 'Daily').error).toMatch(
      /Déjà 4 utilisée\(s\) sur cette période : les nouvelles requêtes concernées seront bloquées après l’enregistrement/,
    );
    await section.save();
    expect(row('Rewrite', 'Daily').usage).toMatch(
      /^Limite atteinte — 4 \/ 4 utilisée\(s\), 0 restante\(s\)/,
    );
    toggle(row('Rewrite', 'Daily').box, false);
    await section.save();
    expect(row('Rewrite', 'Daily').max.value).toBe('4');
    expect(row('Rewrite', 'Daily').usage).toMatch(
      /^Désactivée \(usage toujours compté\) : 4 utilisée\(s\)/,
    );
  });

  it('NOTE-023/POL-006: a limit below usage shows the real over-limit count', async () => {
    for (let i = 0; i < 3; i++) await send();
    const section = await openPage();
    type(row(TOTAL, 'Daily').max, '2');
    expect(row(TOTAL, 'Daily').error).toMatch(
      /En dessous de ce qui est déjà utilisé \(3\)/,
    );
    await section.save();
    expect(row(TOTAL, 'Daily').usage).toMatch(
      /^Limite dépassée — 3 \/ 2 utilisée\(s\) \(dépassement\), 0 restante\(s\)/,
    );
    expect(row(TOTAL, 'Daily').bar.value).toBe(2);
  });

  it('UX-013/T16: a request in progress is not counted as available', async () => {
    const quota = store();
    await openPage(quota);
    await quota.admit(
      {
        id: 'operation-running',
        bootId: 'boot-1',
        task: 'correction',
        provider: 'gemini',
        credentialId: GEMINI_ID,
        revision: 1,
        modelId: 'gemini-3.1-flash-lite',
      },
      NOW,
    );
    await openPage(quota);
    expect(row(TOTAL, 'Daily').usage).toMatch(
      /0 \/ 20 utilisée\(s\), 19 restante\(s\), 1 en cours/,
    );
  });
});

describe('saving safely (RACE-014, UX-020/021)', () => {
  it('UX-020/T24: a stale tab cannot overwrite a newer save; it offers a reload', async () => {
    const stale = await openPage();
    const quota = store();
    const { policy } = await quota.snapshot(NOW, []);
    await quota.savePolicy(
      {
        ...policy!,
        global: { ...policy!.global, daily: { enabled: true, max: 9 } },
      },
      policy!.revision,
      NOW,
    );
    type(row(TOTAL, 'Daily').max, '50');
    await stale.save();
    expect(text('limits-message')).toMatch(
      /modifiées dans un autre onglet ou une autre fenêtre/,
    );
    expect($('limits-reload').hidden).toBe(false);
    expect((await quota.snapshot(NOW, [])).policy!.global.daily.max).toBe(9);
    $('limits-reload').click();
    await vi.waitFor(() => expect(row(TOTAL, 'Daily').max.value).toBe('9'));
  });

  it('UX-021: a storage error on Save keeps the typed values', async () => {
    const quota = store();
    const section = await openPage(quota);
    quota.savePolicy = () => Promise.reject(new Error('disk full'));
    type(row(TOTAL, 'Daily').max, '42');
    await section.save();
    expect(text('limits-message')).toMatch(
      /stockage du navigateur n’a pas pu être lu/,
    );
    expect(row(TOTAL, 'Daily').max.value).toBe('42');
  });

  it('UX-012: unreadable usage records → "unavailable", never "0 of 20"', async () => {
    await openPage(new QuotaStore(undefined));
    expect(text('limits-state')).toBe('Indisponible');
    expect(text('limits-status')).toMatch(/Usage momentanément indisponible/);
    expect(row(TOTAL, 'Daily').usage).toBe('Usage momentanément indisponible.');
    expect(row(TOTAL, 'Daily').box.disabled).toBe(true);
    expect($<HTMLInputElement>('limits-pause').disabled).toBe(true);
  });
});

describe('pause, warnings, time zone, repair, clock', () => {
  it('UX-025/POL-015: Pause all AI is saved at once and shown', async () => {
    const section = await openPage();
    const pause = $<HTMLInputElement>('limits-pause');
    pause.checked = true;
    await section.savePause();
    expect((await store().snapshot(NOW, [])).policy!.pauseAll).toBe(true);
    expect(text('limits-state')).toBe('IA en pause');
    expect(text('limits-message')).toMatch(
      /raccourcis texte continuent de fonctionner/,
    );
  });

  it('NOTE-007/020/024: warnings are listed once, as text, and Dismiss only hides them', async () => {
    const quota = store();
    await openPage(quota);
    const { policy } = await quota.snapshot(NOW, []);
    await quota.savePolicy(
      {
        ...policy!,
        global: { ...policy!.global, daily: { enabled: true, max: 5 } },
      },
      policy!.revision,
      NOW,
    );
    for (let i = 0; i < 4; i++) await send({}, quota);
    await openPage(quota);
    const alerts = () =>
      [...document.querySelectorAll('#limits-alerts li span')].map(
        (node) => node.textContent,
      );
    expect(alerts()).toEqual([
      expect.stringMatching(
        /^Correctly : 80 % de votre limite journalière du total des requêtes IA utilisés \(4 \/ 5\)\. Il reste 1\./,
      ),
    ]);
    document.querySelector<HTMLButtonElement>('#limits-alerts button')!.click();
    await vi.waitFor(() => expect(alerts()).toEqual([]));
    await openPage(quota);
    expect(alerts()).toEqual([]);
    expect((await send({}, quota)).allowed).toBe(true);
  });

  it('CAL-014: changing the time zone asks first, validates the name and keeps usage', async () => {
    await send();
    const section = await openPage();
    $('limits-timezone-change').click();
    expect($('limits-timezone-row').hidden).toBe(false);
    type($<HTMLInputElement>('limits-timezone-input'), 'Mars/Olympus');
    expect(saveDisabled()).toBe(true);
    expect(text('limits-timezone-error')).toMatch(/Fuseau horaire inconnu/);
    const zone =
      text('limits-timezone') === 'America/New_York'
        ? 'Europe/Paris'
        : 'America/New_York';
    type($<HTMLInputElement>('limits-timezone-input'), zone);
    confirm.mockReturnValueOnce(false);
    await section.save();
    expect(text('limits-timezone')).not.toBe(zone);
    await section.save();
    expect(confirm.mock.calls.at(-1)![0]).toMatch(/rien n’est remis à zéro/);
    expect(text('limits-timezone')).toBe(zone);
    expect(row(TOTAL, 'Daily').usage).toMatch(/1 \/ 20 utilisée/);
  });

  it('POL-002: damaged limits → repair keeps the usage', async () => {
    await send();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = globalThis.indexedDB.open(QUOTA_DB);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('policy', 'readwrite');
      tx.objectStore('policy').put({ hacked: true }, 'active');
      tx.oncomplete = () => resolve();
    });
    db.close();
    const section = await openPage();
    expect(text('limits-state')).toBe('À réparer');
    expect($('limits-repair').hidden).toBe(false);
    await section.repair();
    expect(text('limits-state')).toBe('Actives');
    expect(row(TOTAL, 'Daily').usage).toMatch(/1 \/ 20 utilisée/);
  });

  it('CAL-017: a clock moved back shows a confirmation that resumes requests', async () => {
    await send();
    const quota = store();
    const section = await openPage(quota, NOW - 3_600_000);
    expect(text('limits-state')).toBe('Vérifier l’horloge');
    expect($('limits-clock').hidden).toBe(false);
    await section.confirmClock();
    expect($('limits-clock').hidden).toBe(true);
  });
});

describe('per provider and per key (S-06)', () => {
  it('lists existing keys by label (as text) and saves a key limit by profile ID', async () => {
    seedProviders(
      area,
      [
        profile(GEMINI_ID, 'gemini'),
        {
          ...profile(OPENAI_ID, 'openai'),
          label: '<img src=x onerror=alert(1)>',
        },
      ],
      {},
    );
    const section = await openPage();
    expect(document.querySelector('#limits-advanced-groups img')).toBeNull();
    const legend = `Clé « <img src=x onerror=alert(1)> » (OpenAI)`;
    toggle(row(legend, 'Monthly').box, true);
    type(row(legend, 'Monthly').max, '150');
    toggle(row('OpenAI', 'Daily').box, true);
    await section.save();
    const { policy } = await store().snapshot(NOW, []);
    expect(policy!.credentials[OPENAI_ID]!.monthly).toEqual({
      enabled: true,
      max: 150,
    });
    expect(Object.keys(policy!.credentials)).toEqual([OPENAI_ID]);
    expect(policy!.providers.openai.daily.enabled).toBe(true);
    expect(JSON.stringify(policy)).not.toContain('img');
  });
});

describe('V5.12 Summary limits', () => {
  it('QUO-002/WP7: Summary has its own off-but-tracked limits that can be saved', async () => {
    const section = await openPage();
    expect(row('Summary', 'Daily').box.checked).toBe(false);
    expect(row('Summary', 'Daily').usage).toMatch(/usage toujours compté/);
    toggle(row('Summary', 'Daily').box, true);
    type(row('Summary', 'Daily').max, '4');
    await section.save();
    const { policy } = await store().snapshot(NOW, []);
    expect(policy!.tasks.summary.daily).toEqual({ enabled: true, max: 4 });
    expect(policy!.tasks.translation.daily.enabled).toBe(false);
  });

  it('summaries are counted in their own row, not as translations', async () => {
    await send({ task: 'summary' });
    await openPage();
    expect(row('Summary', 'Daily').usage).toMatch(/ : 1 utilisée/);
    expect(row('Translation', 'Daily').usage).toMatch(/ : 0 utilisée/);
    expect(row(TOTAL, 'Daily').usage).toMatch(/1 \/ 20 utilisée/);
  });
});

describe('settings layout (per-action limits folded)', () => {
  it('the total stays in view; per-action limits are folded unless one is on', async () => {
    await openPage();
    const folded = $<HTMLDetailsElement>('limits-tasks');
    expect(folded.open).toBe(false);
    expect(
      document.querySelectorAll('#limits-groups fieldset.limits'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('#limits-task-groups fieldset.limits'),
    ).toHaveLength(7);
    const section = await openPage();
    toggle(row('Summary', 'Daily').box, true);
    await section.save();
    await openPage();
    expect($<HTMLDetailsElement>('limits-tasks').open).toBe(true);
  });
});
