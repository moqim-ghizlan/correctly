# SETUP — la vidéo et le site vitrine

**Règle : chaque fois que `video-brag/brag.mp4` change, le site vitrine
(`website/`) doit être mis à jour dans la même tâche.** Le site n'utilise
jamais `brag.mp4` directement : il en garde des copies encodées pour le web,
une image d'aperçu, un extrait muet et des chapitres minutés. Une vidéo
modifiée sans mettre à jour le site = un site qui montre l'ancienne vidéo,
ou des chapitres qui tombent au mauvais endroit.

Ne pas considérer la tâche finie tant que les étapes 1 à 6 ne sont pas faites
et que `npm run verify` n'est pas à 0 FAIL.

## Ce que le site utilise

| Fichier (`website/assets/video/`) | Rôle                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `correctly-1080.mp4`              | film complet, écrans > 900 px (lecteur `<dialog>`)           |
| `correctly-720.mp4`               | film complet, écrans ≤ 900 px                                |
| `poster.jpg`                      | image du lecteur avant lecture (plan du logo, vers 7,8 s)    |
| `teaser.mp4`                      | extrait muet de 12 s en boucle dans la section « film »      |
| `teaser-poster.jpg`               | image de l'extrait (mouvement réduit, avant chargement)      |

Le build copie `website/assets/` dans `website/site/assets/` (le site publié).

## 1. Réencoder (ffmpeg)

Depuis `website/`, avec le nouveau master :

```powershell
$src = '..\video-brag\brag.mp4'
ffmpeg -y -i $src -c:v libx264 -preset slow -crf 27 -tune animation -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart assets/video/correctly-1080.mp4
ffmpeg -y -i $src -vf scale=-2:720 -c:v libx264 -preset slow -crf 28 -tune animation -pix_fmt yuv420p -c:a aac -b:a 112k -movflags +faststart assets/video/correctly-720.mp4
ffmpeg -y -ss 7.8 -i $src -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/poster.jpg
ffmpeg -y -ss 31.2 -t 12 -i $src -an -vf scale=1280:-2 -c:v libx264 -preset slow -crf 27 -tune animation -pix_fmt yuv420p -movflags +faststart assets/video/teaser.mp4
ffmpeg -y -ss 38.25 -i $src -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/teaser-poster.jpg
```

- `-movflags +faststart` est obligatoire : sans lui, le film ne démarre
  qu'une fois entièrement téléchargé.
- `-ss 7.8` (poster) doit tomber sur un plan propre (logo + titre), sans
  texte à moitié animé. `-ss 31.2 -t 12` (extrait : la correction pendant
  la frappe, vidéo v5) doit montrer l'interface en action. Si le storyboard a bougé, choisir de nouveaux temps et
  **regarder l'image produite** avant de continuer.
- ffmpeg est installé via WinGet ; s'il n'est pas dans le PATH :
  `(Get-ChildItem -Recurse -Filter ffmpeg.exe "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" | Select-Object -First 1).FullName`.
- Viser environ 16 Mo (1080p), 9–10 Mo (720p), < 1 Mo (extrait) pour la vidéo v5 de 156 s. Si c'est
  nettement plus, monter le `-crf` d'un ou deux points.

## 2. Durée

Lire la nouvelle durée : `ffprobe -v error -show_entries format=duration -of csv=p=0 ..\video-brag\brag.mp4`.
Si elle change, mettre à jour **tous** ces endroits :

| Fichier                  | À modifier                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| `index.html`             | `2:36` dans `.fp-time` ; `aria-valuemax="156"` sur `.fp-bar`      |
| `src/js/film.js`         | `FALLBACK_DURATION = 156`                                         |
| `src/data/fr.js`         | `hero.watch`, `video.title`, `film.meta` (« 2 min 36 »)           |
| `src/data/en.js`         | mêmes clés, en anglais                                            |
| `fr.js` / `en.js`        | `film.mp4` : la taille du fichier 1080p (« 7,6 Mo » / « 7.6 MB ») |

