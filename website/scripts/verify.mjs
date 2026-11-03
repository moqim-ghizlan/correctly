// Real-browser checks of website/site in headless Chrome over the DevTools
// protocol (no extra dependency). Serves dist on 127.0.0.1, then for each
// width × theme × language: console errors, outside network requests,
// horizontal overflow, broken images, untranslated text; plus scripted
// checks of the demo, menu, theme/language persistence, reduced motion and
// the no-JavaScript page. Screenshots go to --out (default: os tmpdir).
//   node scripts/verify.mjs [--browser=<path>] [--out=<dir>] [--og]
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [, key, value] = arg.match(/^--([^=]+)(?:=([\s\S]*))?$/) ?? [];
    return [key, value ?? true];
  }),
);
const BROWSER =
  typeof args.browser === 'string'
    ? args.browser
    : 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT =
  typeof args.out === 'string'
    ? args.out
    : join(tmpdir(), 'correctly-website-verify');
const DIST = fileURLToPath(new URL('../site', import.meta.url));
const ASSETS = fileURLToPath(new URL('../assets', import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`,
  );
};

// ---------- static server ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
  if (!file.startsWith(DIST + sep)) return response.writeHead(403).end();
  let size;
  try {
    size = (await stat(file)).size;
  } catch {
    return response.writeHead(404).end();
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  // Byte ranges, like any real host: video seeking needs them.
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Number(range[2]) : size - 1;
    response.writeHead(206, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    });
    return createReadStream(file, { start, end }).pipe(response);
  }
  response.writeHead(200, {
    'content-type': type,
    'accept-ranges': 'bytes',
    'content-length': size,
  });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ---------- browser ----------
const profile = await mkdtemp(join(tmpdir(), 'correctly-site-'));
const browser = spawn(
  BROWSER,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    // Lets the test play the film with sound without a human click.
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = '';
  browser.stderr.on('data', (chunk) => {
    buffer += chunk;
    const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) resolve(match[1]);
  });
  setTimeout(() => reject(new Error('Chrome did not start')), 20000);
});

const socket = new WebSocket(wsUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve));
let sequence = 0;
const pending = new Map();
const listeners = new Set();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else for (const listener of listeners) listener(message);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function openPage({
  width,
  height,
  mobile = false,
  theme = 'light',
  lang = 'fr',
  reduce = false,
  js = true,
  fresh = true,
  url = `${ORIGIN}/`,
}) {
  const { targetId } = await send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  const page = {
    errors: [],
    requests: [],
    send: (method, params) => send(method, params, sessionId),
    close: () => send('Target.closeTarget', { targetId }),
  };
  listeners.add((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown')
      page.errors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    if (
      message.method === 'Runtime.consoleAPICalled' &&
      ['error', 'warning'].includes(message.params.type)
    )
      page.errors.push(
        message.params.args
          .map((arg) => arg.value ?? arg.description)
          .join(' '),
      );
    if (
      message.method === 'Log.entryAdded' &&
      message.params.entry.level === 'error'
    )
      page.errors.push(
        `${message.params.entry.text} ${message.params.entry.url ?? ''}`,
      );
    if (message.method === 'Network.requestWillBeSent')
      page.requests.push(message.params.request.url);
  });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Network.enable');
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await page.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      {
        name: 'prefers-reduced-motion',
        value: reduce ? 'reduce' : 'no-preference',
      },
    ],
  });
  if (!js)
    await page.send('Emulation.setScriptExecutionDisabled', { value: true });
  if (fresh) {
    await page.send('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 Chrome',
      acceptLanguage: lang === 'en' ? 'en-GB,en' : 'fr-FR,fr',
    });
    await page.send('Page.navigate', { url });
    await waitLoad(page);
    await page.send('Runtime.evaluate', { expression: 'localStorage.clear()' });
  }
  await page.send('Page.navigate', { url });
  await waitLoad(page);
  await delay(js ? 900 : 300);
  return page;
}

function waitLoad(page) {
  return new Promise((resolve) => {
    const listener = (message) => {
      if (message.method === 'Page.loadEventFired') {
        listeners.delete(listener);
        resolve();
      }
    };
    listeners.add(listener);
    setTimeout(resolve, 8000);
  });
}

async function evaluate(page, expression) {
  const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails)
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    );
  return result.value;
}

async function screenshot(page, name, fullPage = true) {
  const params = { format: 'png' };
  if (fullPage) {
    const { cssContentSize } = await page.send('Page.getLayoutMetrics');
    params.captureBeyondViewport = true;
    params.clip = {
      x: 0,
      y: 0,
      width: cssContentSize.width,
      height: Math.min(cssContentSize.height, 16000),
      scale: 1,
    };
  }
  const { data } = await page.send('Page.captureScreenshot', params);
  await writeFile(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

const pageChecks = `(async () => {
  const { fr, en } = window.CorrectlyData;
  const lang = document.documentElement.lang;
  const dict = lang === 'en' ? en : fr;
  const wrong = [];
  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (el.textContent !== dict[el.dataset.i18n]) wrong.push(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      if (el.getAttribute(attr) !== dict[key] && !['theme.system', 'nav.menuOpen'].includes(key)) wrong.push(key + '@' + attr);
    }
  }
  scrollTo(80, 0);
  const scrollX = window.scrollX;
  scrollTo(0, 0);
  const offenders = [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5 && getComputedStyle(el).position !== 'fixed')
    .slice(0, 4)
    .map((el) => el.tagName.toLowerCase() + '.' + [...el.classList].join('.') + ' → ' + Math.round(el.getBoundingClientRect().right));
  const broken = [...document.images].filter((img) => { img.loading = 'eager'; return img.complete && img.naturalWidth === 0; }).map((img) => img.src);
  return {
    lang,
    theme: document.documentElement.dataset.theme,
    overflow: document.documentElement.scrollWidth - innerWidth,
    scrollX,
    offenders,
    wrong: wrong.slice(0, 10),
    wrongCount: wrong.length,
    broken,
    h1: document.querySelector('h1').innerText,
  };
})()`;

// --sections [--width=1440] [--theme=dark] [--lang=fr] [--still] [--maxHeight=2400]: one screenshot per
// section (for visual review), then stop.
if (args.sections) {
  await mkdir(OUT, { recursive: true });
  const width = Number(args.width ?? 1440);
  const theme = args.theme === 'light' ? 'light' : 'dark';
  const lang = args.lang === 'en' ? 'en' : 'fr';
  const page = await openPage({
    width,
    height: 900,
    mobile: width < 700,
    theme,
    lang,
    // --still: reduced motion, so tall sections show every block at once.
    reduce: Boolean(args.still),
  });
  await delay(3600);
  const boxes = await evaluate(
    page,
    `[...document.querySelectorAll('header.site-header, main > section, footer')].map((el, i) => { const r = el.getBoundingClientRect(); return { name: (el.id || el.className.split(' ')[0] || 'part') + '-' + i, x: 0, y: r.top + scrollY, width: innerWidth, height: Math.min(r.height, ${Number(args.maxHeight ?? 2400)}) }; })`,
  );
  for (const box of boxes) {
    // Bring the section into view so its reveal animations play first.
    await evaluate(
      page,
      `scrollTo(0, ${box.y - 200}); new Promise((r) => setTimeout(r, 2200))`,
    );
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        scale: 1,
      },
    });
    await writeFile(
      join(OUT, `s-${width}-${theme}-${lang}-${box.name}.png`),
      Buffer.from(data, 'base64'),
    );
  }
  console.log(boxes.map((b) => b.name).join(', '));
  browser.kill();
  server.close();
  process.exit(0);
}

// --film [--width=1440] [--theme=light]: screenshot of the open film player.
if (args.film) {
  await mkdir(OUT, { recursive: true });
  const width = Number(args.width ?? 1440);
  const theme = args.theme === 'light' ? 'light' : 'dark';
  const page = await openPage({
    width,
    height: width < 700 ? 780 : 900,
    mobile: width < 700,
    theme,
  });
  await evaluate(
    page,
    'document.querySelector(\'.film-chip[data-chapter="109.8"]\').click(); new Promise((r) => setTimeout(r, 2500))',
  );
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    join(OUT, `film-${width}-${theme}.png`),
    Buffer.from(data, 'base64'),
  );
  browser.kill();
  server.close();
  process.exit(0);
}
// --probe="<expression>" [--width=1440]: print one evaluation and stop.
if (typeof args.probe === 'string') {
  const page = await openPage({
    width: Number(args.width ?? 1440),
    height: 900,
  });
  console.log(JSON.stringify(await evaluate(page, args.probe), null, 2));
  browser.kill();
  server.close();
  process.exit(0);
}

try {
  await mkdir(OUT, { recursive: true });
  const widths = [
    { width: 360, height: 780, mobile: true },
    { width: 768, height: 1024, mobile: true },
    { width: 1440, height: 900 },
  ];

  // 0. Opened by double-click (file://, no server): style, fonts, scripts.
  {
    const url = pathToFileURL(join(DIST, 'index.html')).href;
    const page = await openPage({
      width: 1440,
      height: 900,
      theme: 'dark',
      url,
    });
    const f = await evaluate(
      page,
      `(async () => {
        await document.fonts.ready;
        const before = document.querySelector('h1').innerText;
        document.querySelector('.seg-btn[data-lang="en"]').click();
        const after = document.querySelector('h1').innerText;
        document.querySelector('[data-go="correction"]').click();
        await new Promise((r) => setTimeout(r, 1100));
        return {
          protocol: location.protocol,
          styled: getComputedStyle(document.body).backgroundColor,
          font: document.fonts.check('16px "Mona Sans"') && [...document.fonts].some((x) => x.family.includes('Mona') && x.status === 'loaded'),
          scripts: typeof window.Correctly?.i18n?.t === 'function',
          before,
          after,
          demo: document.querySelectorAll('[data-result="correction"] del').length,
        };
      })()`,
    );
    record(
      'file:// (double-click): stylesheet applied',
      f.styled === 'rgb(14, 20, 36)',
      f.styled,
    );
    record('file:// (double-click): Mona Sans font loaded', f.font);
    record(
      'file:// (double-click): scripts run, FR → EN works',
      f.scripts &&
        f.before.startsWith('Écrivez') &&
        f.after.startsWith('Write'),
      f.after.replace(/\n/g, ' / '),
    );
    record('file:// (double-click): demo works', f.demo > 0, `${f.demo} marks`);
    record(
      'file:// (double-click): no console error',
      page.errors.length === 0,
      page.errors.slice(0, 3).join(' | '),
    );
    const remote = page.requests.filter(
      (r) => !r.startsWith('file:') && !r.startsWith('data:'),
    );
    record(
      'file:// (double-click): no network request',
      remote.length === 0,
      remote.join(', '),
    );
    await page.close();
  }

  // 1. Matrix: width × theme × language.
  for (const size of widths)
    for (const theme of ['light', 'dark'])
      for (const lang of ['fr', 'en']) {
        const label = `${size.width}-${theme}-${lang}`;
        const page = await openPage({ ...size, theme, lang });
        const info = await evaluate(page, pageChecks);
        // Scroll through so lazy images load, then re-check images.
        await evaluate(
          page,
          'new Promise(async (r) => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo({ top: y, behavior: "instant" }); await new Promise((s) => setTimeout(s, 40)); } scrollTo(0, 0); setTimeout(r, 300); })',
        );
        const images = await evaluate(
          page,
          '[...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src)',
        );
        const outside = page.requests.filter(
          (url) => !url.startsWith(ORIGIN) && !url.startsWith('data:'),
        );
        record(
          `${label}: language ${lang} applied, nothing left in the other language`,
          info.lang === lang && info.wrongCount === 0,
          info.wrongCount
            ? `${info.wrongCount} wrong: ${info.wrong.join(', ')}`
            : info.h1.replace(/\n/g, ' / '),
        );
        record(
          `${label}: theme follows the system (${theme})`,
          info.theme === theme,
        );
        record(
          `${label}: no horizontal scroll`,
          info.overflow <= 0 && info.scrollX === 0,
          `scrollWidth - innerWidth = ${info.overflow}, scrollX = ${info.scrollX}${info.offenders.length ? `, past the edge: ${info.offenders.join('; ')}` : ''}`,
        );
        record(
          `${label}: no console error`,
          page.errors.length === 0,
          page.errors.slice(0, 3).join(' | '),
        );
        record(
          `${label}: no request outside the site`,
          outside.length === 0,
          outside.slice(0, 3).join(', '),
        );
        record(
          `${label}: all images load`,
          images.length === 0,
          images.join(', '),
        );
        if (size.width !== 768 || (theme === 'dark' && lang === 'fr'))
          await screenshot(page, `page-${label}`);
        await page.close();
      }

  // 2. Demo behaviour (desktop, French).
  {
    const page = await openPage({ width: 1440, height: 900 });
    const demo = await evaluate(
      page,
      `(async () => {
        const q = (s) => document.querySelector(s);
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = {};
        const original = q('#demo-text').value;
        q('[data-go="correction"]').click();
        out.busyNote = !!q('.cw-wait-note');
        await sleep(1100);
        out.diff = q('[data-result="correction"] .cw-diff')?.querySelectorAll('del').length ?? 0;
        out.applyEnabled = !q('#demo-apply').disabled;
        q('#demo-apply').click();
        await sleep(50);
        out.applied = q('#demo-text').value !== original;
        out.toast = !q('#demo-toast').hidden;
        out.focusUndo = document.activeElement === q('#demo-undo');
        q('#demo-undo').click();
        await sleep(50);
        out.undone = q('#demo-text').value === original;
        // Rewrite: two styles, custom level 5.
        q('#tab-rewrite').click();
        q('#demo-styles input[value="custom"]').click();
        q('#demo-formality-range').value = '5';
        q('#demo-formality-range').dispatchEvent(new Event('input'));
        out.formalityLabel = q('#demo-formality-value').textContent;
        q('[data-go="rewrite"]').click();
        await sleep(1100);
        out.choices = document.querySelectorAll('[data-result="rewrite"] .cw-choice').length;
        out.applyBeforeChoice = q('#demo-apply').disabled;
        document.querySelectorAll('[data-result="rewrite"] input[type=radio]')[1].click();
        out.applyAfterChoice = !q('#demo-apply').disabled;
        // Translation to Syrian Arabic.
        q('#tab-translation').click();
        q('#demo-to').value = 'ar';
        q('#demo-to').dispatchEvent(new Event('change'));
        out.variantShown = !q('#demo-variant').hidden;
        q('input[name="demo-variant"][value="ar_syrian"]').click();
        q('[data-go="translation"]').click();
        await sleep(1100);
        const tr = q('[data-result="translation"] .cw-out');
        out.rtl = tr?.dir === 'rtl' && /[\\u0600-\\u06FF]/.test(tr.textContent);
        out.trLabel = q('[data-result="translation"] .cw-label')?.textContent;
        // Summary as key points.
        q('#tab-summary').click();
        q('#demo-format').value = 'points';
        q('[data-go="summary"]').click();
        await sleep(1100);
        out.points = document.querySelectorAll('[data-result="summary"] li').length;
        // Applying a translation makes other results stale.
        q('#tab-translation').click();
        q('#demo-apply').click();
        await sleep(50);
        q('#tab-correction').click();
        q('[data-go="correction"]').click();
        await sleep(1100);
        out.stale = !!q('[data-result="correction"] .cw-warn');
        q('[data-result="correction"] .cw-link').click();
        await sleep(50);
        out.restored = q('#demo-text').value === original;
        // Next sample, keyboard tabs.
        q('#demo-next').click();
        out.nextSample = q('#demo-text').value !== original;
        q('#tab-correction').focus();
        q('#tab-correction').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        out.arrowKey = document.activeElement?.id;
        out.injectedHtml = [...document.querySelectorAll('.cw-result *')].some((n) => n.tagName === 'SCRIPT');
        return out;
      })()`,
    );
    record('demo: Generate shows the labelled demo animation', demo.busyNote);
    record(
      'demo: correction shows struck errors and corrections',
      demo.diff >= 4,
      `${demo.diff} marks`,
    );
    record(
      'demo: Apply replaces the demo text and offers Undo (focus on Undo)',
      demo.applyEnabled && demo.applied && demo.toast && demo.focusUndo,
    );
    record('demo: Undo restores the sample', demo.undone);
    record(
      'demo: formality slider label',
      demo.formalityLabel === 'Très formel',
      demo.formalityLabel,
    );
    record(
      'demo: one version per ticked style, Apply waits for a choice',
      demo.choices === 2 && demo.applyBeforeChoice && demo.applyAfterChoice,
      `${demo.choices} versions`,
    );
    record(
      'demo: Arabic variant shown, Syrian result right-to-left',
      demo.variantShown && demo.rtl,
      demo.trLabel,
    );
    record(
      'demo: summary as key points',
      demo.points >= 3,
      `${demo.points} points`,
    );
    record(
      'demo: after applying a translation, other tabs say no prepared result',
      demo.stale && demo.restored,
    );
    record('demo: Another sample switches the text', demo.nextSample);
    record(
      'demo: arrow keys move between tabs',
      demo.arrowKey === 'tab-rewrite',
      demo.arrowKey,
    );
    const outside = page.requests.filter(
      (url) => !url.startsWith(ORIGIN) && !url.startsWith('data:'),
    );
    record(
      'demo: no request outside the site during the whole scenario',
      outside.length === 0,
      outside.join(', '),
    );
    record(
      'demo: no console error',
      page.errors.length === 0,
      page.errors.slice(0, 3).join(' | '),
    );
    await evaluate(
      page,
      "document.querySelector('#demo').scrollIntoView(); document.querySelector('#tab-rewrite').click(); document.querySelector('[data-go=rewrite]').click(); new Promise((r) => setTimeout(r, 1200))",
    );
    await screenshot(page, 'demo-1440-light-fr', false);
    await page.close();
  }

  // 3. Mobile menu, theme and language persistence.
  {
    const page = await openPage({
      width: 360,
      height: 780,
      mobile: true,
      theme: 'dark',
    });
    const menu = await evaluate(
      page,
      `(async () => {
        const btn = document.querySelector('.menu-btn');
        const menu = document.getElementById('mobile-menu');
        btn.click();
        const opened = btn.getAttribute('aria-expanded') === 'true' && getComputedStyle(menu).display !== 'none';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        const closed = btn.getAttribute('aria-expanded') === 'false' && getComputedStyle(menu).display === 'none' && document.activeElement === btn;
        btn.click();
        menu.querySelector('a').click();
        const closedOnLink = btn.getAttribute('aria-expanded') === 'false';
        document.querySelector('[data-theme-toggle]').click();
        // The theme swap runs inside a View Transition callback (async).
        await new Promise((r) => setTimeout(r, 900));
        document.querySelector('.seg-btn[data-lang="en"]').click();
        return { opened, closed, closedOnLink, theme: document.documentElement.dataset.theme, label: document.querySelector('[data-theme-toggle]').getAttribute('aria-label') };
      })()`,
    );
    record(
      'mobile menu: opens, Escape closes and returns focus, a link closes it',
      menu.opened && menu.closed && menu.closedOnLink,
    );
    record('theme: system (dark) → light', menu.theme === 'light', menu.label);
    await page.send('Page.reload');
    await waitLoad(page);
    await delay(800);
    const after = await evaluate(
      page,
      '({ theme: document.documentElement.dataset.theme, lang: document.documentElement.lang, h1: document.querySelector("h1").innerText })',
    );
    record(
      'theme and language persist after reload',
      after.theme === 'light' && after.lang === 'en',
      `${after.theme}, ${after.lang}: ${after.h1.replace(/\n/g, ' / ')}`,
    );
    await screenshot(page, 'menu-360-light-en', false);
    await page.close();
  }

  // 4. Download section, outbound links, FAQ.
  {
    const page = await openPage({ width: 1440, height: 900 });
    const d = await evaluate(
      page,
      `(async () => {
        const zip = document.querySelector('.btn-download');
        const res = await fetch(zip.href);
        const size = (await res.arrayBuffer()).byteLength;
        const outbound = [...document.querySelectorAll('a[href^="http"]')];
        const faq = document.querySelector('.faq');
        faq.querySelector('summary').click();
        return {
          zip: zip.getAttribute('href'),
          download: zip.hasAttribute('download'),
          status: res.status,
          size,
          outbound: outbound.map((a) => a.href),
          safe: outbound.every((a) => a.target === '_blank' && a.rel.includes('noopener')),
          ledger: document.querySelectorAll('.ver, #versions').length,
          faqOpen: faq.open,
        };
      })()`,
    );
    record(
      'download: button points at the 6.1.2 zip, which is served',
      d.download &&
        d.zip.endsWith('Correctly-6.1.2.zip') &&
        d.status === 200 &&
        d.size === 192932,
      `${d.zip}, ${d.size} bytes`,
    );
    record(
      'outbound links: only the all-versions page, opened safely',
      d.outbound.length > 0 &&
        d.outbound.every((h) => h.endsWith('/releases')) &&
        d.safe,
      d.outbound.join(', '),
    );
    record('no version history on the page', d.ledger === 0);
    record('FAQ: a question opens on click', d.faqOpen);
    await page.close();
  }

  // 4b. Theme switch: one atomic swap, no error, persists.
  {
    const page = await openPage({ width: 1440, height: 900, theme: 'light' });
    const t = await evaluate(
      page,
      `(async () => {
        const seen = new Set();
        const watch = new MutationObserver(() => seen.add(document.documentElement.dataset.theme));
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        const button = document.querySelector('[data-theme-toggle]');
        button.click(); // system (light) → light: no visual change
        await new Promise((r) => setTimeout(r, 300));
        button.click(); // light → dark
        await new Promise((r) => setTimeout(r, 900));
        watch.disconnect();
        return { theme: document.documentElement.dataset.theme, seen: [...seen], vt: typeof document.startViewTransition };
      })()`,
    );
    record(
      'theme switch: light → dark in one swap, no console error',
      t.theme === 'dark' && page.errors.length === 0,
      `${JSON.stringify(t)} ${page.errors.join(' | ')}`,
    );
    await page.close();
  }

  // 4c. Motion: every revealed element is visible after scrolling through.
  {
    const page = await openPage({ width: 1440, height: 900 });
    const m = await evaluate(
      page,
      `(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 60)); }
        await new Promise((r) => setTimeout(r, 2600));
        const reveal = [...document.querySelectorAll('.reveal')];
        return {
          reveal: reveal.length,
          notIn: reveal.filter((el) => !el.classList.contains('is-in')).length,
          hidden: reveal.filter((el) => getComputedStyle(el).opacity !== '1').length,
          ink: getComputedStyle(document.querySelector('.cw-tab-ink')).display,
        };
      })()`,
    );
    record(
      'motion: all revealed blocks end fully visible',
      m.reveal > 30 && m.notIn === 0 && m.hidden === 0,
      JSON.stringify(m),
    );
    record('motion: demo tab underline is active', m.ink === 'block');
    record(
      'motion: no console error',
      page.errors.length === 0,
      page.errors.slice(0, 3).join(' | '),
    );
    await page.close();
  }
  // 4d. Film: teaser loop on the page, custom player only on request.
  {
    const page = await openPage({ width: 1440, height: 900 });
    await evaluate(
      page,
      "document.getElementById('video').scrollIntoView(); new Promise((r) => setTimeout(r, 1500))",
    );
    const isFull = (u) => /correctly-(720|1080)\.mp4/.test(u);
    const beforeOpen = page.requests.filter(isFull);
    const f = await evaluate(
      page,
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const teaser = document.querySelector('.film-teaser');
        const dialog = document.getElementById('film');
        const video = document.getElementById('film-video');
        const out = { teaserPlaying: !teaser.paused && teaser.muted };
        // A chapter chip opens the player at that chapter.
        const chip = document.querySelector('.film-chip[data-chapter="61.8"]');
        chip.focus();
        chip.click();
        await wait(1500);
        out.open = dialog.open;
        out.at = Math.round(video.currentTime);
        out.playing = !video.paused;
        out.current = dialog.querySelector('.fp-chapter[aria-current]')?.dataset.chapter;
        // Keyboard: → jumps 5 s, M mutes.
        const before = video.currentTime;
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await wait(300);
        out.jump = Math.round(video.currentTime - before);
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
        await wait(100);
        out.muteLabel = dialog.querySelector('.fp-mute').getAttribute('aria-label');
        out.pauseLabel = dialog.querySelector('.fp-toggle').getAttribute('aria-label');
        dialog.querySelector('.fp-toggle').click();
        await wait(100);
        out.pausedByButton = video.paused;
        return out;
      })()`,
    );
    record(
      'film: nothing of the full film downloaded before opening',
      beforeOpen.length === 0,
      beforeOpen.join(', '),
    );
    record('film: teaser loops, muted, while visible', f.teaserPlaying);
    record(
      'film: a chapter chip opens the player at that chapter and plays',
      f.open && f.at >= 61 && f.at <= 64 && f.playing && f.current === '61.8',
      JSON.stringify(f),
    );
    record(
      'film: → jumps 5 s, M mutes, labels follow the state',
      f.jump === 5 &&
        f.muteLabel === 'Rétablir le son' &&
        f.pauseLabel === 'Pause' &&
        f.pausedByButton,
    );
    // Escape (a real key event) closes the player and stops the film.
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await delay(300);
    const closed = await evaluate(
      page,
      "({ open: document.getElementById('film').open, paused: document.getElementById('film-video').paused, focus: document.activeElement?.className })",
    );
    record(
      'film: Escape closes the player, stops the film, focus returns',
      !closed.open && closed.paused && closed.focus.includes('film-chip'),
      JSON.stringify(closed),
    );
    record(
      'film: no console error',
      page.errors.length === 0,
      page.errors.slice(0, 3).join(' | '),
    );
    await page.close();
  }
  // 5. Reduced motion: hero is in its final state right away.
  {
    const page = await openPage({ width: 1440, height: 900, reduce: true });
    const r = await evaluate(
      page,
      `({ motion: document.documentElement.classList.contains('motion'), opacity: getComputedStyle(document.querySelector('.mock-window')).opacity, ins: getComputedStyle(document.querySelector('.mock-proof ins')).opacity })`,
    );
    record(
      'reduced motion: no motion class, mock window and corrections visible at once',
      !r.motion && r.opacity === '1' && r.ins === '1',
      JSON.stringify(r),
    );
    await page.close();
  }

  // 6. JavaScript disabled: French content readable, JS-only controls hidden.
  {
    const page = await openPage({
      width: 1440,
      height: 900,
      js: false,
      fresh: false,
    });
    // Re-enabling does not run the page's scripts again; it lets us inspect.
    await page.send('Emulation.setScriptExecutionDisabled', { value: false });
    const n = await evaluate(
      page,
      `({
        h1: document.querySelector('h1').innerText,
        visible: getComputedStyle(document.body).visibility,
        langButtons: getComputedStyle(document.querySelector('.seg')).display,
        demoLive: document.querySelector('.demo-live').hidden,
        faq: document.querySelectorAll('details.faq').length,
        download: !!document.querySelector('#download .btn-download'),
        reveal: document.querySelectorAll('.reveal').length,
      })`,
    );
    record(
      'no JavaScript: French page readable, download and FAQ present, nothing hidden by motion',
      n.h1.startsWith('Écrivez') &&
        n.visible === 'visible' &&
        n.langButtons === 'none' &&
        n.demoLive &&
        n.faq === 16 &&
        n.download &&
        n.reveal === 0,
      JSON.stringify(n),
    );
    await page.close();
  }

  // 7. Optional: share image (1200×630, dark, French) into website/assets.
  if (args.og) {
    const page = await openPage({ width: 1200, height: 630, theme: 'dark' });
    await delay(4200);
    await evaluate(
      page,
      "document.getElementById('edge-handle').hidden = true; document.documentElement.style.scrollbarWidth = 'none'",
    );
    await delay(200);
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png',
    });
    await writeFile(join(ASSETS, 'og.png'), Buffer.from(data, 'base64'));
    record('share image written to assets/og.png', true);
    await page.close();
  }
} finally {
  browser.kill();
  server.close();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length} PASS, ${failed.length} FAIL. Screenshots: ${OUT}`,
);
process.exit(failed.length ? 1 : 0);
