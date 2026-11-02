# Security notes — V6.1 real-time correction

This milestone **deliberately changes one V5 rule**: AI checks happen while the
user types, without a click per request. Everything else is unchanged: no
server of our own, no new provider, the worker is the only network caller,
nothing in the page is ever changed without a click, no log.

## What leaves the computer

| Engine                                    | Sent                                                                                                                    | Where                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Local** (Chrome built-in AI, Auto mode) | nothing; the page script calls the browser's own on-device model, **no network request**                                | stays on the PC                                      |
| **API** (opt-in, off by default)          | one sentence + the previous sentence per check, as a separate message; never the whole field, the URL or the page title | the user's own Gemini/OpenAI key, through the worker |

- API mode needs, together: `triggers.realtime`, `realtime.engine === 'api'`
  and `realtime.apiConsent`. The worker refuses every `checkText` without all
  three (`CONSENT_REQUIRED`, no admission, no request). `apiConsent` is only
  set by the settings page after a warning dialog, and is withdrawn when the
  feature is turned off.
- Focusing a field never sends anything; only real typing (`isTrusted` input
  events) does.
- These settings are **not** part of the 5.17 account backup (it picks fixed
  fields) and `triggers.realtime` needs all-sites access, which is per
  computer.

## Where it runs

- **Excluded fields**: password, email, search, number, URL, OTP, card and
  other secret-labelled fields (V5.2 rules); `autocomplete` hints (email, tel,
  url, username, passwords, one-time-code, cc-\*, address, name…), `inputmode`
  numeric/email/tel/url, `spellcheck="false"`, `aria-hidden`/`inert`
  ancestors, disabled and read-only fields, code editors (Monaco,
  CodeMirror, Ace, `pre`, `code`), and Correctly's own UI (closed shadow roots
  are not reachable from the document listeners).
- **Per site**: `realtime.disabledSites` (hostnames, at most 200).
- **Size**: sentences of more than 1,000 code points and fields of more than
  20,000 characters are not checked.

## Messages

- `correctly.v5.checkText` `{ type, text, context }` and
  `correctly.v5.addWord` `{ type, word }` are accepted only from this
  extension's page script, with the exact key set and bounds
  (`isCheckTextRequest`, `isAddWordRequest`). Anything else is ignored with no
  network access.
- Replies carry validated issues or an error code only.

## Model output is untrusted

- The worker and the local engine both ask the model for the wrong words only
  and compute offsets themselves; the result then goes through
  `validateIssues`: exact key set, `text.slice(start, end) === original`,
  1–3 distinct suggestions of at most 200 characters, kind
  `spelling | grammar`, at most 20 issues, overlaps dropped. Anything else is
  dropped.
- Suggestions are rendered with `textContent` only. Replace and Copy are the
  only actions, and Replace re-reads the field and requires the range to
  still hold `original` (otherwise "outdated" and a new check).
- The instruction says the sentence is data and that instructions inside it
  are ignored; the sentence travels as its own message.

## Page integrity

- Underlines, card and badge live in one closed shadow root under `<html>`;
  **no node is added to or changed inside the field**. Text fields are
  measured with a hidden mirror inside that same root.
- Replace uses the browser's `insertText` (native undo) and falls back to the
  V5 exact-range replacement. `contenteditable` editors are never rewritten
  (Copy only).
- IME: nothing is checked between `compositionstart` and `compositionend`.

## Limits and storage

- Own task `realtime`: route slot, usage cap (500/day offered, off by default
  until the user turns it on; the global cap and pause always apply),
  statistics, 8 s timeout, **no retry** (a sent request stays counted).
- No text is stored: the cache (hash of the sentence → issues) lives in the
  page's memory and is cleared with the page. The dictionary stores only the
  words the user added.
- No new permission, no new host. The built-in AI is used from the page
  script; if the WP0 spike shows it needs an offscreen document, the
  `offscreen` permission will be added and audited then.

## Not verified

The local engine could not be tried (spike NOT TESTED): whether Chrome's
built-in AI is exposed to the content-script context, and its French quality,
are open. See `SPIKE_REPORT.md`.