## 3. Chapitres

Les chapitres suivent le storyboard. La vidéo v5 suit `plan_brag.md` (104 s
de storyboard à 150 BPM) jouée 1,5 fois plus lentement (`SLOW` dans
`work/video.html` et `work/audio-v5.mjs`, `DUR` dans `work/capture.mjs`) :
156 s à 100 BPM. Temps actuels = temps du plan × 1,5 : 0 (Introduction), 12
(Correction), 30 (Correction pendant la frappe), 48 (Reformulation), 61.8
(Traduction), 73.8 (Traduction sur la page), 93 (Résumé), 103.8 (Raccourcis
de texte), 109.8 (Capturer du texte), 129 (Réglages et compte).

Si une scène bouge, est ajoutée ou supprimée, mettre à jour dans
`index.html` :

- les **pastilles** sous l'extrait (`.film-chip`) et les **chapitres du
  lecteur** (`.fp-chapter`) : `data-chapter="<secondes>"` **et** le texte
  affiché `<span class="chapter-time">0:12</span>` — les deux listes doivent
  rester identiques ;
- les **repères de la barre** (`.fp-tick`, un par chapitre sauf le premier) :
  `left: <temps / durée × 100>%` (ex. 12 / 156 = 7.69 %) ;
- les noms dans `src/data/fr.js` et `en.js` (`film.ch.*`) ; une nouvelle
  clé doit exister dans les deux langues (le build échoue sinon) ;
- `scripts/verify.mjs` : le test ouvre le chapitre `61.8` et le capture
  `--film` ouvre `109.8` ; adapter s'ils n'existent plus.

Vérifier chaque temps sur une planche d'images :
`ffmpeg -i ..\video-brag\brag.mp4 -vf "select='eq(n\,360)+eq(n\,900)',scale=640:-1,tile=2x1" -frames:v 1 planche.jpg`
(numéro d'image = secondes × 30).

## 4. Exactitude du contenu

Le site s'interdit d'afficher une fonctionnalité fausse. Avant d'intégrer,
comparer ce que la vidéo affirme avec la version présentée (`website/src/data/site.js`,
`version`). Exemple déjà relevé : la vidéo dit « 7 styles », la version
5.13.3 en a 8 (Formalité personnalisée). Signaler tout écart au
propriétaire plutôt que de le publier en silence.

La légende sous la vidéo (`video.caption`) dit que c'est une bande-annonce
animée recréée d'après l'interface réelle, avec des textes d'exemple : la
garder vraie (ne jamais présenter une animation comme une capture réelle).

## 5. Rebuild et contrôles

Depuis `website/` :

```powershell
npm run build      # régénère website/site (copie les nouveaux fichiers)
npm run verify     # doit finir par « 0 FAIL »
node scripts/verify.mjs --film --out=<dossier>      # regarder le lecteur ouvert
node scripts/verify.mjs --sections --out=<dossier>  # regarder la section film
```

Regarder les captures (poster, extrait, lecteur, chapitre actif) avant de
conclure. Puis, depuis la racine : `npx prettier --write website`.

## 6. Publier

- Branches : le site et la vidéo vivent avec l'extension sur `main` et
  `dev`, tenues identiques par avance rapide. **Seul un push sur `main`
  redéploie le site.** Faire `git pull` d'abord.
- Commiter `website/assets/video/` **et** `website/site/` (le site publié
  est versionné ; Git ne stocke qu'une fois les fichiers identiques).
- Dans `video-brag/`, seules les sources sont versionnées (plan, HTML,
  scripts, polices) ; `frames/`, `stills/`, `*.mp4`, `*.wav` sont ignorés
  (`video-brag/.gitignore`) et ne doivent jamais être forcés dans Git.
- Ne commiter, taguer ou pousser que sur demande explicite du propriétaire.
- Après le push, le workflow redéploie le site sur
  https://moqim-ghizlan.github.io/Correctly-Real-time-Grammar-Spelling-Assistant/
  (onglet Actions pour suivre).
