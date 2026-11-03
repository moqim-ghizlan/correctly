# Correctly — règles du projet

Extension personnelle Chrome/Brave, **Manifest V3, TypeScript strict**, qui
deviendra un assistant d'écriture IA à la demande (Gemini et OpenAI, clés
personnelles de l'utilisateur). État actuel : **V6.1.2 prête** (6.1.1 : page Capture d'écran et son raccourci, raccourcis de remplacement de la correction en direct ; 6.1.2 : image figée `correctly.v5.freezeScreen` (capture faite au clic, affichée sous le tracé, recadrée par le worker), nom `Correctly`, site et zip 6.1.2, preuves navigateur dans `docs/v7.1/evidence/` ; jalon V7.1,
spec `v7/v7.1*_done.md`, docs `docs/v7.1/` : **texte d'une zone d'écran** —
bouton « Capturer du texte » à droite de la barre d'onglets de la fenêtre,
`content/area.ts` (rectangle tracé sur la page, coque fermée, seuls des nombres
sortent), `shared/area.ts` (géométrie pure), message `correctly.v5.extractText`
→ `ConnectionController.extractText()` (consentement texte puis consentement
image `ocr.consent` posé par le worker via `correctly.v5.imageConsent`, route
`ocr`, modèle `vision` sinon `MODEL_NO_VISION`, capture d'abord, `admit`/`dispatch`
ensuite, une requête, 30 s), `background/capture.ts` (seul appelant de
`captureVisibleTab`, recadrage OffscreenCanvas, image ≤ 1 600 px, jamais
stockée), `background/ocr.ts` + `shared/ocr.ts` (consigne fixe, réponse
`{found,text}`), `TaskRequest.image` (Gemini `inlineData`, OpenAI
`input_image`), résultat en copie seule ; test réel avec clé et Chrome/Brave
NON FAIT, coût réel par image BLOQUÉ) ; V6.0.0 prête (V6.1.1 à V6.1.4 : correction en direct
pendant la frappe, facultative et désactivée par défaut ; checklist
manuelle `docs/v6.1/` passée par le propriétaire le 2026-11-02, tag `v6.0.3`) ; V5.17.0 livrée (test
réel avec un compte Google non fait). **V6.0 / V6.1** : cœur pur
`shared/realtime.ts` (contrat des erreurs et validateur, découpage en
phrases, cache, planificateur par champ : pause ~1 s ou fin de phrase, une
vérification en vol, résultat périmé jamais affiché, garde IME),
`shared/realtime-model.ts` (consigne et analyseur stricts communs aux deux
moteurs), moteur API = message `correctly.v5.checkText` → `ConnectionController.check()`
(tâche `realtime` : route, limites, statistiques propres, 8 s, jamais de
nouvel essai, refusé sans `triggers.realtime` + `realtime.engine === 'api'` +
`realtime.apiConsent`), moteur local `content/local-engine.ts` (IA intégrée de
Chrome, aucune requête réseau, détecté à l'exécution), page
`content/realtime.ts` dans `smart.js` (soulignement par **overlay** en shadow
root fermé, carte Remplacer/Copier/Ignorer/Ajouter au dictionnaire, badge de
pause), dictionnaire `shared/dictionary.ts` (`correctly.v5.dictionary`, écrit
par la page de paramètres et par le worker via `correctly.v5.addWord`, une
écriture à la fois), liste de sites désactivés, page de paramètres « Correction
en direct » ; spec `v6/v6.1*.md`, docs `docs/v6.1/`. **Règle assumée de la
6.1** : « une requête IA par action explicite » ne vaut plus pour la
correction en direct (une vérification par phrase modifiée, sans clic) ; elle
reste vraie pour correction, reformulation, traduction et résumé, et rien
n'est jamais modifié sans clic. Précédemment : V5.17 (sauvegarde facultative par compte Google :
Firebase Auth + Firestore par REST sans SDK, `background/cloud.ts`
(`CloudEngine`, seul écrivain des clés `correctly.v5.cloud*`),
`background/cloud-auth.ts`, `background/firestore.ts`, `background/domains.ts`,
`shared/cloud.ts`, `shared/cloud-config.ts` (identifiants publics), page
`options/account-ui.ts` qui remplace la page Synchronisation de la 5.14
(`background/sync.ts` et `options/sync-ui.ts` supprimés ; `shared/sync.ts`
reste pour les formats, le chiffrement et la fusion des raccourcis) ; règles
dans `firebase/firestore.rules` ; spec `v5/v5.17.md`, docs `docs/v5.17/` ;
reste : page `privacy.html`, version 5.17.0, site, checklist avec un vrai
compte Google), V5.16.0 (catalogue d'environ 40 langues de texte dans `shared/translate.ts` (`LANGUAGES`, `VARIANTS` par langue : arabe ×6, portugais, chinois, kurde ; `variantFits`/`variantFor`, `isRtl`, `langTag`), préférences `translation.variants` + `favorites` (≤ 12, défaut : les six V5.5) avec `arabicVariant` 5.15 lu en repli et toujours écrit (= `variants.ar`) ; menus « Vos langues » puis A→Z par `Intl.Collator` via `shared/language-menu.ts` (`fillLanguages`, `linkVariants`) dans la fenêtre, le panneau, la bulle et les paramètres ; sortie `dir="rtl"` pour les cibles RTL ; spec `v5/v5.16_done.md`, docs `docs/v5.16/`) ; V5.15.0 (bouton de traduction optionnel sur le texte sélectionné, `content/selection.ts` dans `smart.js`, réglage `triggers.selectionButton` non synchronisé, ≤ 5 mots → bulle (une requête `TRANSLATE_TEXT` par clic), au-delà → message `OPEN_TRANSLATION` → fenêtre sur Traduction avec traduction immédiate ; spec `v5/v5.15_done.md`, docs `docs/v5.15/`) ; V5.14.1 (marge de réflexion Gemini `THINKING_ALLOWANCE` dans `gemini-client.ts`, fenêtre plus grande et restylée dans `content/modal.ts`) ; V5.14.0 (synchronisation optionnelle entre ordinateurs par `chrome.storage.sync`, désactivée par défaut : `shared/sync.ts` (format, découpage, fusion à trois voies des raccourcis, chiffrement PBKDF2 + AES-GCM des clés), `background/sync.ts` (`SyncEngine`, seul écrivain de `storage.sync`), page `options/sync-ui.ts` ; ID d'extension fixé par `"key"` du manifeste, `annnnjfiddfooccihpgebjnipppaejpo`, clé privée hors dépôt ; spec `v5/v5.14_done.md`, docs `docs/v5.14/`, checklist à deux PC non faite) ; V5.13.4 (raccourcis de texte aussi dans les `contenteditable` comme WhatsApp Web, `typedInEditable()` de `content/shortcuts.ts` ; modale de confirmation `options/dialog.ts` pour les raccourcis) ; V5.13.3 (style de reformulation « Formalité personnalisée » `custom`, curseur 1–5 `FORMALITY_LEVELS` dans `shared/rewrite.ts`, champ `formality` exigé avec ce style, réglage `rewrite.formality`) ; V5.13 (interface anglais/français au choix, voir plus bas) ; V5.12 (4ᵉ onglet Résumé
`shared/summary.ts` + `background/summary.ts`, tâche `summary` distincte
(route, limites, stats), résumé écrit directement dans la langue cible en
une requête ; texte de page sélectionné accepté en lecture seule, copie
seulement, `capture(doc, { readOnlyPage })` ; rapport
`docs/v5.12/TEST_REPORT.md`, checklist propriétaire non faite ; V5.11 :
poignée en demi-cercle
au bord droit `content/handle.ts` + modale unique à trois onglets
Correction/Reformulation/Traduction `content/modal.ts`, ouverte par la
poignée, Ctrl+M ou l'icône ; rapport `docs/v5.11/TEST_REPORT.md`, checklist
propriétaire non faite ; V5.10 : audit `docs/v5.10/V5.10_REPORT.md`)
= page de paramètres, service worker,
correction, réécriture (7 styles), traduction (6 langues, arabe standard ou
syrien) à la demande, et raccourcis de texte locaux (`shared/shortcuts.ts`,
expansion dans `smart.js`, protection IA par marqueurs dans
`shared/protection.ts`). Bouton de la barre d'outils,
raccourcis, menu clic droit et poignée (`OPEN_MODAL`) passent par
`correctInTab()` du worker, qui injecte `content.js` (`activeTab` +
`scripting`) puis appelle `correctlyRun(intent, styles, translation,
rewriteEnabled)` ; `'open'` ouvre la modale (`openModal()`), les autres
intents gardent le panneau V5.2–V5.5 (`runInPage()`). La poignée optionnelle
(`smart.js`, réglage `triggers.smartButton`, accès à tous les sites demandé
seulement à l'activation) remplace l'ancien bouton intelligent ; sa position
(`correctly.v5.handle`) n'est écrite que par le worker. Une seule requête IA par action explicite (`generate()` du
contrôleur), aperçu, puis Apply explicite. V5.7 : plusieurs clés
(profils) Gemini/OpenAI et une route clé + modèle par action
(`shared/providers.ts`), résolue et figée par requête, sans jamais de
repli vers une autre clé, un autre modèle ou fournisseur. V5.8 : limites
jour/semaine/mois (total, par action, par fournisseur, par clé), alertes
80/95/100 %, pause, dans IndexedDB `correctly-v5-quota`
(`shared/quota.ts` règles pures, `shared/quota-store.ts` transactions
atomiques) : `admit` puis `dispatch` (marqué envoyé) AVANT tout `fetch`,
jamais de remboursement ni de rejeu après envoi. V5.9 : statistiques locales
(`shared/stats.ts`, `shared/prices.ts`, `options/stats-ui.ts`) lues dans le
journal `operations` (schéma v2 : index `dispatchAt`, stores `events` et
`prices`, rétention 400 jours) ; coût estimé en BigInt, inconnu ≠ 0 ;
événements Apply/Undo (`AI_EDIT`) vérifiés par onglet/cadre d'origine.

