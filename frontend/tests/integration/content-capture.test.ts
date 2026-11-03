import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectlyModal, openModal } from '../../src/content/modal';
import { CONTENT } from '../../src/content/messages';
import {
  EXTRACT_TEXT,
  FREEZE_SCREEN,
  IMAGE_CONSENT,
} from '../../src/shared/contracts';
import { ERROR_CODES } from '../../src/shared/errors';
import { COMMON } from '../../src/shared/i18n';

// V7.1.3: the window's "Capture text" flow with a faked worker and a faked
// area overlay (the overlay itself is covered by content-area.test.ts).

const selectArea = vi.hoisted(() => vi.fn());
vi.mock('../../src/content/area', async (importActual) => ({
  ...(await importActual<typeof import('../../src/content/area')>()),
  selectArea,
  afterPaint: () => Promise.resolve(),
  decodeSnapshot: () => Promise.resolve({ close: () => undefined }),
}));

const SELECTION = {
  rect: { x: 10, y: 20, width: 200, height: 80 },
  viewport: { width: 800, height: 600 },
};
const OPTIONS = {
  styles: ['formal'],
  translation: { source: 'auto', target: 'ar', arabicVariant: 'syrian' },
  rewriteEnabled: true,
};
const AI = ['correctly.v5.correctText', 'correctly.v5.rewriteText'];

let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let consent: boolean;
let extractReply: unknown;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const types = () =>
  send.mock.calls.map(([message]) => (message as { type: string }).type);
const ui = (modal: CorrectlyModal) => ({
  capture: modal.root.querySelector<HTMLButtonElement>(
    `button[aria-label="${CONTENT.en.capture.button}"]`,
  )!,
  textarea: modal.root.querySelector<HTMLTextAreaElement>('textarea')!,
  hint: () => modal.root.querySelector('.body > .hint')!.textContent,
  apply: () =>
    [...modal.root.querySelectorAll('button')].find(
      (button) => button.textContent === CONTENT.en.apply,
    )!,
  dialog: () => modal.root.querySelector('.dialog'),
  dialogButton: (label: string) =>
    [...modal.root.querySelectorAll<HTMLButtonElement>('.dialog button')].find(
      (button) => button.textContent === label,
    )!,
});
const open = () => openModal(document, OPTIONS, send);

beforeEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
  const state = globalThis as { correctlyModal?: CorrectlyModal };
  state.correctlyModal?.close();
  delete state.correctlyModal;
  consent = true;
  extractReply = {
    ok: true,
    text: 'Bonjour\nle monde',
    operationId: 'op-ocr-1',
  };
  selectArea.mockReset().mockResolvedValue(SELECTION);
  send = vi.fn((message: unknown) => {
    const { type } = message as { type: string; action?: string };
    if (type === IMAGE_CONSENT) {
      if ((message as { action: string }).action === 'grant') consent = true;
      return Promise.resolve({ consent });
    }
    if (type === FREEZE_SCREEN)
      return Promise.resolve({
        ok: true,
        image: 'data:image/png;base64,AAAA',
      });
    if (type === EXTRACT_TEXT) return Promise.resolve(extractReply);
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  (globalThis as { correctlyModal?: CorrectlyModal }).correctlyModal?.close();
});

