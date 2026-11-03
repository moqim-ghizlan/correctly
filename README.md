# Correctly V6.1

Personal Chrome/Brave extension (Manifest V3, TypeScript): an on-demand AI
writing assistant using your own Google Gemini and/or OpenAI API keys.
Interface in English or French (V5.13: Settings → Getting started →
Interface language; "Automatic" follows the browser).

- **One Correctly window (V5.11–V5.12).** The toolbar button, **Ctrl+M** and
  the optional logo handle on the right edge of every page open the same
  centered window with four tabs: **Correction**, **Reformulation**,
  **Translation** and **Summary** (V5.12: a summary written directly in the
  chosen language and variant, short/medium/detailed, paragraph or key
  points, in one request). Text selected on an ordinary web page can be read
  too: results are copy-only, the page is never edited. Your selected text is copied into one shared, editable
  text field (or it starts empty). Nothing is sent until you click a tab's
  **Generate** button; each tab keeps its result until you edit the text.
  **Apply** replaces exactly the original selection in a plain text box and
  hides the window, with **Undo** offered for five seconds; **Copy** keeps
  the window open. The header has **Settings** (gear), **Minimize** (─, keeps
  your text and results; the handle, Ctrl+M or the icon shows it again) and
  **Close** (✕, ends the session). Escape minimizes.
  Drag the handle up or down to move it. See
  [docs/v5.11/ARCHITECTURE.md](docs/v5.11/ARCHITECTURE.md).
- **Correction on request.** The **Alt+Shift+C** shortcut and the
  right-click menu **Correctly → Correct selected text** still correct
  directly. **One** AI request checks and corrects it. Nothing changes until
  you click **Apply** (plain text boxes); elsewhere you copy the suggestion.
  Undo is available while the text is unchanged.
