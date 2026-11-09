# Setup 5.17 — ton travail avant que je code la sauvegarde par compte Google

Fichier perso (non versionné : il est dans `.git/info/exclude`).
Spec technique : `v5/v5.17.md`.

Durée : environ 20 minutes. Tout se fait dans ton navigateur, avec **ton**
compte Google. Les menus de Google changent parfois de nom : si un libellé
ne correspond pas exactement, cherche le plus proche.

## Ce que tu vas me donner à la fin (3 valeurs, toutes publiques)

| Valeur            | Exemple                                       | Où je la mets                         |
| ----------------- | --------------------------------------------- | ------------------------------------- |
| `apiKey` Firebase | `AIzaSyB...` (39 caractères)                  | `frontend/src/shared/cloud-config.ts` |
| `projectId`       | `correctly-a1b2c`                             | `frontend/src/shared/cloud-config.ts` |
| ID client OAuth   | `1234567890-abc...apps.googleusercontent.com` | `frontend/src/shared/cloud-config.ts` |

Ces trois valeurs **ne sont pas secrètes** : elles finissent dans le zip de
l'extension, c'est normal. Tu peux me les coller dans le chat. Je crée
`cloud-config.ts` moi-même ; si tu préfères, tu remplis les trois champs
toi-même dans ce fichier.

**À ne JAMAIS me donner ni mettre dans le dépôt :**

- le **code secret du client** OAuth (commence par `GOCSPX-`) ;
- un fichier **JSON de compte de service** (« service account ») ;
- ton mot de passe Google.

On n'en a pas besoin. L'audit du build refusera `GOCSPX-`.

## Étape 0 — Sécuriser ton compte Google

1. https://myaccount.google.com/security
2. Active la **validation en deux étapes**. Ce compte devient le
   propriétaire de toutes les données des utilisateurs : c'est la vraie clé.

## Étape 1 — Créer le projet Firebase

1. https://console.firebase.google.com → **Créer un projet** (ou « Ajouter
   un projet »).