describe('O12: the window', () => {
  it('has an icon button at the end of the tab bar with a tooltip and a name', () => {
    const modal = open();
    const { capture } = ui(modal);
    expect(capture).toBeTruthy();
    expect(capture.title).toBe(CONTENT.en.capture.button);
    expect(capture.closest('.tabrow')).toBeTruthy();
    expect(capture.hidden).toBe(false);
    expect(capture.disabled).toBe(false);
  });

  it('the capture shortcut on an already open window starts the area picker', async () => {
    const first = open();
    const second = openModal(
      document,
      { ...OPTIONS, open: { text: '', generate: false, capture: true } },
      send,
    );
    expect(second).toBe(first);
    await flush();
    await flush();
    expect(selectArea).toHaveBeenCalledTimes(1);
    expect(types()).toEqual([IMAGE_CONSENT, FREEZE_SCREEN, EXTRACT_TEXT]);
  });

  it('one click = consent check, area, one EXTRACT_TEXT; the text replaces the box', async () => {
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(types()).toEqual([IMAGE_CONSENT, FREEZE_SCREEN, EXTRACT_TEXT]);
    expect(send).toHaveBeenLastCalledWith({ type: EXTRACT_TEXT, ...SELECTION });
    expect(modal.sharedText).toBe('Bonjour\nle monde');
    expect(ui(modal).textarea.value).toBe('Bonjour\nle monde');
    expect(ui(modal).hint()).toContain(CONTENT.en.capture.done);
    expect(modal.host.style.display).toBe('');
    // Nothing else was asked of the provider.
    expect(types().some((type) => AI.includes(type))).toBe(false);
  });

  it('the source becomes copy-only: Apply stays impossible', async () => {
    document.body.innerHTML = '<textarea id="f"></textarea>';
    const field = document.getElementById('f') as HTMLTextAreaElement;
    field.value = 'texte tapé';
    field.focus();
    field.setSelectionRange(0, 10);
    const modal = open();
    expect(modal.target).not.toBeNull();
    // The box holds text: it is replaced only after the confirmation.
    ui(modal).capture.click();
    await flush();
    ui(modal).dialogButton(CONTENT.en.capture.replace).click();
    await flush();
    await flush();
    expect(modal.sharedText).toBe('Bonjour\nle monde');
    expect(ui(modal).apply().disabled).toBe(true);
    expect(field.value).toBe('texte tapé');
  });

  it('typed text: Cancel on the confirmation sends nothing and keeps the text', async () => {
    const modal = open();
    modal.setText('mon texte');
    ui(modal).capture.click();
    await flush();
    expect(ui(modal).dialog()).not.toBeNull();
    ui(modal).dialogButton(CONTENT.en.capture.cancel).click();
    await flush();
    expect(selectArea).not.toHaveBeenCalled();
    expect(types()).toEqual([IMAGE_CONSENT]);
    expect(modal.sharedText).toBe('mon texte');
    expect(ui(modal).dialog()).toBeNull();
  });

  it('Esc on the confirmation closes only the confirmation', async () => {
    const modal = open();
    modal.setText('mon texte');
    ui(modal).capture.click();
    await flush();
    ui(modal)
      .dialog()!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    await flush();
    expect(ui(modal).dialog()).toBeNull();
    expect(modal.visible).toBe(true);
    expect(selectArea).not.toHaveBeenCalled();
  });

  it('O11: cancelling the area sends nothing and shows the window again', async () => {
    selectArea.mockResolvedValue(null);
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(types()).toEqual([IMAGE_CONSENT, FREEZE_SCREEN]);
    expect(modal.host.style.display).toBe('');
    expect(modal.sharedText).toBe('');
    expect(ui(modal).capture.disabled).toBe(false);
  });

  it('the window is hidden while the area is chosen and back on every path', async () => {
    let visibleDuringSelection: string | null = null;
    selectArea.mockImplementation(() => {
      visibleDuringSelection = (
        document.querySelector('correctly-modal') as HTMLElement
      ).style.display;
      return Promise.resolve(SELECTION);
    });
    const handle = document.createElement('correctly-handle');
    document.body.append(handle);
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(visibleDuringSelection).toBe('none');
    expect(modal.host.style.display).toBe('');
    expect(handle.style.display).toBe('');
    // A failing worker call also brings everything back.
    extractReply = { ok: false, code: 'CAPTURE_FORBIDDEN' };
    ui(modal).capture.click();
    await flush();
    ui(modal).dialogButton(CONTENT.en.capture.replace).click();
    await flush();
    await flush();
    expect(modal.host.style.display).toBe('');
    expect(handle.style.display).toBe('');
  });

  it('a worker error is shown and the box is unchanged', async () => {
    extractReply = { ok: false, code: 'MODEL_NO_VISION' };
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(ui(modal).hint()).toContain(COMMON.en.error('MODEL_NO_VISION'));
    expect(modal.sharedText).toBe('');
  });

  it('"no text found" is a plain message, the box is unchanged', async () => {
    extractReply = { ok: false, code: 'NO_TEXT_FOUND' };
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(ui(modal).hint()).toContain(COMMON.en.error('NO_TEXT_FOUND'));
    expect(modal.sharedText).toBe('');
  });

  it('a lost worker (no reply) is an error, never a crash', async () => {
    send.mockImplementation((message: unknown) =>
      (message as { type: string }).type === IMAGE_CONSENT
        ? Promise.resolve({ consent: true })
        : Promise.reject(new Error('port closed')),
    );
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(modal.visible).toBe(true);
    expect(ui(modal).capture.disabled).toBe(false);
    expect(modal.sharedText).toBe('');
  });

  it('a double click starts one flow only', async () => {
    const modal = open();
    const { capture } = ui(modal);
    capture.click();
    capture.click();
    await flush();
    await flush();
    expect(selectArea).toHaveBeenCalledTimes(1);
    expect(types().filter((type) => type === EXTRACT_TEXT)).toHaveLength(1);
  });

  it('the text is displayed as text, never as markup', async () => {
    extractReply = { ok: true, text: '<img src=x onerror=alert(1)>' };
    const modal = open();
    ui(modal).capture.click();
    await flush();
    await flush();
    expect(ui(modal).textarea.value).toBe('<img src=x onerror=alert(1)>');
    expect(modal.root.querySelector('img')).toBeNull();
  });

  it('an iframe has no capture button', () => {
    const doc = document.implementation.createHTMLDocument('frame');
    Object.defineProperty(doc, 'defaultView', {
      value: { top: {} },
    });
    const modal = new CorrectlyModal(doc, '', OPTIONS, send);
    expect(ui(modal).capture.hidden).toBe(true);
    modal.close();
  });
});

