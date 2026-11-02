# V6.1 — Manual test checklist

Results are **NOT TESTED** until the owner fills them in (PASS / FAIL / NOT
TESTED / BLOCKED). Automated tests use jsdom, which has no layout: where the
underlines really sit on the words can only be checked here.

## Setup (API mode, V6.1.3)

1. `npm run build`, load `dist/` as an unpacked extension (Chrome or Brave).
2. Settings → AI providers: a Gemini or OpenAI key; optionally a model for
   **Real-time** under "Model per action".
3. Settings → **Real-time correction**: tick "Check while typing" (accept the
   all-sites access), then tick "Check with my API key" and read the warning
   before confirming.
4. Reload the pages you test.

## Checks

| #   | Where                                    | What to do                                                         | Expected                                                                                       | Result     |
| --- | ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------- |
| 1   | Plain `<textarea>` (any test page)       | Type `Je suis aller a Lyon.`                                       | `aller` underlined (blue) within about a second; `a` possibly red                              | NOT TESTED |
| 2   | Same                                     | Hover the underlined word                                          | Card with kind, word, suggestion button                                                        | NOT TESTED |
| 3   | Same                                     | Click `Replace with "allé"`                                        | Only that word changes; caret stays where it was; Ctrl+Z undoes it                             | NOT TESTED |
| 4   | Same                                     | Type `les chat mange` then a pause                                 | `chat` and `mange` flagged (whole sentence is used)                                            | NOT TESTED |
| 5   | Same                                     | Keep typing while a check runs                                     | No flicker of an old result; sentence rechecked after the pause                                | NOT TESTED |
| 6   | Same                                     | Alt+Shift+↓, Enter / Esc                                           | Card opens on the next mistake; Enter replaces; Esc closes                                     | NOT TESTED |
| 7   | Same                                     | Scroll the page / resize the window / scroll the textarea          | Underlines follow the words                                                                    | NOT TESTED |
| 8   | Same                                     | Click away                                                         | Underlines disappear; click back: they return without a new request (see Usage → statistics)   | NOT TESTED |
| 9   | Password field, card field               | Type text                                                          | Nothing underlined, no request                                                                 | NOT TESTED |
| 10  | Gmail compose                            | Type a wrong sentence                                              | Underlines on the words; card offers **Copy** (never rewrites the editor); mail text unchanged | NOT TESTED |
| 11  | Settings                                 | Turn "Check while typing" off                                      | API box off too; reloaded pages stop checking; no request is sent                              | NOT TESTED |
| 12  | Settings → Usage limits                  | Enable a small **Real-time** daily limit, type until it is reached | Checking stops silently; Correction / Rewrite still work                                       | NOT TESTED |
| 13  | Settings → Statistics                    | After typing                                                       | `Real-time` appears as its own action                                                          | NOT TESTED |
| 14  | Dark mode page                           | Underlines and card                                                | Readable in light and dark                                                                     | NOT TESTED |
| 15  | Long page (e.g. a long thread)           | Type fast                                                          | No typing lag                                                                                  | NOT TESTED |
| 16  | Network panel (DevTools, service worker) | Type one sentence                                                  | One request per changed sentence, none while idle, none for unchanged sentences                | NOT TESTED |

## Local engine, Ignore, dictionary, sites (V6.1.4)

Untick "Check with my API key" (Auto mode) for 17–19.

| #   | Where                     | What to do                                                             | Expected                                                                        | Result     |
| --- | ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 17  | Chrome, Settings          | Open Real-time correction                                              | "Local engine status" says ready / not downloaded / downloading / not available | NOT TESTED |
| 18  | Chrome, textarea          | Type `Je suis aller a Lyon.` in Auto mode                              | Underlines appear; **no request** in the service worker's network panel         | NOT TESTED |
| 19  | Brave, textarea           | Type a sentence in Auto mode                                           | No underline; badge "needs Chrome's built-in AI or API mode"; nothing sent      | NOT TESTED |
| 20  | Any textarea              | Hover a word, **Ignore**                                               | Underline gone until the page is reloaded                                       | NOT TESTED |
| 21  | Any textarea              | Hover a word, **Add to dictionary**; reload the page and type it again | Never underlined again; the word is listed in Settings → Dictionary             | NOT TESTED |
| 22  | Settings → Dictionary     | Add a word, remove it, export                                          | List updates; a `correctly-dictionary.txt` file is saved                        | NOT TESTED |
| 23  | Settings → Disabled sites | Add the test site, save, reload the page, type                         | Nothing is checked or sent on that site, still works elsewhere                  | NOT TESTED |
| 24  | API mode, limit reached   | Reach the Real-time limit                                              | Small badge "checking paused (usage limit)" near the field                      | NOT TESTED |
| 25  | API mode, offline         | Disconnect the network, type                                           | Badge "offline"; reconnect: next typing works                                   | NOT TESTED |
| 26  | Chrome, local engine      | Type in French, Spanish, English                                       | Note which languages the local model handles (record in `SPIKE_REPORT.md`)      | NOT TESTED |

## Known limits

- Replace works in textareas and text inputs only; contenteditable editors get
  **Copy** (the exact-range V5 Apply path is not allowed there).
- Google Docs and other canvas editors are not supported.
- The local engine runs in the page script; whether Chrome exposes the
  built-in AI to that context is exactly what the spike must tell.
- The dictionary is local only (not in the account backup).