2. Nom : `Correctly` (Google ajoute un suffixe, par ex. `correctly-a1b2c` :
   c'est ton **`projectId`**, note-le).
3. **Google Analytics : désactivé** (inutile, et moins de données
   collectées).
4. Créer. Le projet est sur le **forfait Spark (gratuit)** par défaut :
   **ne passe pas en Blaze**. En Spark, tu ne peux jamais être facturé ; si
   le quota du jour est dépassé, ça s'arrête jusqu'au lendemain.

## Étape 2 — Activer la connexion Google

1. Dans le projet : menu de gauche **Build → Authentication** → **Commencer**.
2. Onglet **Sign-in method** → **Google** → **Activer**.
3. « Adresse e-mail d'assistance » : ton adresse. **Enregistrer**.
4. **N'active aucun autre fournisseur** (pas d'e-mail/mot de passe, pas
   d'anonyme).
5. Onglet **Settings** (Paramètres) → **Authorized domains** (domaines
   autorisés) → **Ajouter un domaine** :
   `annnnjfiddfooccihpgebjnipppaejpo.chromiumapp.org`
   (c'est l'adresse de retour de l'extension, grâce à l'ID fixé en 5.14).

## Étape 3 — Créer la base Firestore

1. **Build → Firestore Database** → **Créer une base de données**.
2. Édition **Standard** si on te demande.
3. **Emplacement : `eur3 (europe)`** (décision D4 de la spec). ⚠️ Ne peut
   plus être changé ensuite.
4. Mode : **production** (tout est refusé par défaut, c'est ce qu'on veut).
5. Créer. Ne touche pas encore à l'onglet **Règles** : je te donnerai le
   fichier `firebase/firestore.rules` à coller (étape 8).

## Étape 4 — Récupérer la `apiKey` (application Web)

1. Roue dentée en haut à gauche → **Paramètres du projet** → onglet
   **Général**.
2. En bas, « Vos applications » → icône **Web `</>`**.
3. Surnom : `Correctly extension`. **Ne coche pas** « Firebase Hosting ».
   **Enregistrer l'application**.
4. Google affiche un bloc `const firebaseConfig = { ... }`. Note :
   - `apiKey` → **à me donner** ;
   - `projectId` → **à me donner** (le même qu'à l'étape 1) ;
   - le reste (`authDomain`, `storageBucket`, `messagingSenderId`, `appId`)
     n'est pas utilisé ; tu peux me le donner aussi, ce n'est pas grave.
5. **Ne fais pas** l'étape « npm install firebase » qu'il propose : on
   n'utilise pas le SDK (spec §4, pas de nouvelle dépendance).

## Étape 5 — Écran de consentement Google (Google Cloud)

Le projet Firebase est aussi un projet Google Cloud.

1. https://console.cloud.google.com → en haut, **sélectionne le projet**
   `correctly-xxxxx`.
2. Menu ☰ → **API et services → Écran de consentement OAuth** (parfois
   appelé **Google Auth Platform**). Si on te dit « déjà configuré », va
   directement dans les sous-menus ci-dessous.
3. **Branding / Informations sur l'application** :
   - Nom : `Correctly`
   - E-mail d'assistance : ton adresse
   - Logo : facultatif (un logo déclenche une vérification Google, mieux
     vaut **ne pas en mettre** au début)
   - Page d'accueil : `https://moqim-ghizlan.github.io/Correctly-Real-time-Grammar-Spelling-Assistant/`
   - Politique de confidentialité : **laisse vide pour l'instant** ; je crée
     la page `privacy.html` sur le site pendant la 5.17, tu l'ajouteras
     après (étape 10).
   - Coordonnées du développeur : ton adresse.
4. **Audience** : type **Externe** (« External »).
   - Statut : **En test** (« Testing »).
   - **Utilisateurs de test** → **Ajouter** : ton adresse Gmail, et celles
     des personnes qui vont tester (100 maximum). Seuls ces comptes pourront
     se connecter tant que l'app n'est pas publiée.
5. **Accès aux données / Scopes** : ajoute seulement `openid`,
   `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Rien d'autre.

## Étape 6 — Créer l'ID client OAuth

1. Toujours dans Google Cloud : **API et services → Identifiants** (ou
   **Google Auth Platform → Clients**).
2. **Créer des identifiants → ID client OAuth**.
3. Type d'application : **Application Web** (pas « Extension Chrome » :
   celle-là ne marche pas dans Brave).
4. Nom : `Correctly extension`.
5. **URI de redirection autorisés** → Ajouter :
   `https://annnnjfiddfooccihpgebjnipppaejpo.chromiumapp.org/`
   (avec le `/` final). Laisse « Origines JavaScript autorisées » vide.
6. **Créer**. Google affiche :
   - **ID client** (`....apps.googleusercontent.com`) → **à me donner** ;
   - **Code secret du client** (`GOCSPX-...`) → **ne le copie nulle part**,
     ferme la fenêtre.

Remarque : Firebase a peut-être déjà créé un client « Web client (auto
created by Google Service) ». Ne l'utilise pas, garde le tien.

## Étape 7 — Restreindre la clé d'API

1. Google Cloud → **API et services → Identifiants** → section **Clés
   API** → clique sur **Browser key (auto created by Firebase)** (celle dont
   la valeur est ton `apiKey`).
2. **Restrictions relatives aux applications** : **Aucune** (les extensions
   n'envoient pas de « referrer » fiable).
3. **Restrictions relatives aux API** → **Restreindre la clé** → coche
   uniquement :
   - **Identity Toolkit API**
   - **Token Service API**
   - **Cloud Firestore API**
     (si une API n'apparaît pas dans la liste, active-la d'abord dans
     **API et services → Bibliothèque**, puis reviens).
4. **Enregistrer**.

## Étape 8 — Coller les règles Firestore (quand je te les donne)

Pendant la 5.17, je crée `firebase/firestore.rules` dans le dépôt (le
contenu est aussi dans la spec §6). Ensuite :

1. Console Firebase → **Firestore Database → Règles**.
2. Remplace tout le contenu par celui du fichier → **Publier**.

Effet : chaque utilisateur ne peut lire et écrire que ses propres
documents, avec une taille limitée. Tout le reste est refusé.

## Étape 9 — Me donner les valeurs

Colle-moi dans le chat :

```text
apiKey:        AIza...
projectId:     correctly-xxxxx
oauthClientId: 1234...apps.googleusercontent.com
```

Et réponds aux décisions D1 à D6 de `v5/v5.17.md` §3 (ou dis « les
recommandations », comme pour la 5.16).

## Étape 10 — Après la 5.17 (avant d'ouvrir à tout le monde)

1. Je publie le site avec la page `privacy.html`.
2. Google Cloud → écran de consentement → **Branding** → Politique de
   confidentialité :
   `https://moqim-ghizlan.github.io/Correctly-Real-time-Grammar-Spelling-Assistant/privacy.html`
3. Fais la checklist manuelle `docs/v5.17/MANUAL_TEST_CHECKLIST.md` avec
   tes utilisateurs de test.
4. Quand tout est bon : **Audience → Publier l'application**. Avec
   seulement `openid`, `email` et `profile` (et sans logo), Google ne
   demande normalement pas de longue vérification. Dès lors, n'importe quel
   compte Google peut se connecter.

## Pour vérifier que tout est bon (avant de m'envoyer les valeurs)

- [ ] Validation en deux étapes active sur ton compte Google
- [ ] Projet Firebase créé, forfait **Spark**, Analytics désactivé
- [ ] Authentication : **Google seul** activé
- [ ] Domaine autorisé `annnnjfiddfooccihpgebjnipppaejpo.chromiumapp.org`
- [ ] Firestore créé en **eur3**, mode production
- [ ] Application Web enregistrée, `apiKey` + `projectId` notés
- [ ] Écran de consentement : Externe, En test, toi en utilisateur de test,
      scopes openid/email/profile
- [ ] ID client **Application Web** avec la redirection
      `https://annnnjfiddfooccihpgebjnipppaejpo.chromiumapp.org/`
- [ ] Code secret `GOCSPX-` **non copié**
- [ ] Clé d'API restreinte aux 3 API

## Si ça bloque

- « redirect_uri_mismatch » à la connexion → l'URI de l'étape 6 doit être
  exactement `https://annnnjfiddfooccihpgebjnipppaejpo.chromiumapp.org/`.
- « access_denied » / « app not verified » → ton compte n'est pas dans les
  utilisateurs de test (étape 5.4).
- « API key not valid » / « PERMISSION_DENIED » sur Firestore → une API
  manque dans les restrictions de l'étape 7, ou les règles de l'étape 8 ne
  sont pas publiées.
- « INVALID_IDP_RESPONSE » → domaine autorisé de l'étape 2.5 manquant.
