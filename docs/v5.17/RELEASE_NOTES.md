# Correctly 5.17.0 — Release notes (DRAFT, not released)

## New: optional Google account backup

- Settings → **Account** replaces Settings → Sync. Sign in with Google to
  keep your settings, text shortcuts, Correctly keyboard shortcuts and API
  keys in the cloud: remove the extension, reinstall it or change computer,
  sign in again and get everything back.
- **API keys are encrypted on your computer** with your passphrase
  (PBKDF2-SHA-256, 600,000 iterations → AES-GCM) before they are sent.
  Neither Google, Firebase nor the owner of Correctly can read them. A
  forgotten passphrase means the backed-up keys cannot be recovered (enter
  them again).
- **Optional.** Signed out (the default), Correctly sends nothing to Google
  or Firebase and works exactly as in 5.16.
- Backed up a few seconds after a change, and when the settings open. Two
  computers editing different text shortcuts keep both.
- Account page actions: back up now, restore, sign out, and **delete my
  account and my cloud data** (the four cloud documents, then the account).
- The text you send to the AI never goes through Firebase.

## Removed

- The 5.14 browser sync (`chrome.storage.sync`) and its page. Data already in
  your browser's synced storage is left untouched and no longer read; your
  computer keeps its own copy of everything, which the account backup uploads
  once you sign in.

## Technical

- No server of our own and no Firebase SDK: the worker calls Identity Toolkit,
  Secure Token and Firestore REST with `fetch`. New permission `identity`,
  three new host permissions and CSP `connect-src` entries. Sign-in uses
  `chrome.identity.launchWebAuthFlow` (Chrome and Brave).
- `scripts/audit-dist.mjs` now accepts exactly these hosts and the one public
  Firebase key written in `cloud-config.ts`; it refuses any other key-shaped
  string, any OAuth client secret (`GOCSPX-`) and private key.
- Firestore rules: `firebase/firestore.rules` (per-user documents, four
  domains, size limit, everything else denied).
