# V6.1 — Spike report (WP0)

**Status: NOT TESTED.** The spike must run on the owner's two PCs, in Chrome
and in Brave. The agent that prepared V6.1.1 has no access to those browsers,
so **no measurement below exists yet**. Nothing here is a result; every cell
marked `NOT TESTED` must be filled in by the owner before V6.1.4 (local
engine) is designed. V6.1.2 and V6.1.3 (API engine) do not depend on it.

## How to run it

1. `chrome://extensions` → Developer mode → **Load unpacked** →
   `docs/v6.1/spike/` (throwaway extension, never shipped).
2. Click its toolbar icon → the spike page opens.
3. Button 1 probes every context (extension page, service worker, offscreen
   document, content script isolated/main world on the active https tab).
4. Button 2 creates the model (download); note the time and the size shown at
   `chrome://on-device-internals`.
5. Button 3 runs the 30 French sentences (24 wrong, 6 already right) and
   prints exact fixes, false positives, p50/p95 latency and every row.
6. Repeat in Brave on both PCs. Paste the output below.

## Results

### 1. Availability and download

| PC / browser | `Proofreader` | `LanguageModel` | Availability | Download size | Download time |
| ------------ | ------------- | --------------- | ------------ | ------------- | ------------- |
| PC 1 Chrome  | NOT TESTED    | NOT TESTED      | NOT TESTED   | NOT TESTED    | NOT TESTED    |
| PC 1 Brave   | NOT TESTED    | NOT TESTED      | NOT TESTED   | NOT TESTED    | NOT TESTED    |
| PC 2 Chrome  | NOT TESTED    | NOT TESTED      | NOT TESTED   | NOT TESTED    | NOT TESTED    |
| PC 2 Brave   | NOT TESTED    | NOT TESTED      | NOT TESTED   | NOT TESTED    | NOT TESTED    |

### 2. Context where the built-in AI works (decides the architecture)

| Context                         | Works? (Chrome) | Works? (Brave) |
| ------------------------------- | --------------- | -------------- |
| Extension page                  | NOT TESTED      | NOT TESTED     |
| Service worker                  | NOT TESTED      | NOT TESTED     |
| Offscreen document              | NOT TESTED      | NOT TESTED     |
| Content script (isolated world) | NOT TESTED      | NOT TESTED     |
| Page main world (for reference) | NOT TESTED      | NOT TESTED     |

Decision rule: content script isolated world works → no new permission; only
an offscreen document works → add the audited `offscreen` permission in
V6.1.4; nothing works → local engine dropped, owner re-decides D1.

### 3. French quality (30 sentences) and latency

| Engine                  | Exact fixes (/24) | False positives (/6) | p50 (ms)   | p95 (ms)   |
| ----------------------- | ----------------- | -------------------- | ---------- | ---------- |
| Gemini Nano (Chrome)    | NOT TESTED        | NOT TESTED           | NOT TESTED | NOT TESTED |
| Gemini Flash-Lite (API) | NOT TESTED        | NOT TESTED           | NOT TESTED | NOT TESTED |
| GPT-5 nano (API)        | NOT TESTED        | NOT TESTED           | NOT TESTED | NOT TESTED |

The two API rows need the V6.1.2 worker task (or a manual run with the
owner's keys); the spike extension does not hold any API key on purpose.
"Exact fix" means the corrected sentence equals the expected one character
for character, so it under-counts valid alternatives: read the rows, not only
the totals.

## Owner decisions D0–D7

Recorded in `v6/v6.1.md` §3 as **provisional (recommended defaults)**. Only
D1 depends on this spike; the others do not. The owner confirms or changes
them after reading the table above.
