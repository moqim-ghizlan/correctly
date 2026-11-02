# V6.1 / 6.0.0 — Test report

Date: 2026-11-02. Status per line: **PASS** (run), **FAIL**, **NOT TESTED**,
**BLOCKED**.

## Automated (run on this machine)

| Check                             | Result | Detail                                                                                                                            |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`            | PASS   | Prettier clean                                                                                                                    |
| `npm run lint`                    | PASS   | ESLint type-checked, 0 error                                                                                                      |
| `npm run typecheck`               | PASS   | strict                                                                                                                            |
| `npm test`                        | PASS   | 48 files, 918 tests (about 100 new for V6.1)                                                                                      |
| `npm run build` (+ `dist/` audit) | PASS   | 11 files, no new permission or host                                                                                               |
| `npm run package`                 | PASS   | `release/Correctly-V6.0-Extension.zip`, 179,838 bytes, SHA-256 `521e15471864ca367e96becb66f89c01ab60e6c0233dddc716207ee07d849f72` |

## Catalog (`v6/v6.1.md` §10)

| ID  | Where                                                                                                                     | Result                               |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| R1  | `unit/realtime.test.ts` (pause, sentence end, cache)                                                                      | PASS                                 |
| R2  | `unit/realtime.test.ts` (stale result, one in flight)                                                                     | PASS                                 |
| R3  | `unit/realtime.test.ts`, `unit/realtime-engine.test.ts`                                                                   | PASS                                 |
| R4  | `integration/realtime-page.test.ts` (excluded fields)                                                                     | PASS                                 |
| R5  | engine tests (local mode: no `fetch`, no message; `check` refused for local/auto), `unit/local-engine.test.ts`            | PASS (stubbed built-in AI)           |
| R6  | `unit/realtime-engine.test.ts` (off by default, consent, sentence + previous only)                                        | PASS                                 |
| R7  | `unit/realtime-engine.test.ts`, `integration/service-worker.test.ts` (guard, route, task counted, limit pauses, no retry) | PASS                                 |
| R8  | `integration/realtime-page.test.ts` (range re-check, input event, outdated, keyboard, Copy)                               | PASS                                 |
| R9  | `unit/local-engine.test.ts`, page and settings tests (Ignore, dictionary, bounds)                                         | PASS                                 |
| R10 | `integration/realtime-page.test.ts` (reposition, blur, pagehide, no DOM change)                                           | PASS in jsdom with injected geometry |
| R11 | `unit/realtime.test.ts`, `integration/realtime-page.test.ts`                                                              | PASS                                 |
| R12 | `unit/local-engine.test.ts` + typed catalogs (both languages required)                                                    | PASS                                 |

## Real browser

| Check                                                                 | Result     | Detail                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:browser` (Chrome 156)                                   | BLOCKED    | 14 steps PASS, then stops on a **stale step from 5.14** (`#sync` page, removed in 5.17). Two other stale expectations were fixed (Firebase host list, `account` page id). The V6.1 feature itself is not covered by this script. |
| WP0 spike (Gemini Nano, contexts, French quality, latency)            | NOT TESTED | needs the owner's PCs: `SPIKE_REPORT.md`                                                                                                                                                                                         |
| Underlines on real pages, Replace, Gmail, WhatsApp, LinkedIn, Discord | NOT TESTED | `MANUAL_TEST_CHECKLIST.md`                                                                                                                                                                                                       |
| Local engine in Chrome, Auto message in Brave                         | NOT TESTED | idem                                                                                                                                                                                                                             |
| Typing lag on a long page                                             | NOT TESTED | idem                                                                                                                                                                                                                             |

## Not delivered

- Website and presentation video for the major version (`docs/general/processus.md`
  §5–6): not updated; the website still offers 5.17.
- `v6/v6.1*.md` are not renamed `*_done.md`: their definition of done includes
  real-browser results that do not exist yet.
