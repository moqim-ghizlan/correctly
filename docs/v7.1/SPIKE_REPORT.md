# V7.1.1 — Spike report

Date: 2026-11-02. Status per item: PASS / NOT TESTED / BLOCKED.

| Item                                                                                                                               | Result                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gemini request fields for an inline image: `contents[].parts[]` item `inlineData { mimeType, data (base64) }`, after the text part | PASS as implemented and covered by body tests (docs: <https://ai.google.dev/gemini-api/docs/image-understanding>). Not confirmed against a live call: **BLOCKED** (needs the owner's key). |
| OpenAI Responses: `input` item with `content: [{type:"input_text"}, {type:"input_image", image_url:"data:<mime>;base64,<data>"}]`  | PASS as implemented and covered by body tests (docs: <https://developers.openai.com/api/docs/guides/images-vision>). Live call: **BLOCKED**.                                               |
| Models that read images (`vision` flag)                                                                                            | All five catalog models are marked `true` from the documentation; unknown models are always `false`. Live check: **BLOCKED**.                                                              |
| 10 sample crops at 1,024 / 1,600 / 2,048 px: quality, latency p50/p95, real tokens and cost                                        | **BLOCKED** (owner's key).                                                                                                                                                                 |
| D8 (1,600 px long side) and `OCR_TIMEOUT_MS` (30 s)                                                                                | Kept as recommended; **PROVISIONAL** until the live measures above exist.                                                                                                                  |
| `captureVisibleTab` from toolbar, Ctrl+M, handle, context menu in Chrome and Brave                                                 | **NOT TESTED** (needs the loaded extension). Design: no new permission; `CAPTURE_FORBIDDEN` when neither `activeTab` nor all-sites access is held.                                         |

No throwaway spike code was committed. Everything marked BLOCKED or NOT TESTED
is repeated in `MANUAL_TEST_CHECKLIST.md` (part 4).
