// Real-browser smoke test (V5.1 checklist steps 3–6, 8, 9, 11, 15, the V5.2
// content script, V5.3 shortcut, V5.11 handle and modal, V5.4 rewrite, V5.5
// translation, V5.6 text shortcuts, V5.7 provider keys and routes, V5.8
// usage limits on the real IndexedDB of the extension and V5.9 statistics).
// Loads dist/ unpacked in a throwaway profile, drives the settings page over
// the Chrome DevTools Protocol and records network/console evidence.
//
//   node scripts/verify-browser.mjs [--browser=brave|chrome|<path>] [--offline]
//
// Without --offline, four requests are sent with dummy keys (expected answer:
// invalid key): a model list and one test prompt to Google, a model list and
// one test prompt (the winner of a 20-request race) to OpenAI. They cannot
// succeed or cost anything. No real key is used.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
const { console, fetch, WebSocket, setTimeout, clearTimeout } = globalThis;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);
const BROWSERS = {
  brave: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
};
const browserName = typeof args.browser === 'string' ? args.browser : 'brave';
const browserPath = BROWSERS[browserName] ?? browserName;
const offline = Boolean(args.offline);
const extensionPath = resolve('dist');
const DUMMY_KEY = 'CORRECTLY_TEST_SENTINEL_KEY_dummy_000000';
const DUMMY_OPENAI_KEY = 'CORRECTLY_TEST_SENTINEL_KEY_openai_dummy_0';
const profile = await mkdtemp(join(tmpdir(), 'correctly-v511-'));
const EVIDENCE = 'docs/v5.17/evidence';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

const evidence = {
  browser: browserName,
  browserVersion: null,
  date: new Date().toISOString(),
  offline,
  steps: [],
  networkRequests: [],
  consoleMessages: [],
};
const step = (id, result, detail) => {
  evidence.steps.push({ id, result, detail });
  console.log(`${result.padEnd(7)} ${id} — ${detail}`);
};

class Session {
  constructor(url, label) {
    this.label = label;
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.handlers = [];
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { done, fail, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message));
        else done(message.result);
      } else if (message.method)
        for (const handler of this.handlers) handler(message);
    });
    this.ready = new Promise((done, fail) => {
      this.socket.addEventListener('open', done, { once: true });
      this.socket.addEventListener('error', fail, { once: true });
    });
  }
  on(handler) {
    this.handlers.push(handler);
  }
  call(method, params = {}) {
    return new Promise((done, fail) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`CDP timeout (${this.label}): ${method}`));
      }, 20000);
      this.pending.set(id, { done, fail, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
  async until(expression, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await this.evaluate(expression).catch(() => null);
      if (value) return value;
      await delay(100);
    }
    throw new Error(`Timed out (${this.label}): ${expression}`);
  }
  close() {
    this.socket.close();
  }
}

let browser, port, page, worker;
const json = async (path, method = 'GET') =>
  (await fetch(`http://127.0.0.1:${port}${path}`, { method })).json();

function watch(session, source) {
  session.on((message) => {
    if (message.method === 'Network.requestWillBeSent')
      evidence.networkRequests.push({
        source,
        method: message.params.request.method,
        url: message.params.request.url,
        headerNames: Object.keys(message.params.request.headers ?? {}),
      });
    if (message.method === 'Runtime.consoleAPICalled')
      evidence.consoleMessages.push({
        source,
        type: message.params.type,
        text: message.params.args
          .map((arg) => arg.value ?? arg.description ?? '')
          .join(' '),
      });
  });
}

async function attachWorker(extensionId, tries = 100) {
  let target;
  for (let i = 0; i < tries && !target; i++) {
    target = (await json('/json/list')).find(
      (item) =>
        item.type === 'service_worker' &&
        item.url.startsWith(`chrome-extension://${extensionId}/`),
    );
    if (!target) await delay(100);
  }
  if (!target) return null;
  worker?.close();
  worker = new Session(target.webSocketDebuggerUrl, 'worker');
  await worker.ready;
  watch(worker, 'service-worker');
  await worker.call('Network.enable');
  await worker.call('Runtime.enable');
  return worker;
}

const text = (id) =>
  `document.getElementById(${JSON.stringify(id)}).textContent.trim()`;
const loaded = `location.protocol === 'chrome-extension:' && typeof chrome !== 'undefined' && !!chrome.runtime?.id && document.getElementById('app')?.getAttribute('aria-busy') === 'false'`;
// Chrome blocks CDP navigation to chrome-extension:// URLs, so the page is
// opened the way the toolbar button does it and later only reloaded.
async function openOptions() {
  // Mark the current document so the wait below only accepts the new one.
  await page.evaluate('window.__beforeReload = true').catch(() => {});
  await page.call('Page.reload', { ignoreCache: true });
  await page.until(`!window.__beforeReload && ${loaded}`);
}
/** "Test" of one saved route (the page auto-confirms the billing prompt). */
async function clickTest(slot = 'default') {
  const message = `route-message-${slot}`;
  // After a reload the route editor renders once its keys are loaded.
  await page.until(
    `!!document.getElementById(${JSON.stringify(`route-test-${slot}`)})`,
  );
  await page.evaluate(
    `document.getElementById(${JSON.stringify(message)}).textContent = ''`,
  );
  await page.evaluate(
    `document.getElementById(${JSON.stringify(`route-test-${slot}`)}).click()`,
  );
  await page.until(`${text(message)} !== ''`, 30000);
  return page.evaluate(text(message));
}
/** Usage line of one limit row of the V5.8 "Usage limits" section. */
const PERIOD = {
  Daily: 'Par jour',
  Weekly: 'Par semaine',
  Monthly: 'Par mois',
};
const capRow = (legend, period) => `(() => {
  const set = [...document.querySelectorAll('fieldset.limits')].find(
    (node) => node.querySelector('legend').textContent === ${JSON.stringify(legend)});
  return [...set.querySelectorAll('.cap-row')].find(
    (node) => node.querySelector('label span').textContent === ${JSON.stringify(PERIOD[period])});
})()`;
const TOTAL = 'Total (toutes actions, tous fournisseurs et toutes clés)';
const totalDaily = `${capRow(TOTAL, 'Daily')}.querySelector('.cap-usage').textContent`;
/** Types a total daily limit and saves it like the owner would. */
async function saveTotalDaily(value) {
  await page.until(`!document.getElementById('limits-pause').disabled`);
  await page.evaluate(`(() => {
    const input = ${capRow(TOTAL, 'Daily')}.querySelector('input.cap-max');
    input.value = ${JSON.stringify(String(value))};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('limits-message').textContent = '';
    document.getElementById('limits-save').click();
  })()`);
  await page.until(
    `${text('limits-message')}.startsWith('Limites enregistrées')`,
  );
}
/** The worker's answer to a TEST_CONNECTION sent like the page sends it. */
const sendTest = (slot = 'default') =>
  page.evaluate(
    `chrome.runtime.sendMessage({ type: 'correctly.v5.testConnection', slot: ${JSON.stringify(slot)} })`,
  );
