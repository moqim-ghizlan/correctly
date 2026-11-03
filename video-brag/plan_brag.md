# Correctly — plan_brag (v5) : nouvelle version de la vidéo

**Pour : brag.** Ce fichier est **le seul plan à suivre**. Il remplace
`brag-plan.md` (v3, 57,6 s) et la v4 de ce fichier (écrite pour la 5.17).
Version présentée : **Correctly 6.1.2**. Refaire la vidéo avec **10 sections**
et une clôture ; garder la direction artistique de la v3 (voir « Ce qu'on
garde »). Tout est en **français**.

**Ce qui change par rapport à la v4 :**

- nouvelle section **Correction pendant la frappe** (6.0) : soulignement en
  direct, carte de suggestion, dictionnaire, raccourcis de remplacement ;
- nouvelle section **Capturer du texte** (6.1) avec l'**image figée** (6.1.2) :
  lire le texte d'une image ou d'une vidéo qui tourne ;
- les **raccourcis de texte** retrouvent leur propre section (« cdlt » →
  « Cordialement, » tapé dans une vraie page), comme dans la v3 ;
- les autres fonctions passent en plans éclairs dans les sections existantes :
  menu clic droit, Alt+Shift+C et poignée (section 2), dictionnaire (section
  3), traduire et reformuler en une requête (section 5), langue de
  l'interface, alertes de limites, coût estimé et sites exclus (section 10) ;
- l'ancienne section « Correction en temps réel (Ctrl+M) » devient
  **Correction dans la fenêtre** : depuis la 6.0, « en temps réel » désigne la
  correction pendant la frappe, il ne faut pas mélanger les deux ;
- la **fenêtre** est montrée dans son style actuel (onglets en pastilles,
  bouton de capture au bout), et les **paramètres** avec leur menu regroupé
  actuel, y compris les pages Correction en direct et Capture d'écran ;
- la traduction montre un **dialecte arabe** (syrien), qui n'est plus coupé
  sur les textes longs depuis la 6.1.2 ;
- le nom affiché est **Correctly** (plus « Correctly V6 »).

**Source de vérité : le code, pas ce plan.** Avant d'animer un écran, lire :

- fenêtre : `frontend/src/content/modal.ts` (CSS et structure),
  `frontend/src/content/messages.ts` et `frontend/src/shared/i18n.ts`
  (libellés FR) ;
- correction pendant la frappe : `frontend/src/content/realtime.ts` (overlay,
  carte), `messages.ts` → `realtime` ;
- capture : `frontend/src/content/area.ts` (surcouche, image figée, consigne),
  `messages.ts` → `capture` et `area` ;
- bouton de traduction : `frontend/src/content/selection.ts` ;
- paramètres : `frontend/src/options/options.html`,
  `frontend/src/options/messages-html.ts`, `options/messages.ts` ;
- vraies captures de référence (6.1.2, Brave) : `docs/v7.1/evidence/`
  (`summary-brave.png`, `modal-brave.png`, `settings-realtime-brave.png`,
  `settings-capture-brave.png`, `options-brave-900.png`, `account-brave-900.png`).

Les textes d'exemple restent fictifs (Claire, « TechDaily » sur
`techdaily.example`, clés « Perso » / « Travail »), les résultats sont écrits
pour la démo. Ne jamais présenter l'animation comme une capture réelle.

## Vue d'ensemble

Format 1920×1080, 30 i/s. **Durée totale cible : 104 s.** Tous les temps
sont des multiples de 0,4 s (150 BPM, un temps = 0,4 s) pour rester calés sur
la musique. Si le rendu change la durée, **noter la durée finale** : le site
doit être mis à jour (voir « Après le rendu »).

