// Action score + SFX as one piece (v5): E minor, 48 kHz stereo WAV. Written in story time (150 BPM, 104 s) and
// played SLOW times slower, like video.html: 100 BPM, 156 s. Note envelopes stay in real time.
// Times match video.html: section starts 0, 8, 20, 32, 41.2, 49.2, 62, 69.2, 73.2, 86, close 100.
import { writeFileSync } from 'node:fs';
const SLOW = 1.5, STORY = 104, SR = 48000, DUR = STORY * SLOW, N = Math.round(SR * DUR), BEAT = .4, BAR = 1.6;
const L = new Float32Array(N), R = new Float32Array(N), sendL = new Float32Array(N), sendR = new Float32Array(N);
const hz = m => 440 * 2 ** ((m - 69) / 12);
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(t0, len, fn, gain, pan = 0, send = .2) {
  const s0 = Math.floor(t0 * SLOW * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr; sendL[s0 + i] += v * gl * send; sendR[s0 + i] += v * gr * send;
  }
}
const inAny = (t, rs) => rs.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);

// Song map. Full groove everywhere except the intro, the slam cards, the freeze and the tail.
const SLAMS = [[10.4, 11.6], [20.0, 21.2], [32.0, 32.8], [41.2, 42.0], [49.2, 50.4], [62.0, 62.8], [69.2, 70.0], [73.2, 74.4], [86.0, 87.2], [92.4, 93.6], [100.0, 102.0]];
const FREEZE = [77.6, 78.4];
const GROOVE = [[3.2, 103.2]];
const grooveOn = t => inAny(t, GROOVE) && !inAny(t, SLAMS) && !inAny(t, [FREEZE]);
const DROPS = [3.2, ...SLAMS.flatMap(([a, b]) => [a, b])];

// Em – C – G – D, one chord per bar.
const PROG = [{ b: 40, c: [64, 67, 71] }, { b: 36, c: [64, 67, 72] }, { b: 43, c: [62, 67, 71] }, { b: 38, c: [62, 66, 69] }];
const chordAt = t => PROG[Math.floor(t / BAR + 1e-6) % 4];

