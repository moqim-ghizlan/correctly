import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { auditDist } from '../../../scripts/audit-dist.mjs';

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../manifest.json'), 'utf8'),
) as Record<string, unknown>;

let dir: string;
const put = (path: string, content: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const writeManifest = (value: Record<string, unknown>) =>
  put('manifest.json', JSON.stringify(value));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'correctly-audit-'));
  writeManifest(manifest);
  put('service-worker.js', 'console;');
  put('content.js', 'void 0;');
  put('smart.js', 'void 0;');
  put('icons/icon-16.png', 'png');
  put('icons/icon-48.png', 'png');
  put('icons/icon-128.png', 'png');
  put(
    'src/options/options.html',
    '<link rel="icon" href="/icons/icon-48.png"><script type="module" src="/options.js"></script><a href="https://aistudio.google.com/apikey">x</a>',
  );
  put('options.js', 'export {};');
});

it('B01: the real source manifest passes on a well-formed dist', () => {
  expect(auditDist(dir).errors).toEqual([]);
});

it('B01: extra permissions, broad hosts and missing assets fail', () => {
  writeManifest({
    ...manifest,
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    options_page: 'missing.html',
  });
  const { errors } = auditDist(dir);
  expect(errors.join('\n')).toMatch(/permissions must be exactly/);
  expect(errors.join('\n')).toMatch(/host_permissions/);
  expect(errors.join('\n')).toMatch(/options page missing/);
});

it('V5.3: optional hosts and commands are allowlisted exactly', () => {
  writeManifest({
    ...manifest,
    optional_host_permissions: ['<all_urls>', 'file:///*'],
    commands: { 'correct-selection': {}, other: {} },
  });
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/optional_host_permissions must be exactly/);
  expect(text).toMatch(/commands must be exactly/);
});

it('V5.2: the on-click content script must be built', () => {
  rmSync(join(dir, 'content.js'));
  expect(auditDist(dir).errors.join('\n')).toMatch(/content script missing/);
});

it('B04: any content script or page-facing surface fails', () => {
  writeManifest({
    ...manifest,
    content_scripts: [{ matches: ['<all_urls>'], js: ['content-script.js'] }],
    web_accessible_resources: [],
  });
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/content_scripts/);
  expect(text).toMatch(/web_accessible_resources/);
});

it('B02: key-shaped strings and the test sentinel are detected', () => {
  put('chunks/a.js', 'const k="AIza' + 'B'.repeat(35) + '";');
  put('chunks/b.js', 'const k="CORRECTLY_TEST_SENTINEL_KEY_1";');
  put('.env', 'GEMINI_API_KEY=x');
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(
    /a\.js: contains something shaped like a Google API key/,
  );
  expect(text).toMatch(/b\.js: contains test key sentinel/);
  expect(text).toMatch(/forbidden file type in dist: \.env/);
});

it('B03: legacy localhost/LanguageTool/Java and binaries are detected', () => {
  put('chunks/old.js', 'fetch("http://127.0.0.1:8081/v2/check")');
  put('chunks/lt.js', 'const engine = "LanguageTool";');
  put('runtime/bin/javaw.exe', 'MZ');
  put('server.jar', 'PK');
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/127\.0\.0\.1/);
  expect(text).toMatch(/8081/);
  expect(text).toMatch(/LanguageTool/);
  expect(text).toMatch(/javaw\.exe/);
  expect(text).toMatch(/server\.jar/);
});

it('rejects eval and permissive CSP', () => {
  put('chunks/e.js', 'eval("1")');
  writeManifest({
    ...manifest,
    content_security_policy: {
      extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
    },
  });
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/eval\(\)/);
  expect(text).toMatch(/CSP/);
});

it('V5.7: exactly the two provider hosts, in permissions and CSP; key shapes are caught', () => {
  writeManifest({
    ...manifest,
    host_permissions: ['https://generativelanguage.googleapis.com/*'],
    content_security_policy: {
      extension_pages:
        "default-src 'self'; script-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com https://api.example.com",
    },
  });
  put('chunks/k.js', 'const k = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";');
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/host_permissions must be exactly/);
  expect(text).toMatch(/connect-src/);
  expect(text).toMatch(/OpenAI API key/);
});

it('V5.9: in-page anchors are links, not files; a missing file still fails', () => {
  put(
    'src/options/options.html',
    '<script type="module" src="/options.js"></script><a href="#statistics">x</a><a href="#usage-limits">y</a>',
  );
  expect(auditDist(dir).errors).toEqual([]);
  put(
    'src/options/options.html',
    '<script type="module" src="/missing.js"></script><a href="#statistics">x</a>',
  );
  expect(auditDist(dir).errors.join('\n')).toMatch(
    /options page asset missing: \/missing\.js/,
  );
});

it('5.14: the stable extension key is required; no private key ships', () => {
  writeManifest({ ...manifest, key: 'MIIBother' });
  expect(auditDist(dir).errors.join('\n')).toMatch(/manifest key must be/);
  const withoutKey = { ...manifest };
  delete withoutKey.key;
  writeManifest(withoutKey);
  expect(auditDist(dir).errors.join('\n')).toMatch(/manifest key must be/);
  writeManifest(manifest);
  put('extra.txt', '-----BEGIN PRIVATE KEY-----\nMIIE');
  put('correctly-key.pem', 'x');
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/extra\.txt: contains a private key/);
  expect(text).toMatch(/forbidden file type in dist: correctly-key\.pem/);
});

it('F10 (5.17): only the configured public Firebase key and the five hosts are allowed; no client secret', () => {
  const config = readFileSync(
    join(import.meta.dirname, '../../src/shared/cloud-config.ts'),
    'utf8',
  );
  const key = /apiKey:\s*'(AIza[0-9A-Za-z_-]{35})'/.exec(config)![1]!;
  put('chunks/cloud.js', `const k = "${key}";`);
  expect(auditDist(dir).errors).toEqual([]);

  put('chunks/other.js', 'const k = "AIza' + 'b'.repeat(35) + '";');
  expect(auditDist(dir).errors.join('\n')).toMatch(/other\.js.*Google API key/);
  rmSync(join(dir, 'chunks/other.js'));

  put('chunks/secret.js', 'const s = "GOCSPX-' + 'a1b2c3d4e5f6g7h8' + '";');
  expect(auditDist(dir).errors.join('\n')).toMatch(/OAuth client secret/);
  rmSync(join(dir, 'chunks/secret.js'));

  writeManifest({
    ...manifest,
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
    host_permissions: [
      ...(manifest.host_permissions as string[]),
      'https://example.com/*',
    ],
  });
  const text = auditDist(dir).errors.join('\n');
  expect(text).toMatch(/permissions must be exactly/);
  expect(text).toMatch(/host_permissions must be exactly/);
});

it('V7.1: captureVisibleTab is allowed in the worker only', () => {
  put('service-worker.js', 'chrome.tabs.captureVisibleTab(1);');
  expect(auditDist(dir).errors).toEqual([]);
  for (const file of ['content.js', 'smart.js', 'options.js']) {
    put(file, 'chrome.tabs.captureVisibleTab(1);');
    expect(auditDist(dir).errors.join()).toContain(
      `${file}: contains captureVisibleTab`,
    );
    put(file, 'void 0;');
  }
});
