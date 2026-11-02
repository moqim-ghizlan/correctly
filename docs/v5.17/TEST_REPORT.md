# Test report — 5.17 (work in progress, not released)

Date: 2026-11-02. Windows 10, Node 22, branch `dev`. The version in
`package.json` is still 5.16.0 (the bump to 5.17.0 is part of the release step).

Live sign-in, real Firestore, rules and the browser smoke test with the new
permissions are **NON TESTÉ**; they need the owner's Google account
(`MANUAL_TEST_CHECKLIST.md`).

## Summary

| Check                                    | Result                                |
| ---------------------------------------- | ------------------------------------- |
| `npm run format:check`                   | PASS                                  |
| `npm run lint`                           | PASS                                  |
| `npm run typecheck`                      | PASS                                  |
| `npm test`                               | PASS — 44 files, 795 tests            |
| `npm run build` (Vite, audit of `dist/`) | PASS                                  |
| `node scripts/verify-browser.mjs`        | NON TESTÉ (not run for this report)   |
| `npm run package`                        | NON TESTÉ (release step)              |
| Owner manual checklist                   | **NON TESTÉ**                         |
| Firestore rules in the emulator          | **NON TESTÉ** (file written, not run) |
| Live Google sign-in, real Firestore      | **BLOCKED** (owner's Google account)  |

One test was fixed on the way: `options-nav.test.ts` expected the sidebar
links in the DOM order of the pages, but the sidebar had been reordered
(Account first, Usage limits after Providers). The test now states the
sidebar order explicitly.

## Matrix

| Area                                          | Result                                            |
| --------------------------------------------- | ------------------------------------------------- |
| F1 signed out / not configured → zero request | PASS (unit + worker)                              |
| F2 sign-in (nonce, audience, expiry, cancel)  | PASS (unit, stubbed window)                       |
| F3 refresh / expiry                           | PASS (unit)                                       |
| F4 backup per domain, debounced               | PASS (integration)                                |
| F5 keys never in clear                        | PASS (integration)                                |
| F6 corrupt/oversized cloud data refused       | PASS (integration)                                |
| F7 conflict → retry / merge                   | PASS (integration)                                |
| F8 sign-out, account deletion                 | PASS (integration)                                |
| F9 message shapes and senders                 | PASS (unit + worker)                              |
| F10 dist audit                                | PASS (unit + build)                               |
| F11 Firestore rules                           | NON TESTÉ (file written; not run in the emulator) |
| Live Google sign-in, real Firestore           | NON TESTÉ                                         |