async function addKey(provider, label, key) {
  await page.evaluate(`(() => {
    document.getElementById('profile-provider').value = ${JSON.stringify(provider)};
    document.getElementById('profile-label').value = ${JSON.stringify(label)};
    document.getElementById('profile-key').value = ${JSON.stringify(key)};
    document.getElementById('profile-save').click();
  })()`);
  await page.until(
    `document.getElementById('profile-list').textContent.includes(${JSON.stringify(label)})`,
  );
}
async function chooseRoute(slot, label, model) {
  await page.evaluate(`(() => {
    const select = document.getElementById('route-key-${slot}');
    select.value = [...select.options].find((o) => o.textContent.startsWith(${JSON.stringify(label)})).value;
    select.dispatchEvent(new Event('change'));
    const input = document.getElementById('route-model-${slot}');
    input.value = ${JSON.stringify(model)};
    input.dispatchEvent(new Event('input'));
    document.getElementById('route-save-${slot}').click();
  })()`);
  await page.until(
    `${text(`route-summary-${slot}`)}.includes(${JSON.stringify(model)})`,
  );
}
/** "Check key" of one profile row; returns the profile message. */
async function checkKey(label) {
  await page.evaluate(
    `document.getElementById('profile-message').textContent = ''`,
  );
  await page.evaluate(`[...document.querySelectorAll('#profile-list li')]
    .find((li) => li.textContent.includes(${JSON.stringify(label)}))
    .querySelector('button').click()`);
  await page.until(`${text('profile-message')} !== ''`, 30000);
  return page.evaluate(text('profile-message'));
}
// An ignored message wakes an idle worker so its network can be recorded.
async function wakeWorker(extensionId) {
  await page.evaluate(
    `chrome.runtime.sendMessage({ type: 'correctly.v5.wake' }).catch(() => null)`,
  );
  assert(await attachWorker(extensionId), 'service worker did not start');
}
const googleRequests = () =>
  evidence.networkRequests.filter((request) =>
    request.url.startsWith('https://generativelanguage.googleapis.com/'),
  );
const openaiRequests = () =>
  evidence.networkRequests.filter((request) =>
    request.url.startsWith('https://api.openai.com/'),
  );
const providerRequests = () => [...googleRequests(), ...openaiRequests()];

