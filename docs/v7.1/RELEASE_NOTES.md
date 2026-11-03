# Correctly 6.1.2 — Release notes

## 6.1.2 (2026-11-03)

- **Frozen frame.** Capture text now freezes the screen when you click: the
  screenshot of the visible tab is taken right away and shown under the
  selection, so the text of a playing video can be read. The worker crops
  that same frame; it stays in memory for the drawing only (never stored,
  never used after 5 minutes) and only the cropped area is sent.
- The capture keyboard shortcut no longer cancels itself when Alt is released,
  and starts the capture on an already open window.
- Gemini: larger thinking allowance, long dialect translations are no longer
  cut off.
- The extension is now named **Correctly** (was "Correctly V6").
- Website: 6.1.2 download, real-time correction and Capture text presented,
  texts made true again for real-time correction, new real screenshots of the
  window and of the settings.

## 6.1.1 (2026-11-02)

- Screen capture page in the settings with its own keyboard shortcut; its
  limits stay in Usage limits.
- Real-time correction: configurable "fix one word" and "fix the whole
  sentence" shortcuts.
- Usage alerts are shown only while the limit they were raised for still
  applies.

# 6.1.0 (V7.1: text from a screen area)

## New

- **Capture text.** A new icon button at the end of the window's tab bar. Click
  it, drag a rectangle over an image, a paused video frame or a canvas, and the
  text in that area is read by your own AI key and placed in the window's text
  box. Then Correction, Reformulation, Translation and Summary work as usual
  (each is still its own click and its own request).
- Esc or right click cancels the selection; a too small area is refused; a
  capture of a page Chrome forbids says so.
- A separate **image consent** (asked once per computer, withdrawable in
  Settings → Getting started).
- A new action in AI providers, Usage limits and Statistics: **Text from
  image** (route `ocr`, inherits Default; refused with a clear message when
  the model cannot read images).

## Good to know

- One confirmed area = one request. Cancelling, a too small area, a missing
  consent or a model without vision send and count nothing.
- The text read from an image is **copy only** (no field to write it into).
- Not supported: fullscreen video, DRM video (black frame), other tabs, a
  scrolling capture. In an iframe the button is absent.
- An image of the area (cropped on your computer, 1,600 px long side at most)
  is sent to the provider you chose; Correctly keeps nothing.
- Estimated cost: about 300 to 1,500 input tokens plus 100 to 400 output tokens
  per area. **Real cost per image: BLOCKED** until measured with the owner's key
  (statistics show it per action).

## Version

Minor release (6.0.3 to 6.1.0): website updated, no video. Package:
`release/Correctly-V6.1-Extension.zip`.

## Test status

Automated tests, lint, typecheck and build: see `TEST_REPORT.md`. The live
parts (real screenshot, crop at zoom 150 % and Windows scaling 125 %, provider
quality, Brave) are **NOT TESTED / BLOCKED** until the owner runs
`MANUAL_TEST_CHECKLIST.md`.
