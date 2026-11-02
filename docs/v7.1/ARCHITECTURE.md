# V7.1 — Architecture (text from a screen area)

Shipped as **Correctly 6.1.0** (minor, decision D0). The spec folder `v7/` is
not a version number.

## Flow

```text
window (content.js)                    worker (service-worker.js)                provider
────────────────────                   ──────────────────────────                ────────
Capture text click
 └ IMAGE_CONSENT status ─────────────► read settings.ocr.consent
 └ consent dialog (once) ── grant ───► worker writes settings.ocr.consent
 └ confirm "Replace the current text?" if the box holds text
 └ hide window, handle, bubble, underlines, Undo offer
 └ selectArea(): closed-shadow overlay, user drags a rectangle (CSS px)
 └ overlay removed, two animation frames
 └ EXTRACT_TEXT { rect, viewport } ──► exact-shape guard, content-script sender,
                                       top frame only (frameId 0)
                                       consent (text) → consent (image) → route `ocr`
                                       → model reads images? (else MODEL_NO_VISION)
                                       → chrome.tabs.get: sender tab is active
                                       → captureVisibleTab(windowId, png)   (one)
                                       → crop + scale + encode (OffscreenCanvas)
                                       → admit → dispatch (marked sent) ───► one request
                                       → parse { found, text }              ◄── answer
 show window, text replaces the box ◄─ { ok, text, operationId, notice }
```

## Files

| File                                              | Role                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `shared/area.ts`                                  | Pure geometry (`normalizeRect`, `clampRect`, `isLargeEnough`, `isRectIn`, `isSize`) shared by page and worker |
| `shared/ocr.ts`                                   | `parseOcrAnswer`, `OcrResult`, `toOcrResult`, guards of `EXTRACT_TEXT` and `IMAGE_CONSENT`                    |
| `content/area.ts`                                 | `selectArea` overlay, `hideOwnUi`, `afterPaint`                                                               |
| `content/modal.ts`                                | icon button at the end of the tab bar, consent and confirmation dialogs, the flow, copy-only source           |
| `background/capture.ts`                           | `cropScale` (pure), `captureArea`, `chromeCaptureDeps` (the only `captureVisibleTab` caller)                  |
| `background/ocr.ts`                               | `ocrTask` (fixed instruction, schema `{ found, text }`), `OCR_TIMEOUT_MS` = 30 s                              |
| `background/transport.ts`                         | optional `TaskRequest.image`, `isTaskImage`, `MAX_IMAGE_BASE64_CHARS`                                         |
| `background/gemini-client.ts`, `openai-client.ts` | image part after the text part (`inlineData` / `input_image` data URL); text-only bodies unchanged            |
| `background/connection-controller.ts`             | `extractText(capture, origin)`: consents, route, vision check, capture, then the shared `generate()`          |
| `shared/models.ts`                                | `ModelInfo.vision`, `readsImages()`, task kind `ocr` ("Text from image")                                      |
| `shared/quota.ts`                                 | `ocr` caps (daily default 50, off) and `withOcrCaps` migration                                                |

## Decisions

- **Coordinates.** The page sends CSS pixels and `innerWidth/innerHeight`;
  the worker computes `bitmap.width / viewport.width` (page zoom and Windows
  scaling are already in the screenshot). `devicePixelRatio` is never used.
- **Image size (D8).** Long side at most 1,600 px; a crop under 512 px is
  enlarged at most 2x; PNG, JPEG 0.9 above 1.5 MB of base64; hard cap 4 MB.
- **Top frame only.** The rectangle is in the viewport of the frame that drew
  it, while `captureVisibleTab` captures the whole tab, so sub-frames have no
  button and the worker refuses them.
- **Scrolling** is blocked with listeners, not `overflow: hidden`, which could
  change the viewport width and shift the crop.
- **Consent.** `settings.ocr.consent` is separate from the text consent, per
  computer, never in `pickSettings` (sync) or the Firebase domains; "Reset
  image consent" is in Settings → Getting started.
- **Counting.** Nothing is counted before `dispatch`: cancel, too small area,
  missing consent, non-vision model and capture failure send and count
  nothing. "No text found" was sent, so it is counted.
- **Copy-only.** After a capture, `imageSource` makes the blocker refuse Apply:
  there is no field to write the text into.