## Ce qui n'existe plus

V1–V4 (LanguageTool, serveur `127.0.0.1:8081`, backend Python, Java, tray,
installateur Windows, `createSetup.cmd`) ont été **supprimés** ; leurs sources
sont dans le tag Git `v4.0.0`. Le runtime V5 est **frontend-only** : ne jamais
réintroduire serveur local, Java, Python, LanguageTool, `.exe` ou installateur
(interdit par les specs `v5/*.md` et bloqué par `scripts/audit-dist.mjs`).
**Exception 5.17 assumée** : en plus de Gemini et OpenAI, le worker peut
appeler les trois API REST de Firebase (Identity Toolkit, Secure Token,
Firestore) pour la sauvegarde facultative du compte ; toujours aucun serveur à
nous, aucun SDK, aucun texte envoyé à l'IA vers Firebase, clés API chiffrées
sur l'ordinateur avant envoi. Le secret client OAuth (`GOCSPX-`) et tout
fichier de compte de service sont interdits (audit du build).
Les documents `plans/` et l'historique V4 sont du contexte, pas l'état du code.

## Carte du dépôt

- `frontend/manifest.json` — seul manifeste (copié dans `dist/` par Vite).
- `frontend/src/background/` — service worker, **seul appelant réseau** :
  `index.ts` (expéditeur de confiance + forme exacte du message,
  `storage.local` restreint aux contextes de confiance),
  `connection-controller.ts` (route figée, limites, un appel), `transport.ts`,
  `gemini-client.ts`, `openai-client.ts` (API Responses, `store:false`).
