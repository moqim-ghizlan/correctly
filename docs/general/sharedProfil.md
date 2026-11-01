# Correctly — Partager sa configuration entre deux ordinateurs

| Élément                   | Valeur                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Version requise           | **Correctly 5.14.0** ou ultérieure                                            |
| Navigateur pris en charge | Google Chrome 120+ (Brave : non garanti)                                      |
| Identifiant d'extension   | `annnnjfiddfooccihpgebjnipppaejpo`                                            |
| Mécanisme                 | Synchronisation du navigateur (`chrome.storage.sync`), sans serveur Correctly |

## À lire avant tout : ne jamais supprimer l'extension

**Supprimer Correctly dans `chrome://extensions` efface ses données** (clés
API, raccourcis, réglages) sur cet ordinateur, et peut aussi effacer sa copie
synchronisée. Pour passer à une nouvelle version, on ne supprime pas :

1. remplacer le contenu du dossier de l'extension par celui du nouveau zip ;
2. cliquer sur **Actualiser** sur la carte Correctly dans
   `chrome://extensions`.

Les données sont conservées. Avant toute suppression volontaire, exporter les
raccourcis texte (Paramètres → Raccourcis texte → **Exporter**) et garder ses
clés API à portée de main.

## Principe

La configuration est préparée sur **PC 1** (ordinateur source), puis
récupérée sur **PC 2** (ordinateur cible) par la synchronisation de Chrome,
liée au compte Google. Les clés API sont chiffrées sur PC 1 avec une phrase
secrète avant tout envoi ; Google ne peut pas les lire.

Les étapes doivent être réalisées dans l'ordre : **PC 1 entièrement, puis
PC 2.**

---

## 1. Prérequis (PC 1 et PC 2)

- Chrome est connecté au **même compte Google** sur les deux ordinateurs.
- La **synchronisation Chrome** est activée.
- Dans `chrome://settings/syncSetup`, la catégorie **Extensions** est
  incluse.
- Le paquet **Correctly 5.14.1** (`.zip`, dernière version) est disponible.

> **Migration depuis la 5.13 ou une version antérieure.** La 5.14.0 fixe
> l'identifiant de l'extension : la première installation démarre sans
> données. Avant de désinstaller l'ancienne version, exportez les raccourcis
> texte (Paramètres → Raccourcis texte → **Exporter**). Les clés API, routes
> et limites devront être ressaisies une fois sur PC 1.

---

## 2. PC 1 — Préparer la configuration

### 2.1 Installer l'extension

1. Décompresser le paquet 5.14.1 dans un dossier permanent (par exemple
   `Documents\Correctly`). Ce dossier ne doit pas être supprimé : Chrome
   l'utilise en continu.
2. Ouvrir `chrome://extensions` et activer le **Mode développeur**.
3. Uniquement lors de la migration depuis la 5.13 : supprimer l'ancienne
   version (après export des raccourcis). Pour toute mise à jour ultérieure,
   ne rien supprimer : voir « À lire avant tout ».
4. Cliquer sur **Charger l'extension non empaquetée** et sélectionner le
   dossier décompressé.
5. Contrôler l'identifiant : `annnnjfiddfooccihpgebjnipppaejpo`.

### 2.2 Configurer Correctly

Dans les paramètres de Correctly :

- **Fournisseurs IA** : ajouter les clés API, puis définir la clé et le
  modèle de chaque action.
- **Raccourcis texte** : importer le fichier exporté, le cas échéant.
- **Démarrage** : autoriser l'envoi du texte sélectionné.
- **Actions**, **Raccourcis clavier** : ajuster les préférences.

### 2.3 Activer la synchronisation

Dans **Synchronisation** :

1. Activer **Synchroniser ce navigateur avec mes autres ordinateurs**.
2. Cocher les quatre domaines : Raccourcis texte, Réglages, Raccourcis
   clavier, Clés API et routes.
3. Dans **Phrase secrète des clés API**, saisir une phrase d'au moins
   8 caractères, distincte du mot de passe Google, puis la confirmer et
   cliquer sur **Chiffrer et synchroniser mes clés**.
4. Conserver cette phrase dans un gestionnaire de mots de passe. Elle ne
   peut pas être récupérée.
5. Cliquer sur **Synchroniser maintenant** et vérifier que chaque domaine
   affiche « Synchronisé ».