describe('image consent dialog (D5)', () => {
  it('asked first; Cancel sends nothing at all', async () => {
    consent = false;
    const modal = open();
    ui(modal).capture.click();
    await flush();
    expect(ui(modal).dialog()?.textContent).toContain(
      CONTENT.en.capture.consentTitle,
    );
    ui(modal).dialogButton(CONTENT.en.capture.cancel).click();
    await flush();
    expect(types()).toEqual([IMAGE_CONSENT]);
    expect(selectArea).not.toHaveBeenCalled();
  });

  it('Allow goes through the worker, then the flow continues', async () => {
    consent = false;
    const modal = open();
    ui(modal).capture.click();
    await flush();
    ui(modal).dialogButton(CONTENT.en.capture.accept).click();
    await flush();
    await flush();
    expect(send.mock.calls.map(([m]) => m)).toEqual([
      { type: IMAGE_CONSENT, action: 'status' },
      { type: IMAGE_CONSENT, action: 'grant' },
      { type: FREEZE_SCREEN },
      { type: EXTRACT_TEXT, ...SELECTION },
    ]);
    expect(modal.sharedText).toBe('Bonjour\nle monde');
  });
});

describe('O15: French and English for every new text', () => {
  it('both catalogs have every capture / area string and every error code', () => {
    for (const locale of ['en', 'fr'] as const) {
      const m = CONTENT[locale];
      for (const value of [
        ...Object.values(m.capture),
        ...Object.values(m.area),
      ])
        expect(value.trim()).not.toBe('');
      for (const code of ERROR_CODES)
        expect(COMMON[locale].error(code).trim()).not.toBe('');
      expect(COMMON[locale].slot.ocr.trim()).not.toBe('');
      expect(COMMON[locale].task.ocr.trim()).not.toBe('');
    }
    expect(CONTENT.fr.capture.button).not.toBe(CONTENT.en.capture.button);
    expect(COMMON.fr.error('NO_TEXT_FOUND')).not.toBe(
      COMMON.en.error('NO_TEXT_FOUND'),
    );
  });
});