- `frontend/src/content/` — script injecté au clic : capture de la sélection,
  aperçu (shadow root fermé), Apply/Undo sur plage exacte.
- `frontend/src/options/` — page de paramètres (`settings-ui.ts`,
  `providers-ui.ts` pour clés et routes, `limits-ui.ts` pour les limites
  d'usage, `stats-ui.ts` pour les statistiques, `shortcuts-ui.ts`).
- `frontend/src/shared/` — contrats de messages, erreurs, catalogue de
  modèles (`models.ts`), profils/routes/secrets et migration V5.1
  (`providers.ts`), limites d'usage (`quota.ts`, `quota-store.ts`),
  schémas/normalisation des réglages, adaptateur `chrome.storage.local`.
- `frontend/tests/` — Vitest + jsdom (`unit/`, `integration/`,
  `helpers/fake-storage.ts`, `helpers/setup.ts` : IndexedDB `fake-indexeddb`
  neuve à chaque test).
- `scripts/` — audit de `dist/`, packaging ZIP, watch, smoke test navigateur.
- `website/` — site vitrine statique, séparé de l'extension (son propre
  `package.json` ; `website/site/` = site publié sur GitHub Pages, à
  régénérer par `npm run build`). Le site se déploie depuis **`main`** (push
  sur `main` qui touche `website/site/`) ; `main` et `dev` restent identiques
  par avance rapide (la branche `showcase-website` est obsolète). Consignes : `website/SETUP.md` ;
  technique : `website/README.md`.
