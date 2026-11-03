# V7.1 — Test report

Honest status: PASS / FAIL / NOT TESTED / BLOCKED.

## 7.1.1 — Vision foundations

| Check                                                                                                                                | Result                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `npm run format:check`, `lint`, `typecheck`, `test`, `build` (+ audit)                                                               | PASS (49 files, 945 tests) |
| O1 Gemini body (image part after text; text-only body unchanged)                                                                     | PASS                       |
| O2 OpenAI body (`input_image` data URL; text-only content stays a string)                                                            | PASS                       |
| O3 catalog `vision`; non-vision/unknown model → `MODEL_NO_VISION`, zero fetch                                                        | PASS                       |
| O4 answer validation                                                                                                                 | PASS                       |
| O5 task kind, labels, quota caps and migration with/without caps                                                                     | PASS                       |
| Controller order: consents → route → vision → capture → admit/dispatch → one fetch; failure before dispatch not counted; own timeout | PASS                       |
| Live provider calls                                                                                                                  | BLOCKED (owner's key)      |

## 7.1.2 — Area selection and capture

| Check                                                                                                                                                        | Result                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| O6 geometry (drag in any direction, clamp, minimum size, scale from bitmap/viewport at 1x, 1.25x, 1.5x, 2x, edges)                                           | PASS                                                                            |
| O7 crop/encode (long side <= 1,600, upscale <= 2x, PNG to JPEG above the budget, oversized result refused)                                                   | PASS                                                                            |
| O8 overlay (Esc, right click, blur, hidden tab cancel; too small stays open; no listener left; page keys and scroll blocked; closed shadow root; fr/en hint) | PASS (jsdom)                                                                    |
| `captureArea` with fakes (inactive tab, Chrome refusal vs failure, no retry, bitmap closed)                                                                  | PASS                                                                            |
| Real `captureVisibleTab`, `OffscreenCanvas` crop, exact crop at zoom 150 % / Windows scaling 125 %, overlay absent from the screenshot                       | NOT TESTED (needs the loaded extension; covered by the part 4 manual checklist) |

No permission was added. Nothing is wired yet: the overlay and the capture
are not reachable from any message or button.

## 7.1.3 — Window integration, consent and settings

| Check                                                                                                                                                                                                 | Result                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `npm run format:check`, `lint`, `typecheck`, `test`, `build` (+ audit)                                                                                                                                | PASS (53 files, 999 tests)           |
| O9 `EXTRACT_TEXT` guard (exact shape, numbers, bounds, extra field, untrusted sender, options page, sub-frame, inactive tab)                                                                          | PASS                                 |
| O10 order: consents → route → vision → capture → admit/dispatch → one fetch; failed capture not counted; real worker handler with a faked `chrome.tabs` / canvas                                      | PASS                                 |
| O11 one click = one request; cancel, too small, no consent = zero request, zero count; double click = one flow                                                                                        | PASS                                 |
| O12 window: icon button in the tab bar, confirmation when text is present, result replaces text, copy-only source (Apply impossible), window and handle shown again on every path, text shown as text | PASS (jsdom)                         |
| O13 no image, base64, rectangle or recognized text in storage or IndexedDB                                                                                                                            | PASS                                 |
| O14 `ocr.consent` default false, normalized, granted only through the worker, never part of the synced settings, kept by a merge                                                                      | PASS                                 |
| O15 fr and en text for every new string and error code                                                                                                                                                | PASS                                 |
| Settings page: route "Text from image" (no-vision warning), limits and statistics list `ocr`, "Reset image consent"                                                                                   | PASS (jsdom)                         |
| Bundles: `content.js` contains the overlay, the button and the message; `smart.js` has no modal (every opening path injects `content.js`)                                                             | PASS                                 |
| Browser smoke test with a stub provider (`scripts/verify-browser.mjs` has no provider stub)                                                                                                           | NOT TESTED                           |
| Real crop at zoom 150 % / Windows scaling 125 %, own UI absent from the screenshot, Esc in a real browser                                                                                             | NOT TESTED (part 4 manual checklist) |
| Live provider reading an image                                                                                                                                                                        | BLOCKED (owner's key)                |

Design notes: the capture is refused outside the top frame (the rectangle is
in the viewport of the frame that drew it); the image consent is granted by a
worker message after the window's dialog (the page never writes storage).

## 7.1.4 — Release 6.1.0 (2026-11-02)

| Check                                                                                                                                                                                                                        | Result                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `format:check`, `lint`, `typecheck`, `test` (53 files, 1,000 tests), `build` + audit of `dist/`                                                                                                                              | PASS                                    |
| New audit rule: `captureVisibleTab` only in the worker (page scripts and options page fail the audit) + test                                                                                                                 | PASS                                    |
| `npm run package` → `release/Correctly-V6.1-Extension.zip` (189,439 bytes), SHA-256 `e80a3caa47e9175fc16099f1842f7bf8195f473125a7c807523ddfa1bf152321`, manifest version 6.1.0                                               | PASS                                    |
| Browser smoke test in Brave (`npm run test:browser`): existing flows (modal, rewrite, translate, summary, shortcuts, handle, selection button) with the new tab bar; 0 console message, only the two provider APIs contacted | PASS                                    |
| Website: `npm run check`, `npm run build`, `npm run verify`                                                                                                                                                                  | PASS (110 PASS, 0 FAIL)                 |
| Security review (`SECURITY.md`)                                                                                                                                                                                              | DONE (code review)                      |
| Capture text in a real browser (real screenshot, crop at 150 % / 125 %, own UI absent from the image, Esc, Brave)                                                                                                            | NOT TESTED — `MANUAL_TEST_CHECKLIST.md` |
| Provider quality, latency and real cost per image; confirmation of D8 (1,600 px)                                                                                                                                             | BLOCKED — owner's key                   |

Nothing is committed, tagged or pushed (on the owner's request only).

## 7.1.5 — Release 6.1.2 (2026-11-03)

Frozen frame (`FREEZE_SCREEN`), capture shortcut and settings page (6.1.1),
blur grace, Gemini thinking allowance, manifest name `Correctly`.

| Check                                                                                                                                                                                            | Result                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `format:check`, `lint`, `typecheck`, `test` (53 files, 1,014 tests), `build` + audit of `dist/`                                                                                                  | PASS                                    |
| `npm run package` → `release/Correctly-V6.1-Extension.zip` (192,932 bytes), SHA-256 `ef014db6606aa11e1e0bb89b4eac5d0b90023e423f6b8cfad064ee7dfa107824`, manifest version 6.1.2, name `Correctly` | PASS                                    |
| Browser smoke test in Brave (`node scripts/verify-browser.mjs`), evidence in `docs/v7.1/evidence/` (now also `settings-realtime` and `settings-capture` screenshots)                             | PASS (28 PASS, 0 FAIL)                  |
| Website: `npm run check`, `npm run build`, `npm run verify`                                                                                                                                      | PASS (110 PASS, 0 FAIL)                 |
| Frozen frame in a real browser (playing video, draw on the still frame, crop matches it)                                                                                                         | NOT TESTED — `MANUAL_TEST_CHECKLIST.md` |
| Provider quality, latency and real cost per image                                                                                                                                                | BLOCKED — owner's key                   |

Nothing is committed, tagged or pushed (on the owner's request only).
