# V7.1 — Security review

Review of "text from a screen area" (Correctly 6.1.0) against the
`correctly-security` rules. Status: code review done on 2026-11-02; live
behaviour NOT TESTED (see `MANUAL_TEST_CHECKLIST.md`).

| Point                     | Finding                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New permission or host    | **None.** `activeTab` (toolbar, Ctrl+M, handle all inject through `correctInTab`) covers `captureVisibleTab`. If neither it nor site access applies, Chrome refuses and the user sees `CAPTURE_FORBIDDEN`; no permission is requested. `audit-dist` still pins permissions and hosts exactly                       |
| Who can ask for a capture | `correctly.v5.extractText`: our own content script only (`isContentScriptSender`: `sender.id` + `sender.tab`), exact shape `{ type, rect, viewport }`, finite numbers, at least 8 CSS px, inside the viewport, viewport at most 10,000 px, any extra field rejected. Web pages cannot message the extension at all |
| Which tab                 | Only `sender.tab`, only if it is the active tab (`chrome.tabs.get`), only the top frame (`frameId` 0); otherwise `CAPTURE_FAILED` before any capture                                                                                                                                                               |
| Screenshot exposure       | Taken, cropped and encoded in the worker. The page receives numbers in, text out; no pixel or base64 ever reaches it. `audit-dist` fails if `content.js`, `smart.js` or `options.js` contain `captureVisibleTab`                                                                                                   |
| What leaves the computer  | One cropped image (long side at most 1,600 px) to the provider of the route `ocr`, only after the user chose an area, with the separate image consent. Nothing else is added (fixed instruction and a fixed sentence)                                                                                              |
| Storage                   | The image, its base64, the rectangle, the URL and the recognized text are never stored: not in storage, IndexedDB, statistics, sync or Firebase (test O13). `ocr.consent` is a boolean, normalized, never synced                                                                                                   |
| Consent                   | Separate dialog in the window; granted through a worker message (the page never writes storage); withdrawn from Settings. The worker also refuses without the text consent                                                                                                                                         |
| Prompt injection          | The image text is transcribed as data (instruction says so; test with "Ignore your instructions"). The answer is validated (exact fields, bounded, controls removed), put in a `textarea` value (never HTML), and never triggers another request                                                                   |
| Model                     | Unknown or text-only model for `ocr`: `MODEL_NO_VISION` before capture, admit and fetch. No fallback to another model, key or provider                                                                                                                                                                             |
| Own UI in the shot        | Window, handle, bubble, underlines and Undo offer are hidden and two frames are painted before the message; shown again on every path                                                                                                                                                                              |
| Logs                      | None added (reviewed: no `console` call in the new files)                                                                                                                                                                                                                                                          |
| Cost                      | Own route, limits (daily 50 offered, off) and statistics; one request per confirmed area; own 30 s timeout; no retry                                                                                                                                                                                               |

Residual risks: the provider may keep the image under its own terms (stated in
the consent dialog and on the privacy page); a DRM video gives a black frame
("No text found"); the owner's real-key quality and cost per image are
BLOCKED until measured.

## 6.1.2 — Frozen frame (`correctly.v5.freezeScreen`)

Code review on 2026-11-03; live behaviour NOT TESTED.

- **Changed claim.** Since 6.1.2 the "Screenshot exposure" row above is no
  longer true as written: to freeze a playing video, the worker sends the
  PNG of the visible tab to our content script, which draws it on a canvas
  inside the closed shadow root of the selection overlay. It never goes to
  the web page's own scripts (isolated world, closed shadow root), is not
  stored and is released when the overlay closes. `captureVisibleTab` itself
  is still worker-only (audit rule unchanged).
- **Who can ask.** Bare `{ type }` only, from our content script, top frame
  only (`frameId` 0); the tab must be the active one, as for `extractText`.
  The window asks only after the image consent.
- **Worker memory.** The frame is kept per tab for the next `extractText`
  (taken once, ignored after 5 minutes). A cancelled selection leaves it in
  the worker's memory until the next capture of that tab or the worker stops
  (MV3 stops an idle worker after about 30 s); it is never written anywhere.
- **What leaves the computer.** Unchanged: only the cropped area, after the
  rectangle and the consents.
- **Residual risk.** The frame can show what the page itself cannot read
  (for example a cross-origin frame); it is only displayed in our closed
  overlay, as the live page was.