- `video-brag/` — sources de la vidéo de présentation. **Toute modification
  de la vidéo doit être reportée dans `website/` dans la même tâche** :
  suivre `video-brag/SETUP.md` (réencodage, durée, chapitres, contrôles).
  Images, musique et rendus sont régénérés et jamais versionnés.
- `docs/v5.1/` — architecture, sécurité, rapport de tests, checklist manuelle.
- `v5/` — spécifications des jalons V5 (`*_done.md` = livrés ; les autres
  sont des plans, pas des preuves).

## Commandes (racine, Node 22.13+ ou 24+)

```powershell
npm ci
npm test              # Vitest
npm run lint          # ESLint type-checked
npm run typecheck
npm run build         # typecheck + 2 builds Vite (modules + content.js) → dist/ + audit
npm run format:check
```

## Règles générales

- **Lire le code réel avant d'agir.** Les specs `v5/` proposent des chemins
  illustratifs ; le dépôt et les tests exécutés font foi.
- **Un jalon à la fois.** Ne pas implémenter silencieusement V5.(n+1).
- **Changement minimal**, dans le style existant : pas de nouvelle dépendance,
  permission, abstraction ou framework sans besoin démontré.
- **Ne jamais modifier les clés de stockage V4** ; les clés V5 sont
  namespacées `correctly.v5.*` et chaque lecture passe par `normalize*`.
- **Aucun log** dans le worker ou la page (ni clé, ni requête, ni réponse).
- **Ne jamais prétendre qu'un test est passé** sans l'avoir lancé. Distinguer
  PASS / FAIL / NON TESTÉ / BLOQUÉ (ex. test live qui exige la clé du
  propriétaire).
- **Git** : ne pas committer, taguer, pousser ni lancer de commande
  destructive (`reset --hard`, `clean`, suppression de `release/`) sans
  demande explicite. `dist/` et `release/` sont ignorés par Git.
- Shell : Windows 10 ; PowerShell par défaut, Git Bash disponible.
- Le code et les commentaires sont en **anglais** ; les échanges avec
  l'utilisateur en **français**. Interface **bilingue anglais/français**
  (5.13, réglage `ui.language` = `auto` | `fr` | `en`, `shared/locale.ts`) :
  catalogues `shared/i18n.ts` (commun), `content/messages.ts` (fenêtre,
  panneau, poignée), `options/messages.ts` (page de paramètres) ; le texte
  fixe de la page est généré par `node scripts/i18n-options.mjs`
  (`options.html` + `options/messages-html.ts`, ne pas les éditer à la main,
  puis `npm run format`). Toute nouvelle chaîne visible doit exister dans les
  deux langues ; le code partagé renvoie des **codes** (`ProviderError`,
  `ShortcutError`, `RangeError`, `BindingProblem`), jamais du texte. Les
  instructions envoyées à l'IA restent en anglais. Mise en page : menu
  latéral, une page à la fois selon l'ancre (`options/nav.ts`).
- Raccourcis clavier : Chrome ne permet pas de modifier les `commands` par
  code (lecture seule via `chrome.commands.getAll`, modification dans
  `chrome://extensions/shortcuts`). Correctly a donc aussi ses propres
  raccourcis dans les pages (`shared/keybindings.ts`, clé
  `correctly.v5.keybindings` écrite par la page de paramètres seule,
  `content/keys.ts` dans `smart.js`, message `KEY_COMMAND` → `correctInTab`
  avec le déclencheur `keyboard`).

## Skills du projet (`.claude/skills/`)

- `correctly-extension` — développer une fonctionnalité de l'extension.
- `correctly-debugging` — diagnostiquer et corriger un bug.
- `correctly-security` — confidentialité, clé API, permissions, réseau.
- `correctly-release` — tests complets, build, ZIP, versions et tags Git.
