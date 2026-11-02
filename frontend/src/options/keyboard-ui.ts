import {
  ACTION_COMMANDS,
  KEYBINDINGS_KEY,
  KEY_ACTIONS,
  bindingFromEvent,
  bindingProblem,
  emptyKeybindings,
  formatBinding,
  loadKeybindings,
  matchesChromeShortcut,
  saveKeybindings,
  sameBinding,
  type KeyAction,
  type KeybindingsStore,
} from '../shared/keybindings';
import type { StorageArea } from '../shared/storage';
import { COMMON, type CommonMessages } from '../shared/i18n';
import type { Locale } from '../shared/locale';
import { OPTIONS, type OptionsMessages } from './messages';
import type { Tone } from './settings-ui';

// "Raccourcis clavier": the browser's command shortcuts (read-only here:
// Chrome lets only the user change them, in chrome://extensions/shortcuts)
// and Correctly's own in-page shortcuts, recorded on this page.

export interface BrowserCommand {
  name: string;
  shortcut: string;
  description?: string;
}

export interface KeyboardDeps {
  area: StorageArea;
  /** chrome.commands.getAll (name and assigned shortcut). */
  getCommands: () => Promise<BrowserCommand[]>;
  requestSiteAccess: () => Promise<boolean>;
  hasSiteAccess: () => Promise<boolean>;
  /** Removes all-sites access when nothing needs it any more. */
  releaseSiteAccess: () => Promise<void>;
  /** 5.13: language of this page (French when absent). */
  locale?: Locale;
}

const MODIFIER = /^(?:Shift|Control|Alt|Meta|AltGraph|CapsLock|OS)$/;

export class KeyboardSection {
  private store: KeybindingsStore = emptyKeybindings();
  private commands: BrowserCommand[] = [];
  private access = false;
  /** The action waiting for a key press, or null. */
  recording: KeyAction | null = null;
  private busy = false;

  private readonly m: OptionsMessages;
  private readonly c: CommonMessages;

  constructor(
    private readonly doc: Document,
    private readonly deps: KeyboardDeps,
  ) {
    this.m = OPTIONS[deps.locale ?? 'fr'];
    this.c = COMMON[deps.locale ?? 'fr'];
  }

  private get KEY_ACTION_FR() {
    return this.m.keyAction;
  }

