# Security notes — 5.17 account backup

- **What leaves the computer** (only when signed in): four documents per user,
  `users/{uid}/data/{settings|shortcuts|keybindings|keys}`, each
  `{schema, rev, updatedAt, payload}`. `keys` is the AES-GCM envelope only;
  the other three are the 5.14 formats (no limits, statistics, consent,
  handle or site access). Never the text sent to an AI provider.
- **Secrets**: the Firebase web `apiKey`, `projectId` and OAuth client ID are
  public identifiers (they ship in the extension). The OAuth client secret
  and service-account files are never used and are refused by the build audit.
- **Tokens**: Firebase ID/refresh tokens live in `storage.local`
  (`correctly.v5.cloudSession`), readable only by trusted extension contexts,
  read and written by the worker, never sent to a page, never logged. The
  settings page reads only the e-mail.
- **Messages**: `correctly.v5.cloud*` requests are accepted only from the
  extension's own pages, with exact shapes; replies carry a code only.
- **Sign-in**: Google OAuth in the browser's own window, `response_type=
id_token`, random nonce checked, audience and expiry checked, then
  Identity Toolkit verifies it server side.
- **Server side**: Firestore rules restrict each user to their own four
  documents, to a fixed field set and to a 200,000-character payload.
  Google is the only sign-in method. The API key is restricted by the owner to
  Identity Toolkit, Token Service and Cloud Firestore.
- **Network rules** unchanged otherwise: `credentials:'omit'`,
  `redirect:'error'`, timeout, no automatic retry beyond one conflict retry.
- **Residual risks**: a stolen unlocked browser profile exposes tokens and
  keys as it already exposes API keys; a weak passphrase weakens the keys
  backup; Spark quota exhaustion stops backups until the next day (local work
  continues); the consent screen is in test mode until the owner publishes it.