// --- instruments
const kick = (t, g = .5) => add(t, .35, x => Math.sin(2 * Math.PI * (45 * x + 115 * (1 - Math.exp(-x * 28)) / 28)) * Math.exp(-x * 9) + rnd() * Math.exp(-x * 400) * .3, g, 0, .02);
const snare = (t, g = .26) => { let lp = 0; add(t, .3, x => { lp += .55 * (rnd() - lp); return (rnd() - lp) * Math.exp(-x * 13) + .6 * Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x * 30); }, g, .05, .35); };
const hat = (t, g = .05, pan = .3) => { let p = 0; add(t, .05, x => { const n = rnd(), y = n - p; p = n; return y * Math.exp(-x * 90); }, g, pan, .1); };
const tom = (t, m, g = .3) => add(t, .5, x => Math.sin(2 * Math.PI * hz(m) * x * (1 + .4 * Math.exp(-x * 20))) * Math.exp(-x * 7), g, 0, .3);
function bassNote(t, m, len, g = .2) {
  const f = hz(m); let ph = 0, lp = 0;
  add(t, len, x => { ph += f / SR; const saw = 2 * (ph % 1) - 1, sq = ph % 1 < .5 ? 1 : -1; lp += (.08 + .25 * Math.exp(-x * 18)) * ((saw + .5 * sq) - lp); return Math.tanh(lp * 2.5) * Math.min(1, x / .004) * Math.min(1, (len - x) / .02); }, g, 0, .03);
}
function stab(t, notes, g = .07, len = .22) {
  for (const [j, m] of notes.entries()) for (const det of [-.1, .1]) {
    const f = hz(m + det); let ph = j * .2, lp = 0;
    add(t, len, x => { ph += f / SR; lp += .35 * Math.exp(-x * 6) * ((2 * (ph % 1) - 1) - lp); return lp * Math.min(1, x / .003) * Math.exp(-x * 7); }, g, det < 0 ? -.45 : .45, .3);
  }
}
const pluck = (t, m, g = .04, pan = 0, send = .35) => { const f = hz(m); add(t, .5, x => (Math.sin(2 * Math.PI * f * x) + .4 * Math.sin(4 * Math.PI * f * x) + .15 * Math.sin(6 * Math.PI * f * x)) * Math.exp(-x * 11) * Math.min(1, x / .002), g, pan, send); };
const bell = (t, m, g = .05, len = 1.5) => add(t, len, x => (Math.sin(2 * Math.PI * hz(m) * x) + .3 * Math.sin(2 * Math.PI * hz(m) * 2.76 * x) * Math.exp(-x * 9)) * Math.exp(-x * 3) * Math.min(1, x / .003), g, .1, .5);
function impact(t, g = 1) {
  add(t, 1.6, x => Math.sin(2 * Math.PI * (30 * x + 60 * (1 - Math.exp(-x * 6)) / 6)) * Math.exp(-x * 2.6) * Math.min(1, x / .003), .55 * g, 0, .05);
  let lp = 0; add(t, 1.4, x => { lp += .3 * (rnd() - lp); return (rnd() * .5 + lp) * Math.exp(-x * 3.2); }, .22 * g, 0, .7);
  kick(t, .5 * g);
}
function riser(t, len, g = .12) {
  let lp = 0, ph = 0;
  len *= SLOW; // spans a story interval
  add(t, len, x => { const k = x / len; lp += (.01 + .5 * k * k) * (rnd() - lp); ph += hz(52 + 30 * k) / SR; return (lp * 1.4 + .25 * Math.sin(2 * Math.PI * ph)) * k * k; }, g, 0, .5);
}
const whoosh = (t, len, g) => { let lp = 0; len *= SLOW; add(t, len, x => { lp += (.03 + .4 * (x / len)) * (rnd() - lp); return lp * Math.sin(Math.PI * x / len) ** 2; }, g, 0, .5); };
const tick = (t, g = .08) => { let lp = 0; add(t, .03, x => { lp += .4 * (rnd() - lp); return lp * Math.exp(-x * 200); }, g, .2, .1); };
const glitch = (t, g = .07) => add(t, .14, x => (Math.floor(x * 900) % 2 ? 1 : -1) * (Math.floor(x * 70) % 2) * Math.exp(-x * 14), g, -.2, .15);
function roll(a, b, g = .16) { // snare roll accelerating from 8ths to 32nds
  let t = a; while (t < b) { const k = (t - a) / (b - a); snare(t, g * (.4 + .6 * k)); t += .2 * (1 - k) + .05 * k; }
}
const typing = (a, b, g = .05) => { for (let t = a, i = 0; t < b; t += .068 + (i % 3) * .008, i++) tick(t, g); };
const sparkle = (t, g = .045) => { for (const [i, m] of [88, 91, 95].entries()) bell(t + i * .08, m, g, 1.2); };

// --- intro (0–3.2): pulse builds, word hits, roll and riser into the logo drop
for (let i = 0; i < 16; i++) { const t = i * .2; const k = t / 3.2; bassNote(t, 40, .14, .06 + .1 * k); hat(t + .1, .02 + .04 * k); }
for (const t of [.4, 1.2, 2.0]) { tom(t, 40, .32); stab(t, PROG[0].c, .05, .3); kick(t, .35); }
riser(1.6, 1.55, .14); roll(2.4, 3.1, .15);