| #   | Section                                    | Début | Fin   | Durée  |
| --- | ------------------------------------------ | ----- | ----- | ------ |
| 1   | Intro : logo et slogan                     | 0,0   | 8,0   | 8 s    |
| 2   | Correction dans la fenêtre (Ctrl+M)        | 8,0   | 20,0  | 12 s   |
| 3   | Correction pendant la frappe (6.0)         | 20,0  | 32,0  | 12 s   |
| 4   | Reformulation                              | 32,0  | 41,2  | 9,2 s  |
| 5   | Traduction dans la fenêtre                 | 41,2  | 49,2  | 8 s    |
| 6   | Traduction sur texte sélectionné (2 démos) | 49,2  | 62,0  | 12,8 s |
| 7   | Résumé                                     | 62,0  | 69,2  | 7,2 s  |
| 8   | Raccourcis de texte                        | 69,2  | 73,2  | 4 s    |
| 9   | Capturer du texte, image figée (6.1)       | 73,2  | 86,0  | 12,8 s |
| 10  | Paramètres, connexion Google et sauvegarde | 86,0  | 100,0 | 14 s   |
| —   | Clôture (logo, appel à l'action)           | 100,0 | 104,0 | 4 s    |

La clôture n'est pas une section : c'est le dernier plan obligatoire d'une
bande-annonce (logo + appel à l'action). La garder courte.

## La fenêtre Correctly (6.1.2), commune aux sections 2 à 7 et 9

À reproduire d'après `modal.ts` et `docs/v7.1/evidence/summary-brave.png` :

- en-tête : logo, « Correctly », puis à droite roue (Paramètres), réduire,
  fermer ;
- **barre d'onglets en pastilles** dans un cadre arrondi : Correction,
  Reformulation, Traduction, Résumé (l'onglet actif est une pastille pleine) ;
- au bout, **à droite et séparé**, un bouton carré avec l'icône de capture
  (coins de cadre + trois lignes) : « Capturer du texte à l'écran » ;
- champ « Texte », puis les options de l'onglet, puis le pied : **Appliquer**
  (bouton principal), **Copier**, **Annuler**.

---

## Section 1 — Intro avec logo (0,0 – 8,0 s)

**Quoi dire.** Le problème en trois phrases-chocs, puis le nom.
**Quand.**

- 0,0–3,2 : « Vos e-mails. » « Vos messages. » « Vos idées. » + montée
  sonore (comme la v3).
- 3,2–6,4 : IMPACT, le logo s'écrase et se dessine (particules), « Correctly ».
- 6,4–8,0 : slogan « Écrivez comme vous le pensez. » puis flou vers la scène 2.

**Ne pas mettre ici** la scène « fautes tapées » de la v3 : elle ouvre la
section 2, pour que la correction soit vue en situation.

## Section 2 — Correction dans la fenêtre, Ctrl+M (8,0 – 20,0 s)

**Comportement réel** (à respecter) : l'utilisateur sélectionne son texte
dans un champ d'une page et appuie sur **Ctrl+M** (ou clique sur la poignée
au bord droit) ; la fenêtre Correctly s'ouvre sur l'onglet **Correction**.
Une seule requête IA part ; l'**aperçu** s'affiche, puis rien n'est écrit dans
la page avant un clic sur **Appliquer**. Un toast **Annuler** reste 5 s après
l'application.

**Quand.**

- 8,0–10,4 : le navigateur arrive ; un message avec des fautes se tape
  (effet glitch) ; la sélection s'allume.
- 10,4–11,6 : carte « CORRIGER. » et, bien visible, **Ctrl + M** (touches qui
  s'enfoncent). En incrustation rapide (0,4 s chacune), les autres accès :
  la **poignée** en demi-cercle qu'on fait glisser le long du bord droit, le
  **menu clic droit** « Correctly → Corriger le texte sélectionné » et
  **Alt + Maj + C** (corrige directement, sans passer par les onglets).
- 11,6–14,8 : la fenêtre s'ouvre (style 6.1.2 ci-dessus), onde de balayage
  pendant que l'IA travaille, le texte corrigé apparaît dans l'aperçu.
- 14,8–17,6 : **légende** (voir ci-dessous).
- 17,6–20,0 : **Appliquer** (impact), le texte de la page change, toast
  « Annuler » qui se vide sur 5 s.

**Légende obligatoire (3 s).** « Rien n'est écrit tant que vous n'avez pas
cliqué sur Appliquer. » (vrai dans tous les cas). Ne dire « modifiez la
correction avant de l'appliquer » que si `modal.ts` montre que le résultat est
modifiable.

## Section 3 — Correction pendant la frappe (20,0 – 32,0 s) — NOUVEAU (6.0)

**Comportement réel (à lire dans `content/realtime.ts`).** Facultative et
**désactivée par défaut** (Paramètres → Correction en direct). Après environ
une seconde de pause, ou dès la fin d'une phrase, la phrase modifiée est
vérifiée et les fautes sont **soulignées dans le champ** par une vague :
**rouge `#d93025` = orthographe**, **bleue `#1a73e8` = grammaire**. Au survol
d'un mot souligné, une **carte** blanche s'ouvre (style de `realtime.ts`) : titre « Suggestion de Correctly », type (« Orthographe » ou
« Grammaire »), **« Remplacer par « … » »**, **« Tout remplacer (n) »** quand
la même faute revient, **Ignorer**, **Ajouter au dictionnaire**. Seul le mot
change, le curseur reste en place. **Rien n'est modifié sans clic** (ou sans
raccourci). Raccourcis par défaut : **Ctrl+Espace** (corriger un mot) et
**Ctrl+Maj+Espace** (corriger toute la phrase).

Deux moteurs : par défaut l'**IA intégrée de Chrome** (rien ne quitte
l'ordinateur ; pas disponible dans Brave) ; en option, la **clé API** de
l'utilisateur (chaque phrase modifiée est envoyée, après un avertissement).

**Quand.**

- 20,0–21,2 : carte « CORRIGER EN DIRECT. », sous-titre « Pendant que vous
  écrivez. »
- 21,2–24,4 : un champ de texte simple (zone de message), une phrase se tape
  au clavier ; le curseur s'arrête, une courte pulsation, puis **« méssage »**
  se souligne en vague rouge et **« les dossier »** en vague bleue.
- 24,4–27,6 : le pointeur survole « méssage » ; la carte s'ouvre ; clic sur
  **« Remplacer par « message » »** (petit impact) ; le mot change, le
  soulignement disparaît.
- 27,6–30,0 : touches **Ctrl + Maj + Espace** qui s'enfoncent : la faute de
  grammaire est corrigée d'un coup. Légende : « Corrigez un mot ou toute la
  phrase, sans souris. »
- 30,0–32,0 : un nom propre souligné (« TechDaily ») ; clic sur **Ajouter au
  dictionnaire** : le soulignement disparaît pour de bon. Légende « Facultatif.
  Avec l'IA intégrée de Chrome, rien ne quitte votre ordinateur. » ; flou vers
  la scène 4.

**Honnêteté.** Toujours dire « facultatif ». Ne pas montrer la correction dans
un champ de mot de passe, de paiement, de code ou de recherche (elle n'y
marche jamais). Ne pas montrer Brave avec le moteur local. Ne pas montrer de
remplacement automatique sans clic.

## Section 4 — Reformulation (32,0 – 41,2 s)

**Comportement réel.** Onglet **Reformulation**. Il y a **8 styles** :
Professionnel, Formel, Amical, Décontracté, Poli, Concis, Drôle et
**Formalité personnalisée** (curseur de 1 à 5). Libellés FR exacts dans
`shared/i18n.ts` ; liste dans `shared/rewrite.ts`. Plusieurs styles cochés =
**une seule requête**, une version par style. **Ne pas écrire « 7 styles »**
(erreur de la v3).

**Quand.**

- 32,0–33,6 : carte « REFORMULER. », bascule d'onglet (la pastille glisse).
- 33,6–38,4 : trois styles arrivent sur le temps (Professionnel, Amical,
  Concis), même texte de départ, trois résultats différents.
- 38,4–41,2 : le curseur **Formalité personnalisée** glisse de 1 à 5 et le
  ton change ; flou vers la scène 5.

## Section 5 — Traduction dans la fenêtre (41,2 – 49,2 s)

**Comportement réel.** Onglet **Traduction** : langue **Vers** choisie dans
un menu « Vos langues » puis A→Z (environ 40 langues), variantes quand elles
comptent (arabe standard ou dialectes, portugais, chinois, kurde). Les langues
de droite à gauche s'affichent en `rtl`.

**Quand.**

- 41,2–42,8 : carte « TRADUIRE. ».
- 42,8–44,4 : le menu de langues s'ouvre, défilement rapide ; choix de
  l'anglais.
- 44,4–46,8 : traduction français → anglais tapée en direct.
- 46,8–49,2 : second choix rapide : **arabe, dialecte syrien**, et la case
  **« Reformuler aussi dans un style »** cochée (Amical) : traduction et
  reformulation en **une seule requête** ; un texte plus long s'écrit en
  droite-à-gauche jusqu'au bout. Flou vers la scène 6.

## Section 6 — Traduction sur texte sélectionné (49,2 – 62,0 s)

**Comportement réel (V5.15, `content/selection.ts`).** Option « Afficher un
bouton de traduction sur le texte sélectionné » (désactivée par défaut).
Quand on sélectionne du texte sur une page, un petit bouton rond apparaît au
bout de la sélection. **Rien n'est envoyé tant qu'on n'a pas cliqué
dessus.** Le seuil est `SHORT_WORDS = 5` :

- **1 à 5 mots** → une **bulle** à côté de la sélection : la traduction, le
  menu de langue, **Copier** et **Ouvrir dans Correctly**. Pas de fenêtre.
- **6 mots et plus** → la **fenêtre** s'ouvre directement sur Traduction et
  la traduction **démarre immédiatement**.

**Quand.**

- 49,2–50,4 : carte « TRADUIRE SUR LA PAGE. », sous-titre « Sélectionnez.
  Cliquez. »
- **Démo A — 3 mots, 50,4–55,6.** Sur une page d'article, « une idée
  géniale » sélectionné ; le bouton rond apparaît ; clic ; la **bulle** donne
  « a brilliant idea ». Légende : « 5 mots ou moins : une bulle, sans ouvrir
  de fenêtre. »
- **Démo B — 8 à 12 mots, 55,6–62,0.** Une phrase sélectionnée ; clic sur le
  bouton ; la **fenêtre** s'ouvre sur Traduction et la traduction se tape
  aussitôt. Légende : « Plus de 5 mots : la fenêtre s'ouvre et traduit
  aussitôt. »

Même bouton rond dans les deux démos (même icône que dans le code). Ne pas
montrer de traduction sans clic.

## Section 7 — Résumé (62,0 – 69,2 s)

**Comportement réel (V5.12).** Onglet **Résumé** : court, moyen ou détaillé ;
paragraphe ou points clés. Un texte de page sélectionné est accepté en
**lecture seule** : le résumé est écrit directement dans la langue cible, en
**une seule requête**, et on peut seulement le **copier** (bandeau : le texte
sélectionné sur la page ne peut pas être modifié, copiez le résultat).

**Quand.**

- 62,0–63,6 : carte « RÉSUMER. ».
- 63,6–65,6 : article anglais sur `techdaily.example`, long paragraphe
  sélectionné ; la fenêtre s'ouvre sur Résumé, « Points clés ».
- 65,6–68,0 : onde de balayage, puis le résumé **en français** apparaît.
- 68,0–69,2 : clic sur **Copier** (étincelle), message de confirmation.

## Section 8 — Raccourcis de texte (69,2 – 73,2 s)

**Comportement réel (`shared/shortcuts.ts`, expansion dans `smart.js`).** Des
raccourcis définis par l'utilisateur (Paramètres → Raccourcis texte, jusqu'à
500) se développent **dans la page**, pendant la frappe, quand on tape le
raccourci suivi d'une espace ou de `, ; : . ! ?`. **Sans internet, sans IA,
sans quota.** Marche aussi dans les éditeurs riches comme WhatsApp Web.
C'est la seule modification voulue sans clic.

**Quand.**

- 69,2–70,0 : carte « EN DEUX LETTRES. ».
- 70,0–72,0 : dans un champ de message, « cdlt » se tape puis une espace :
  « Cordialement, » se déploie (étincelles) ; enchaîné sur le temps,
  « sig » + espace → une signature de deux lignes.
- 72,0–73,2 : légende « Sans IA, sans réseau, sans quota. » ; flou vers la
  scène 9.

## Section 9 — Capturer du texte, image figée (73,2 – 86,0 s) — NOUVEAU (6.1)

**Comportement réel (à lire dans `content/area.ts`, `content/modal.ts`,
`docs/v7.1/RELEASE_NOTES.md`).** Le texte d'une image, d'une vidéo ou d'un PDF
scanné ne se sélectionne pas. Dans la fenêtre, le **bouton de capture** au
bout des onglets (ou un raccourci clavier réglé dans Paramètres → Capture
d'écran) :

1. la première fois, une boîte demande le **consentement image** :
   « Envoyer une image de la zone à votre fournisseur d'IA ? », boutons
   **Autoriser** / **Annuler** ;
2. la fenêtre se cache et **l'écran se fige à cet instant** (6.1.2), même si la
   vidéo continue derrière ; la page est assombrie et une consigne s'affiche
   en haut : « Faites glisser pour choisir une zone (souris ou stylet) — Échap
   pour annuler » ;
3. l'utilisateur trace un rectangle ; la fenêtre revient avec « Lecture du
   texte de l'image… », puis le texte lu remplit le champ, avec le bandeau
   « Texte lu dans une image — copie seulement » ;
4. ensuite, les quatre onglets marchent comme d'habitude (chacun = un clic et
   une requête).

Une zone = une requête, avec la propre clé de l'utilisateur et un modèle qui
sait lire les images. Rien n'est conservé.

**Quand.**

- 73,2–74,4 : carte « CAPTURER. », sous-titre « Le texte d'une image. Même
  d'une vidéo. »
- 74,4–76,4 : une page de cours en ligne fictive ; une vidéo **qui tourne**
  (barre de progression qui avance, compteur) montre une diapositive avec une
  phrase en anglais. La fenêtre Correctly est ouverte ; zoom sur le bouton de
  capture, clic.
- 76,4–77,6 : boîte de consentement (montrée une fois, rapidement) ; clic sur
  **Autoriser**.
- 77,6–80,8 : **gel** (flash bref, l'image s'immobilise, la barre de la vidéo
  s'arrête à l'écran) ; assombrissement ; consigne en haut ; le rectangle se
  trace autour de la phrase (pointillés). Légende : « L'écran se fige : rien
  ne vous échappe. »
- 80,8–83,6 : la fenêtre revient ; « Lecture du texte de l'image… » ; la
  phrase se tape dans le champ ; bandeau « copie seulement ».
- 83,6–86,0 : clic sur l'onglet **Traduction** puis Générer : la phrase
  passe en français. Légende : « Une zone, une requête, votre clé. »

**Honnêteté.** Ne pas montrer : une vidéo en plein écran (non pris en charge),
une vidéo protégée (image noire), un autre onglet, une capture qui défile, un
texte écrit directement dans la page depuis l'image (copie seulement). Le
consentement existe : ne pas le cacher complètement.

## Section 10 — Paramètres, connexion Google et sauvegarde (86,0 – 100,0 s)

**Comportement réel.** Page de paramètres 6.1.2 (`options.html`, référence
`docs/v7.1/evidence/settings-realtime-brave.png`) : en haut à gauche le logo
et « Paramètres 6.1.2 », le bouton **Compte** mis en avant, puis le menu
**regroupé** :

- **Démarrage** ;
- **CONFIGURATION** : Fournisseurs IA, Limites d'usage ;
- **ÉCRITURE** : Actions, Raccourcis clavier, Correction en direct, Capture
  d'écran, Raccourcis texte ;
- **SUIVI** : Statistiques, À propos.

Un sous-menu s'ouvre sous la page active. La sauvegarde par compte Google est
**facultative** (V5.17, `options/account-ui.ts`) : « Se connecter avec
Google », l'e-mail connecté, « Sauvegarder maintenant », « Restaurer », « Se
déconnecter », « Supprimer mon compte et mes données cloud ». Sont
sauvegardés : réglages, raccourcis de texte, raccourcis clavier de Correctly
et **clés API**, ces dernières **chiffrées sur l'ordinateur avec une phrase
secrète** avant l'envoi. Le texte envoyé à l'IA ne passe jamais par Firebase.
Sans compte, rien n'est envoyé à Google.

**Quand.**

- 86,0–87,2 : carte « VOS RÉGLAGES. ».
- 87,2–92,4 : **survol rapide**, six plans de 0,8 s en suivant le menu
  (les raccourcis de texte ont déjà leur section) :
  1. **Démarrage → Langue de l'interface** : le menu passe de « Automatique
     (langue du navigateur) » à « Français » / « English » ; légende courte
     « Français ou anglais » ;
  2. **Fournisseurs IA** : clés « Perso » / « Travail », clé et modèle par
     action, dont « Texte d'une image » et « Temps réel » ;
  3. **Limites d'usage** : par jour, semaine et mois, avec les **alertes à 80 %
     et 95 %** (une barre qui se remplit, couleurs de `limits-ui.ts`) ;
  4. **Correction en direct** : activation, moteur local, raccourcis de
     remplacement et **Sites désactivés** (un site fictif ajouté à la liste) ;
  5. **Capture d'écran** : son raccourci clavier ;
  6. **Statistiques** : requêtes et **coût estimé** par action (un coût
     inconnu s'affiche « Indisponible », jamais 0 $).
- 92,4–93,6 : carte « VOTRE COMPTE GOOGLE. ».
- 93,6–96,4 : page **Compte** ; clic sur « Se connecter avec Google » ;
  l'e-mail apparaît (fictif, `claire@example.com`) ; mention « Facultatif ».
- 96,4–98,4 : « Sauvegarder maintenant » ; « Sauvegardé. » ; légende :
  « Réinstallez, changez d'ordinateur : tout revient. »
- 98,4–100,0 : cadenas sur « clés API » + légende : « Vos clés sont chiffrées
  sur votre ordinateur. »

**Honnêteté (obligatoire).** Ne pas dire « Google stocke vos clés » sans dire
qu'elles sont chiffrées d'abord ; ne pas laisser croire que la connexion est
obligatoire. Ne jamais montrer de vrai compte, de vraie clé ni de vrai e-mail.
Les limites et statistiques ne sont pas sauvegardées : ne pas le suggérer.

## Clôture (100,0 – 104,0 s)

Montage éclair : CORRIGER. REFORMULER. TRADUIRE. RÉSUMER. CAPTURER. (0,4 s
chacun, 2 s en tout), puis logo, « Écrivez comme vous le pensez. »,
pastilles, appel à l'action (télécharger l'extension, Chrome et Brave).

---

## Ce qu'on garde de la v3

- Langage visuel : impacts, lignes de vitesse, titres flous puis nets,
  particules, balayages flous entre scènes, onde pendant que l'IA travaille,
  résultats tapés en direct. Nouveau pour la section 9 : un **effet de gel**
  (flash bref + image immobile) au moment de la capture.
- Son : 150 BPM, mi mineur (Em–C–G–D), grosse caisse à chaque temps, caisse
  claire 2 et 4, basse saturée, accords syncopés, arpèges, montées et
  roulements avant chaque carte, impacts, final. Réécrire la musique pour
  **104 s** (`work/audio-v3.mjs`), avec un impact à chaque début de section et
  un « gel » sonore (coupure courte) en section 9.
- Source du rendu : `work/video.html`, `work/capture.mjs`, `work/audio*.mjs`.

## Règles

- Tout en français (cartes, légendes, interface montrée).
- Ne montrer que des fonctions qui existent dans le code livré (**6.1.2**).
- Ne jamais montrer un envoi à l'IA sans action de l'utilisateur, sauf la
  correction pendant la frappe en mode clé API (et alors le dire).
- Aucune clé API, aucun compte réel ni texte privé dans l'image.
- Fichiers du rendu : sauvegarder le master dans `video-brag/brag.mp4`.
  Les `*.mp4`, `frames/`, `stills/` et `*.wav` ne sont jamais versionnés
  (`video-brag/.gitignore`).

## Après le rendu — mise à jour du site (obligatoire)

Dès que `brag.mp4` change, suivre **`video-brag/SETUP.md`** dans la même
tâche : réencodage ffmpeg vers `website/assets/video/` (master, 720p, poster,
teaser de 12 s, poster du teaser), **nouvelle durée** (aujourd'hui `0:58` :
`index.html` dont `aria-valuemax`, `src/js/film.js`, `film.meta`,
`hero.watch` et `video.title` dans `src/data/fr.js` et `src/data/en.js`),
**nouveaux chapitres** — les 10 sections, avec leurs temps de début : 0, 8,
20, 32, 41,2, 49,2, 62, 69,2, 73,2, 86 — dans `index.html` (pastilles
`data-chapter`, chapitres du lecteur, repères `fp-tick`), `fr.js`/`en.js`
(`film.ch.*` : ajouter les chapitres « Correction pendant la frappe »,
« Traduction sur la page » et « Capturer du texte » ; garder « Raccourcis de
texte », « Clés et réglages » devient « Réglages et compte ») et `website/scripts/verify.mjs`, la taille
du MP4 dans `film.mp4`, puis `npm run build` et `npm run verify` (0 FAIL).
Mettre aussi à jour `video.caption` si la légende ne correspond plus.
Branche : `dev`.