Prévoir un délai de quelques minutes avant de passer à PC 2 : la
propagation par Chrome n'est pas instantanée.

---

## 3. PC 2 — Récupérer la configuration

### 3.1 Installer l'extension

Reprendre les étapes 2.1 avec le **même paquet 5.14.1**, et contrôler que
l'identifiant est identique à celui de PC 1.

### 3.2 Activer la synchronisation

**Ne rien configurer avant cette étape** : un PC vide reçoit les données
sans rien écraser.

1. Paramètres → **Synchronisation** : activer l'interrupteur et cocher les
   **mêmes quatre domaines** que sur PC 1.
2. Cliquer sur **Synchroniser maintenant**. Raccourcis, réglages et
   raccourcis clavier sont importés.
3. Dans **Phrase secrète des clés API**, un seul champ et le bouton
   **Déverrouiller les clés synchronisées** doivent apparaître. Saisir la
   phrase définie sur PC 1.

> Si deux champs et le bouton **Chiffrer et synchroniser mes clés**
> apparaissent encore, les clés de PC 1 ne sont pas encore arrivées. Ne
> rien saisir — une nouvelle phrase remplacerait celle de PC 1 — attendre
> quelques minutes, puis cliquer à nouveau sur **Synchroniser maintenant**.

### 3.3 Réglages propres à chaque ordinateur

Ces éléments ne sont volontairement pas synchronisés et doivent être
définis sur PC 2 :

- l'autorisation d'envoyer le texte sélectionné (**Démarrage**) ;
- la poignée au bord droit des pages ;
- les **limites d'usage** (chaque ordinateur applique les siennes) ;
- l'activation des raccourcis texte et des raccourcis clavier (les listes
  sont synchronisées, l'activation demande l'accès aux sites sur chaque
  ordinateur).

La configuration est alors identique sur les deux ordinateurs. Toute
modification ultérieure est propagée automatiquement.

---

## 4. Périmètre de la synchronisation

| Synchronisé                                         | Non synchronisé                              |
| --------------------------------------------------- | -------------------------------------------- |
| Liste des raccourcis texte                          | Limites d'usage                              |
| Réglages (langue, styles, traduction, déclencheurs) | Statistiques et historique                   |
| Combinaisons des raccourcis clavier Correctly       | Autorisation d'envoyer le texte              |
| Clés API et routes, chiffrées (AES-GCM, PBKDF2)     | Poignée, accès à tous les sites, activations |

Capacité : environ **100 Ko** au total (limite de Chrome). Au-delà, rien
n'est envoyé ni tronqué et un message l'indique.

En cas de modification du même raccourci sur les deux ordinateurs, une
version est retenue et l'autre reste disponible via **Restaurer**.

---

## 5. Clé privée de l'extension (`correctly-key.pem`)

Ce fichier, stocké dans `C:\Users\moqim\correctly-keys\`, fixe
l'identifiant de l'extension. Il ne s'agit ni de la phrase secrète ni d'une
clé API.

- Il n'est **pas nécessaire** sur PC 2.
- Il doit être **sauvegardé** hors de l'ordinateur (support externe ou
  gestionnaire de secrets).
- Il ne doit jamais être partagé ni ajouté au dépôt.

---

## 6. Dépannage

| Symptôme                                                   | Action                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Identifiants différents sur PC 1 et PC 2                   | Réinstaller à partir du paquet 5.14.1.                                                                                                    |
| Aucune donnée sur PC 2                                     | Vérifier le compte Google et l'inclusion des **Extensions** dans la synchronisation Chrome ; patienter, puis **Synchroniser maintenant**. |
| « Trop volumineux »                                        | Réduire ou supprimer des raccourcis texte longs.                                                                                          |
| « Phrase secrète incorrecte »                              | Saisir exactement la phrase définie sur PC 1 (casse comprise).                                                                            |
| « Cet ordinateur et les données synchronisées diffèrent »  | Choisir **Garder la version de cet ordinateur** ou **Prendre la version synchronisée**.                                                   |
| « Des modifications de cet ordinateur ont été remplacées » | Cliquer sur **Restaurer** pour rétablir la version locale.                                                                                |

Références : `docs/v5.14/RELEASE_NOTES.md`, `docs/v5.14/ARCHITECTURE.md`,
`docs/v5.14/MANUAL_TEST_CHECKLIST.md`.
