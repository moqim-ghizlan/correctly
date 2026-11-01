# Manual checklist — 5.17 (owner, real Google account) — NOT DONE

Status of every line: **NON TESTÉ** until the owner fills it in.

- [ ] Sign in on Chrome (test user listed on the consent screen)
- [ ] Sign in on Brave
- [ ] Back up; the four documents exist in the Firebase console
- [ ] `keys` document holds ciphertext only (no key visible)
- [ ] Remove the extension, reinstall, sign in: settings, shortcuts and
      keyboard shortcuts return; keys return after the passphrase
- [ ] Second computer: shortcuts edited on both are merged
- [ ] Wrong passphrase refused; weak passphrase refused
- [ ] Forgotten passphrase: "new passphrase" flow re-encrypts local keys
- [ ] Offline: local work continues; backup resumes when back online
- [ ] Sign out: data kept locally, session gone
- [ ] Delete account: documents gone in the console, account gone
- [ ] A Google account NOT listed as a test user is refused (test mode)
- [ ] French and English interface
- [ ] Signed out: no request to Google or Firebase (DevTools → Network)