- **Text from a screen area (V6.1, spec V7.1).** The **Capture text** icon
  at the end of the window's tab bar (or its own keyboard shortcut, Settings →
  Screen capture) freezes the screen and lets you drag a rectangle over an
  image, a video (even while it plays, 6.1.2) or a canvas; the cropped area is read by your own AI
  key (a vision-capable model) and the text lands in the window's text box
  (copy only). Separate image consent, own route/limits/statistics ("Text
  from image"), nothing stored. See [docs/v7.1/ARCHITECTURE.md](docs/v7.1/ARCHITECTURE.md).
- **Frontend only.** No Java, Python, LanguageTool, local server or Windows
  installer. Node.js is only needed to build and test.
- **Nothing is read or sent without an explicit action.** The content script
  is injected only into the tab (and frame) where you act (`activeTab`), and
  only after you allowed sending selected text in the settings. Plain page
  text, password, email, phone, URL, number and search fields are never sent.
  The right-edge handle is off by default; turning it on asks Chrome for
  access to all sites, and turning it off removes that access.
- **Rewrite (V5.4).** The **Reformulation** tab, right-click **Correctly →
  Rewrite selected text…**, or an optional shortcut (set it in
  `chrome://extensions/shortcuts`). Pick one or more styles (Professional,
  Formal, Friendly, Casual, Polite, Concise, Funny), click **Generate
  rewrites**: **one** AI request returns one labeled version per style, in
  the same language. Choose one, then Apply, Copy or Cancel.
- **Translate (V5.5).** Right-click **Correctly → Translate selected text…**
  or **Translate & rewrite…**, the **Translation** tab, or an optional
  shortcut. Choose From (Auto-detect or a language), To (V5.16: about 40
  languages, e.g. Japanese, Persian, Hindi, Portuguese, Chinese, Ukrainian…)
  and, where it matters, a **variant**: Arabic (Modern Standard, Syrian,
  Egyptian, Moroccan, Lebanese, Gulf), Portuguese (Brazil, Portugal),
  Chinese (Simplified, Traditional), Kurdish (Kurmanji, Sorani); optionally
  tick styles. **One** AI request detects, translates and styles; then
  Apply, Copy or Cancel. Every language menu shows **Your languages**
  (favorites, Settings → Actions → Translation) first, then all languages
  A→Z; right-to-left results (Arabic, Hebrew, Persian, Urdu, Sorani) are
  shown right-to-left.
- **Text shortcuts (V5.6).** In the settings, turn on **Text shortcuts**
  (asks for site access), add e.g. `bjr` → `Bonjour`; typing `bjr` then a
  space or `, ; : . ! ?` expands it locally — no internet, no AI, no quota.
  Up to 500 entries, JSON export/import with preview. Shortcuts found in text
  you correct, rewrite or translate are kept unchanged by default.
- **Several providers and keys (V5.7).** Save several labeled keys for
  Google Gemini and OpenAI, and choose which key and model each action uses
  (Correction, Rewrite, Translation, Translate & rewrite, or the default).
  A missing, disabled or refused key stops the action with a message:
  Correctly never switches to another key, model or provider by itself and
  never retries.
- **Usage limits (V5.8).** Daily, weekly and monthly limits on AI requests:
  in total, per action, and optionally per provider and per key. Warnings
  at 80 % and 95 %, a hard local stop at 100 % (before anything is sent),
  **Pause all AI requests**, and an explicit time zone. Limits are enforced
  atomically in the extension's own IndexedDB, so several tabs or a worker
  restart cannot exceed them. They count requests in this browser profile,
  not money. See [docs/v5.8/USER_GUIDE.md](docs/v5.8/USER_GUIDE.md).
- **Statistics (V5.9).** Today, this week, this month or any dates:
  requests used, successful results, AI edits actually applied, tokens
  reported by the provider and an **estimated** USD cost (official list
  prices checked on 15 October 2026, or your own dated prices), by action,
  provider, model and key, with CSV/JSON export and deletion. Local only:
  viewing statistics never contacts a provider, and unknown is never shown
  as $0.00. See [docs/v5.9/USER_GUIDE.md](docs/v5.9/USER_GUIDE.md).
- **Translate button on selected text (V5.15, optional).** Settings →
  Getting started → Opening Correctly. Select text on any page: a small
  button appears at the end of the selection. Up to 5 words, a click shows a
  bubble with the translation (one request), the target language and
  variant, Copy and **Open in Correctly**; longer selections open the
  Correctly window on Translation and translate at once. Showing the button
  sends nothing; each click counts as one request. Off by default; it asks
  for access to all sites, like the handle.
- **Sync between your computers (V5.14, optional).** Settings → **Sync**:
  text shortcuts, settings, Correctly's keyboard shortcuts and, if you
  choose, API keys and routes follow your browser account through
  `chrome.storage.sync` — no Correctly server. Off by default, domain by
  domain. Keys are encrypted on your computer with a passphrase
  (PBKDF2-SHA-256 600,000 iterations → AES-GCM) before they leave it.
  Shortcuts are merged one by one; a version replaced by another computer's
  is kept and can be restored. Never synced: usage limits, statistics,
  consent, the handle and site access. About 100 KB in all (Chrome's limit):
  above that nothing is sent and a message says so. Chrome: supported;
  Brave: not guaranteed. See
  [docs/v5.14/ARCHITECTURE.md](docs/v5.14/ARCHITECTURE.md).
- **Release audit (V5.10).** No new feature: security and quota audit,
  cross-version regression tests, a clearer message when an answer is lost
  after sending (it may be billed), and the owner guide
  [docs/v5.10/USER_GUIDE.md](docs/v5.10/USER_GUIDE.md) (install, keys,
  privacy, backup, rollback, incidents).

V1–V4 (LanguageTool engine, Windows server and installer) are archived in Git:
tag `v4.0.0` contains the last V4 sources.

## Build

Requirements: Node.js 22.13+ or 24+, npm.

```powershell
npm ci
npm run build     # typecheck + bundle into dist/ + static audit of dist/
npm test          # unit + integration tests (Vitest, jsdom)
npm run lint
```

Optional:

```powershell
npm run package        # release/Correctly-V6.1-Extension.zip (+ .sha256)
npm run test:browser   # real-browser smoke test (Brave by default)
node scripts/verify-browser.mjs --browser=chrome
```

`test:browser` sends four requests with dummy keys (a model list and one
test prompt to Google and to OpenAI; expected answer: invalid key, no cost).
Add `--offline` to send none.

## Install in Chrome or Brave

1. `npm run build`
2. Open `chrome://extensions` (or `brave://extensions`), enable **Developer
   mode**, click **Load unpacked** and select the **`dist`** folder.
3. Open _Extension options_ (or the gear in the Correctly window) to open
   the settings.
4. After rebuilding, click **Reload** on the extension card.

Chrome and Brave profiles are separate: each keeps its own keys, routes,
limits and usage (unless you turn on **Sync**, 5.14).

Since 5.14 the manifest has a fixed public `key`, so the extension ID is the
same on every computer (`annnnjfiddfooccihpgebjnipppaejpo`), which
`chrome.storage.sync` needs. **Coming from 5.13 or older:** the ID changes
once and the extension starts empty. Before updating, export your text
shortcuts (Settings → Text shortcuts → Export) and, if you want, your
statistics (CSV/JSON, not re-importable); then import the shortcuts and enter
your keys, routes and limits again. See
[docs/v5.14/RELEASE_NOTES.md](docs/v5.14/RELEASE_NOTES.md).

## Use

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey)
   and/or the [OpenAI dashboard](https://platform.openai.com/api-keys). API
   keys use API billing: ChatGPT and Gemini subscriptions do not pay for them.
2. In **AI providers**, choose the provider, give the key a name, paste it and
   click **Save key**. Nothing is sent. **Check key** (free) verifies it and
   loads its model list.
3. In **Which key and model each action uses**, choose a key and a model for
   the **Default** route, and optionally a different one per action. **Test**
   sends one tiny prompt through a saved route (may be billed).
4. Under **Correction**, tick _Send the text I select to the AI provider…_.
   A V5.1–V5.6 Gemini key is moved automatically to a profile named
   _Gemini — Migrated_, used as the default route.
5. On any page, select up to 2,000 characters in a text box and open
   Correctly (toolbar button, Ctrl+M, right-edge handle), choose a tab and
   click **Generate**; or use Alt+Shift+C / the right-click menu. Change the
   shortcuts in `chrome://extensions/shortcuts` (Ctrl+M may be taken by
   another extension or app: check it there). Review the suggestion, then
   **Apply**, **Copy** or **Cancel**.
   Without consent or a usable route for that action (or on `chrome://`
   pages) the button opens the settings instead.
6. **Usage limits**: at most 20 AI requests per day in total by default (your
   previous daily limit is kept). Add weekly and monthly limits, and limits
   per action, provider or key, in **Usage limits**. One request counts once,
   whatever the number of styles. Key checks and text shortcuts never
   count. The settings show used / remaining, the reset time and today's
   requests per key, model and action. It is a safety brake, **not** a
   billing limit — set spend caps at Google and OpenAI. A request whose
   answer was lost (timeout) stays counted and may still be billed.

Keys are stored in `chrome.storage.local` of this browser profile (not
exported, not encrypted locally), restricted to the extension's own pages
and worker. They are synced only if you tick **API keys and routes** in
**Sync**, and then only encrypted with your passphrase. Use them only on your own computer and profile. Usage records
(metadata only: never text, prompts or keys) are kept in the extension's
IndexedDB.

## Repository layout

| Path                        | Content                                                   |
| --------------------------- | --------------------------------------------------------- |
| `frontend/src/`             | source (`background/`, `content/`, `options/`, `shared/`) |
| `frontend/tests/`           | unit and integration tests                                |
| `frontend/manifest.json`    | the only manifest (copied to `dist/` by Vite)             |
| `scripts/`                  | dist audit, packaging, dev watch, browser smoke test      |
| `docs/v5.1/` … `docs/v7.1/` | architecture, security, test reports, checklists          |
| `v5/`                       | V5.1–V5.x specifications                                  |
| `plans/`                    | V1–V4 plans (history)                                     |

See [docs/v7.1/TEST_REPORT.md](docs/v7.1/TEST_REPORT.md) (text from a screen area),
[docs/v5.17/TEST_REPORT.md](docs/v5.17/TEST_REPORT.md) (optional Google account backup),
[docs/v5.16/TEST_REPORT.md](docs/v5.16/TEST_REPORT.md) (about 40 translation languages, favorites, variants, RTL),
[docs/v5.15/TEST_REPORT.md](docs/v5.15/TEST_REPORT.md) (translate button on selected text),
[docs/v5.14/TEST_REPORT.md](docs/v5.14/TEST_REPORT.md) (sync between computers, fixed extension ID),
[docs/v5.12/TEST_REPORT.md](docs/v5.12/TEST_REPORT.md) (Summary tab, read-only page selection, French settings page),
[docs/v5.11/TEST_REPORT.md](docs/v5.11/TEST_REPORT.md) (right-edge handle and three-tab modal),
[docs/v5.10/V5.10_REPORT.md](docs/v5.10/V5.10_REPORT.md) (release audit and owner guide [docs/v5.10/USER_GUIDE.md](docs/v5.10/USER_GUIDE.md)),
[docs/v5.9/V5.9_REPORT.md](docs/v5.9/V5.9_REPORT.md),
[docs/v5.8/V5.8_REPORT.md](docs/v5.8/V5.8_REPORT.md),
[docs/v5.7/V5.7_REPORT.md](docs/v5.7/V5.7_REPORT.md),
[docs/v5.6/V5.6_REPORT.md](docs/v5.6/V5.6_REPORT.md),
[docs/v5.5/V5.5_REPORT.md](docs/v5.5/V5.5_REPORT.md),
[docs/v5.4/V5.4_REPORT.md](docs/v5.4/V5.4_REPORT.md),
[docs/v5.3/V5.3_REPORT.md](docs/v5.3/V5.3_REPORT.md),
[docs/v5.2/V5.2_REPORT.md](docs/v5.2/V5.2_REPORT.md),
[docs/v5.1/ARCHITECTURE.md](docs/v5.1/ARCHITECTURE.md),
[SECURITY.md](docs/v5.1/SECURITY.md),
[TEST_REPORT.md](docs/v5.1/TEST_REPORT.md) and
[MANUAL_CHECKLIST.md](docs/v5.1/MANUAL_CHECKLIST.md).
