// Interactive demo of the Correctly window. Every result is a predefined
// example from data/demo.js, rendered as text nodes: no network request,
// no AI call, no HTML injection, and nothing outside this component.
(function () {
  const { BULLET, DEMO, STYLE_IDS, TARGETS } = window.CorrectlyData;
  const { copyText } = window.Correctly.copy;
  const { getLang, onLangChange, t } = window.Correctly.i18n;

  const KINDS = ['correction', 'rewrite', 'translation', 'summary'];
  const UNDO_MS = 5000;

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  };
  const keyed = (tag, key, props = {}) =>
    el(tag, { ...props, 'data-i18n': key, text: t(key) });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Word-level diff (LCS) between two short texts: [{type, text}]. */
  function diff(before, after) {
    const a = before.match(/\s+|[^\s]+/g) ?? [];
    const b = after.match(/\s+|[^\s]+/g) ?? [];
    const lcs = Array.from(
      { length: a.length + 1 },
      () => new Uint16Array(b.length + 1),
    );
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        lcs[i][j] =
          a[i] === b[j]
            ? lcs[i + 1][j + 1] + 1
            : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    const ops = [];
    const push = (type, text) => {
      const last = ops[ops.length - 1];
      if (last?.type === type) last.text += text;
      else ops.push({ type, text });
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        push('same', a[i]);
        i += 1;
        j += 1;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('del', a[i++]);
      else push('ins', b[j++]);
    }
    while (i < a.length) push('del', a[i++]);
    while (j < b.length) push('ins', b[j++]);
    return ops;
  }

  function initDemo() {
    const root = document.getElementById('demo-window');
    if (!root) return;
    const byId = (id) => document.getElementById(id);
    const live = root.querySelector('.demo-live');
    const textArea = byId('demo-text');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const status = byId('demo-status');
    const announce = byId('demo-announce');
    const applyButton = byId('demo-apply');
    const copyButton = byId('demo-copy');
    const cancelButton = byId('demo-cancel');
    const toast = byId('demo-toast');
    const toastText = byId('demo-toast-text');
    const undoButton = byId('demo-undo');
    const styleBox = byId('demo-styles');
    const range = byId('demo-formality-range');
    const rangeValue = byId('demo-formality-value');
    const formality = byId('demo-formality');
    const target = byId('demo-to');
    const variantBox = byId('demo-variant');
    const length = byId('demo-length');
    const format = byId('demo-format');
    const motion = () => document.documentElement.classList.contains('motion');

    const state = {
      sample: 0,
      tab: 'correction',
      text: '',
      applied: null, // null | 'correction' | 'other'
      results: {},
      busy: false,
      undo: null,
      toastTimer: 0,
    };
    const sample = () => DEMO[getLang()][state.sample];

    live.hidden = false;

    // Style checkboxes (Professional ticked by default, as in the extension).
    for (const id of STYLE_IDS) {
      const box = el('input', { type: 'checkbox', value: id });
      box.checked = id === 'professional';
      styleBox.append(
        el('label', { class: 'cw-check' }, box, keyed('span', `st.${id}`)),
      );
    }
    const selectedStyles = () =>
      [...styleBox.querySelectorAll('input:checked')].map((box) => box.value);
    const syncFormality = () => {
      formality.hidden = !selectedStyles().includes('custom');
      rangeValue.textContent = t(`fl.${range.value}`);
    };

    function fillTargets() {
      const source = sample().lang;
      const previous = target.value;
      target.replaceChildren(
        ...TARGETS.filter((id) => id !== source).map((id) =>
          keyed('option', `ln.${id}`, { value: id }),
        ),
      );
      target.value =
        TARGETS.includes(previous) && previous !== source
          ? previous
          : source === 'fr'
            ? 'en'
            : 'fr';
      variantBox.hidden = target.value !== 'ar';
    }

    function setText(value, highlight) {
      state.text = value;
      textArea.value = value;
      if (highlight && motion()) {
        textArea.classList.remove('is-changed');
        void textArea.offsetWidth;
        textArea.classList.add('is-changed');
      }
    }

    // ----- Results -----
    const resultBox = (kind) => root.querySelector(`[data-result="${kind}"]`);
    const current = () => state.results[state.tab];

    function canUse(result) {
      if (!result || result.empty || result.stale) return false;
      return state.tab !== 'rewrite' || result.choice !== null;
    }

    function syncFooter() {
      const result = current();
      const usable = canUse(result) && !state.busy;
      applyButton.disabled = !usable;
      copyButton.disabled = !usable;
      cancelButton.disabled = !result || state.busy;
    }

    function staleNode() {
      const restore = keyed('button', 'demo.restore', {
        type: 'button',
        class: 'cw-link',
      });
      restore.addEventListener('click', () => reset(true));
      return el(
        'div',
        {},
        keyed('p', 'demo.stale', { class: 'cw-warn' }),
        restore,
      );
    }

    function renderResult(kind) {
      const box = resultBox(kind);
      const result = state.results[kind];
      box.replaceChildren();
      if (!result) return;
      if (result.stale) return box.append(staleNode());
      if (result.empty)
        return box.append(keyed('p', 'demo.noCorrections', { class: 'cw-ok' }));

      if (kind === 'correction') {
        const visual = el('p', {
          class: 'cw-diff cw-out',
          'aria-hidden': 'true',
        });
        const ops = diff(result.source, result.text);
        ops.forEach((op, index) => {
          if (op.type === 'same') visual.append(op.text);
          else visual.append(el(op.type, { text: op.text }));
          if (op.type === 'del' && ops[index + 1]?.type === 'ins')
            visual.append(' ');
        });
        box.append(
          keyed('span', 'demo.corrected', { class: 'cw-label' }),
          visual,
          el('p', { class: 'sr-only', text: result.text }),
        );
      } else if (kind === 'rewrite') {
        const group = el('div', {
          class: 'cw-choices',
          role: 'radiogroup',
          'aria-label': t('demo.chooseOne'),
        });
        result.items.forEach((item, index) => {
          const radio = el('input', {
            type: 'radio',
            name: 'demo-choice',
            value: String(index),
          });
          radio.checked = result.choice === index;
          radio.addEventListener('change', () => {
            result.choice = index;
            status.textContent = '';
            syncFooter();
          });
          group.append(
            el(
              'label',
              { class: 'cw-choice' },
              el(
                'span',
                { class: 'cw-choice-head' },
                radio,
                el('span', { text: item.label }),
              ),
              el('p', { class: 'cw-out', text: item.text }),
            ),
          );
        });
        box.append(group);
      } else {
        box.append(el('span', { class: 'cw-label', text: result.label }));
        if (result.points)
          box.append(
            el(
              'ul',
              { class: 'cw-list' },
              ...result.points.map((point) => el('li', { text: point })),
            ),
          );
        else {
          const out = el('p', { class: 'cw-out', text: result.text });
          if (result.rtl) {
            out.lang = 'ar';
            out.dir = 'rtl';
          }
          box.append(out);
        }
      }
    }

    function compute(kind) {
      const s = sample();
      if (state.applied === 'other') return { stale: true };
      if (kind === 'correction')
        return state.applied === 'correction'
          ? { empty: true }
          : { source: s.text, text: s.correction };
      if (kind === 'rewrite') {
        const items = selectedStyles().map((id) => {
          if (id !== 'custom')
            return { label: t(`st.${id}`), text: s.rewrite[id] };
          const level = Number(range.value);
          return {
            label: `${t('st.custom')} · ${t(`fl.${level}`)}`,
            text: s.rewrite.custom[level - 1],
          };
        });
        return {
          items,
          choice: null,
          get text() {
            return this.choice === null ? '' : this.items[this.choice].text;
          },
        };
      }
      if (kind === 'translation') {
        const to = target.value;
        const variant = root.querySelector(
          'input[name="demo-variant"]:checked',
        ).value;
        const key = to === 'ar' ? variant : to;
        const name =
          to === 'ar'
            ? `${t('ln.ar')} (${t(`v.${variant.slice(3)}`)})`
            : t(`ln.${to}`);
        return {
          label: t('demo.result.translation', { lang: name }),
          text: s.translation[key],
          rtl: to === 'ar',
        };
      }
      const summary = s.summary[length.value];
      const points = format.value === 'points' ? summary.points : null;
      return {
        label: t('demo.result.summary', { lang: t(`ln.${s.lang}`) }),
        points,
        text: points
          ? points.map((point) => BULLET + point).join('\n')
          : summary.paragraph,
      };
    }

    function lock(locked) {
      state.busy = locked;
      for (const control of root.querySelectorAll(
        '.cw-panel input, .cw-panel select, .cw-go, #demo-next',
      ))
        control.disabled = locked;
      syncFooter();
    }

    async function generate(kind, button) {
      if (state.busy) return;
      if (kind === 'rewrite' && !selectedStyles().length) {
        status.textContent = t('demo.pickStyle');
        return;
      }
      status.textContent = '';
      announce.textContent = '';
      lock(true);
      const note = keyed('span', 'demo.waitNote', { class: 'cw-wait-note' });
      button.replaceChildren(
        el('span', { class: 'spinner', 'aria-hidden': 'true' }),
        t(`demo.wait.${kind}`),
      );
      button.after(note);
      await wait(motion() ? 750 : 200);
      note.remove();
      button.replaceChildren(t(`demo.go.${kind}`));
      state.results[kind] = compute(kind);
      lock(false);
      renderResult(kind);
      const result = state.results[kind];
      if (kind === 'rewrite' && !result.stale)
        status.textContent = t('demo.chooseOne');
      else if (!result.stale) announce.textContent = t('demo.ready');
    }

    // ----- Footer actions -----
    function hideToast() {
      clearTimeout(state.toastTimer);
      const hadFocus = toast.contains(document.activeElement);
      toast.hidden = true;
      toast.classList.remove('is-running');
      state.undo = null;
      if (hadFocus) textArea.focus();
    }

    function applyResult() {
      const result = current();
      if (!canUse(result)) return;
      const kind = state.tab;
      const before = {
        text: state.text,
        applied: state.applied,
        results: state.results,
      };
      state.applied =
        kind === 'correction' && state.applied === null
          ? 'correction'
          : 'other';
      state.results = {};
      for (const k of KINDS) renderResult(k);
      setText(result.text, true);
      syncFooter();

      state.undo = { kind, before };
      toastText.textContent = t(`demo.applied.${kind}`);
      undoButton.textContent = t(`demo.undo.${kind}`);
      toast.hidden = false;
      toast.classList.remove('is-running');
      void toast.offsetWidth;
      toast.classList.add('is-running');
      undoButton.focus();
      clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(hideToast, UNDO_MS);
    }

    function undo() {
      if (!state.undo) return;
      const { kind, before } = state.undo;
      state.applied = before.applied;
      state.results = before.results;
      setText(before.text, true);
      for (const k of KINDS) renderResult(k);
      hideToast();
      status.textContent = t(`demo.undone.${kind}`);
      syncFooter();
    }

    async function copyResult() {
      const result = current();
      if (!canUse(result)) return;
      status.textContent = t(
        (await copyText(result.text)) ? 'demo.copied' : 'demo.copyFailed',
      );
    }

    function cancel() {
      delete state.results[state.tab];
      renderResult(state.tab);
      status.textContent = '';
      syncFooter();
    }

    // ----- Tabs -----
    function selectTab(kind, focus) {
      state.tab = kind;
      for (const tab of tabs) {
        const selected = tab.dataset.tab === kind;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        byId(tab.getAttribute('aria-controls')).hidden = !selected;
        if (selected && focus) tab.focus();
      }
      status.textContent = '';
      syncFooter();
    }

    function reset(focusText) {
      hideToast();
      const s = sample();
      const total = DEMO[getLang()].length;
      byId('demo-sample-count').textContent = t('demo.sample', {
        n: state.sample + 1,
        total,
      });
      byId('demo-from').textContent = t('demo.detected', {
        lang: t(`ln.${s.lang}`),
      });
      byId('demo-sum-lang').textContent = t(`ln.${s.lang}`);
      state.applied = null;
      state.results = {};
      for (const kind of KINDS) renderResult(kind);
      fillTargets();
      syncFormality();
      setText(s.text, false);
      textArea.lang = s.lang;
      status.textContent = '';
      syncFooter();
      if (focusText) textArea.focus();
    }

    // ----- Events -----
    for (const tab of tabs)
      tab.addEventListener('click', () => selectTab(tab.dataset.tab, false));
    root
      .querySelector('[role="tablist"]')
      .addEventListener('keydown', (event) => {
        const index = tabs.findIndex((tab) => tab.dataset.tab === state.tab);
        const moves = {
          ArrowRight: index + 1,
          ArrowLeft: index - 1,
          Home: 0,
          End: tabs.length - 1,
        };
        if (!(event.key in moves)) return;
        event.preventDefault();
        selectTab(
          tabs[(moves[event.key] + tabs.length) % tabs.length].dataset.tab,
          true,
        );
      });
    for (const button of root.querySelectorAll('[data-go]'))
      button.addEventListener('click', () =>
        generate(button.dataset.go, button),
      );
    styleBox.addEventListener('change', syncFormality);
    range.addEventListener('input', syncFormality);
    target.addEventListener(
      'change',
      () => (variantBox.hidden = target.value !== 'ar'),
    );
    byId('demo-next').addEventListener('click', () => {
      state.sample = (state.sample + 1) % DEMO[getLang()].length;
      reset(false);
    });
    // The site never captures the screen: the button only explains itself.
    byId('demo-capture').addEventListener('click', () => {
      status.textContent = t('demo.captureNote');
    });
    applyButton.addEventListener('click', applyResult);
    copyButton.addEventListener('click', copyResult);
    cancelButton.addEventListener('click', cancel);
    undoButton.addEventListener('click', undo);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !toast.hidden) hideToast();
    });
    onLangChange(() => {
      state.sample = 0;
      reset(false);
    });

    reset(false);
    selectTab('correction', false);
  }

  (window.Correctly ||= {}).demo = { diff, initDemo };
})();
