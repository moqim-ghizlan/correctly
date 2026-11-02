// Throwaway spike (V6.1.1, WP0). Plain JS, no dependency, never shipped.
// [input sentence, expected corrected sentence]; 24 wrong + 6 already right.
const SENTENCES = [
  ['Je suis aller a Lyon.', 'Je suis allé à Lyon.'],
  ['Les chat mange la souris.', 'Les chats mangent la souris.'],
  ['Il a manger tout le gateau.', 'Il a mangé tout le gâteau.'],
  [
    'Elle est très contente de sont voyage.',
    'Elle est très contente de son voyage.',
  ],
  ['Ces enfants ont perdu ses clés.', 'Ces enfants ont perdu leurs clés.'],
  ['Nous avons mangés des pommes.', 'Nous avons mangé des pommes.'],
  ['Il faut que tu viens demain.', 'Il faut que tu viennes demain.'],
  ['Je pense que sa va marcher.', 'Je pense que ça va marcher.'],
  ['Il et parti hier soir.', 'Il est parti hier soir.'],
  ['Mes amis sont arriver en retard.', 'Mes amis sont arrivés en retard.'],
  [
    'La voiture que j’ai acheté est rouge.',
    'La voiture que j’ai achetée est rouge.',
  ],
  ['Elle a oublier son parapluie.', 'Elle a oublié son parapluie.'],
  [
    'Je ne sais pas ce que tu veux dires.',
    'Je ne sais pas ce que tu veux dire.',
  ],
  ['Tout les jours, il prend le train.', 'Tous les jours, il prend le train.'],
  [
    'Nous irons à la plage si il fait beau.',
    'Nous irons à la plage s’il fait beau.',
  ],
  ['Il ne veut pas qu’on le déranges.', 'Il ne veut pas qu’on le dérange.'],
  ['Les fleurs sont très jolie.', 'Les fleurs sont très jolies.'],
  [
    'Je voudrais un renseignement s’il vous plait.',
    'Je voudrais un renseignement, s’il vous plaît.',
  ],
  ['Hier, nous sommes aller au cinéma.', 'Hier, nous sommes allés au cinéma.'],
  [
    'Elle a pris la voiture de son frere.',
    'Elle a pris la voiture de son frère.',
  ],
  ['Ils ont finit leurs devoirs.', 'Ils ont fini leurs devoirs.'],
  ['Je suis desolé pour le retard.', 'Je suis désolé pour le retard.'],
  [
    'Quand il pleut, je reste a la maison.',
    'Quand il pleut, je reste à la maison.',
  ],
  ['Ses parents et lui son partis.', 'Ses parents et lui sont partis.'],
  [
    'Les élèves qui ont réussit sont contents.',
    'Les élèves qui ont réussi sont contents.',
  ],
  [
    'Bonjour, je suis content de vous voir.',
    'Bonjour, je suis content de vous voir.',
  ],
  ['Les enfants jouent dans le jardin.', 'Les enfants jouent dans le jardin.'],
  [
    'Nous avons visité plusieurs musées à Paris.',
    'Nous avons visité plusieurs musées à Paris.',
  ],
  [
    'Elle a acheté des pommes et des poires.',
    'Elle a acheté des pommes et des poires.',
  ],
  ['Il fait très beau aujourd’hui.', 'Il fait très beau aujourd’hui.'],
];

const out = document.getElementById('out');
const log = (text) => (out.textContent += `\n${text}`);
document.getElementById('browser').textContent = navigator.userAgent;

const probeInTab = async () => probeBuiltInAi();

document.getElementById('contexts').onclick = async () => {
  out.textContent = 'Contexts:';
  log('extension page: ' + JSON.stringify(await probeInTab()));
  log(
    'service worker: ' +
      JSON.stringify(
        await chrome.runtime.sendMessage({ type: 'probe-worker' }),
      ),
  );
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Spike: probe the built-in AI in an offscreen document.',
    });
  } catch (error) {
    log('offscreen create: ' + String(error));
  }
  log(
    'offscreen: ' +
      JSON.stringify(
        await chrome.runtime.sendMessage({ type: 'probe-offscreen' }),
      ),
  );
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: ['https://*/*'],
  });
  if (!tab?.id)
    return log('content script: activate an https tab, then click again');
  for (const world of ['ISOLATED', 'MAIN']) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world,
        func: () => ({
          Proofreader: typeof Proofreader,
          LanguageModel: typeof LanguageModel,
        }),
      });
      log(`content script ${world}: ` + JSON.stringify(res?.result));
    } catch (error) {
      log(`content script ${world}: ${String(error)}`);
    }
  }
};

async function createEngine() {
  const monitor = (m) =>
    m.addEventListener('downloadprogress', (e) =>
      log(`download ${Math.round(e.loaded * 100)} %`),
    );
  if (typeof Proofreader !== 'undefined') {
    const p = await Proofreader.create({
      expectedInputLanguages: ['fr'],
      monitor,
    });
    return {
      name: 'Proofreader',
      run: async (text) => (await p.proofread(text)).correctedInput,
    };
  }
  if (typeof LanguageModel !== 'undefined') {
    const session = await LanguageModel.create({
      expectedInputs: [{ type: 'text', languages: ['fr'] }],
      expectedOutputs: [{ type: 'text', languages: ['fr'] }],
      initialPrompts: [
        {
          role: 'system',
          content:
            'Correct the French sentence. Reply with the corrected sentence only.',
        },
      ],
      monitor,
    });
    return {
      name: 'Prompt API',
      run: async (text) => (await (await session.clone()).prompt(text)).trim(),
    };
  }
  throw new Error('No built-in AI API in this browser');
}

let engine;
document.getElementById('download').onclick = async () => {
  const t0 = performance.now();
  engine = await createEngine();
  log(
    `${engine.name} ready after ${Math.round(performance.now() - t0)} ms (size: chrome://on-device-internals)`,
  );
};

document.getElementById('bench').onclick = async () => {
  engine ??= await createEngine();
  const times = [];
  const rows = [];
  let fixed = 0;
  let wrong = 0;
  let falsePositives = 0;
  let right = 0;
  for (const [input, expected] of SENTENCES) {
    const t0 = performance.now();
    const got = await engine.run(input);
    times.push(performance.now() - t0);
    if (input !== expected) {
      wrong++;
      if (got === expected) fixed++;
    } else {
      right++;
      if (got !== input) falsePositives++;
    }
    rows.push({ input, expected, got, ok: got === expected });
  }
  times.sort((a, b) => a - b);
  const pct = (p) =>
    Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))]);
  log(
    `${engine.name}: exact fixes ${fixed}/${wrong}, false positives ${falsePositives}/${right}`,
  );
  log(`latency p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms`);
  log(JSON.stringify(rows, null, 1));
};
