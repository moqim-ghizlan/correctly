// Static audit of the built extension (checks B01–B04 of the V5.1 plan,
// updated for V5.2's on-click content script, V5.3's triggers and V5.7's
// second provider).
// Pure function so tests can run it against synthetic directories.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GEMINI_HOST_PERMISSION =
  'https://generativelanguage.googleapis.com/*';
export const OPENAI_HOST_PERMISSION = 'https://api.openai.com/*';
// 5.17: Google's Firebase REST APIs for the optional account backup (the
// sign-in window itself is opened by chrome.identity, not by fetch).
export const FIREBASE_HOST_PERMISSIONS = [
  'https://identitytoolkit.googleapis.com/*',
  'https://securetoken.googleapis.com/*',
  'https://firestore.googleapis.com/*',
];
// The only network destinations: the two official provider APIs and the
// three Firebase APIs. Never a server of our own.
const HOSTS = [
  GEMINI_HOST_PERMISSION,
  OPENAI_HOST_PERMISSION,
  ...FIREBASE_HOST_PERMISSIONS,
];
const CONNECT_SRC =
  "connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com";
export const TEST_KEY_SENTINEL = 'CORRECTLY_TEST_SENTINEL_KEY';
// 5.14: public key that fixes the extension ID (same ID on every computer,
// so storage.sync is shared). Public by design; the private .pem never
// enters the repository or dist/.
export const EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApp3XQ9T8KTC/IuYukU/ohcfJuSPFDUstH6XQ8OpkoacbB/SHfKDsD86hi29iuLimHvz43s/6uX8+1AEhzEL9oAshDqmvprIubzHE6J7Z5NSVkM6MMerS5f3Tg662lvqnPp6K4AqYkcILNMfPxDyLTbE3RbSkZPAxVpEVI396HPpwZzG0lgtHCyc3X0CwPkgkXc9cKwFihfjxoQqNVDYh433jFsv8MkQSYf6FU2kZealOcnnvUZwMWI/u/t9EHhCm66Mkup5e0m4nZPdmH82JLlvEyLyrxKgl1wVtQsehZ+jU6tBq/RTNgodEXYioBMdqwwqgOPBctTd2jJvz/ViBhwIDAQAB';
const PERMISSIONS = [
  'activeTab',
  'contextMenus',
  'identity',
  'scripting',
  'storage',
];

// 5.17: the Firebase web API key is public by design (it ships in the
// extension; security comes from Google sign-in and the Firestore rules).
// Only the key written in cloud-config.ts may appear in dist/; any other
// key-shaped string still fails the audit.
const CLOUD_CONFIG = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'frontend',
  'src',
  'shared',
  'cloud-config.ts',
);
const PUBLIC_FIREBASE_KEYS = (() => {
  try {
    return [
      ...readFileSync(CLOUD_CONFIG, 'utf8').matchAll(
        /apiKey:\s*'(AIza[0-9A-Za-z_-]{35})'/g,
      ),
    ].map((match) => match[1]);
  } catch {
    return [];
  }
})();
// Requested at runtime only when the user turns the handle or shortcuts on.
const OPTIONAL_HOSTS = ['<all_urls>'];
const COMMANDS = [
  'open-correctly',
  'correct-selection',
  'rewrite-selection',
  'translate-selection',
];

const FORBIDDEN_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.jar',
  '.class',
  '.py',
  '.pyc',
  '.ps1',
  '.cmd',
  '.bat',
  '.msi',
  '.zip',
  '.map',
  '.env',
  '.pem',
  '.key',
]);
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.html',
  '.css',
  '.json',
  '.txt',
  '.svg',
]);
const FORBIDDEN_TEXT = [
  [/127\.0\.0\.1/, 'local server address 127.0.0.1'],
  [/\blocalhost\b/i, 'localhost reference'],
  [/:8081\b/, 'legacy LanguageTool port 8081'],
  [/languagetool/i, 'LanguageTool reference'],
  [/\bjavaw?\.exe\b|\bjavaw\b/i, 'Java runtime reference'],
  [/CorrectlyServer/, 'legacy Windows server reference'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/AIza[0-9A-Za-z_-]{35}/, 'something shaped like a Google API key'],
  [/GOCSPX-[0-9A-Za-z_-]{10,}/, 'an OAuth client secret'],
  [
    /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/,
    'something shaped like an OpenAI API key',
  ],
  [new RegExp(TEST_KEY_SENTINEL), 'test key sentinel'],
  [/http:\/\/(?!www\.w3\.org\/)/, 'plain http:// URL'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(relative(root, full).split(sep).join('/'));
    }
  };
  walk(root);
  return files.sort();
}

