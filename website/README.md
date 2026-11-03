# Correctly — showcase website

Static, bilingual (French/English) presentation site for the Correctly
extension: HTML, CSS and plain JavaScript (classic scripts, no modules, no
framework). No server, no backend, no analytics, no cookies, no AI call:
the demo only shows predefined examples.

## View it

Open **`website/site/index.html`** (double-click). That folder is the
finished site: it works from `file://` and on any static host as is.

## Edit it

`site/` is generated: change the sources, then rebuild. Node 22.13+ or 24+,
from `website/`:

```powershell
npm ci             # Tailwind CLI + self-hosted fonts (Mona Sans, Noto Sans Arabic)
npm run build      # checks, then writes site/
npm run dev        # rebuild on every change
npm run check      # dictionaries and demo data only
npm run verify     # headless Chrome checks of site/ (see below)
```

| Change                | File                                                    |
| --------------------- | ------------------------------------------------------- |
| Text (both languages) | `src/data/fr.js`, `src/data/en.js` (same keys)          |
| Page structure        | `index.html` (elements carry `data-i18n` keys, no text) |
| Styles                | `src/css/input.css` (tokens on `:root`, per theme)      |
| Behaviour             | `src/js/*.js`                                           |
| Demo results          | `src/data/demo.js`                                      |
| Download and versions | `src/data/site.js`, `assets/download/`                  |
| Real screenshots      | `assets/shots/`, `docs/v7.1/evidence/` (`build.mjs`)    |

`npm run build` stops if `fr.js` and `en.js` do not have the same keys, a key
used by the page or the scripts is missing, a dictionary key is never used,
the demo samples differ in shape between languages, or the downloadable zip
is missing.

## Publishing a new version

1. At the repository root: `npm run package` (builds and audits the
   extension, writes `release/Correctly-V<x.y>-Extension.zip`).
2. Copy that zip to `website/assets/download/Correctly-<version>.zip` and
   remove the old one.
3. Update `src/data/site.js` (`version`, `download`) and the `dl.*` texts in
   `fr.js` / `en.js` (version, date, size, what's new, test status).
4. `npm run build`, then `npm run verify`.

## The film

The section shows `assets/video/teaser.mp4`, a 12 s silent loop played only
while visible (poster only with reduced motion). "Watch the film", the hero
link and the chapter chips open `js/film.js`'s player, a `<dialog>` with
custom controls; the full film (`correctly-720.mp4` up to 900 px wide,
`correctly-1080.mp4` above) is downloaded only then. Chapter times live in
`index.html` (`data-chapter`, `fp-tick`) and their names in `film.ch.*`.

From a new master `brag.mp4`, with ffmpeg:

```powershell
ffmpeg -i brag.mp4 -c:v libx264 -preset slow -crf 23 -tune animation -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/video/correctly-1080.mp4
ffmpeg -i brag.mp4 -vf scale=-2:720 -c:v libx264 -preset slow -crf 24 -tune animation -pix_fmt yuv420p -c:a aac -b:a 112k -movflags +faststart assets/video/correctly-720.mp4
ffmpeg -ss 4.9 -i brag.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/poster.jpg
ffmpeg -ss 12.8 -t 12 -i brag.mp4 -an -vf scale=1280:-2 -c:v libx264 -preset slow -crf 27 -tune animation -pix_fmt yuv420p -movflags +faststart assets/video/teaser.mp4
ffmpeg -ss 13 -i brag.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/teaser-poster.jpg
```

Then update the duration (`0:58`, `aria-valuemax`, `film.meta`,
`hero.watch`) and the chapter times if they changed.
The "All versions" button opens the repository's GitHub Releases page: it
stays empty until releases are published there.

It is separate from the extension: own `package.json` and lockfile; the
extension's build, tests and lint do not read this folder (root ESLint
ignores `website/**`, Prettier ignores `website/site`).

## How it works

- The build fills `index.html` with the French text, so the page reads
  even without JavaScript; `js/i18n.js` switches to English (choice stored
  in `localStorage`, otherwise the browser language, French by default).
  Text is always set with `textContent`, never HTML.
- Scripts are classic and deferred, sharing `window.Correctly` (code) and
  `window.CorrectlyData` (texts, demo): this is what lets the page work from
  `file://`, where browsers refuse ES modules.
- `js/boot.js` runs in `<head>`: theme (system / light / dark, no flash),
  motion flag, language.
- Motion (`js/motion.js` + the Motion block of `input.css`) runs only with
  the `motion` class: JavaScript on and no `prefers-reduced-motion`. Blocks
  rise in on first view, the feature cards replay their illustration when
  they come into view, the header shows reading progress, the demo tab
  underline slides. Without it, everything is simply visible.
- Theme switch: one atomic change of `data-theme`; where View Transitions
  exist, the new theme is revealed by a circle growing from the button.
- The only outbound link is the GitHub Releases page ("All versions").

## `npm run verify`

Drives the installed Chrome (`--browser=<path>` to change it) over the
DevTools protocol, no extra dependency:

- `site/index.html` opened from `file://`: stylesheet, font, scripts,
  language switch, demo, no console error, no network request;
- 360, 768 and 1440 px × light/dark × French/English: language fully applied,
  theme, no horizontal scroll, no console error, no request outside the
  site, images load;
- the demo, mobile menu and Escape, theme switch and persistence, language
  persistence, the download (zip served, size), outbound links, FAQ, every
  revealed block visible after scrolling, reduced motion, the page without
  JavaScript.

Screenshots go to `--out=<dir>` (default: the OS temp folder).
`--sections [--width=360] [--theme=light] [--lang=en] [--still] [--maxHeight=2400]`
takes one screenshot per section (`--still`: reduced motion, every block
shown; `--maxHeight`: taller sections); `--og` rewrites `assets/og.png` (1200×630 share image).

## Publishing

Upload the content of `site/` to any static host (GitHub Pages, Netlify,
Vercel, a plain web server). No domain is decided yet, so there is no
canonical URL and `og:image` is relative (some social networks need an
absolute URL: set it once a domain exists).
