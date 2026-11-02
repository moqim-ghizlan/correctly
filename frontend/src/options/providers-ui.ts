import {
  TEST_CONNECTION,
  TEST_KEY,
  toConnectionResult,
  toKeyCheckResult,
} from '../shared/contracts';
import {
  MODEL_CATALOG,
  PROVIDERS,
  catalogModel,
  isProviderId,
  modelStatus,
  readsImages,
  type ProviderId,
} from '../shared/models';
import {
  CHECKS_KEY,
  PROVIDERS_KEY,
  ProviderError,
  ROUTE_SLOTS,
  SECRETS_KEY,
  addProfile,
  deleteProfile,
  emptyProviders,
  loadProfiles,
  migrateLegacyKey,
  mutateProviders,
  parseChecks,
  renameProfile,
  replaceKey,
  setProfileEnabled,
  setRoute,
  slotsUsing,
  type KeyCheck,
  type ProviderProfile,
  type ProviderStore,
  type RouteSlot,
} from '../shared/providers';
import type { StorageArea } from '../shared/storage';
import { COMMON, type CommonMessages } from '../shared/i18n';
import type { Locale } from '../shared/locale';
import { OPTIONS, type OptionsMessages } from './messages';
import type { Tone } from './settings-ui';

// V5.7 "AI providers": API-key profiles and the key + model each action
// uses. This page writes keys to storage but never reads one back: views use
// metadata only, and messages to the worker carry IDs, never a key.

export interface ProvidersDeps {
  area: StorageArea;
  confirm: (question: string) => boolean;
  /** TEST_KEY / TEST_CONNECTION to the service worker. */
  send: (message: unknown) => Promise<unknown>;
  now?: () => Date;
  uiTimeoutMs?: number;
  /** 5.13: language of this page (French when absent). */
  locale?: Locale;
}

const providerName = (provider: ProviderId) => PROVIDERS[provider].label;

type Draft = { credentialId: string; modelId: string };

export class ProvidersSection {
  private store: ProviderStore = emptyProviders();
  private checks: Record<string, KeyCheck> = {};
  private editing: ProviderProfile | null = null;
  private readonly drafts: Partial<Record<RouteSlot, Draft>> = {};
  /** Actions in progress ("key:<id>", "route:<slot>"): one at a time each. */
  private readonly busy = new Set<string>();
  private ready = false;

  private readonly m: OptionsMessages;
  private readonly c: CommonMessages;

  constructor(
    private readonly doc: Document,
    private readonly deps: ProvidersDeps,
  ) {
    this.m = OPTIONS[deps.locale ?? 'fr'];
    this.c = COMMON[deps.locale ?? 'fr'];
  }

  private time(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : this.c.dateTime(date);
  }

  private slot(slot: RouteSlot): string {
    return this.c.slot[slot];
  }

  private el<T extends HTMLElement>(id: string): T {
    const node = this.doc.getElementById(id);
    if (!node) throw new Error('Missing element #' + id);
    return node as T;
  }

  private message(id: string, text: string, tone: Tone = 'neutral') {
    const node = this.el(id);
    node.textContent = text;
    node.dataset.tone = tone;
  }

  private get keyInput() {
    return this.el<HTMLInputElement>('profile-key');
  }