// --- groove
for (let t = 0; t < STORY - 1e-6; t = +(t + BEAT / 2).toFixed(4)) {
  const beat = Math.round(t / BEAT * 2) / 2, onBeat = Number.isInteger(beat);
  if (!grooveOn(t)) continue;
  const c = chordAt(t), inBar = Math.round(((t % BAR) / (BEAT / 2))) % 8; // 8th index in the bar
  if (onBeat) { kick(t, .45); if (beat % 2 === 1) snare(t, .24); }
  hat(t, onBeat ? .025 : .05, onBeat ? -.25 : .3);
  hat(t + .1, .018, .35);
  bassNote(t, c.b + ([0, 0, 12, 0, 0, 12, 0, 7][inBar]), .18, .17);
  if ([0, 3, 6].includes(inBar)) stab(t, c.c, inBar === 0 ? .06 : .045);
}
// 16th arpeggio in the feature scenes
for (let t = 8.0; t < 100.0 - 1e-6; t = +(t + .1).toFixed(4)) {
  if (!grooveOn(t)) continue;
  const c = chordAt(t), i = Math.round(t / .1) % 4, m = [c.c[0], c.c[1], c.c[2], c.c[1] + 12][i] + 12;
  pluck(t, m, .02, i % 2 ? .4 : -.4, .25);
}

// --- slams: impact on entry and exit, kick hits on the beat, riser + roll into the return
for (const t of DROPS) impact(t, t === 3.2 || t === 102.0 ? 1.2 : .8);
for (const [a, b] of SLAMS) {
  for (let t = a; t < b - 1e-6; t += BEAT) { kick(t, .4); stab(t, chordAt(a).c.map(m => m - 12), .05, .35); }
  if (b - a > .9) { riser(b - 1.0, .95, .12); roll(b - .6, b - .05, .13); }
  roll(a - .55, a - .02, .11); // fill into each card
}
for (const t of [100.4, 100.8, 101.2, 101.6]) impact(t, .55);
riser(6.4, 1.55, .1); riser(98.4, 1.55, .09);

// --- freeze (77.6): the band stops dead, a shutter, a frozen shimmer, the groove returns on the bar
{ let lp = 0; add(77.6, .09, x => { lp += .6 * (rnd() - lp); return (rnd() - lp) * Math.exp(-x * 60); }, .32, 0, .3); }
add(77.6, .9, x => Math.sin(2 * Math.PI * (55 * x - 20 * x * x)) * Math.exp(-x * 4), .35, 0, .1);
for (const m of [76, 83, 88]) add(77.62, .8, x => Math.sin(2 * Math.PI * hz(m) * x) * (1 + .3 * Math.sin(2 * Math.PI * 9 * x)) * Math.min(1, x / .02) * Math.exp(-x * 2.5), .028, m % 2 ? .3 : -.3, .8);
roll(77.95, 78.38, .1);

// --- finale: hit at 103.2, chord rings out
impact(103.2, .9);
for (const m of [52, 59, 64, 67, 71]) add(103.2, .8, x => Math.sin(2 * Math.PI * hz(m) * x) * Math.exp(-x * 1.5) * Math.min(1, x / .005), .05, 0, .7);
stab(103.2, [52, 59, 64, 67, 71], .08, .6);

// --- UI sound design, in key
const SEG = [['Salut Claire, je suis allé ', 0], ['a', 1], [' la réunion ', 0], ['hier mais', 1], [' j’ai ', 0], ['oublier', 1], [' le ', 0], ['fichié', 1], ['.', 0]];
const TOTAL = SEG.reduce((n, s) => n + s[0].length, 0);
{ let i = 0; for (const [s, e] of SEG) { i += s.length; if (e) glitch(8.45 + 1.4 * Math.min(1, (i + 2) / TOTAL)); } }
typing(8.47, 9.85, .06); whoosh(9.9, .45, .05);                                   // mail typed, selected
const CLICKS = [12.4, 25.0, 26.2, 31.0, 33.05, 33.6, 34.0, 34.3, 34.8, 36.8, 38.8, 42.05, 42.75, 44.0, 44.4, 46.75, 47.0, 47.2, 47.4, 47.6,
  51.8, 57.2, 64.55, 64.95, 65.2, 65.6, 68.2, 75.8, 77.2, 83.75, 84.25, 94.3, 96.6];