/** @returns {{ errors: string[], files: string[] }} */
export function auditDist(distDir) {
  const root = resolve(distDir);
  const errors = [];
  const fail = (message) => errors.push(message);
  const manifestPath = join(root, 'manifest.json');
  if (!existsSync(manifestPath))
    return { errors: ['manifest.json missing'], files: [] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { errors: ['manifest.json is not valid JSON'], files: [] };
  }
  const inside = (path) => {
    if (typeof path !== 'string' || !path) return null;
    const full = resolve(root, path.replace(/^\//, ''));
    return full.startsWith(root + sep) ? full : null;
  };
  const needFile = (path, label) => {
    const full = inside(path);
    if (!full || !existsSync(full) || !statSync(full).isFile())
      fail(`${label} missing in dist: ${String(path)}`);
    return full;
  };
  const same = (actual, expected) =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((item) => actual.includes(item));

  // B01 — manifest shape and minimal permissions.
  if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
  if (manifest.version !== '6.0.1') fail('version must be 6.0.1');
  if (!String(manifest.name ?? '').includes('V6')) fail('name must say V6');
  if (manifest.key !== EXTENSION_PUBLIC_KEY)
    fail('manifest key must be the Correctly public key (stable extension ID)');
  // activeTab + scripting: inject content.js into the clicked tab only.
  if (!same(manifest.permissions, PERMISSIONS))
    fail(`permissions must be exactly ${JSON.stringify(PERMISSIONS)}`);
  if (!same(manifest.host_permissions, HOSTS))
    fail(`host_permissions must be exactly ${JSON.stringify(HOSTS)}`);
  for (const key of [
    'content_scripts',
    'optional_permissions',
    'externally_connectable',
    'web_accessible_resources',
  ])
    if (key in manifest) fail(`unexpected manifest key: ${key}`); // B04
  if (manifest.action?.default_popup) fail('no popup is expected in V5.11');
  if (!same(manifest.optional_host_permissions ?? [], OPTIONAL_HOSTS))
    fail(
      `optional_host_permissions must be exactly ${JSON.stringify(OPTIONAL_HOSTS)}`,
    );
  if (!same(Object.keys(manifest.commands ?? {}), COMMANDS))
    fail(`commands must be exactly ${JSON.stringify(COMMANDS)}`);
  if (manifest.background?.type !== 'module')
    fail('background.type must be "module"');
  needFile(manifest.background?.service_worker, 'service worker');
  needFile('content.js', 'content script');
  needFile('smart.js', 'right-edge handle script');
  for (const path of Object.values(manifest.icons ?? {}))
    needFile(path, 'icon');
  const csp = String(manifest.content_security_policy?.extension_pages ?? '');
  if (!/script-src 'self'(;|$)/.test(csp))
    fail("CSP must be script-src 'self'");
  if (/unsafe-eval|unsafe-inline|https?:\/\/[^ ;]*\*/.test(csp))
    fail('CSP is too permissive');
  if (!csp.split(';').some((part) => part.trim() === CONNECT_SRC))
    fail(`CSP must contain exactly "${CONNECT_SRC}"`);

  const optionsPath = manifest.options_page ?? manifest.options_ui?.page;
  const optionsFull = needFile(optionsPath, 'options page');
  if (optionsFull && existsSync(optionsFull)) {
    const html = readFileSync(optionsFull, 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const asset = match[1];
      if (/^https:\/\//.test(asset)) {
        if (/<script[^>]+src="https:/.test(html))
          fail('remote script in options page');
        continue;
      }
      // External schemes and in-page anchors (#section) are not files.
      if (asset.includes(':') || asset.startsWith('#')) continue;
      const full = asset.startsWith('/')
        ? inside(asset)
        : resolve(dirname(optionsFull), asset);
      if (!full || !full.startsWith(root + sep) || !existsSync(full))
        fail('options page asset missing: ' + asset);
    }
  }

  // B02/B03 — inventory and content scan.
  const files = listFiles(root);
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(extension) || /(^|\/)\.env/.test(file))
      fail('forbidden file type in dist: ' + file);
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    for (const [pattern, label] of FORBIDDEN_TEXT) {
      const found = text.match(new RegExp(pattern.source, 'g' + pattern.flags));
      const bad = (found ?? []).filter(
        (hit) => !PUBLIC_FIREBASE_KEYS.includes(hit),
      );
      if (bad.length) fail(`${file}: contains ${label}`);
    }
  }
  return { errors, files };
}
