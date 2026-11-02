# Correctly 6.0.0 — Release notes (DRAFT, not released, not tagged)

## New: real-time correction while you type (optional, off by default)

- Mistakes are **underlined while you write**: red wavy = spelling, blue =
  grammar. Hover (or Alt+Shift+↓) an underlined word to see the suggestions,
  then **Replace** — only that word changes, the caret stays, Ctrl+Z still
  works. Nothing is ever changed without your click.
- The sentence that changed is checked after about a second without typing,
  or as soon as you end it with `. ! ? …` or a line break — with the previous
  sentence as context, never word by word. Unchanged sentences are not
  checked again.
- Card actions: **Replace**, **Ignore** (until the page is reloaded) and
  **Add to dictionary** (never underlined again). Rich editors such as Gmail
  show the underlines but offer **Copy** instead of Replace.
- Two engines:
  - **Auto (default)**: Chrome's built-in AI (Gemini Nano). Nothing leaves
    your computer, no request is made. Not available in Brave: a small badge
    says so and nothing is sent.
  - **API (opt-in)**: your Gemini or OpenAI key, after a warning that every
    sentence you type in checked fields is sent to your provider. Own route
    ("Real-time" under Model per action), own usage limit and own line in the
    statistics. A reached limit pauses checking silently with a badge; the
    other actions are unaffected unless the total limit is reached.
- Never in password, payment, one-time-code, email, search or number
  fields, nor in code editors, and not on the sites you list.
- Settings → **Real-time correction**: switch (asks the all-sites access),
  API checkbox with its warning, local engine status, disabled sites,
  personal dictionary (add, remove, export).

## Changed rule

"One AI request per explicit action" no longer holds for real-time
correction (one request per changed sentence, API mode only). It still holds
for correction, rewrite, translation and summary.

## Technical

- New: `shared/realtime.ts`, `shared/realtime-model.ts`,
  `shared/dictionary.ts`, `background/realtime.ts`, `content/realtime.ts`,
  `content/local-engine.ts`; messages `correctly.v5.checkText` and
  `correctly.v5.addWord` (exact shapes, page script only).
- New task kind `realtime` (route slot, usage caps, statistics); older stored
  policies and route lists are migrated on read.
- No new permission or host.

## Not verified yet

- The local engine (WP0 spike) and the underline positions on real sites
  (Gmail, WhatsApp Web…): see `SPIKE_REPORT.md` and
  `MANUAL_TEST_CHECKLIST.md`, all NOT TESTED.
- Website and presentation video are **not** updated for 6.0 (the major
  version rule asks for both).
