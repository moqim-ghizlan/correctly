// Settings page navigation: one page shown at a time, chosen by the URL hash
// (#providers, #usage-limits…). A hash naming an element inside a page shows
// that page. Every page stays in the DOM, so the sections keep working
// whether they are shown or not.

/** Shows the page named by `hash` (or the first one) and marks its link. */
export function showPage(doc: Document, hash: string): HTMLElement | null {
  const pages = [...doc.querySelectorAll<HTMLElement>('.page')];
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const target = id ? doc.getElementById(id) : null;
  const page =
    (target?.closest<HTMLElement>('.page') ?? null) || pages[0] || null;
  for (const item of pages) item.hidden = item !== page;
  for (const link of doc.querySelectorAll<HTMLAnchorElement>(
    '.sidebar a[href^="#"]',
  )) {
    if (page && link.getAttribute('href') === `#${page.id}`)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // Sub-menu: a page with sections shows one section (card) at a time.
  const subLinks = [...doc.querySelectorAll<HTMLAnchorElement>('.subnav a')];
  const cardOf = (link: HTMLAnchorElement) =>
    doc
      .getElementById(link.getAttribute('href')?.slice(1) ?? '')
      ?.closest<HTMLElement>('.card') ?? null;
  const mine = subLinks.filter((link) => {
    const card = cardOf(link);
    return card !== null && page?.contains(card);
  });
  const cards = mine.map(cardOf);
  const wanted = target?.closest<HTMLElement>('.card') ?? null;
  const shown = wanted && cards.includes(wanted) ? wanted : (cards[0] ?? null);
  for (const link of subLinks) {
    const card = cardOf(link);
    if (card && cards.includes(card)) card.hidden = card !== shown;
    if (card && card === shown && mine.includes(link))
      link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  return page;
}

export function installNav(doc: Document, win: Window): void {
  const update = () => {
    const page = showPage(doc, win.location.hash);
    const target = doc.getElementById(win.location.hash.slice(1));
    // A page or a section starts at the top; another anchor scrolls to itself.
    const section = doc.querySelector(`.subnav a[href="${win.location.hash}"]`);
    if (target && target !== page && !section) target.scrollIntoView();
    else win.scrollTo(0, 0);
  };
  win.addEventListener('hashchange', update);
  update();
}
