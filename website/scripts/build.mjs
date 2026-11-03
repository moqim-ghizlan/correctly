// Builds the static site into website/site (committed, opens from file://):
//   1. i18n/data checks (check-i18n.mjs);
//   2. index.html: links from src/data/site.js, French text and attributes
//      filled from fr.js (so the page reads without JS);
//   3. the downloadable zip must exist;
//   4. Tailwind CSS compiled and minified;
//   5. scripts, dictionaries, fonts and images copied.
//   node scripts/build.mjs [--watch]
import { spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { check } from './check-i18n.mjs';
import { loadData } from './load-data.mjs';
import { SITE } from '../src/data/site.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = join(ROOT, '..');
// Output: the ready-to-open static site (double-click site/index.html).
const DIST = join(ROOT, 'site');
const { fr } = loadData();
const at = (...parts) => join(ROOT, ...parts);

const escapeText = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttr = (text) => escapeText(text).replaceAll('"', '&quot;');

/** Fills leaf elements and attributes with French text (escaped). */
function fillFrench(html) {
  let out = html.replace(
    /(<([a-z][a-z0-9]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g,
    (_, open, _tag, key, _old, close) =>
      `${open}${escapeText(fr[key])}${close}`,
  );
  out = out.replace(
    /<[a-z][a-z0-9]*\b[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g,
    (tag, pairs) => {
      let result = tag;
      for (const pair of pairs.split(';')) {
        const [attr, key] = pair.split(':').map((part) => part.trim());
        const value = escapeAttr(fr[key]);
        const existing = new RegExp(`\\s${attr}="[^"]*"`);
        result = existing.test(result)
          ? result.replace(existing, ` ${attr}="${value}"`)
          : result
              .replace(/\s*(\/?)>$/, ` ${attr}="${value}" $1>`)
              .replace(/ >$/, '>');
      }
      return result;
    },
  );
  return out;
}

async function buildOnce() {
  const started = Date.now();
  const problems = await check();
  let html = await readFile(at('index.html'), 'utf8');
  html = html.replace(/<!--[\s\S]*?-->\n/, '');
  html = html
    .replaceAll('{{DOWNLOAD}}', SITE.download)
    .replaceAll('{{RELEASES}}', SITE.releases);
  html = fillFrench(html);
  if (html.includes('{{'))
    problems.push('index.html still contains a {{placeholder}}');
  await access(at(SITE.download)).catch(() =>
    problems.push(`download missing: website/${SITE.download}`),
  );
  if (problems.length)
    throw new Error(
      `build stopped, ${problems.length} problem(s):\n- ${problems.join('\n- ')}`,
    );

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await writeFile(join(DIST, 'index.html'), html);
  // 5.17: standalone bilingual privacy policy (linked from Google's consent
  // screen), copied as is.
  await copyFile(at('privacy.html'), join(DIST, 'privacy.html'));

  const tailwind = spawnSync(
    process.execPath,
    [
      at('node_modules/@tailwindcss/cli/dist/index.mjs'),
      '-i',
      at('src/css/input.css'),
      '-o',
      join(DIST, 'css/site.css'),
      '--minify',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  if (tailwind.status !== 0)
    throw new Error(`Tailwind failed:\n${tailwind.stderr}`);

  await cp(at('src/js'), join(DIST, 'js'), { recursive: true });
  await mkdir(join(DIST, 'data'), { recursive: true });
  for (const file of ['fr.js', 'en.js', 'demo.js'])
    await copyFile(at('src/data', file), join(DIST, 'data', file));

  const fonts = [
    ['@fontsource-variable/mona-sans', 'mona-sans-latin-standard-normal.woff2'],
    [
      '@fontsource-variable/mona-sans',
      'mona-sans-latin-ext-standard-normal.woff2',
    ],
    [
      '@fontsource-variable/noto-sans-arabic',
      'noto-sans-arabic-arabic-wght-normal.woff2',
    ],
  ];
  await mkdir(join(DIST, 'fonts'), { recursive: true });
  for (const [pkg, file] of fonts)
    await copyFile(
      at('node_modules', pkg, 'files', file),
      join(DIST, 'fonts', file),
    );

  await cp(at('assets'), join(DIST, 'assets'), { recursive: true });
  const external = [
    ['frontend/public/icons/icon-48.png', 'assets/icons/icon-48.png'],
    ['frontend/public/icons/icon-128.png', 'assets/icons/icon-128.png'],
    ['docs/v7.1/evidence/summary-brave.png', 'assets/shots/summary-brave.png'],
  ];
  for (const [from, to] of external) {
    await mkdir(dirname(join(DIST, to)), { recursive: true });
    await copyFile(join(REPO_ROOT, from), join(DIST, to));
  }
  console.log(`website built in ${Date.now() - started} ms → ${DIST}`);
}

try {
  await buildOnce();
} catch (error) {
  console.error(error.message);
  if (!process.argv.includes('--watch')) process.exit(1);
}

if (process.argv.includes('--watch')) {
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => buildOnce().catch((error) => console.error(error.message)),
      150,
    );
  };
  for (const target of ['index.html', 'privacy.html', 'src', 'assets'])
    watch(at(target), { recursive: true }, rebuild);
  console.log('watching index.html, src/ and assets/ (Ctrl+C to stop)');
}
