# SETUP — travailler sur le site vitrine

Consignes pour l'agent. Détails techniques (build, structure, contrôles) :
`website/README.md`. Vidéo : `video-brag/SETUP.md`.

## Branches : `main` publie, `dev` suit

- L'extension, le site (`website/`) et les sources de la vidéo
  (`video-brag/`) vivent ensemble sur `main` et `dev`, tenues identiques par
  avance rapide (jamais de fusion avec conflits). On ne change pas de
  branche pour travailler sur le site.
- **Le site se déploie depuis `main`** : publier = pousser `main`.
- La branche `showcase-website` est **obsolète** (fusionnée dans `dev`) : ne
  pas l'utiliser, ne pas y pousser.
- Ne commiter, taguer ou pousser que sur demande explicite du propriétaire.

## Déploiement : automatique

- Le site publié est le dossier **`website/site/`** (généré par
  `npm run build`, et versionné).
- `.github/workflows/static.yml` le déploie sur GitHub Pages à chaque push
  sur `main` **qui modifie `website/site/`** (ou le workflow) :
  https://moqim-ghizlan.github.io/Correctly-Real-time-Grammar-Spelling-Assistant/
- Un commit qui ne touche que l'extension ne redéploie pas le site.
- Ne jamais éditer `website/site/` à la main : modifier les sources
  (`website/index.html`, `website/src/`, `website/assets/`) puis
  `npm run build`.

## Quand le site doit-il changer ?

| Situation                                                  | À faire                         |
| ---------------------------------------------------------- | ------------------------------- |
| Simple travail sur l'extension, sans nouvelle version      | Rien sur le site                |
| Nouvelle version **mineure ou majeure** de l'extension     | « Nouvelle version » ci-dessous |
| Simple correctif de l'extension (`x.y.Z`)                  | Rien sur le site                |
| Une fonction affichée sur le site change, apparaît ou part | Mettre les textes à jour        |
| Version majeure (`X.0.0`) : la vidéo est refaite           | Suivre `video-brag/SETUP.md`    |

Le site ne doit **jamais** présenter comme disponible une fonction qui
n'existe pas dans la version proposée au téléchargement. En cas de doute,
lire le code de l'extension, pas les specs `v5/`.

## Nouvelle version de l'extension

1. À la racine : `npm run package` (build + audit de `dist/`, écrit
   `release/Correctly-V<x.y>-Extension.zip`). Vérifier dans le zip que
   `manifest.json` porte bien la nouvelle version.
2. Copier le zip dans `website/assets/download/Correctly-<version>.zip` et
   supprimer l'ancien.
3. `website/src/data/site.js` : `version` et `download`.
4. `website/src/data/fr.js` **et** `en.js` (mêmes clés, les deux langues) :
   - `dl.lede` (version, date), `dl.new1`–`dl.new3` (nouveautés),
     `dl.button`, `dl.size` (taille réelle du zip), `dl.note` (statut de
     test réel : ne jamais affirmer un test non fait) ;
   - `footer.version` ;
   - tout texte de fonctionnalité devenu faux (sections Fonctions, Démo,
     Confidentialité, Et aussi, FAQ).
5. Si l'interface de la fenêtre change, mettre à jour la maquette du hero et
   la démo (`website/index.html`, `src/data/demo.js`).

## Vérifier et livrer

Depuis `website/` :

```powershell
npm ci              # première fois seulement
npm run build       # échoue si FR/EN divergent, clé manquante ou inutilisée, zip absent
npm run verify      # Chrome headless : doit finir par « 0 FAIL »
```

Regarder aussi le rendu (`node scripts/verify.mjs --sections --out=<dossier>`)
avant de conclure. Puis, à la racine : `npx prettier --write website`, et
vérifier que l'extension n'est pas touchée (`npm run build`, `npm test`).

Livrer = commiter les sources **et** `website/site/` régénéré, puis pousser
`main` (sur demande) ; `dev` est ensuite avancé sur `main`. Le déploiement se suit dans l'onglet Actions.

## Pièges connus

- Sous Windows, Git peut réécrire des fichiers en CRLF : si Prettier signale
  des fichiers sans changement réel, `npx prettier --write <fichiers>` ;
  `git diff` doit rester vide pour eux.
- Le site s'ouvre aussi par double-clic (`website/site/index.html`) : les
  scripts sont des scripts classiques, **pas de modules ES** (bloqués en
  `file://`). Ne pas en réintroduire.
- `website/node_modules/` et les fichiers lourds de `video-brag/` sont
  ignorés par Git : ne jamais les forcer (`git add -f`).
- Le bouton « Toutes les versions » ouvre la page GitHub Releases : elle
  reste vide tant qu'aucune release n'y est publiée.
