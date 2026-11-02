# Architecture — V6.1 real-time correction

```text
page field ──typing──► smart.js
                        content/realtime.ts  (listeners, overlay, card, badge)
                          │ createFieldChecker (shared/realtime.ts, pure)
              ┌───────────┴────────────┐
   engine = auto / local            engine = api
   content/local-engine.ts          sendMessage(checkText) ─► worker
   (Chrome built-in AI,             ConnectionController.check()
    no network)                     (task `realtime`, route, limits, 8 s, no retry)
```

## Modules

| File                                  | Role                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `shared/realtime.ts`                  | issue contract + `validateIssues`, `splitSentences`, `IssueCache`, `createFieldChecker`, message guards |
| `shared/realtime-model.ts`            | instruction, JSON schema, strict `parseRealtime` (model names words, code computes offsets)             |
| `shared/dictionary.ts`                | `correctly.v5.dictionary` (≤ 2,000 words of ≤ 64 characters), `addWord`                                 |
| `background/realtime.ts`              | the worker task (`realtimeTask`, `REALTIME_TIMEOUT_MS`)                                                 |
| `background/connection-controller.ts` | `check()` / `runCheck()`: consent gate, then the usual `begin → dispatch → settle`                      |
| `content/local-engine.ts`             | Proofreader API, else Prompt API with a JSON schema; feature-detected                                   |
| `content/realtime.ts`                 | eligibility, text reading, geometry, overlay, card, Replace/Copy/Ignore/Dictionary, badge, keyboard     |
| `options/settings-ui.ts`              | page "Real-time correction": switch, API consent dialog, engine status, sites, dictionary               |

## Scheduling (per field)

- `input` → show what is already known (cache), then check after a 1 s pause,
  or at once when the text ends with `. ! ? … 。` or a line break.
- Sentences are split with `Intl.Segmenter`; unchanged sentences come from the
  cache (no request). At most 3 sentences per run, one request in flight; a
  result for text that has since changed is cached but not shown.
- Failures do not retry by themselves; the next typing does. A failed check
  shows a badge (limit, offline, engine unavailable/downloading); a good one
  clears it.

## Engines and modes

- `engine: 'auto'` (default): the local engine only; if absent, a badge says
  real-time correction needs Chrome's built-in AI or API mode. Never the API.
- `engine: 'api'`: the worker, only with consent. The page config never
  offers `api` without `apiConsent`.
- `engine: 'local'` is stored as such but behaves like `auto` without the
  suggestion to use the API; the settings page offers Auto (box unticked) and
  API (box ticked).

## Data

- `settings.triggers.realtime` (default false), `settings.realtime`
  `{ engine, apiConsent, disabledSites }`, `correctly.v5.dictionary`.
- New task kind `realtime` in `TASKS` (route slot, quota caps, statistics).
  A stored policy or route list without it is migrated on read; no
  IndexedDB schema change (counters are created on demand).

## Known limits

- Replace in textareas and `type=text` inputs through insertText. 6.0.3: `contenteditable` too (`replaceInEditable`: select the exact word, wait for the editor to see it, `insertText`, never a DOM rewrite); Copy is only the fallback when that is not possible (word over several nodes, text changed, insertion refused).
- Google Docs and other canvas editors are unsupported.
- The local engine runs where the page script runs; the spike has not decided
  whether that context exposes the built-in AI.