const NOTES = [76, 79, 83, 79, 81, 76, 83, 88];
CLICKS.forEach((t, i) => { tick(t, .07); pluck(t, NOTES[i % NOTES.length] + 12, .03, .1); });
for (const [i, m] of [76, 79, 83, 88].entries()) pluck(13.5 + i * .2, m, .03, .2);   // corrected words pop
for (const [t, m] of [[17.62, 83], [17.72, 88], [17.82, 91]]) bell(t, m, .045);          // Apply
typing(21.3, 23.15, .045);                                                           // real-time typing
for (const [t, m] of [[23.65, 71], [23.8, 74], [23.95, 71]]) pluck(t, m, .03, -.3);  // underlines appear
bell(26.22, 88, .04); bell(28.33, 83, .045); bell(28.43, 88, .04); sparkle(31.02, .035);
for (const [i, m] of [76, 79, 83].entries()) { whoosh(35.16 + i * .4, .2, .035); pluck(35.2 + i * .4, m, .03, -.2); }
for (const [i, m] of [76, 78, 79, 81, 83].entries()) pluck(39.1 + i * .31, m + 12, .03, .25); // formality slider 1 → 5
typing(43.0, 43.85, .03);                                                            // language list scroll
typing(44.95, 46.1, .04); typing(48.0, 49.0, .04);                                   // translations typed
whoosh(50.6, .5, .045); pluck(51.2, 83, .03); pluck(51.9, 79, .025); bell(52.37, 88, .04); // bubble
whoosh(55.8, .8, .045); pluck(56.7, 83, .03); typing(57.8, 58.9, .035);
whoosh(63.6, .7, .045);
for (const [i, m] of [76, 79, 83].entries()) { whoosh(66.36 + i * .4, .2, .035); pluck(66.4 + i * .4, m, .03, -.2); }
sparkle(68.22, .035);
typing(70.1, 70.45, .07); sparkle(70.6); typing(70.9, 71.15, .07); sparkle(71.3);    // text shortcuts
whoosh(78.3, 1.55, .04); tick(80.0, .08);                                            // area drag, release
typing(81.6, 82.5, .045); typing(84.65, 85.5, .04);
for (const [i, t] of [87.2, 88.0, 88.8, 89.6, 90.4, 91.2].entries()) { whoosh(t - .1, .25, .05); pluck(t, NOTES[i] + 12, .03, .2); } // settings pages
sparkle(96.85, .04); bell(98.4, 76, .05, 1.4); bell(98.4, 83, .04, 1.4);            // saved, lock
for (const [i, m] of [76, 79, 83, 88].entries()) pluck(102.5 + i * .08, m, .03, .2);  // outro chips
bell(102.65, 88, .05); bell(102.65, 83, .04);                                         // CTA

// Reverb on the send bus (Schroeder: 4 combs + 2 all-passes per side).
function verb(inp, off) {
  const out = new Float32Array(N);
  for (const [d, g] of [[1557, .78], [1617, .77], [1491, .79], [1422, .76]]) {
    const len = Math.round((d + off) * SR / 44100), buf = new Float32Array(len); let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const y = buf[p]; lp = .55 * lp + .45 * y; buf[p] = inp[i] + lp * g; p = (p + 1) % len; out[i] += y * .25; }
  }
  for (const d of [225, 556]) {
    const len = d + off, buf = new Float32Array(len); let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p], x = out[i]; const y = -x + b; buf[p] = x + b * .5; out[i] = y; p = (p + 1) % len; }
  }
  return out;
}
const vL = verb(sendL, 0), vR = verb(sendR, 23);

// Master: sum, glue (tanh), short tail fade, normalize to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / .02) * Math.min(1, (DUR - t) / .7);
  L[i] = Math.tanh((L[i] + vL[i] * .8) * 1.5) * fade; R[i] = Math.tanh((R[i] + vR[i] * .8) * 1.5) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak, data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(L[i] * norm * 32767), 44 + i * 4); data.writeInt16LE(Math.round(R[i] * norm * 32767), 46 + i * 4); }
writeFileSync(process.argv[2] ?? 'music-v5.wav', data);
console.log('peak', peak.toFixed(3));