  private get COMMAND_FR() {
    return this.m.commands;
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private message(text: string, tone: Tone = 'neutral') {
    const node = this.el('keybindings-message');
    node.textContent = text;
    node.dataset.tone = tone;
  }

  async init(): Promise<void> {
    this.el<HTMLInputElement>('keybindings-enabled').addEventListener(
      'change',
      () => void this.toggle(),
    );
    this.el('commands-refresh').addEventListener(
      'click',
      () => void this.refreshCommands(),
    );
    // Capture phase: the key press is the recording, never a page action.
    this.doc.addEventListener('keydown', this.onKeyDown, true);
    await Promise.all([this.reload(), this.refreshCommands()]);
  }

  onStorageChanged(keys: string[]): void {
    if (keys.includes(KEYBINDINGS_KEY)) void this.reload();
  }

  async reload(): Promise<void> {
    try {
      const [store, access] = await Promise.all([
        loadKeybindings(this.deps.area),
        this.deps.hasSiteAccess().catch(() => false),
      ]);
      this.store = store;
      this.access = access;
      this.el<HTMLInputElement>('keybindings-enabled').disabled = false;
    } catch {
      this.message(this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  /** Reads the shortcuts Chrome assigned (after a change in its page). */
  async refreshCommands(): Promise<void> {
    try {
      this.commands = await this.deps.getCommands();
    } catch {
      this.commands = [];
    }
    this.render();
  }

  private chromeShortcut(action: KeyAction): string {
    return (
      this.commands.find((c) => c.name === ACTION_COMMANDS[action])?.shortcut ??
      ''
    );
  }

  /** Read-modify-write from fresh storage (another tab may have changed it). */
  private async update(
    change: (store: KeybindingsStore) => KeybindingsStore,
    done: string,
  ): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      const fresh = await loadKeybindings(this.deps.area);
      this.store = await saveKeybindings(this.deps.area, change(fresh));
      this.message(done, 'ok');
      return true;
    } catch {
      this.message(this.c.error('STORAGE_ERROR'), 'error');
      return false;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async toggle(): Promise<void> {
    const box = this.el<HTMLInputElement>('keybindings-enabled');
    if (box.checked) {
      // The permission prompt must come first, while the click counts.
      this.access = await this.deps.requestSiteAccess().catch(() => false);
      if (!this.access) {
        box.checked = false;
        this.message(this.m.keysNoAccess, 'error');
        return;
      }
      await this.update(
        (store) => ({ ...store, enabled: true }),
        this.m.keysOn,
      );
    } else if (
      await this.update(
        (store) => ({ ...store, enabled: false }),
        this.m.keysOff,
      )
    )
      await this.deps.releaseSiteAccess().catch(() => undefined);
  }

  /** Waits for the next key press to bind it to `action` (Échap cancels). */
  record(action: KeyAction): void {
    this.recording = this.recording === action ? null : action;
    this.message(
      this.recording ? this.m.pressFor(this.KEY_ACTION_FR[action]) : '',
      'info',
    );
    this.render();
    if (this.recording)
      this.doc
        .getElementById(`keybinding-record-${action}`)
        ?.focus({ preventScroll: true });
  }

  async clear(action: KeyAction): Promise<void> {
    if (this.recording === action) this.recording = null;
    await this.update((store) => {
      const bindings = { ...store.bindings };
      delete bindings[action];
      return { ...store, bindings };
    }, this.m.keyCleared(this.KEY_ACTION_FR[action]));
  }

  /** One key press while recording (exposed for tests). */
  async press(
    event: Pick<
      KeyboardEvent,
      'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
    >,
  ): Promise<void> {
    const action = this.recording;
    if (!action) return;
    if (event.key === 'Escape') {
      this.recording = null;
      this.message(this.m.noChange);
      this.render();
      return;
    }
    // A lone modifier: keep waiting for the full combination.
    if (MODIFIER.test(event.key)) return;
    const binding = bindingFromEvent(event);
    if (!binding) {
      this.message(this.m.keyUnusable, 'error');
      return;
    }
    const problem = bindingProblem(binding);
    if (problem) {
      this.message(
        this.m.bindingProblem(problem, formatBinding(binding)),
        'error',
      );
      return;
    }
    const other = KEY_ACTIONS.find(
      (id) =>
        id !== action &&
        this.store.bindings[id] &&
        sameBinding(this.store.bindings[id], binding),
    );
    if (other) {
      this.message(
        this.m.keyTaken(formatBinding(binding), this.KEY_ACTION_FR[other]),
        'error',
      );
      return;
    }
    this.recording = null;
    const text = formatBinding(binding);
    await this.update(
      (store) => ({
        ...store,
        bindings: { ...store.bindings, [action]: binding },
      }),
      this.m.bindingSaved(text, this.KEY_ACTION_FR[action], this.store.enabled),
    );
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.recording) return;
    event.preventDefault();
    event.stopPropagation();
    void this.press(event);
  };

  // ------------------------------------------------------------ rendering

  render(): void {
    this.renderCommands();
    const box = this.el<HTMLInputElement>('keybindings-enabled');
    box.checked = this.store.enabled && this.access;
    const list = this.el('keybinding-list');
    list.replaceChildren(
      ...KEY_ACTIONS.filter((action) => action !== 'capture').map((action) =>
        this.renderBinding(action),
      ),
    );
    // The screen-capture shortcut lives on its own page.
    this.el('capture-keybinding').replaceChildren(
      this.renderBinding('capture'),
    );
  }

  private renderCommands() {
    const body = this.el('command-list').querySelector('tbody')!;
    body.replaceChildren(
      ...this.commands.map((command) => {
        const row = this.doc.createElement('tr');
        const name = this.doc.createElement('th');
        name.scope = 'row';
        name.textContent =
          this.COMMAND_FR[command.name] ?? command.description ?? command.name;
        const keys = this.doc.createElement('td');
        if (command.shortcut) {
          const kbd = this.doc.createElement('kbd');
          kbd.textContent = command.shortcut;
          keys.append(kbd);
        } else {
          keys.className = 'hint';
          keys.textContent = this.m.notSet;
        }
        row.append(name, keys);
        return row;
      }),
    );
    this.el('command-empty').hidden = this.commands.length > 0;
  }

  private renderBinding(action: KeyAction): HTMLElement {
    const doc = this.doc;
    const item = doc.createElement('li');
    const name = doc.createElement('strong');
    name.textContent = this.KEY_ACTION_FR[action];
    const binding = this.store.bindings[action];
    const current = doc.createElement('span');
    current.className = 'key-current';
    if (this.recording === action) {
      current.textContent = this.m.pressCombination;
      current.classList.add('recording');
    } else if (binding) {
      const kbd = doc.createElement('kbd');
      kbd.textContent = formatBinding(binding);
      current.append(kbd);
    } else {
      current.textContent = this.m.noneBound;
      current.classList.add('hint');
    }
    const record = doc.createElement('button');
    record.type = 'button';
    record.className = 'ghost';
    record.id = `keybinding-record-${action}`;
    record.textContent =
      this.recording === action
        ? this.m.cancelRecord
        : binding
          ? this.m.modify
          : this.m.define;
    record.setAttribute(
      'aria-label',
      this.m.recordLabel(record.textContent, this.KEY_ACTION_FR[action]),
    );
    record.addEventListener('click', () => this.record(action));
    const clear = doc.createElement('button');
    clear.type = 'button';
    clear.className = 'ghost';
    clear.textContent = this.m.clear;
    clear.setAttribute(
      'aria-label',
      this.m.clearLabel(this.KEY_ACTION_FR[action]),
    );
    clear.disabled = !binding;
    clear.addEventListener('click', () => void this.clear(action));
    item.append(name, current, record, clear);
    // Same keys as a browser command: both would react to one press.
    const chrome = this.chromeShortcut(action);
    const clash = binding
      ? this.commands.find(
          (command) =>
            command.shortcut &&
            matchesChromeShortcut(binding, command.shortcut),
        )
      : undefined;
    if (clash) {
      const note = doc.createElement('p');
      note.className = 'hint key-note';
      note.textContent =
        clash.name === ACTION_COMMANDS[action]
          ? this.m.sameAsBrowser(chrome)
          : this.m.clashWith(
              clash.shortcut,
              this.COMMAND_FR[clash.name] ?? clash.name,
            );
      item.append(note);
    }
    return item;
  }
}
