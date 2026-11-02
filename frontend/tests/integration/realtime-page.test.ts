import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RealtimeCorrection,
  realtimeField,
  readEditable,
  type Measure,
} from '../../src/content/realtime';
import { CHECK_TEXT } from '../../src/shared/contracts';
import {
  CheckFailure,
  PAUSE_MS,
  type RealtimeIssue,
} from '../../src/shared/realtime';

// V6.1.3: page side of real-time correction (catalog R4, R8, R10 + flow).
// jsdom has no layout: positions come from an injected measure function.

const SENTENCE = 'Je suis aller a Lyon.';
const ISSUE = {
  original: 'aller',
  suggestions: ['allé'],
  kind: 'grammar' as const,
};
const issueIn = (text: string, issue = ISSUE): RealtimeIssue => {
  const start = text.indexOf(issue.original);
  return { ...issue, start, end: start + issue.original.length };
};
const CHAR = 8;
const measure: Measure = (_field, start, end) => [
  { left: start * CHAR, top: 10, width: (end - start) * CHAR, height: 16 },
];

let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let feature: RealtimeCorrection | null;

const make = (options = {}) =>
  (feature = new RealtimeCorrection(document, {
    locale: 'en',
    engine: 'api',
    send,
    pauseMs: PAUSE_MS,
    trusted: () => true,
    measure,
    ...options,
  }));

const answer = (text: string, issues: RealtimeIssue[]) =>
  send.mockResolvedValueOnce({
    ok: true,
    // The worker answers sentence-relative issues.
    issues: issues.map((i) => ({
      ...i,
      start: i.start - text.indexOf(SENTENCE),
      end: i.end - text.indexOf(SENTENCE),
    })),
  });

const textarea = (value = '') => {
  const field = document.createElement('textarea');
  field.value = value;
  document.body.append(field);
  return field;
};
const focus = (el: Element) => {
  (el as HTMLElement).focus();
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
};
const type = (field: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  field.value = value;
  field.setSelectionRange(value.length, value.length);
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
};
const settle = (ms = PAUSE_MS) => vi.advanceTimersByTimeAsync(ms);
const hover = (x: number, y: number) =>
  document.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }),
  );
const overWord = (issue: RealtimeIssue) => hover(issue.start * CHAR + 2, 18);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  send = vi.fn(() => Promise.resolve({ ok: true, issues: [] }));
  feature = null;
});

afterEach(() => {
  feature?.dispose();
  vi.useRealTimers();
});

