import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installNav, showPage } from '../../src/options/nav';

// Settings page layout: a sidebar and one page shown at a time (URL hash).

const html = readFileSync(
  join(import.meta.dirname, '../../src/options/options.html'),
  'utf8',
);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const visible = () =>
  [...document.querySelectorAll<HTMLElement>('.page')]
    .filter((page) => !page.hidden)
    .map((page) => page.id);
const current = () =>
  [...document.querySelectorAll('.sidebar a[aria-current="page"]')].map(
    (link) => link.getAttribute('href'),
  );

beforeEach(() => {
  document.body.innerHTML = body;
});

describe('settings navigation', () => {
  it('has nine pages, each linked once from the sidebar', () => {
    const pages = [...document.querySelectorAll('.page')].map((p) => p.id);
    expect(pages).toEqual([
      'start',
      'providers',
      'actions',
      'keyboard',
      'shortcuts',
      'account',
      'usage-limits',
      'statistics',
      'about',
    ]);
    const links = [...document.querySelectorAll('.sidebar a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(pages.map((id) => `#${id}`));
    expect(document.documentElement.lang || 'fr').toBe('fr');
  });

  it('shows exactly one page: the first by default, or the one in the hash', () => {
    showPage(document, '');
    expect(visible()).toEqual(['start']);
    expect(current()).toEqual(['#start']);
    showPage(document, '#statistics');
    expect(visible()).toEqual(['statistics']);
    expect(current()).toEqual(['#statistics']);
    // Unknown anchors fall back to the first page.
    showPage(document, '#nope');
    expect(visible()).toEqual(['start']);
  });

  it('an anchor inside a page shows that page (worker link #usage-limits, inner ids)', () => {
    showPage(document, '#usage-limits');
    expect(visible()).toEqual(['usage-limits']);
    showPage(document, '#profile-form');
    expect(visible()).toEqual(['providers']);
    expect(current()).toEqual(['#providers']);
  });

  it('follows hash changes; every section stays in the DOM', () => {
    const win = {
      location: { hash: '#shortcuts' },
      listeners: [] as (() => void)[],
      addEventListener(_: string, listener: () => void) {
        this.listeners.push(listener);
      },
      scrollTo: vi.fn(),
    };
    installNav(document, win as unknown as Window);
    expect(visible()).toEqual(['shortcuts']);
    win.location.hash = '#actions';
    for (const listener of win.listeners) listener();
    expect(visible()).toEqual(['actions']);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    for (const id of ['correction-consent', 'limits-form', 'stats-chart'])
      expect(document.getElementById(id)).not.toBeNull();
  });
});
