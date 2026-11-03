// node capture.mjs <outDir> [t1,t2,...]   — no times = all frames at 30 fps for 21 s
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = import.meta.dirname;
const [outDir, times] = process.argv.slice(2);
const FPS = 30, DUR = 57.6;
const list = times ? times.split(',').map(Number) : Array.from({ length: Math.round(FPS * DUR) }, (_, i) => i / FPS);
await mkdir(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try { const body = await readFile(join(DIR, decodeURIComponent(req.url.split('?')[0]))); res.writeHead(200, { 'content-type': TYPES[extname(req.url)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const port = server.address().port;

const profile = await mkdtemp(join(tmpdir(), 'brag-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${profile}`, '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1920,1080', '--force-color-profile=srgb', 'about:blank']);
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9337/json')).json(); if (targets.some(t => t.type === 'page')) break; } catch {}
  await new Promise(r => setTimeout(r, 200));
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;

await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/video.html` });
for (let i = 0; i < 100; i++) { const v = await ev('window.ready ? window.ready.then(() => 1) : 0'); if (v?.result?.value === 1) break; await new Promise(r => setTimeout(r, 100)); }

for (let i = 0; i < list.length; i++) {
  const t = list[i];
  const res = await ev(`(window.renderAt(${t}), new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))))`);
  if (res.exceptionDetails) { console.error(t, JSON.stringify(res.exceptionDetails)); process.exit(1); }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const name = times ? `still-${t.toFixed(2)}.png` : `f${String(i).padStart(4, '0')}.png`;
  await writeFile(join(outDir, name), Buffer.from(shot.result.data, 'base64'));
  if (!times && i % 60 === 0) console.log('frame', i);
}
ws.close(); chrome.kill(); server.close();
