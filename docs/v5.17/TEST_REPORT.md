# Test report — 5.17 (work in progress)

Automated (Vitest, jsdom, fake Firestore/Identity Toolkit): see the final run
in the release step. Live sign-in, real Firestore, rules and the browser smoke
test with the new permissions are **NON TESTÉ**; they need the owner's Google
account (`MANUAL_TEST_CHECKLIST.md`).

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