let exitCode = 0;
try {
  browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--remote-debugging-port=0',
      // Branded Chrome ignores --load-extension since v137; it loads the
      // extension below through CDP Extensions.loadUnpacked over the pipe.
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      '--user-data-dir=' + profile,
      // Branded Chrome rejects (and then blocks) command-line extensions.
      ...(browserName === 'chrome'
        ? []
        : [
            '--disable-extensions-except=' + extensionPath,
            '--load-extension=' + extensionPath,
          ]),
      'about:blank',
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    },
  );
  const pipeCall = (method, params) =>
    new Promise((done, fail) => {
      let buffer = '';
      const output = browser.stdio[4];
      const timer = setTimeout(() => fail(new Error('pipe timeout')), 10000);
      const onData = (chunk) => {
        buffer += chunk.toString('utf8');
        for (const raw of buffer.split('\0').slice(0, -1)) {
          const message = JSON.parse(raw);
          if (message.id !== 1) continue;
          clearTimeout(timer);
          output.off('data', onData);
          if (message.error) fail(new Error(message.error.message));
          else done(message.result);
        }
        buffer = buffer.slice(buffer.lastIndexOf('\0') + 1);
      };
      output.on('data', onData);
      browser.stdio[3].write(JSON.stringify({ id: 1, method, params }) + '\0');
    });
  for (let i = 0; i < 100 && !port; i++) {
    port = await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      .then((data) => data.split('\n')[0])
      .catch(() => null);
    if (!port) await delay(100);
  }
  assert(port, 'Browser did not expose a DevTools port');
  evidence.browserVersion = (await json('/json/version')).Browser;

  // Step 3: the extension's service worker is registered.
  let extensionId;
  await delay(1500);
  const alreadyLoaded = (await json('/json/list')).some(
    (item) =>
      item.type === 'service_worker' && item.url.endsWith('/service-worker.js'),
  );
  if (!alreadyLoaded)
    extensionId = (
      await pipeCall('Extensions.loadUnpacked', { path: extensionPath })
    ).id;
  for (let i = 0; i < 100 && !extensionId; i++) {
    const target = (await json('/json/list')).find(
      (item) =>
        item.type === 'service_worker' &&
        item.url.startsWith('chrome-extension://') &&
        item.url.endsWith('/service-worker.js'),
    );
    extensionId = target?.url.split('/')[2];
    if (!extensionId) await delay(100);
  }
  assert(extensionId, 'Extension not loaded (was dist/ built?)');
  step('M3', 'PASS', `extension loaded (${extensionId})`);

  const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;
  // Brave starts the worker at install; Chrome may keep it idle until an event.
  // A just-listed worker may not have its script context yet; wait briefly.
  const opened =
    (await attachWorker(extensionId, 20)) &&
    (await worker
      .until(`typeof chrome !== 'undefined' && !!chrome.runtime?.id`, 5000)
      .then(() => worker.evaluate('chrome.runtime.openOptionsPage()'))
      .then(() => true)
      .catch(() => false));
  if (!opened) await json('/json/new?' + optionsUrl, 'PUT');
  let pageTarget;
  for (let i = 0; i < 100 && !pageTarget; i++) {
    pageTarget = (await json('/json/list')).find(
      (item) => item.type === 'page' && item.url === optionsUrl,
    );
    if (!pageTarget) await delay(100);
  }
  assert(pageTarget, 'Options page did not open');
  page = new Session(pageTarget.webSocketDebuggerUrl, 'options');
  await page.ready;
  watch(page, 'options-page');
  await page.call('Page.enable');
  await page.call('Network.enable');
  await page.call('Runtime.enable');
  await page.call('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.confirm = () => true;',
  });
  await openOptions();
  // 5.13: the settings page follows the browser language by default; the
  // checks below read its French wording, so French is chosen first.
  await page.evaluate(
    `chrome.storage.local.get('correctly.v5.settings').then((d) => chrome.storage.local.set({ 'correctly.v5.settings': { ...(d['correctly.v5.settings'] ?? {}), ui: { language: 'fr' } } }))`,
  );
  await openOptions();
  await wakeWorker(extensionId);
  const manifest = await page.evaluate('chrome.runtime.getManifest()');
  assert.equal(manifest.version, '5.17.0');
  assert.equal(manifest.name, 'Correctly V5.17');
  assert.deepEqual(manifest.host_permissions, [
    'https://generativelanguage.googleapis.com/*',
    'https://api.openai.com/*',
  ]);
  const command = (
    await page.evaluate(
      `chrome.commands.getAll().then((all) => all.map(({ name, shortcut }) => ({ name, shortcut })))`,
    )
  ).find((item) => item.name === 'correct-selection');
  assert(command, 'correct-selection command must be registered');
  step(
    'K05',
    'PASS',
    `command registered; shortcut reported: ${command.shortcut || 'none (automated profiles may not assign suggested keys; check chrome://extensions/shortcuts manually)'}`,
  );

  // Step 4.
  assert.equal(
    await page.evaluate(`!document.getElementById('profile-empty').hidden`),
    true,
  );
  assert.match(
    await page.evaluate(text('route-summary-default')),
    /Aucune route par défaut/,
  );
  await page.until(`${text('limits-state')} === 'Actives'`);
  assert.match(
    await page.evaluate(totalDaily),
    /^Disponible — 0 \/ 20 utilisée\(s\), 20 restante\(s\)\. Remise à zéro : .+\)\.$/,
  );
  const dbs = await page.evaluate(
    `indexedDB.databases().then((all) => all.map((d) => d.name))`,
  );
  assert(dbs.includes('correctly-v5-quota'), 'usage database must exist');
  step(
    'M4',
    'PASS',
    `settings open: no key, no route; usage limits created in IndexedDB (total 20/day); ${await page.evaluate(totalDaily)}`,
  );

  // Step 6 / Scenario A: no route → blocked before any network access.
  assert.equal(
    await page.evaluate(
      `document.getElementById('route-test-default').disabled`,
    ),
    true,
  );
  const noKey = await sendTest();
  assert.equal(noKey.code, 'NOT_CONFIGURED');
  assert.equal(providerRequests().length, 0);
  step(
    'M6',
    'PASS',
    'no route: Test disabled and refused by the worker, zero network',
  );

  // Step 5 / Scenarios B–C: two dummy keys, reopen, masked; no request.
  await addKey('gemini', 'Gemini Test', DUMMY_KEY);
  await addKey('openai', 'OpenAI Test', DUMMY_OPENAI_KEY);
  await openOptions();
  const listed = await page.evaluate(text('profile-list'));
  assert.match(listed, /Gemini Test.*Google Gemini/);
  assert.match(listed, /OpenAI Test.*OpenAI/);
  assert.equal(
    await page.evaluate(`document.getElementById('profile-key').type`),
    'password',
  );
  for (const key of [DUMMY_KEY, DUMMY_OPENAI_KEY])
    assert.equal(
      await page.evaluate(
        `document.documentElement.outerHTML.includes(${JSON.stringify(key)})`,
      ),
      false,
    );
  assert.equal(providerRequests().length, 0);
  step(
    'M5a',
    'PASS',
    'two dummy keys (Gemini, OpenAI) saved; after reopen listed, keys not in DOM, zero network',
  );

  // Scenario D: split routes persist; saving routes sends nothing.
  await chooseRoute('default', 'Gemini Test', 'gemini-3.1-flash-lite');
  await chooseRoute('correction', 'OpenAI Test', 'gpt-5-nano');
  await openOptions();
  assert.match(
    await page.evaluate(text('route-summary-correction')),
    /^Correction → OpenAI Test \(OpenAI\) • gpt-5-nano$/,
  );
  assert.match(
    await page.evaluate(text('route-summary-rewrite')),
    /Gemini Test .* \(par défaut\)$/,
  );
  assert.equal(providerRequests().length, 0);
  step(
    'M5c',
    'PASS',
    'routes saved and persisted (Correction → OpenAI, Rewrite → default Gemini), zero network',
  );

  if (!offline) {
    // Free key checks: one GET per provider, key in a header only.
    const geminiCheck = await checkKey('Gemini Test');
    const openaiCheck = await checkKey('OpenAI Test');
    const [listGoogle] = googleRequests();
    const [listOpenAi] = openaiRequests();
    assert.equal(googleRequests().length, 1);
    assert.equal(openaiRequests().length, 1);
    assert.match(
      listGoogle.url,
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?pageSize=1000$/,
    );
    assert.equal(listOpenAi.url, 'https://api.openai.com/v1/models');
    for (const request of [listGoogle, listOpenAi]) {
      assert.equal(request.source, 'service-worker');
      assert.equal(request.method, 'GET');
      assert(!request.url.includes('SENTINEL'), 'key must not be in the URL');
    }
    assert(
      listGoogle.headerNames.some((n) => n.toLowerCase() === 'x-goog-api-key'),
    );
    assert(
      listOpenAi.headerNames.some((n) => n.toLowerCase() === 'authorization'),
    );
    assert.match(await page.evaluate(totalDaily), /0 \/ 20 utilisée/);
    step(
      'M5d',
      'PASS',
      `key checks: one GET each, not counted; UI: ${geminiCheck} | ${openaiCheck}`,
    );

    const result = await clickTest('default');
    const posts = googleRequests().filter((r) => r.method === 'POST');
    assert.equal(posts.length, 1, 'exactly one test prompt expected');
    assert.equal(posts[0].source, 'service-worker');
    assert.match(
      posts[0].url,
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.1-flash-lite:generateContent$/,
    );
    assert.equal(openaiRequests().length, 1, 'no switch to OpenAI on failure');
    assert.match(result, /refusé cette clé API|Hors ligne|réseau/i);
    // The worker's write reaches this page through IndexedDB + BroadcastChannel.
    await page.until(`/1 \\/ 20 utilisée/.test(${totalDaily})`);
    step(
      'M5b',
      'PASS',
      `dummy key → one worker POST to Google, no fallback; UI shows: ${result}`,
    );
  } else step('M5b', 'SKIPPED', '--offline: dummy-key requests not sent');

  // Step 8: cap 1 → blocked; reload → still blocked.
  const used = offline ? 0 : 1;
  let sentBefore = providerRequests().length;
  await saveTotalDaily(1);
  await page.until(`/${used} \\/ 1 utilisée/.test(${totalDaily})`);
  if (offline) {
    step('M8', 'SKIPPED', '--offline: cap test needs one dispatched attempt');
  } else {
    const refusal = await clickTest('correction');
    assert.match(refusal, /limite d’usage de Correctly est atteinte/);
    assert.match(
      refusal,
      /Limite journalière du total des requêtes IA atteinte \(1 \/ 1\)/,
    );
    await openOptions();
    assert.match(
      await clickTest('default'),
      /limite d’usage de Correctly est atteinte/,
    );
    assert.equal(
      providerRequests().length,
      sentBefore,
      'blocked tests must not hit the network',
    );
    step(
      'M8',
      'PASS',
      'cap 1 shared by both providers: OpenAI and Gemini tests refused locally, also after reload',
    );
  }

  // Step 9: stop the service worker, wake it with a message, state persists.
  await page.call('ServiceWorker.enable');
  await page.call('ServiceWorker.stopAllWorkers');
  await delay(500);
  await openOptions();
  assert.match(
    await page.evaluate(text('route-summary-correction')),
    /OpenAI Test/,
  );
  await page.until(
    `${capRow(TOTAL, 'Daily')}.querySelector('input.cap-max').value === '1'`,
  );
  await wakeWorker(extensionId);
  // Offline: the worker is only woken; a test would reach the provider.
  const afterRestart = offline
    ? { code: 'not sent (--offline)' }
    : await sendTest('correction');
  if (!offline) {
    assert.equal(afterRestart.code, 'QUOTA_EXCEEDED');
    assert.equal(afterRestart.quota?.used, 1);
    assert.equal(providerRequests().length, sentBefore);
  }
  step(
    'M9',
    'PASS',
    `worker stopped and woken by message; keys, routes and count persisted (${afterRestart.code ?? 'ok'})`,
  );

  // V5.8 L1: 20 simultaneous requests for the last slot in the real worker
  // and IndexedDB → exactly one reaches the network (dummy OpenAI key).
  if (!offline) {
    await saveTotalDaily(2);
    const before = openaiRequests().filter((r) => r.method === 'POST').length;
    const started = Date.now();
    const race =
      await page.evaluate(`Promise.all(Array.from({ length: 20 }, () =>
      chrome.runtime.sendMessage({ type: 'correctly.v5.testConnection', slot: 'correction' })))`);
    const elapsed = Date.now() - started;
    await delay(500);
    const posts = openaiRequests().filter((r) => r.method === 'POST');
    assert.equal(posts.length - before, 1, 'exactly one request may be sent');
    assert.equal(race.filter((r) => r.code === 'QUOTA_EXCEEDED').length, 19);
    assert.equal(race.filter((r) => r.code === 'INVALID_KEY').length, 1);
    assert.equal(googleRequests().filter((r) => r.method === 'POST').length, 1);
    await page.until(`/2 \\/ 2 utilisée/.test(${totalDaily})`);
    sentBefore = providerRequests().length;
    step(
      'L1',
      'PASS',
      `20 simultaneous requests for 1 slot: 1 sent (dummy key → INVALID_KEY), 19 refused locally (QUOTA_EXCEEDED) in ${elapsed} ms; no fallback to Gemini`,
    );
  } else step('L1', 'SKIPPED', '--offline: the race winner would be sent');

  // V5.8 L2: Pause all AI blocks everything locally; admission latency of the
  // real worker + IndexedDB (each refusal is one readwrite transaction).
  await page.evaluate(`(() => {
    const box = document.getElementById('limits-pause');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
  })()`);
  await page.until(`${text('limits-state')} === 'IA en pause'`);
  const timings = [];
  for (let i = 0; i < 30; i++) {
    const begin = Date.now();
    const paused = await sendTest('correction');
    timings.push(Date.now() - begin);
    assert.equal(paused.code, 'AI_PAUSED');
  }
  timings.sort((a, b) => a - b);
  const p50 = timings[14];
  const p95 = timings[28];
  assert.equal(providerRequests().length, sentBefore);
  await page.evaluate(`(() => {
    const box = document.getElementById('limits-pause');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
  })()`);
  await page.until(`${text('limits-state')} === 'Actives'`);
  evidence.admissionLatencyMs = { samples: timings.length, p50, p95 };
  step(
    'L2',
    'PASS',
    `Pause all AI: 30 requests refused locally (AI_PAUSED), zero network; message + admission round trip p50 ${p50} ms, p95 ${p95} ms`,
  );

  // V5.8 L3: the usage records hold metadata only (read from the extension
  // page; web pages and content scripts cannot open this database).
  const records = await page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('correctly-v5-quota');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const names = [...db.objectStoreNames];
      const tx = db.transaction(names);
      const out = {};
      for (const name of names) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => (out[name] = request.result);
      }
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify(out)); };
    };
  })`);
  for (const secret of [DUMMY_KEY, DUMMY_OPENAI_KEY, 'Reply with OK', 'Bearer'])
    assert(!records.includes(secret), 'usage records must not hold ' + secret);
  const stores = Object.keys(JSON.parse(records));
  step(
    'L3',
    'PASS',
    `IndexedDB stores ${stores.join(', ')}: no key, prompt or header inside (${records.length} bytes)`,
  );

  // V5.9 S1: Statistics read the real journal; viewing, filtering,
  // refreshing and exporting never contact a provider (INV-19).
  const beforeStats = providerRequests().length;
  await page.evaluate(
    `document.querySelector('[data-stats-preset="today"]').click()`,
  );
  await page.until(`/^(À jour|Aucune requête)$/.test(${text('stats-state')})`);
  const sent = offline ? 0 : 2;
  assert.equal(await page.evaluate(text('stats-requests-value')), String(sent));
  assert.equal(await page.evaluate(text('stats-success-value')), '0');
  assert.equal(
    await page.evaluate(text('stats-cost-value')),
    offline ? '$0.00' : 'Indisponible',
    'requests without token counts are unknown, never $0.00',
  );
  for (const preset of ['week', 'month', 'today'])
    await page.evaluate(
      `document.querySelector('[data-stats-preset="${preset}"]').click()`,
    );
  await page.evaluate(`(() => {
    const select = document.getElementById('stats-provider');
    select.value = 'openai';
    select.dispatchEvent(new Event('change'));
  })()`);
  const openaiOnly = await page.evaluate(text('stats-requests-value'));
  for (let i = 0; i < 10; i++)
    await page.evaluate(`document.getElementById('stats-refresh').click()`);
  await page.until(`/^(À jour|Aucune requête)$/.test(${text('stats-state')})`);
  await page.evaluate(`document.getElementById('stats-csv').click()`);
  await page.until(`${text('stats-message')}.includes('.csv exporté')`);
  await page.evaluate(`document.getElementById('stats-json').click()`);
  await page.until(
    `${text('stats-message')}.endsWith('.json exporté (aucun texte, aucune clé).')`,
  );
  await delay(300);
  assert.equal(
    providerRequests().length,
    beforeStats,
    'statistics sent requests',
  );
  step(
    'S1',
    'PASS',
    `Statistics: ${sent} request(s) today (OpenAI filter: ${openaiOnly}), cost "${await page.evaluate(text('stats-cost-value'))}"; presets, filters, 10 refreshes and CSV/JSON export with zero provider requests`,
  );

  // Step 14: narrow width, keyboard order, screenshots (no key is on screen).
  for (const width of [360, 900]) {
    await page.call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1400,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(300);
    const overflow = await page.evaluate(
      `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
    );
    assert(overflow <= 0, `horizontal overflow of ${overflow}px at ${width}px`);
    // V5.12 settings layout: one page at a time; the overview is "start".
    await page.evaluate(`location.hash = '#start'`);
    await delay(150);
    const shot = await page.call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await mkdir(EVIDENCE, { recursive: true });
    await writeFile(
      `${EVIDENCE}/options-${browserName}-${width}.png`,
      Buffer.from(shot.data, 'base64'),
    );
    // The V5.8 and V5.9 sections alone, readable at full scale.
    for (const [id, name] of [
      ['usage-limits', 'limits'],
      ['statistics', 'statistics'],
      ['keyboard', 'keyboard'],
      ['sync', 'sync'],
    ]) {
      await page.evaluate(`location.hash = '#${id}'`);
      await delay(150);
      const box = await page.evaluate(`(() => {
        const r = document.getElementById('${id}').getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
      })()`);
      const sectionShot = await page.call('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { ...box, scale: 1 },
      });
      await writeFile(
        `${EVIDENCE}/${name}-${browserName}-${width}.png`,
        Buffer.from(sectionShot.data, 'base64'),
      );
    }
  }
  await page.call('Emulation.clearDeviceMetricsOverride');
  // 5.14: the sync page shows, sync is off by default and storage.sync holds
  // nothing of Correctly (no sync call while it is off).
  await page.evaluate(`location.hash = '#sync'`);
  await delay(150);
  const syncPage = await page.evaluate(`(async () => ({
    visible: !document.getElementById('sync').hidden,
    enabled: document.getElementById('sync-enabled').checked,
    synced: Object.keys(await chrome.storage.sync.get(null)).length,
  }))()`);
  assert.deepEqual(syncPage, { visible: true, enabled: false, synced: 0 });
  step('Y01', 'PASS', 'sync page shown, off by default, storage.sync empty');
  const focusOrder = [];
  await page.evaluate(`location.hash = '#providers'`);
  await delay(150);
  await page.evaluate('document.activeElement?.blur()');
  for (let i = 0; i < 16; i++) {
    await page.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await page.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    focusOrder.push(
      await page.evaluate(
        'document.activeElement.id || document.activeElement.textContent.trim() || document.activeElement.tagName',
      ),
    );
  }
  assert(
    focusOrder.includes('profile-key') && focusOrder.includes('Vérifier'),
    'keyboard reaches key actions and the key field',
  );
  step(
    'M14',
    'PASS',
    `no horizontal overflow at 360/900px; Tab order: ${focusOrder.join(' → ')}`,
  );

  // Scenario E: delete the default key → routes block, nothing else is used.
  await page.evaluate(`[...document.querySelectorAll('#profile-list li')]
    .find((li) => li.textContent.includes('Gemini Test'))
    .querySelector('button[aria-label^="Supprimer"]').click()`);
  await page.until(
    `${text('route-summary-default')}.startsWith('À configurer')`,
  );
  const blocked = await sendTest('rewrite');
  assert.equal(blocked.code, 'ROUTE_BROKEN');
  assert.equal(providerRequests().length, sentBefore);
  step(
    'M6b',
    'PASS',
    'deleting the default key blocks inheriting actions (ROUTE_BROKEN); the OpenAI key is not used',
  );

  // Step 11: a regular page gets nothing injected.
  await page.call('Page.navigate', {
    url: 'data:text/html,<textarea id=t>Je sui ici</textarea><div contenteditable id=c>helo</div>',
  });
  await page.until(`document.readyState === 'complete'`);
  await page.evaluate(
    `(() => { const t = document.getElementById('t'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); })()`,
  );
  await page.call('Input.insertText', { text: ' teh mistake' });
  await delay(1500);
  const injected = await page.evaluate(
    `[...document.querySelectorAll('*')].filter(n => n.shadowRoot || n.hasAttribute('data-correctly-ui')).length + document.body.children.length`,
  );
  assert.equal(injected, 2, 'page DOM must be untouched');
  assert.equal(
    await page.evaluate(`document.getElementById('t').value`),
    'Je sui ici teh mistake',
  );
  step('M11', 'PASS', 'regular page: no injected UI, text unchanged');

  // V5.2: the built content script on a real textarea. The toolbar click
  // cannot be automated over CDP, so the worker reply is stubbed here.
  const bundle = await readFile(join(extensionPath, 'content.js'), 'utf8');
  const value = `document.getElementById('t').value`;
  await page.evaluate(
    `(() => { const t = document.getElementById('t'); t.value = 'Bonjour. Je suis aller a Lyon. Fin'; t.focus(); t.setSelectionRange(9, 30); })()`,
  );
  await page.evaluate(
    `globalThis.chrome = { runtime: { sendMessage: async (message) => (globalThis.sentMessage = message, { ok: true, hasErrors: true, correctedText: 'Je suis allé à Lyon.', suspicious: false }) } }; ${bundle}; globalThis.correctlyRun('correct', []); void 0`,
  );
  await page.until(`globalThis.correctlyPanel?.busy === false`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessage'), {
    type: 'correctly.v5.correctText',
    text: 'Je suis aller a Lyon.',
  });
  assert.equal(
    await page.evaluate(value),
    'Bonjour. Je suis aller a Lyon. Fin',
    'nothing may change before Apply',
  );
  assert.equal(
    await page.evaluate('globalThis.correctlyPanel.host.shadowRoot'),
    null,
    'panel shadow root must be closed',
  );
  await page.evaluate('globalThis.correctlyPanel.apply()');
  assert.equal(await page.evaluate(value), 'Bonjour. Je suis allé à Lyon. Fin');
  await page.evaluate('globalThis.correctlyPanel.undo()');
  assert.equal(
    await page.evaluate(value),
    'Bonjour. Je suis aller a Lyon. Fin',
  );
  step(
    'C01',
    'PASS',
    'content.js: exact selection sent, no change before Apply, Apply/Undo exact range, closed panel',
  );

  // V5.11: the built handle script and the modal with real layout and real
  // (trusted) mouse input over CDP. The worker is stubbed: OPEN_MODAL runs
  // content.js's 'open' intent in this frame, like the real worker does.
  const smartBundle = await readFile(join(extensionPath, 'smart.js'), 'utf8');
  const screenshot = async (name) => {
    const image = await page.call('Page.captureScreenshot', { format: 'png' });
    await mkdir(EVIDENCE, { recursive: true });
    await writeFile(
      `${EVIDENCE}/${name}-${browserName}.png`,
      Buffer.from(image.data, 'base64'),
    );
  };
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    const t = document.getElementById('t');
    t.value = 'Bonjour. Je suis aller a Lyon. Fin';
    t.focus(); t.setSelectionRange(9, 30);
    globalThis.sentMessages = [];
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => {
        globalThis.sentMessages.push(message);
        if (message.type === 'correctly.v5.pageConfig')
          return { smartButton: true, handleY: 0.5, shortcuts: [{ trigger: 'bjr', replacement: 'Bonjour' }] };
        if (message.type === 'correctly.v5.openModal')
          globalThis.correctlyRun('open', ['formal'], { source: 'auto', target: 'en', arabicVariant: 'msa' }, true);
        if (message.type === 'correctly.v5.correctText')
          return { ok: true, hasErrors: true, correctedText: 'Je suis allé à Lyon.', suspicious: false };
        if (message.type === 'correctly.v5.summarizeText')
          return { ok: true, unsummarizable: false, text: '• ملخص قصير', suspicious: false };
        return undefined;
      } } };
  })()`);
  await page.evaluate(`${smartBundle}; void 0`);
  await page.until(
    `document.querySelectorAll('correctly-handle').length === 1`,
  );
  const handleBox = `(() => { const b = globalThis.correctlyHandle.button.getBoundingClientRect(); return { right: b.right, width: b.width, height: b.height, mid: b.top + b.height / 2, vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight }; })()`;
  const before = await page.evaluate(handleBox);
  assert(Math.abs(before.right - before.vw) <= 1, 'handle on the right edge');
  assert(
    Math.abs(before.mid - before.vh / 2) <= 1,
    'handle centred by default',
  );
  assert(before.height > before.width, 'a half-disk, not a full circle');
  const mouse = (type, x, y, extra = {}) =>
    page.call('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      clickCount: 1,
      ...extra,
    });
  // Drag up by 100 px, moving sideways too: only Y changes, nothing opens.
  await mouse('mousePressed', before.vw - 8, before.mid);
  await mouse('mouseMoved', before.vw - 100, before.mid - 50, { buttons: 1 });
  await mouse('mouseMoved', before.vw - 200, before.mid - 100, { buttons: 1 });
  await mouse('mouseReleased', before.vw - 200, before.mid - 100);
  const dragged = await page.evaluate(handleBox);
  await screenshot('handle');
  assert(Math.abs(dragged.mid - (before.mid - 100)) <= 2, 'dragged vertically');
  assert(Math.abs(dragged.right - dragged.vw) <= 1, 'still on the right edge');
  const types = `globalThis.sentMessages.map((m) => m.type)`;
  assert(
    !(await page.evaluate(types)).includes('correctly.v5.openModal'),
    'a drag must not open the modal',
  );
  assert(
    (await page.evaluate(types)).includes('correctly.v5.handlePosition'),
    'the dragged position is saved',
  );
  step(
    'H05',
    'PASS',
    'smart.js: handle on the right edge, centred; a real drag moves Y only and opens nothing',
  );

  // A real click (no drag) opens the modal with the field selection.
  await mouse('mousePressed', dragged.vw - 8, dragged.mid);
  await mouse('mouseReleased', dragged.vw - 8, dragged.mid);
  await page.until(`globalThis.correctlyModal?.visible === true`);
  const modal = 'globalThis.correctlyModal';
  assert.equal(
    await page.evaluate(`${modal}.sharedText`),
    'Je suis aller a Lyon.',
    'the selection must survive the handle click',
  );
  assert.equal(await page.evaluate(`${modal}.activeTab`), 'correction');
  assert.equal(
    await page.evaluate('globalThis.correctlyHandle.button.hidden'),
    true,
  );
  assert.equal(
    await page.evaluate(
      `${modal}.root.querySelectorAll('header button').length`,
    ),
    3,
    'header: Settings, Minimize and Close',
  );
  assert.equal(await page.evaluate(`${modal}.host.shadowRoot`), null);
  const size = `(() => { const n = ${modal}.root.querySelector('[role=dialog]'); const d = n.getBoundingClientRect(); return [n.offsetWidth, n.offsetHeight, Math.round(d.left + d.width / 2), Math.round(d.top + d.height / 2)]; })()`;
  await delay(300); // opening animation done
  await screenshot('modal');
  const sizes = [];
  for (const tab of ['correction', 'reformulation', 'translation', 'summary']) {
    await page.evaluate(`${modal}.selectTab('${tab}')`);
    sizes.push(await page.evaluate(size));
  }
  assert.deepEqual(sizes[0], sizes[1], 'same modal size on every tab');
  assert.deepEqual(sizes[0], sizes[2], 'same modal size on every tab');
  assert.deepEqual(sizes[0], sizes[3], 'same modal size on every tab (V5.12)');
  const viewport = await page.evaluate(handleBox);
  assert(Math.abs(sizes[0][2] - viewport.vw / 2) <= 1, 'modal centred (x)');
  assert(Math.abs(sizes[0][3] - viewport.vh / 2) <= 1, 'modal centred (y)');
  assert(
    !(await page.evaluate(types)).includes('correctly.v5.correctText'),
    'opening and switching tabs must not send',
  );
  await page.evaluate(`${modal}.selectTab('correction')`);
  await page.evaluate(`${modal}.generate('correction')`);
  await page.until(
    `${modal}.root.textContent.includes('Suggested correction')`,
  );
  assert.equal(await page.evaluate(`${modal}.apply()`), true);
  assert.equal(await page.evaluate(value), 'Bonjour. Je suis allé à Lyon. Fin');
  assert.equal(
    await page.evaluate(`document.querySelector('correctly-modal')`),
    null,
  );
  assert.equal(
    await page.evaluate('globalThis.correctlyHandle.button.hidden'),
    false,
  );
  assert.equal(await page.evaluate('globalThis.correctlyUndo.undo()'), true);
  assert.equal(
    await page.evaluate(value),
    'Bonjour. Je suis aller a Lyon. Fin',
  );
  step(
    'C02',
    'PASS',
    'modal: real click opens it with the selection, handle hidden, Settings/Minimize/Close, fixed centred size on all tabs, nothing sent before Generate, Apply hides it, Undo restores',
  );

  // V5.12: plain article text selected on the page survives a real click on
  // the handle, fills the modal, and its summary can be copied, never applied.
  await page.evaluate(`(() => {
    const p = document.createElement('p');
    p.id = 'article';
    p.textContent = 'Le conseil municipal a voté un budget pour trois écoles.';
    document.body.append(p);
    document.activeElement?.blur();
    const range = document.createRange();
    range.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    globalThis.sentMessages = [];
  })()`);
  const handleNow = await page.evaluate(handleBox);
  await mouse('mousePressed', handleNow.vw - 8, handleNow.mid);
  await mouse('mouseReleased', handleNow.vw - 8, handleNow.mid);
  await page.until(`globalThis.correctlyModal?.visible === true`);
  assert.equal(
    await page.evaluate(`${modal}.sharedText`),
    'Le conseil municipal a voté un budget pour trois écoles.',
    'the page selection must survive the handle click',
  );
  assert.equal(await page.evaluate(`${modal}.activeTab`), 'correction');
  await page.evaluate(`${modal}.selectTab('summary')`);
  assert(
    !(await page.evaluate(types)).includes('correctly.v5.summarizeText'),
    'opening the Summary tab must not send',
  );
  await page.evaluate(`${modal}.generate('summary')`);
  await page.until(`${modal}.root.textContent.includes('Suggested summary')`);
  await screenshot('summary');
  assert.equal(
    (await page.evaluate(types)).filter(
      (type) => type === 'correctly.v5.summarizeText',
    ).length,
    1,
    'one summary request',
  );
  assert.equal(await page.evaluate(`${modal}.apply()`), false);
  assert.equal(
    await page.evaluate(
      `[...${modal}.root.querySelectorAll('button')].find((b) => b.textContent === 'Apply').disabled`,
    ),
    true,
    'Apply disabled on page text',
  );
  assert.equal(
    await page.evaluate(`document.getElementById('article').textContent`),
    'Le conseil municipal a voté un budget pour trois écoles.',
  );
  // Minimize (─) keeps the session; a real click on the handle shows it
  // again with the same tab and result; Close (X) ends it.
  await page.evaluate(
    `${modal}.root.querySelector('[aria-label^="Minimize Correctly"]').click()`,
  );
  assert.equal(
    await page.evaluate('globalThis.correctlyHandle.button.hidden'),
    false,
    'the handle returns when minimized',
  );
  const back = await page.evaluate(handleBox);
  await mouse('mousePressed', back.vw - 8, back.mid);
  await mouse('mouseReleased', back.vw - 8, back.mid);
  await page.until(`${modal}.minimized === false`);
  assert.equal(await page.evaluate(`${modal}.activeTab`), 'summary');
  assert(
    await page.evaluate(
      `${modal}.root.textContent.includes('Suggested summary')`,
    ),
    'the result survives Minimize',
  );
  await page.evaluate(
    `${modal}.root.querySelector('[aria-label="Close Correctly"]').click()`,
  );
  assert.equal(
    await page.evaluate(`document.querySelector('correctly-modal')`),
    null,
  );
  step(
    'S12',
    'PASS',
    'V5.12: page text selection survives the handle click, Summary sends one request, Apply disabled, page unchanged; Minimize keeps the session (real handle click restores it), Close ends it',
  );

  // 5.16: a non-Latin, right-to-left target through the modal (worker
  // stubbed): favorites first in the menu, one request, RTL layout.
  await page.evaluate(`(() => {
    document.getElementById('article')?.remove();
    const t = document.getElementById('t');
    t.value = 'Bonjour à tous';
    t.focus(); t.setSelectionRange(0, t.value.length);
    globalThis.sentMessages = [];
    // Wraps the stub above (kept for the next steps) with a Persian reply.
    const runtime = globalThis.chrome.runtime;
    globalThis.stubbedSend = runtime.sendMessage;
    runtime.sendMessage = async (message) => {
      if (message.type !== 'correctly.v5.translateText')
        return globalThis.stubbedSend(message);
      globalThis.sentMessages.push(message);
      return { ok: true, missing: [], candidates: [{ styleId: 'neutral', text: 'سلام به همه', suspicious: false }] };
    };
    globalThis.correctlyRun('open', [], { source: 'auto', target: 'fa', favorites: ['fa', 'ja'] }, true);
  })()`);
  await page.until(`globalThis.correctlyModal?.visible === true`);
  await page.evaluate(`${modal}.selectTab('translation')`);
  const tSelect = `${modal}.root.querySelectorAll('#correctly-panel-translation select')[1]`;
  assert.deepEqual(
    await page.evaluate(
      `[...${tSelect}.querySelector('optgroup').querySelectorAll('option')].map((o) => o.value)`,
    ),
    ['fa', 'ja'],
    'favorites first in the target menu',
  );
  assert.equal(await page.evaluate(`${tSelect}.value`), 'fa');
  assert(
    !(await page.evaluate(types)).includes('correctly.v5.translateText'),
    'opening the Translation tab must not send',
  );
  await page.evaluate(`${modal}.generate('translation')`);
  const tOutput = `${modal}.root.querySelector('#correctly-panel-translation .results .text')`;
  await page.until(`${tOutput}?.textContent === 'سلام به همه'`);
  assert.deepEqual(
    await page.evaluate(
      `globalThis.sentMessages.filter((m) => m.type === 'correctly.v5.translateText').map((m) => [m.target, m.variant])`,
    ),
    [['fa', null]],
    'one translation request to Persian',
  );
  assert.equal(
    await page.evaluate(`getComputedStyle(${tOutput}).direction`),
    'rtl',
    'Persian result must render right-to-left',
  );
  await screenshot('translation-rtl');
  await page.evaluate(`(() => {
    ${modal}.root.querySelector('[aria-label="Close Correctly"]').click();
    globalThis.chrome.runtime.sendMessage = globalThis.stubbedSend;
  })()`);
  step(
    'T16',
    'PASS',
    '5.16: modal target menu shows favorites first; Persian: one request, result laid out right-to-left',
  );

  // V5.6: real typing (trusted input events over CDP) expands a shortcut
  // locally, keeps the separator and the caret, and sends nothing.
  await page.evaluate(
    `(() => { globalThis.correctlyPanel?.close(); const t = document.getElementById('t'); t.value = ''; t.focus(); globalThis.sentMessage = null; })()`,
  );
  await page.call('Input.insertText', { text: 'Salut bjr' });
  await page.call('Input.insertText', { text: ',' });
  await page.until(`document.getElementById('t').value === 'Salut Bonjour,'`);
  assert.equal(
    await page.evaluate(`document.getElementById('t').selectionStart`),
    'Salut Bonjour,'.length,
  );
  await page.call('Input.insertText', { text: ' abjr ' });
  await delay(200);
  assert.equal(
    await page.evaluate(`document.getElementById('t').value`),
    'Salut Bonjour, abjr ',
    'a partial word must not expand',
  );
  assert.equal(await page.evaluate('globalThis.sentMessage'), null);
  step(
    'C05',
    'PASS',
    'shortcut: real typed "bjr," → "Bonjour," locally, caret after separator, "abjr" untouched, nothing sent',
  );

  // V5.4: rewrite picker and cards with real layout (worker stubbed, the
  // reply deliberately in a different order than requested).
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    const t = document.getElementById('t');
    t.value = "I can't attend the meeting tomorrow.";
    t.focus(); t.setSelectionRange(0, t.value.length);
    globalThis.sentMessages = [];
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => message.type === 'correctly.v5.pageConfig' ? {} : (globalThis.sentMessages.push(message), { ok: true, missing: [], candidates: [
        { styleId: 'concise', text: "Can't attend tomorrow.", suspicious: false },
        { styleId: 'formal', text: 'I am unable to attend the meeting tomorrow.', suspicious: false } ] }) } };
    globalThis.correctlyRun('rewrite', ['formal', 'concise']);
  })()`);
  const rewritePanel = 'globalThis.correctlyPanel.root';
  assert.equal(
    await page.evaluate(
      `${rewritePanel}.querySelectorAll('fieldset input:checked').length`,
    ),
    2,
  );
  assert.equal(
    await page.evaluate('globalThis.sentMessages.length'),
    0,
    'opening the picker must not send',
  );
  await page.evaluate(
    `[...${rewritePanel}.querySelectorAll('button')].find((b) => b.textContent === 'Generate rewrites').click()`,
  );
  await page.until(`${rewritePanel}.querySelectorAll('.card').length === 2`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessages'), [
    {
      type: 'correctly.v5.rewriteText',
      text: "I can't attend the meeting tomorrow.",
      styleIds: ['formal', 'concise'],
    },
  ]);
  assert.deepEqual(
    await page.evaluate(
      `[...${rewritePanel}.querySelectorAll('.card strong')].map((n) => n.textContent)`,
    ),
    ['Formal', 'Concise'],
  );
  await page.evaluate(
    `${rewritePanel}.querySelectorAll('.card input')[1].click()`,
  );
  assert.equal(
    await page.evaluate(value),
    "I can't attend the meeting tomorrow.",
    'choosing a card must not edit',
  );
  await page.evaluate('globalThis.correctlyPanel.apply()');
  assert.equal(await page.evaluate(value), "Can't attend tomorrow.");
  await page.evaluate('globalThis.correctlyPanel.undo()');
  assert.equal(
    await page.evaluate(value),
    "I can't attend the meeting tomorrow.",
  );
  step(
    'C03',
    'PASS',
    'rewrite: picker sends nothing, one request for 2 styles, cards in requested order, chosen card applied, undo',
  );

  // V5.5: translation picker with real layout and RTL output (worker stubbed).
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    const t = document.getElementById('t');
    t.value = 'Salut, tu peux me dire quand tu seras libre demain ?';
    t.focus(); t.setSelectionRange(0, t.value.length);
    globalThis.sentMessages = [];
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => message.type === 'correctly.v5.pageConfig' ? {} : (globalThis.sentMessages.push(message), { ok: true, missing: [], candidates: [
        { styleId: 'neutral', text: 'مرحبا، فيك تقلي إمتى رح تكون فاضي بكرا؟', suspicious: false } ] }) } };
    globalThis.correctlyRun('translate', ['professional'], { source: 'auto', target: 'ar', arabicVariant: 'syrian' });
  })()`);
  const tPanel = 'globalThis.correctlyPanel.root';
  assert.equal(await page.evaluate('globalThis.sentMessages.length'), 0);
  await page.evaluate(
    `[...${tPanel}.querySelectorAll('button')].find((b) => b.textContent === 'Translate').click()`,
  );
  await page.until(`${tPanel}.querySelectorAll('.card').length === 1`);
  assert.deepEqual(await page.evaluate('globalThis.sentMessages'), [
    {
      type: 'correctly.v5.translateText',
      text: 'Salut, tu peux me dire quand tu seras libre demain ?',
      source: 'auto',
      target: 'ar',
      variant: 'syrian',
      styleIds: [],
    },
  ]);
  assert.equal(
    await page.evaluate(
      `getComputedStyle(${tPanel}.querySelector('.card .text')).direction`,
    ),
    'rtl',
    'Arabic result must render right-to-left',
  );
  await page.evaluate('globalThis.correctlyPanel.apply()');
  assert.equal(
    await page.evaluate(value),
    'مرحبا، فيك تقلي إمتى رح تكون فاضي بكرا؟',
  );
  await page.evaluate('globalThis.correctlyPanel.undo()');
  assert.equal(
    await page.evaluate(value),
    'Salut, tu peux me dire quand tu seras libre demain ?',
  );
  step(
    'C04',
    'PASS',
    'translate: picker sends nothing, one request (auto → Arabic Syrian), RTL result, exact Apply/Undo',
  );

  // 5.15: the translate button on a real mouse selection (worker stubbed):
  // the button appears and sends nothing; a click opens the bubble with one
  // translation request.
  await page.evaluate(`(() => {
    globalThis.correctlyPanel?.close();
    const p = document.createElement('p');
    p.id = 'sel';
    p.textContent = 'Combined Operating Ratio';
    p.style.cssText = 'font: 20px sans-serif; margin: 40px; display: inline-block';
    document.body.prepend(p);
    window.scrollTo(0, 0);
    document.activeElement?.blur();
    globalThis.sentMessages = [];
    globalThis.chrome = { runtime: { id: 'test', onMessage: { addListener() {} },
      sendMessage: async (message) => {
        if (message.type === 'correctly.v5.pageConfig')
          return { selectionButton: true, locale: 'en', translation: { target: 'fr', arabicVariant: 'msa' } };
        globalThis.sentMessages.push(message);
        return { ok: true, missing: [], candidates: [
          { styleId: 'neutral', text: 'Ratio combiné', suspicious: false } ] };
      } } };
  })()`);
  await page.evaluate(`${smartBundle}; void 0`);
  await page.evaluate('new Promise((resolve) => setTimeout(resolve, 100))');
  const words = await page.evaluate(`(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('sel'));
    const r = range.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  })()`);
  const middle = (words.top + words.bottom) / 2;
  await mouse('mousePressed', words.left + 1, middle);
  await mouse('mouseMoved', words.right - 1, middle, { buttons: 1 });
  await mouse('mouseReleased', words.right - 1, middle);
  await page.until(`!!document.querySelector('correctly-selection')`);
  assert.equal(
    await page.evaluate('globalThis.sentMessages.length'),
    0,
    'showing the button sends nothing',
  );
  // The button sits just below the end of the selection (closed shadow root).
  await mouse('mousePressed', words.right - 1, words.bottom + 19);
  await mouse('mouseReleased', words.right - 1, words.bottom + 19);
  await page.until(`!!document.querySelector('correctly-bubble')`);
  await page.until('globalThis.sentMessages.length === 1');
  await screenshot('selection');
  assert.deepEqual(await page.evaluate('globalThis.sentMessages'), [
    {
      type: 'correctly.v5.translateText',
      text: 'Combined Operating Ratio',
      source: 'auto',
      target: 'fr',
      variant: null,
      styleIds: [],
    },
  ]);
  step(
    'Y02',
    'PASS',
    'translate button: a real selection shows it and sends nothing; a click opens the bubble with exactly one request',
  );

  // Step 15: no console output containing the key; only approved hosts.
  const leaked = evidence.consoleMessages.filter(
    (item) =>
      item.text.includes(DUMMY_KEY) || item.text.includes(DUMMY_OPENAI_KEY),
  );
  assert.equal(leaked.length, 0);
  const external = evidence.networkRequests.filter(
    (request) =>
      !request.url.startsWith('chrome-extension://') &&
      !request.url.startsWith('data:') &&
      !request.url.startsWith('https://generativelanguage.googleapis.com/') &&
      !request.url.startsWith('https://api.openai.com/'),
  );
  assert.deepEqual(external, [], 'unexpected hosts contacted');
  step(
    'M15',
    'PASS',
    `${evidence.consoleMessages.length} console messages, none with a key; only the Gemini and OpenAI APIs contacted`,
  );
} catch (error) {
  exitCode = 1;
  step('ERROR', 'FAIL', error instanceof Error ? error.message : String(error));
  if (page)
    console.log(
      'page state:',
      await page
        .evaluate(
          'location.href + " | " + document.title + " | " + document.body?.innerText?.slice(0, 200)',
        )
        .catch((e) => e.message),
    );
} finally {
  page?.close();
  worker?.close();
  browser?.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await mkdir(EVIDENCE, { recursive: true });
  const out = `${EVIDENCE}/browser-${browserName}.json`;
  await writeFile(out, JSON.stringify(evidence, null, 2) + '\n');
  console.log('Evidence written to ' + out);
  process.exit(exitCode);
}