describe('R4: excluded fields', () => {
  const build = (
    html: string,
    selector = 'input,textarea,[contenteditable]',
  ) => {
    document.body.innerHTML = html;
    return document.body.querySelector<HTMLElement>(selector)!;
  };

  it.each([
    ['password', '<input type="password">'],
    ['autocomplete email', '<input type="text" autocomplete="email">'],
    [
      'autocomplete one-time-code',
      '<input type="text" autocomplete="one-time-code">',
    ],
    ['autocomplete cc-number', '<input type="text" autocomplete="cc-number">'],
    ['OTP label', '<input type="text" name="otp-code">'],
    ['card label', '<input type="text" aria-label="Card number">'],
    ['secret label', '<textarea id="api-secret"></textarea>'],
    ['numeric input mode', '<input type="text" inputmode="numeric">'],
    ['spellcheck off', '<textarea spellcheck="false"></textarea>'],
    ['aria-hidden', '<div aria-hidden="true"><textarea></textarea></div>'],
    ['inert', '<div inert><textarea></textarea></div>'],
    ['disabled', '<textarea disabled></textarea>'],
    ['read-only', '<textarea readonly></textarea>'],
    ['email type', '<input type="email">'],
    ['search type', '<input type="search">'],
    ['number type', '<input type="number">'],
    ['Monaco', '<div class="monaco-editor"><textarea></textarea></div>'],
    [
      'CodeMirror',
      '<div class="cm-editor"><div contenteditable="true"></div></div>',
    ],
    ['Ace', '<div class="ace_editor"><textarea></textarea></div>'],
    ['pre/code', '<pre><div contenteditable="true"></div></pre>'],
    ['secret contenteditable', '<div contenteditable="true" id="token"></div>'],
    ['not editable', '<div contenteditable="false"></div>'],
    ['plain div', '<div></div>'],
  ])('%s: not a field', (_name, html) => {
    expect(realtimeField(build(html))).toBeNull();
  });

  it.each([
    ['textarea', '<textarea></textarea>'],
    ['text input', '<input type="text">'],
    ['input without type', '<input>'],
    ['contenteditable', '<div contenteditable="true"></div>'],
    [
      'rich editor host',
      '<div contenteditable="true" class="ProseMirror"></div>',
    ],
    ['autocomplete off', '<textarea autocomplete="off"></textarea>'],
  ])('%s: eligible', (_name, html) => {
    expect(realtimeField(build(html))).not.toBeNull();
  });

  it('typing in an excluded field sends nothing', async () => {
    make();
    const field = document.createElement('input');
    field.type = 'text';
    field.setAttribute('autocomplete', 'email');
    document.body.append(field);
    focus(field);
    type(field, 'Je suis aller a Lyon.');
    await settle(PAUSE_MS * 3);
    expect(send).not.toHaveBeenCalled();
    expect(feature!.underlines).toHaveLength(0);
  });

  it('focusing a field with text sends nothing until the user types', async () => {
    make();
    focus(textarea(SENTENCE));
    await settle(PAUSE_MS * 3);
    expect(send).not.toHaveBeenCalled();
  });

  it('untrusted (script-made) input events are ignored', async () => {
    make({ trusted: () => false });
    const field = textarea();
    focus(field);
    type(field, SENTENCE);
    await settle(PAUSE_MS * 3);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('flow: type → pause → underline → Replace', () => {
  it('underlines the word, shows the card, replaces exactly that word', async () => {
    make();
    const field = textarea();
    focus(field);
    const issue = issueIn(SENTENCE);
    answer(SENTENCE, [issue]);
    type(field, SENTENCE);
    await settle(0); // sentence end: checked at once
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: CHECK_TEXT,
      text: SENTENCE,
      context: '',
    });
    expect(feature!.underlines).toHaveLength(1);
    const mark = feature!.underlines[0]!;
    expect(mark.dataset.kind).toBe('grammar');
    expect(mark.style.left).toBe(`${issue.start * CHAR}px`);
    expect(mark.style.width).toBe(`${5 * CHAR}px`);

    overWord(issue);
    const card = feature!.currentCard!;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Grammar');
    expect(card.textContent).toContain('aller');
    const inputs = vi.fn();
    field.addEventListener('input', inputs);
    field.setSelectionRange(SENTENCE.length, SENTENCE.length);
    card.querySelector('button')!.click();
    await settle(0);
    expect(field.value).toBe('Je suis allé a Lyon.');
    // The caret stays after the same text, shifted by the replacement.
    expect(field.selectionStart).toBe('Je suis allé a Lyon.'.length);
    expect(inputs).toHaveBeenCalled();
    expect(feature!.currentCard).toBeNull();
  });

  it('the card stays while the pointer is on it (even after a direct jump from the word)', async () => {
    make();
    const field = textarea();
    focus(field);
    const issue = issueIn(SENTENCE);
    answer(SENTENCE, [issue]);
    type(field, SENTENCE);
    await settle(0);
    overWord(issue);
    const card = feature!.currentCard!;
    // Straight from the word onto the card, then still moving over it.
    card.dispatchEvent(new MouseEvent('mouseenter'));
    card.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        composed: true,
        clientX: 900,
        clientY: 900,
      }),
    );
    await settle(2000);
    expect(feature!.currentCard).toBe(card);
    card.querySelector('button')!.click();
    await settle(0);
    expect(field.value).toBe('Je suis allé a Lyon.');
  });

  it('Replace all fixes every mistake of the sentence, each range re-checked', async () => {
    make();
    const field = textarea();
    focus(field);
    const text = 'Les chat mange la souris.';
    const issues = [
      { original: 'chat', suggestions: ['chats'], kind: 'grammar' as const },
      { original: 'mange', suggestions: ['mangent'], kind: 'grammar' as const },
    ].map((i) => issueIn(text, i));
    send.mockResolvedValueOnce({
      ok: true,
      issues,
    });
    type(field, text);
    await settle(0);
    expect(feature!.underlines).toHaveLength(2);
    overWord(issues[0]!);
    const card = feature!.currentCard!;
    const all = [...card.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Replace all'),
    )!;
    expect(all.textContent).toBe('Replace all (2)');
    all.click();
    await settle(0);
    expect(field.value).toBe('Les chats mangent la souris.');
  });

  it('Replace all skips a word that changed instead of guessing', async () => {
    make();
    const field = textarea();
    focus(field);
    const text = 'Les chat mange la souris.';
    const issues = [
      { original: 'chat', suggestions: ['chats'], kind: 'grammar' as const },
      { original: 'mange', suggestions: ['mangent'], kind: 'grammar' as const },
    ].map((i) => issueIn(text, i));
    send.mockResolvedValueOnce({ ok: true, issues });
    type(field, text);
    await settle(0);
    overWord(issues[0]!);
    const card = feature!.currentCard!;
    field.value = 'Les chaT mange la souris.';
    [...card.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Replace all'))!
      .click();
    await settle(0);
    expect(field.value).toBe('Les chaT mangent la souris.');
  });

  it('Tab walks the choices and Enter applies the selected one', async () => {
    make();
    const field = textarea();
    focus(field);
    const issue = issueIn(SENTENCE, {
      original: 'aller',
      suggestions: ['allé', 'allez'],
      kind: 'grammar',
    });
    send.mockResolvedValueOnce({
      ok: true,
      issues: [issue].map((i) => ({ ...i })),
    });
    type(field, SENTENCE);
    await settle(0);
    const key = (init: KeyboardEventInit) =>
      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    key({ key: 'ArrowDown', altKey: true, shiftKey: true });
    key({ key: 'Tab' });
    expect(
      feature!.currentCard!.querySelectorAll('button.sel')[0]?.textContent,
    ).toContain('allez');
    key({ key: 'Enter' });
    await settle(0);
    expect(field.value).toBe('Je suis allez a Lyon.');
  });

  it('R8: outdated — the word changed meanwhile: nothing replaced, checked again', async () => {
    make();
    const field = textarea();
    focus(field);
    const issue = issueIn(SENTENCE);
    answer(SENTENCE, [issue]);
    type(field, SENTENCE);
    await settle(0);
    overWord(issue);
    const card = feature!.currentCard!;
    // Changed without the page noticing (no input event).
    field.value = 'Je suis allez a Lyon.';
    card.querySelector('button')!.click();
    await settle(0);
    expect(field.value).toBe('Je suis allez a Lyon.');
    expect(card.textContent).toContain('The text changed');
    await settle(PAUSE_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('R8: keyboard — Alt+Shift+↓ opens the card, Enter replaces, Esc closes', async () => {
    make();
    const field = textarea();
    focus(field);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    type(field, SENTENCE);
    await settle(0);
    const key = (init: KeyboardEventInit) =>
      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    key({ key: 'ArrowDown', altKey: true, shiftKey: true });
    expect(feature!.currentCard).not.toBeNull();
    key({ key: 'Escape' });
    expect(feature!.currentCard).toBeNull();
    key({ key: 'ArrowDown', altKey: true, shiftKey: true });
    key({ key: 'Enter' });
    await settle(0);
    expect(field.value).toBe('Je suis allé a Lyon.');
  });

  it('R8: a contenteditable only gets "Copy" and is never rewritten', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    make();
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.textContent = SENTENCE;
    document.body.append(host);
    focus(host);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    host.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await settle(0);
    expect(feature!.underlines).toHaveLength(1);
    overWord(issueIn(SENTENCE));
    const card = feature!.currentCard!;
    const button = card.querySelector('button')!;
    expect(button.textContent).toContain('Copy');
    button.click();
    await settle(0);
    expect(writeText).toHaveBeenCalledWith('allé');
    expect(host.textContent).toBe(SENTENCE);
    expect(card.textContent).toContain('Copied');
  });
});

describe('R10: overlay', () => {
  it('never changes the page or the field', async () => {
    const field = textarea();
    const before = document.body.innerHTML;
    make();
    focus(field);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    type(field, SENTENCE);
    await settle(0);
    overWord(issueIn(SENTENCE));
    const after = document.body.innerHTML.replace(/ ?></g, '><');
    expect(after).toBe(before.replace(/ ?></g, '><'));
    expect(field.outerHTML).toBe('<textarea></textarea>');
    // Everything lives in one closed root under <html>.
    expect(feature!.host.shadowRoot).toBeNull();
    expect(feature!.host.parentElement).toBe(document.documentElement);
  });

  it('contenteditable keeps its markup', async () => {
    make();
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    host.innerHTML = `${SENTENCE}<br>Second line`;
    document.body.append(host);
    const html = host.innerHTML;
    focus(host);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    host.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await settle(0);
    expect(host.innerHTML).toBe(html);
  });

  it('repositions on scroll and resize, with no extra request', async () => {
    let shift = 0;
    make({
      measure: (...args: Parameters<Measure>) =>
        measure(...args).map((r) => ({ ...r, top: r.top + shift })),
    });
    const field = textarea();
    focus(field);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    type(field, SENTENCE);
    await settle(0);
    const mark = feature!.underlines[0]!;
    const top = mark.style.top;
    shift = 40;
    document.dispatchEvent(new Event('scroll'));
    await settle(50);
    expect(feature!.underlines[0]!.style.top).not.toBe(top);
    shift = 80;
    window.dispatchEvent(new Event('resize'));
    await settle(50);
    expect(feature!.underlines[0]!.style.top).toBe(`${10 + 80 + 16 - 3}px`);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('removed on blur, and the cache shows them again on refocus without a request', async () => {
    make();
    const field = textarea();
    focus(field);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    type(field, SENTENCE);
    await settle(0);
    expect(feature!.underlines).toHaveLength(1);
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(feature!.underlines).toHaveLength(0);
    focus(field);
    expect(feature!.underlines).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('removed with the page (pagehide)', () => {
    make();
    window.dispatchEvent(new Event('pagehide'));
    expect(feature!.host.isConnected).toBe(false);
  });

  it('typing on the underlined word removes its underline at once', async () => {
    make();
    const field = textarea();
    focus(field);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    type(field, SENTENCE);
    await settle(0);
    type(field, 'Je suis allez a Lyon.');
    expect(feature!.underlines).toHaveLength(0);
  });
});

describe('R11 in the page: IME', () => {
  it('nothing is sent until compositionend', async () => {
    make();
    const field = textarea();
    focus(field);
    field.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true }),
    );
    type(field, 'Les chat mange.');
    await settle(PAUSE_MS * 3);
    expect(send).not.toHaveBeenCalled();
    field.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true }),
    );
    await settle(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('failures are silent', () => {
  it('a refused check (limit, no consent) draws nothing and breaks nothing', async () => {
    send.mockResolvedValue({ ok: false, code: 'QUOTA_EXCEEDED' });
    make();
    const field = textarea();
    focus(field);
    type(field, SENTENCE);
    await settle(PAUSE_MS);
    expect(feature!.underlines).toHaveLength(0);
    type(field, SENTENCE + ' Encore une phrase.');
    await settle(PAUSE_MS);
    expect(send).toHaveBeenCalled();
  });
});

describe('readEditable', () => {
  it('splits lines at <br> and blocks, keeps indices of text nodes', () => {
    const host = document.createElement('div');
    host.innerHTML = 'One<br>Two<div>Three</div>Four';
    const { text, segments } = readEditable(host);
    expect(text).toBe('One\nTwo\nThree\nFour');
    for (const s of segments)
      expect(text.slice(s.start, s.end)).toBe(s.node.data);
  });
});

describe('V6.1.4: engines', () => {
  const localEngine = (check: ReturnType<typeof vi.fn>) => ({
    check: check as never,
    status: () => Promise.resolve('ready' as const),
  });

  it('R5: auto mode uses the local engine and sends nothing anywhere', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const issue = issueIn(SENTENCE);
    const check = vi.fn(() =>
      Promise.resolve([{ ...issue, start: issue.start, end: issue.end }]),
    );
    make({ engine: 'auto', localEngine: localEngine(check) });
    const field = textarea();
    focus(field);
    type(field, SENTENCE);
    await settle(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(feature!.underlines).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('auto mode without a local engine: a badge, nothing sent', async () => {
    const check = vi.fn(() =>
      Promise.reject(new CheckFailure('ENGINE_UNAVAILABLE')),
    );
    make({ engine: 'auto', localEngine: localEngine(check) });
    const field = textarea();
    focus(field);
    type(field, SENTENCE);
    await settle(0);
    expect(send).not.toHaveBeenCalled();
    expect(feature!.currentBadge?.textContent).toContain('built-in AI');
    expect(feature!.underlines).toHaveLength(0);
  });

  it('API mode: a usage limit shows a "paused" badge, and a good check clears it', async () => {
    send.mockResolvedValueOnce({ ok: false, code: 'QUOTA_EXCEEDED' });
    make();
    const field = textarea();
    focus(field);
    type(field, SENTENCE);
    await settle(0);
    expect(feature!.currentBadge?.textContent).toContain('paused');
    answer('Une autre phrase ici.', []);
    type(field, 'Une autre phrase ici.');
    await settle(0);
    expect(feature!.currentBadge).toBeNull();
  });

  it('offline shows its own badge; the badge goes with the field', async () => {
    send.mockResolvedValueOnce({ ok: false, code: 'NETWORK_ERROR' });
    make();
    const field = textarea();
    focus(field);
    type(field, SENTENCE);
    await settle(0);
    expect(feature!.currentBadge?.textContent).toContain('offline');
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(feature!.currentBadge).toBeNull();
  });
});

describe('R9: Ignore and personal dictionary', () => {
  const typeAndHover = async (options = {}) => {
    make(options);
    const field = textarea();
    focus(field);
    const issue = issueIn(SENTENCE);
    answer(SENTENCE, [issue]);
    type(field, SENTENCE);
    await settle(0);
    return { field, issue };
  };
  const link = (label: string) =>
    [...feature!.currentCard!.querySelectorAll('button')].find(
      (b) => b.textContent === label,
    )!;

  it('Ignore hides the word for this page session only', async () => {
    const { field, issue } = await typeAndHover();
    expect(feature!.underlines).toHaveLength(1);
    overWord(issue);
    link('Ignore').click();
    expect(feature!.underlines).toHaveLength(0);
    expect(feature!.currentCard).toBeNull();
    expect(field.value).toBe(SENTENCE);
    // Typing elsewhere does not bring it back...
    type(field, SENTENCE + ' Fin');
    expect(feature!.underlines).toHaveLength(0);
    // ...but a new page session does.
    feature!.dispose();
    make();
    focus(field);
    expect(feature!.underlines).toHaveLength(0);
    answer(SENTENCE, [issue]);
    type(field, SENTENCE);
    await settle(0);
    expect(feature!.underlines).toHaveLength(1);
  });

  it('Add to dictionary tells the worker and hides the word for good', async () => {
    const { issue } = await typeAndHover();
    overWord(issue);
    link('Add to dictionary').click();
    expect(send).toHaveBeenCalledWith({
      type: 'correctly.v5.addWord',
      word: 'aller',
    });
    expect(feature!.underlines).toHaveLength(0);
  });

  it('dictionary words from the page config are never underlined (any case)', async () => {
    make({ dictionary: ['ALLER'] });
    const field = textarea();
    focus(field);
    answer(SENTENCE, [issueIn(SENTENCE)]);
    type(field, SENTENCE);
    await settle(0);
    expect(feature!.underlines).toHaveLength(0);
    expect(feature!.current).toHaveLength(0);
  });
});