  async init(): Promise<void> {
    this.bind();
    // A V5.1 key becomes a profile (local only; the worker does the same).
    await migrateLegacyKey(this.deps.area).catch(() => undefined);
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      const { area } = this.deps;
      const [loaded, checks] = await Promise.all([
        loadProfiles(area),
        area.get([CHECKS_KEY]),
      ]);
      this.store = loaded.store;
      this.checks = parseChecks(checks[CHECKS_KEY]);
      this.ready = !loaded.damaged;
      if (loaded.damaged)
        this.message('providers-status', this.m.providersDamaged, 'error');
      else if (loaded.dropped)
        this.message(
          'providers-status',
          this.m.keysDropped(loaded.dropped),
          'error',
        );
    } catch {
      this.ready = false;
      this.message('providers-status', this.c.error('STORAGE_ERROR'), 'error');
    }
    this.render();
  }

  onStorageChanged(keys: string[]): void {
    if (
      [PROVIDERS_KEY, SECRETS_KEY, CHECKS_KEY].some((key) => keys.includes(key))
    )
      void this.reload();
  }

  /** Called on navigation/visibility change: never leave a key revealed. */
  hideKey(clear = false): void {
    this.keyInput.type = 'password';
    if (clear) this.keyInput.value = '';
    const toggle = this.el<HTMLButtonElement>('profile-toggle');
    toggle.textContent = this.m.showKey;
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', this.m.showKeyLabel);
  }

  private bind() {
    this.el<HTMLFormElement>('profile-form').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.saveProfile();
      },
    );
    this.el('profile-cancel').addEventListener('click', () => this.resetForm());
    this.el('profile-provider').addEventListener('change', () =>
      this.renderHelp(),
    );
    this.el('profile-toggle').addEventListener('click', () => {
      if (this.keyInput.type !== 'password') return this.hideKey();
      this.keyInput.type = 'text';
      const toggle = this.el<HTMLButtonElement>('profile-toggle');
      toggle.textContent = this.m.hideKey;
      toggle.setAttribute('aria-pressed', 'true');
      toggle.setAttribute('aria-label', this.m.hideKeyLabel);
    });
  }

  /** Runs one write; the store is re-read so other windows' edits survive. */
  private async run(
    change: Parameters<typeof mutateProviders>[1],
    done: string,
    target: string,
  ): Promise<boolean> {
    try {
      const { store } = await mutateProviders(this.deps.area, change);
      this.store = store;
      this.message(target, done, 'ok');
      return true;
    } catch (error) {
      this.message(
        target,
        error instanceof ProviderError
          ? this.m.providerError(error.code, error.params)
          : this.c.error('STORAGE_ERROR'),
        'error',
      );
      await this.reload();
      return false;
    } finally {
      this.render();
    }
  }

  // ---- Profiles -----------------------------------------------------------

  private resetForm() {
    this.editing = null;
    this.el<HTMLInputElement>('profile-label').value = '';
    this.hideKey(true);
    this.el<HTMLSelectElement>('profile-provider').disabled = false;
    this.el('profile-form-title').textContent = this.m.addKeyTitle;
    this.el('profile-save').textContent = this.m.saveKey;
    this.el('profile-cancel').hidden = true;
    this.keyInput.placeholder = '';
    this.renderHelp();
  }

  edit(profile: ProviderProfile): void {
    this.editing = profile;
    const provider = this.el<HTMLSelectElement>('profile-provider');
    provider.value = profile.provider;
    provider.disabled = true;
    this.el<HTMLInputElement>('profile-label').value = profile.label;
    this.hideKey(true);
    this.keyInput.placeholder = this.m.keepKeyPlaceholder;
    this.el('profile-form-title').textContent = this.m.editKeyTitle(
      profile.label,
    );
    this.el('profile-save').textContent = this.m.saveChanges;
    this.el('profile-cancel').hidden = false;
    this.renderHelp();
    this.el<HTMLInputElement>('profile-label').focus();
  }

  /** Add, or rename and/or replace the key of the profile being edited. No network. */
  async saveProfile(): Promise<void> {
    const label = this.el<HTMLInputElement>('profile-label').value;
    const key = this.keyInput.value;
    const editing = this.editing;
    if (!editing) {
      const provider = this.el<HTMLSelectElement>('profile-provider').value;
      if (
        await this.run(
          addProfile({ provider, label, key }, this.deps.now?.()),
          this.m.keySaved,
          'profile-message',
        )
      )
        this.resetForm();
      return;
    }
    if (
      key.trim() &&
      !this.deps.confirm(this.m.confirmReplaceKey(editing.label))
    ) {
      this.message('profile-message', this.m.nothingChanged);
      return;
    }
    const now = this.deps.now?.();
    if (
      await this.run(
        (pair) => {
          let next = pair;
          let current = editing;
          if (label.trim() !== editing.label) {
            next = renameProfile(current, label, now)(next);
            current =
              next.store.profiles.find((p) => p.id === editing.id) ?? current;
          }
          if (key.trim()) next = replaceKey(current, key, now)(next);
          return next;
        },
        key.trim() ? this.m.keyReplaced : this.m.changesSaved,
        'profile-message',
      )
    )
      this.resetForm();
  }

  private async toggle(profile: ProviderProfile): Promise<void> {
    const used = slotsUsing(this.store, profile.id);
    if (
      profile.enabled &&
      used.length &&
      !this.deps.confirm(
        this.m.confirmDisable(
          profile.label,
          used.map((s) => this.slot(s)).join(', '),
        ),
      )
    )
      return;
    await this.run(
      setProfileEnabled(profile, !profile.enabled, this.deps.now?.()),
      this.m.toggled(profile.label, !profile.enabled),
      'profile-message',
    );
  }

  private async remove(profile: ProviderProfile): Promise<void> {
    const used = slotsUsing(this.store, profile.id);
    const impact = used.length
      ? this.m.deleteImpact(used.map((s) => this.slot(s)).join(', '))
      : '';
    if (!this.deps.confirm(this.m.confirmDelete(profile.label, impact))) return;
    if (this.editing?.id === profile.id) this.resetForm();
    await this.run(
      deleteProfile(profile),
      this.m.deleted(profile.label),
      'profile-message',
    );
  }

  /** Free check: lists the key's models; sends no text, uses no quota. */
  async checkKey(profile: ProviderProfile): Promise<void> {
    const id = `key:${profile.id}`;
    if (this.busy.has(id)) return;
    this.busy.add(id);
    this.render();
    try {
      const result = toKeyCheckResult(
        await this.withTimeout(
          this.deps.send({ type: TEST_KEY, credentialId: profile.id }),
        ),
      );
      this.message(
        'profile-message',
        result.ok
          ? this.m.keyAccepted(
              profile.label,
              providerName(profile.provider),
              result.models,
            )
          : this.m.keyRefused(profile.label, this.c.error(result.code)),
        result.ok ? 'ok' : 'error',
      );
    } finally {
      this.busy.delete(id);
      await this.reload();
    }
  }

  private async withTimeout(task: Promise<unknown>): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('UI timeout')),
            this.deps.uiTimeoutMs ?? 90_000,
          );
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Routes -------------------------------------------------------------

  private draft(slot: RouteSlot): Draft {
    const saved = this.store.routes[slot];
    return (
      this.drafts[slot] ?? {
        credentialId: saved?.credentialId ?? '',
        modelId: saved?.modelId ?? '',
      }
    );
  }

  async saveRoute(slot: RouteSlot): Promise<void> {
    const { credentialId, modelId } = this.draft(slot);
    const route = credentialId
      ? { credentialId, modelId: modelId.trim() }
      : null;
    if (
      await this.run(
        setRoute(slot, route),
        route
          ? this.m.routeSaved(this.slot(slot))
          : slot === 'default'
            ? this.m.defaultRemoved
            : this.m.routeDefault(this.slot(slot)),
        `route-message-${slot}`,
      )
    )
      delete this.drafts[slot];
    this.render();
  }

  /** One tiny generation through the SAVED route; may be billed. */
  async testRoute(slot: RouteSlot): Promise<void> {
    const id = `route:${slot}`;
    if (this.busy.has(id)) return;
    if (!this.deps.confirm(this.m.confirmTest(this.slot(slot)))) return;
    this.busy.add(id);
    this.render();
    try {
      const result = toConnectionResult(
        await this.withTimeout(this.deps.send({ type: TEST_CONNECTION, slot })),
      );
      if (result.ok) {
        const usage = result.usage
          ? this.m.tokensReported(
              String(result.usage.inputTokens ?? '?'),
              String(result.usage.outputTokens ?? '?'),
            )
          : '';
        this.message(
          `route-message-${slot}`,
          this.m.modelAnswered(
            providerName(result.provider),
            result.model,
            result.sample,
            this.time(result.checkedAt),
          ) + usage,
          'ok',
        );
      } else
        this.message(
          `route-message-${slot}`,
          `${this.c.error(result.code)}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}${result.quota ? ` ${this.c.note(result.quota)}` : ''}`,
          'error',
        );
    } finally {
      this.busy.delete(id);
      await this.reload();
    }
  }

  /** Human summary of what a slot does now; never names a fallback. */
  routeSummary(slot: RouteSlot): { text: string; tone: Tone } {
    const own = this.store.routes[slot];
    const route = own ?? this.store.routes.default;
    const via = own || slot === 'default' ? '' : this.m.viaDefault;
    if (!route)
      return {
        text: slot === 'default' ? this.m.noDefaultRoute : this.m.needsDefault,
        tone: 'error',
      };
    const profile = this.store.profiles.find(
      (p) => p.id === route.credentialId,
    );
    if (!profile)
      return {
        text: this.m.keyGone(via),
        tone: 'error',
      };
    const target = `${profile.label} (${providerName(profile.provider)}) • ${route.modelId}`;
    if (!profile.enabled)
      return {
        text: this.m.keyBlocked(via, profile.label),
        tone: 'error',
      };
    const status = modelStatus(profile.provider, route.modelId);
    if (status === 'invalid' || status === 'mismatch')
      return {
        text: this.m.modelNotValid(via, providerName(profile.provider)),
        tone: 'error',
      };
    if (slot === 'ocr' && !readsImages(profile.provider, route.modelId))
      return { text: this.m.noVision(via), tone: 'error' };
    return { text: `${this.slot(slot)} → ${target}${via}`, tone: 'ok' };
  }

  private modelNote(
    provider: ProviderId | null,
    modelId: string,
    credentialId: string,
  ) {
    if (!provider) return '';
    const status = modelStatus(provider, modelId.trim());
    if (status === 'invalid')
      return modelId.trim() ? this.m.invalidModelId : this.m.chooseModel;
    if (status === 'mismatch')
      return this.m.notProviderModel(providerName(provider));
    const listed = this.checks[credentialId]?.models ?? [];
    const notListed =
      listed.length && !listed.includes(modelId.trim()) ? this.m.notListed : '';
    if (status === 'reviewed')
      return `${this.m.modelNote(modelId.trim(), catalogModel(provider, modelId.trim())?.note ?? '')}${notListed}`;
    return this.m.unreviewed(notListed);
  }

  // ---- Rendering ----------------------------------------------------------

  private button(
    label: string,
    aria: string,
    action: () => void,
    disabled = false,
  ) {
    const node = this.doc.createElement('button');
    node.type = 'button';
    node.className = 'ghost';
    node.textContent = label;
    node.setAttribute('aria-label', aria);
    node.disabled = disabled || !this.ready;
    node.addEventListener('click', action);
    return node;
  }

  private renderHelp() {
    const value = this.el<HTMLSelectElement>('profile-provider').value;
    const provider = isProviderId(value) ? value : 'gemini';
    const link = this.el<HTMLAnchorElement>('profile-help-link');
    link.href = PROVIDERS[provider].keysUrl;
    link.textContent = this.m.createKeyIn(PROVIDERS[provider].keysSite);
  }

  render(): void {
    for (const id of [
      'profile-provider',
      'profile-label',
      'profile-key',
      'profile-toggle',
      'profile-save',
    ])
      this.el<HTMLInputElement>(id).disabled =
        !this.ready || (id === 'profile-provider' && this.editing !== null);
    this.renderProfiles();
    this.renderRoutes();
  }

  private renderProfiles() {
    const { profiles } = this.store;
    this.el('profile-empty').hidden = profiles.length > 0;
    this.el('profile-list').replaceChildren(
      ...profiles.map((profile) => {
        const row = this.doc.createElement('li');
        const name = this.doc.createElement('strong');
        name.textContent = profile.label;
        const provider = this.doc.createElement('span');
        provider.textContent = providerName(profile.provider);
        const details = this.doc.createElement('span');
        details.className = 'hint';
        const check = this.checks[profile.id];
        const current = check && check.revision === profile.revision;
        const used = slotsUsing(this.store, profile.id).map((s) =>
          this.slot(s),
        );
        details.textContent = [
          profile.enabled ? this.m.enabled : this.m.disabled,
          !current
            ? this.m.notChecked
            : check.ok
              ? this.m.acceptedOn(
                  this.time(check.checkedAt),
                  check.models.length,
                )
              : this.m.checkFailedOn(
                  this.time(check.checkedAt),
                  check.errorCode ? this.c.error(check.errorCode) : '',
                ),
          used.length ? this.m.usedBy(used.join(', ')) : this.m.unused,
        ].join(' · ');
        const checking = this.busy.has(`key:${profile.id}`);
        const checkButton = this.button(
          checking ? this.m.checking : this.m.check,
          this.m.checkLabel(profile.label),
          () => void this.checkKey(profile),
          checking,
        );
        checkButton.setAttribute('aria-busy', String(checking));
        row.append(
          name,
          provider,
          details,
          checkButton,
          this.button(this.m.edit, this.m.editLabel(profile.label), () =>
            this.edit(profile),
          ),
          this.button(
            profile.enabled ? this.m.disable : this.m.enable,
            this.m.toggleLabel(!profile.enabled, profile.label),
            () => void this.toggle(profile),
          ),
          this.button(
            this.m.remove,
            this.m.removeLabel(profile.label),
            () => void this.remove(profile),
          ),
        );
        return row;
      }),
    );
  }

  private renderRoutes() {
    const container = this.el('route-list');
    const focused = this.doc.activeElement?.id ?? '';
    container.replaceChildren(
      ...ROUTE_SLOTS.map((slot) => this.renderRoute(slot)),
    );
    if (focused) this.doc.getElementById(focused)?.focus();
  }

  private renderRoute(slot: RouteSlot): HTMLElement {
    const draft = this.draft(slot);
    const box = this.doc.createElement('fieldset');
    box.className = 'route';
    const legend = this.doc.createElement('legend');
    legend.textContent = this.slot(slot);
    const summary = this.doc.createElement('p');
    summary.className = 'message';
    summary.id = `route-summary-${slot}`;
    const { text, tone } = this.routeSummary(slot);
    summary.textContent = text;
    summary.dataset.tone = tone;

    const keyLabel = this.doc.createElement('label');
    keyLabel.className = 'stack';
    keyLabel.htmlFor = `route-key-${slot}`;
    keyLabel.textContent = this.m.apiKey;
    const select = this.doc.createElement('select');
    select.id = `route-key-${slot}`;
    const none = this.doc.createElement('option');
    none.value = '';
    none.textContent = slot === 'default' ? this.m.none : this.m.useDefault;
    select.append(none);
    const known = new Set<string>();
    for (const profile of this.store.profiles) {
      known.add(profile.id);
      const option = this.doc.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.label} (${providerName(profile.provider)})${profile.enabled ? '' : this.m.disabledSuffix}`;
      select.append(option);
    }
    if (draft.credentialId && !known.has(draft.credentialId)) {
      const option = this.doc.createElement('option');
      option.value = draft.credentialId;
      option.textContent = this.m.deletedKeyOption;
      select.append(option);
    }
    select.value = draft.credentialId;
    keyLabel.append(select);

    const profile = this.store.profiles.find(
      (p) => p.id === draft.credentialId,
    );
    const modelLabel = this.doc.createElement('label');
    modelLabel.className = 'stack';
    modelLabel.htmlFor = `route-model-${slot}`;
    modelLabel.textContent = this.m.model;
    const model = this.doc.createElement('input');
    model.id = `route-model-${slot}`;
    model.type = 'text';
    model.autocomplete = 'off';
    model.spellcheck = false;
    model.maxLength = 80;
    model.value = draft.modelId;
    model.hidden = !draft.credentialId;
    modelLabel.hidden = !draft.credentialId;
    const list = this.doc.createElement('datalist');
    list.id = `route-models-${slot}`;
    model.setAttribute('list', list.id);
    model.setAttribute('aria-describedby', `route-note-${slot}`);
    const suggestions = new Set<string>();
    if (profile) {
      for (const item of MODEL_CATALOG)
        if (item.provider === profile.provider) suggestions.add(item.id);
      for (const id of this.checks[profile.id]?.models ?? [])
        suggestions.add(id);
    }
    list.replaceChildren(
      ...[...suggestions].map((id) => {
        const option = this.doc.createElement('option');
        option.value = id;
        const reviewed = profile && catalogModel(profile.provider, id);
        if (reviewed) option.label = `${reviewed.label} — ${this.m.reviewed}`;
        return option;
      }),
    );
    modelLabel.append(model, list);
    const note = this.doc.createElement('p');
    note.className = 'hint';
    note.id = `route-note-${slot}`;
    note.textContent = draft.credentialId
      ? this.modelNote(
          profile?.provider ?? null,
          draft.modelId,
          draft.credentialId,
        )
      : '';

    select.addEventListener('change', () => {
      const next = this.store.profiles.find((p) => p.id === select.value);
      // Another provider never inherits the previous model ID.
      const keep = next && profile && next.provider === profile.provider;
      this.drafts[slot] = {
        credentialId: select.value,
        modelId: keep ? draft.modelId : '',
      };
      this.render();
    });
    model.addEventListener('input', () => {
      this.drafts[slot] = { credentialId: select.value, modelId: model.value };
      note.textContent = this.modelNote(
        profile?.provider ?? null,
        model.value,
        select.value,
      );
    });

    const actions = this.doc.createElement('div');
    actions.className = 'actions';
    const dirty = slot in this.drafts;
    const save = this.button(
      this.m.save,
      this.m.saveRouteLabel(this.slot(slot)),
      () => void this.saveRoute(slot),
    );
    save.className = 'primary';
    save.id = `route-save-${slot}`;
    const testing = this.busy.has(`route:${slot}`);
    const usable = this.routeSummary(slot).tone === 'ok';
    const test = this.button(
      testing ? this.m.testing : this.m.test,
      this.m.testLabel(this.slot(slot)),
      () => void this.testRoute(slot),
      testing || dirty || !usable,
    );
    test.id = `route-test-${slot}`;
    test.setAttribute('aria-busy', String(testing));
    actions.append(save, test);
    if (dirty) {
      const cancel = this.button(
        this.m.cancel,
        this.m.cancelRouteLabel(this.slot(slot)),
        () => {
          delete this.drafts[slot];
          this.render();
        },
      );
      actions.append(cancel);
    }
    const message = this.doc.createElement('p');
    message.className = 'message';
    message.id = `route-message-${slot}`;
    message.setAttribute('aria-live', 'polite');
    const old = this.doc.getElementById(message.id);
    if (old) {
      message.textContent = old.textContent;
      message.dataset.tone = old.dataset.tone ?? 'neutral';
    }
    for (const node of [select, model]) node.disabled = !this.ready;
    box.append(legend, summary, keyLabel, modelLabel, note, actions, message);
    return box;
  }
}
