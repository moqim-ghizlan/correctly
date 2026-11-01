/* global console */
// Generates the bilingual settings page (5.13).
//
//   node scripts/i18n-options.mjs
//
// Writes frontend/src/options/options.html (French text as the default, every
// translatable node tagged with data-i18n / data-i18n-html / data-i18n-aria)
// and frontend/src/options/messages-html.ts (the same texts in English and
// French). Edit TEXTS and TEMPLATE here, never the generated files.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPTIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'frontend',
  'src',
  'options',
);

// key: [French, English]. Keys used with {{@key}} may hold trusted inline
// markup (<strong>, <kbd>, <code>, <a href="#…">); all others are plain text.
const TEXTS = {
  skip: ['Aller au contenu', 'Skip to content'],
  navLabel: ['Sections des paramètres', 'Settings sections'],
  brandSub: ['Paramètres', 'Settings'],
  navStart: ['Démarrage', 'Getting started'],
  navProviders: ['Fournisseurs IA', 'AI providers'],
  navActions: ['Actions', 'Actions'],
  navKeyboard: ['Raccourcis clavier', 'Keyboard shortcuts'],
  navShortcuts: ['Raccourcis texte', 'Text shortcuts'],
  navAccount: ['Compte', 'Account'],
  navLimits: ['Limites d’usage', 'Usage limits'],
  navStats: ['Statistiques', 'Statistics'],
  navAbout: ['À propos', 'About'],
  subLanguage: ['Langue', 'Language'],
  subCorrection: ['Correction', 'Correction'],
  subTriggers: ['Déclencheurs', 'Triggers'],
  subKeys: ['Clés API', 'API keys'],
  subRouting: ['Modèle par action', 'Model per action'],
  subRewrite: ['Reformulation', 'Rewriting'],
  subTranslation: ['Traduction', 'Translation'],
  subBrowserKeys: ['Dans le navigateur', 'In the browser'],
  subPageKeys: ['Dans les pages', 'In web pages'],
  subShortcutForm: ['Ajouter', 'Add'],
  subShortcutList: ['Mes raccourcis', 'My shortcuts'],
  subBackup: ['Sauvegarde', 'Backup'],
  subAccountCard: ['Connexion', 'Sign-in'],
  subAccountMain: ['Données sauvegardées', 'Backed-up data'],
  subAccountKeys: ['Clés API', 'API keys'],
  subAccountDelete: ['Suppression', 'Deletion'],
  subToday: ['Aujourd’hui', 'Today'],
  subChart: ['Par jour', 'Per day'],
  subBy: ['Détail', 'Detail'],
  navGroupSetup: ['Configuration', 'Setup'],
  navGroupWriting: ['Écriture', 'Writing'],
  navGroupUsage: ['Suivi', 'Usage'],
  startLead: [
    'Correctly corrige, reformule, traduit ou résume le texte que vous sélectionnez, uniquement quand vous le demandez, et développe vos raccourcis texte localement.',
    'Correctly corrects, rewrites, translates or summarizes the text you select, on request only, and expands your text shortcuts locally.',
  ],
  step1Title: ['Ajoutez une clé API', 'Add an API key'],
  step1: [
    'Google Gemini ou OpenAI, dans <a href="#providers">Fournisseurs IA</a>.',
    'Google Gemini or OpenAI, in <a href="#providers">AI providers</a>.',
  ],
  step2Title: ['Autorisez l’envoi', 'Allow sending'],
  step2: [
    'La case ci-dessous : sans elle, rien n’est jamais envoyé.',
    'The box below: without it, nothing is ever sent.',
  ],
  step3Title: [
    'Sélectionnez du texte et ouvrez Correctly',
    'Select text and open Correctly',
  ],
  step3: [
    'Bouton de la barre d’outils, <kbd>Ctrl</kbd>+<kbd>M</kbd> ou la poignée au bord droit de la page.',
    'Toolbar button, <kbd>Ctrl</kbd>+<kbd>M</kbd> or the handle on the right edge of the page.',
  ],
  languageTitle: ['Langue de l’interface', 'Interface language'],
  languageLabel: ['Langue', 'Language'],
  languageAuto: [
    'Automatique (langue du navigateur)',
    'Automatic (browser language)',
  ],
  languageHint: [
    'S’applique à ces paramètres, à la fenêtre Correctly, à la poignée et au menu clic droit. Les textes envoyés à l’IA ne changent pas.',
    'Applies to these settings, the Correctly window, the handle and the right-click menu. What is sent to the AI does not change.',
  ],
  consentTitle: ['Envoi du texte à l’IA', 'Sending text to the AI'],
  consent: [
    'Envoyer le texte que je sélectionne au fournisseur d’IA de l’action choisie (Google Gemini ou OpenAI) quand je demande à Correctly de le corriger, reformuler, traduire ou résumer.',
    'Send the text I select to the AI provider of that action (Google Gemini or OpenAI) when I ask Correctly to correct, rewrite, translate or summarize it.',
  ],
  howItWorks: ['Comment ça marche', 'How it works'],
  howItWorksText: [
    'La sélection est copiée dans la fenêtre Correctly ; elle n’est envoyée que quand vous cliquez sur un bouton <strong>Générer</strong>. Rien ne change dans la page tant que vous ne cliquez pas sur <strong>Appliquer</strong>, disponible dans les zones de texte simples ; ailleurs, copiez le résultat. Le texte d’un article peut être sélectionné pour le traduire ou le résumer (copie seulement). Les champs mot de passe, e-mail, téléphone, URL, nombre et recherche ne sont jamais lus. Chaque génération compte comme une requête dans vos limites d’usage et peut être facturée par votre fournisseur. Les suggestions peuvent être fausses : vérifiez-les.',
    'The selection is copied into the Correctly window; it is sent only when you click a <strong>Generate</strong> button. Nothing changes in the page until you click <strong>Apply</strong>, available in plain text boxes; elsewhere, copy the result. Article text can be selected to translate or summarize it (copy only). Password, email, phone, URL, number and search fields are never read. Each generation counts as one request in your usage limits and may be billed by your provider. Suggestions can be wrong: check them.',
  ],
  triggersTitle: ['Ouvrir Correctly', 'Opening Correctly'],
  triggersHint: [
    'Le bouton de la barre d’outils ouvre toujours la fenêtre Correctly. L’IA n’est appelée qu’après une action de votre part.',
    'The toolbar button always opens the Correctly window. AI is called only after you act.',
  ],
  triggerKeyboard: [
    'Raccourcis clavier (ceux du navigateur, comme <kbd>Ctrl</kbd>+<kbd>M</kbd>, et les vôtres)',
    'Keyboard shortcuts (the browser’s, such as <kbd>Ctrl</kbd>+<kbd>M</kbd>, and your own)',
  ],
  triggerKeyboardHint: [
    'Voir et modifier les combinaisons : <a href="#keyboard">Raccourcis clavier</a>.',
    'See and change the combinations: <a href="#keyboard">Keyboard shortcuts</a>.',
  ],
  triggerMenu: [
    'Menu clic droit : Correctly → Corriger le texte sélectionné',
    'Right-click menu: Correctly → Correct selected text',
  ],
  triggerSelection: [
    'Bouton de traduction sur le texte sélectionné (jusqu’à 5 mots : petite bulle de traduction ; au-delà : la fenêtre Correctly sur Traduction). Rien n’est envoyé tant que vous ne cliquez pas sur le bouton ; chaque clic compte comme une requête. Demande l’accès à tous les sites, retiré si plus rien n’en a besoin.',
    'Translate button on selected text (up to 5 words: a small translation bubble; more: the Correctly window on Translation). Nothing is sent until you click the button; each click counts as one request. Asks for access to all sites, removed when nothing needs it any more.',
  ],
  triggerSmart: [
    'Poignée Correctly au bord droit de chaque page (clic pour ouvrir, glisser vers le haut ou le bas pour la déplacer ; demande l’accès à tous les sites, retiré si vous la désactivez)',
    'Correctly handle on the right edge of every page (click to open, drag up or down to move; asks for access to all sites, removed when you turn it off)',
  ],
  providersLead: [
    'Utilisez vos propres clés API Google Gemini et/ou OpenAI, puis choisissez la clé et le modèle de chaque action. <strong>Les abonnements ChatGPT et Gemini grand public sont séparés et ne paient pas les appels API.</strong>',
    'Use your own Google Gemini and/or OpenAI API keys, then choose the key and model of each action. <strong>ChatGPT and Gemini consumer subscriptions are separate and do not pay for API calls.</strong>',
  ],
  keysTitle: ['Clés API', 'API keys'],
  profileEmpty: [
    'Aucune clé API enregistrée. Ajoutez-en une pour utiliser la correction, la reformulation, la traduction et le résumé. Les raccourcis texte fonctionnent sans clé.',
    'No API key saved yet. Add one to use correction, rewriting, translation and summaries. Text shortcuts work without any key.',
  ],
  savedKeys: ['Clés API enregistrées', 'Saved API keys'],
  addKey: ['Ajouter une clé API', 'Add an API key'],
  provider: ['Fournisseur', 'Provider'],
  keyName: ['Nom (affiché seulement ici)', 'Name (only shown here)'],
  apiKey: ['Clé API', 'API key'],
  showKeyLabel: ['Afficher la clé API saisie', 'Show the API key being typed'],
  showKey: ['Afficher', 'Show'],
  keyHint: [
    'Les espaces avant ou après la clé sont retirés. Enregistrer n’envoie rien.',
    'Spaces before or after the key are removed. Saving sends nothing.',
  ],
  createKey: [
    'Créer une clé dans Google AI Studio',
    'Create a key in Google AI Studio',
  ],
  saveKey: ['Enregistrer la clé', 'Save key'],
  cancel: ['Annuler', 'Cancel'],
  keyWarning: [
    'Les clés sont stockées localement dans ce profil de navigateur (jamais exportées, jamais réaffichées ; sauvegardées dans votre compte seulement si vous vous connectez, chiffrées par votre phrase secrète). Ce n’est pas un coffre-fort : toute personne ayant accès à ce profil ou à cet ordinateur peut les lire. Fixez des plafonds de dépense chez votre fournisseur et changez une clé en cas de doute.',
    'Keys are stored locally in this browser profile (never exported, never shown again; backed up to your account only if you sign in, encrypted with your passphrase). This is not a vault: anyone with access to this profile or computer may read them. Set spending limits at your provider and rotate a key if in doubt.',
  ],
  routingTitle: [
    'Clé et modèle de chaque action',
    'Key and model of each action',
  ],
  routingHint: [
    'Chaque action utilise exactement la clé et le modèle choisis ici (ou la route par défaut). Si cette clé manque, est désactivée ou refusée, l’action s’arrête avec un message : <strong>Correctly ne passe jamais tout seul à une autre clé, un autre modèle ou un autre fournisseur</strong> et ne réessaie jamais seul. « Vérifier » est gratuit ; « Tester » envoie un tout petit message et peut être facturé.',
    'Each action uses exactly the key and model chosen here (or the default route). If that key is missing, disabled or refused, the action stops with a message: <strong>Correctly never switches to another key, model or provider by itself</strong> and never retries on its own. “Check” is free; “Test” sends one tiny prompt and may be billed.',
  ],
  prices: ['Tarifs :', 'Prices:'],
  pricesNote: [
    'Ils changent et dépendent de votre compte.',
    'They change and depend on your account.',
  ],
  actionsLead: [
    'Les choix par défaut des onglets Reformulation, Traduction et Résumé. Vous pouvez les changer à chaque fois avant de générer.',
    'Defaults of the Reformulation, Translation and Summary tabs. You can change them each time before generating.',
  ],
  rewriteTitle: ['Reformulation', 'Rewrite'],
  rewriteEnabled: [
    'Proposer la reformulation (onglet Reformulation, menu clic droit, raccourci optionnel)',
    'Offer rewriting (Reformulation tab, right-click menu, optional shortcut)',
  ],
  defaultStyles: ['Styles cochés par défaut', 'Styles selected by default'],
  defaultFormality: [
    'Niveau de départ du style « Formalité personnalisée »',
    'Starting level of the “Custom formality” style',
  ],
  lessFormal: ['Moins formel', 'Less formal'],
  moreFormal: ['Plus formel', 'More formal'],
  rewriteHint: [
    'Tous les styles choisis sont produits par <strong>une</strong> seule requête IA, dans la langue de votre texte (pas de traduction).',
    'All chosen styles are produced by <strong>one</strong> AI request, in the language of your text (no translation).',
  ],
  translationTitle: ['Traduction et résumé', 'Translation and summary'],
  translationHint: [
    'Langues par défaut de l’onglet Traduction (et du menu clic droit). L’onglet <strong>Résumé</strong> démarre avec la même langue cible et la même variante, et écrit le résumé directement dans cette langue, en une requête.',
    'Default languages of the Translation tab (and the right-click menu). The <strong>Summary</strong> tab starts with the same target language and variant, and writes the summary directly in that language, in one request.',
  ],
  from: ['De', 'From'],
  to: ['Vers', 'To'],
  variant: ['Variante', 'Variant'],
  favoritesLegend: ['Vos langues', 'Your languages'],
  favoritesHint: [
    'Cochez jusqu’à 12 langues : elles sont proposées en premier dans tous les menus de langue (fenêtre, menu clic droit, bulle de traduction, résumé). Les autres restent dans « Toutes les langues ». La variante choisie est retenue pour chaque langue qui en a (arabe, portugais, chinois, kurde).',
    'Tick up to 12 languages: they come first in every language menu (window, right-click menu, translate bubble, summary). The others stay under “All languages”. The chosen variant is remembered for each language that has variants (Arabic, Portuguese, Chinese, Kurdish).',
  ],
  translationNote: [
    'Une requête IA par traduction (détection de la langue comprise). Pour l’arabe, les dialectes parlés (syrien, égyptien, marocain, libanais, du Golfe) sont l’arabe de tous les jours ; l’arabe standard moderne est la norme écrite. Une traduction automatique peut être fausse : relisez-la avant d’envoyer quelque chose d’important.',
    'One AI request per translation (language detection included). For Arabic, the colloquial dialects (Syrian, Egyptian, Moroccan, Lebanese, Gulf) are everyday spoken Arabic; Modern Standard Arabic is the formal written standard. Machine translation can be wrong: review it before sending anything important.',
  ],
  keyboardLead: [
    'Deux sortes de raccourcis, utilisables ensemble. Ils ne font qu’ouvrir Correctly ou lancer une action sur la sélection : rien n’est envoyé à l’IA sans votre clic sur Générer (sauf « Corriger la sélection », qui corrige directement comme le menu clic droit).',
    'Two kinds of shortcuts, usable together. They only open Correctly or start an action on the selection: nothing is sent to the AI without your click on Generate (except “Correct the selection”, which corrects directly like the right-click menu).',
  ],
  browserKeysTitle: ['Raccourcis du navigateur', 'Browser shortcuts'],
  refresh: ['Actualiser', 'Refresh'],
  browserKeysHint: [
    'Ils fonctionnent partout dans le navigateur. Chrome ne permet pas à une extension de les modifier elle-même : cliquez sur « Modifier dans Chrome », changez la combinaison, puis revenez ici.',
    'They work everywhere in the browser. Chrome does not let an extension change them itself: click “Change in Chrome”, change the combination, then come back here.',
  ],
  colAction: ['Action', 'Action'],
  colShortcut: ['Raccourci', 'Shortcut'],
  commandEmpty: [
    'Raccourcis du navigateur indisponibles ici.',
    'Browser shortcuts are not available here.',
  ],
  changeInChrome: ['Modifier dans Chrome ↗', 'Change in Chrome ↗'],
  pageKeysTitle: [
    'Raccourcis Correctly dans les pages',
    'Correctly shortcuts in pages',
  ],
  pageKeysHint: [
    'Définis directement ici : cliquez sur « Définir » puis appuyez sur la combinaison. Ils fonctionnent seulement sur les pages web ordinaires (pas sur les pages internes du navigateur) et un site peut parfois les intercepter. Les combinaisons du navigateur et de l’édition (Ctrl+C, Ctrl+T…) sont refusées.',
    'Set directly here: click “Set” then press the combination. They work only on ordinary web pages (not on the browser’s internal pages) and a site may sometimes intercept them. Browser and editing combinations (Ctrl+C, Ctrl+T…) are refused.',
  ],
  keysEnabled: [
    'Activer mes raccourcis Correctly dans les pages web (demande l’accès à tous les sites, retiré si plus rien n’en a besoin)',
    'Turn on my Correctly shortcuts in web pages (asks for access to all sites, removed when nothing needs it any more)',
  ],
  myKeys: ['Mes raccourcis Correctly', 'My Correctly shortcuts'],
  shortcutsLead: [
    'Tapez un raccourci suivi d’un espace ou de <code>, ; : . ! ?</code> pour le remplacer localement — sans internet, sans IA, sans quota.',
    'Type a shortcut followed by a space or <code>, ; : . ! ?</code> to replace it locally — no internet, no AI, no quota.',
  ],
  activation: ['Activation', 'Activation'],
  shortcutsEnabled: [
    'Développer mes raccourcis pendant que je tape (demande l’accès à tous les sites ; retiré si vous désactivez aussi la poignée)',
    'Expand my shortcuts while I type (asks for access to all sites; removed if the handle is off too)',
  ],
  shortcutsHint: [
    'Jamais au collage, à Tab ou Entrée, ni dans les champs mot de passe, paiement, code ou éditeurs riches. Les raccourcis restent dans ce profil de navigateur (sauvegardés dans votre compte seulement si vous vous connectez) : exportez aussi une sauvegarde.',
    'Never on paste, Tab or Enter, and never in password, payment, code or rich editors. Shortcuts stay in this browser profile (backed up to your account only if you sign in): export a backup too.',
  ],
  addShortcutTitle: ['Ajouter un raccourci', 'Add a shortcut'],
  trigger: [
    'Raccourci (1 à 32 lettres ou chiffres)',
    'Shortcut (1–32 letters or digits)',
  ],
  replacement: ['Texte de remplacement', 'Replacement text'],
  entryEnabled: ['Activé', 'Enabled'],
  protectTrigger: [
    'Garder ce raccourci inchangé quand je demande à Correctly de corriger, reformuler, traduire ou résumer',
    'Keep this shortcut unchanged when I ask Correctly to correct, rewrite, translate or summarize',
  ],
  protectReplacement: [
    'Garder aussi le texte de remplacement inchangé (noms, signatures, codes — pas des mots courants comme « Bonjour »)',
    'Also keep the replacement text unchanged (for names, signatures or codes — not for common words like “Bonjour”)',
  ],
  addShortcut: ['Ajouter le raccourci', 'Add shortcut'],
  cancelEdit: ['Annuler la modification', 'Cancel edit'],
  myShortcuts: ['Mes raccourcis', 'My shortcuts'],
  search: ['Rechercher', 'Search'],
  shortcutEmpty: [
    'Aucun raccourci enregistré pour l’instant.',
    'No shortcuts saved yet.',
  ],
  backup: ['Sauvegarde', 'Backup'],
  export: ['Exporter (JSON)', 'Export (JSON)'],
  import: ['Importer (JSON)', 'Import (JSON)'],
  ifExists: ['Si un raccourci existe déjà', 'If a shortcut already exists'],
  keepMine: [
    'Garder le mien (n’ajouter que les nouveaux)',
    'Keep mine (add only new ones)',
  ],
  overwrite: [
    'Remplacer le mien par celui du fichier',
    'Replace mine with the file’s version',
  ],
  replaceAll: [
    'Remplacer TOUS mes raccourcis par le fichier',
    'Replace ALL my shortcuts with the file',
  ],
  importButton: ['Importer', 'Import'],
  loading: ['Chargement…', 'Loading…'],
  limitsLead: [
    'Nombre maximal de requêtes IA envoyées par Correctly dans ce profil de navigateur. Une requête compte quand elle est envoyée, quel que soit le nombre de styles ou de langues ; vérifier une clé et les raccourcis texte ne comptent jamais. À 100 %, les requêtes concernées sont bloquées avant tout envoi.',
    'Maximum number of AI requests sent by Correctly in this browser profile. A request counts when it is sent, whatever the number of styles or languages; key checks and text shortcuts never count. At 100% the matching requests are blocked before anything is sent.',
  ],
  repairText: [
    'Les limites enregistrées sont absentes ou endommagées : aucune requête IA n’est envoyée. Restaurer les valeurs sûres conserve tout l’usage enregistré.',
    'The saved usage limits are missing or damaged, so no AI request is sent. Restoring safe defaults keeps all recorded usage.',
  ],
  repairButton: ['Restaurer les limites sûres', 'Restore safe limits'],
  clockText: [
    'L’horloge de votre ordinateur a reculé depuis la dernière requête : les requêtes IA sont en pause (un changement d’heure ne doit pas remettre les limites à zéro). Vérifiez la date et l’heure, puis confirmez.',
    'Your computer’s clock moved back since the last request, so AI requests are paused (a clock change must not reset limits). Check the date and time, then confirm.',
  ],
  clockButton: ['Mon horloge est correcte', 'My clock is correct'],
  alertsLabel: ['Alertes d’usage', 'Usage warnings'],
  pause: ['Pause', 'Pause'],
  pauseAll: [
    'Mettre en pause toutes les requêtes IA (correction, reformulation, traduction, résumé et tests). Les raccourcis texte continuent de fonctionner.',
    'Pause all AI requests (correction, rewrite, translation, summary and tests). Text shortcuts keep working.',
  ],
  limitsTitle: ['Limites', 'Limits'],
  tasksLimits: [
    'Limites par action (facultatif)',
    'Limits per action (optional)',
  ],
  tasksHint: [
    'Correction, reformulation, traduction, résumé… Désactivées par défaut, mais l’usage de chaque action est toujours compté.',
    'Correction, rewrite, translation, summary… Off by default, but each action’s usage is always counted.',
  ],
  advancedLimits: [
    'Limites par fournisseur et par clé API (facultatif)',
    'Limits per provider and per API key (optional)',
  ],
  advancedHint: [
    'Elles ne font qu’ajouter des restrictions : jamais plus que ce que permettent les limites totales et par action. Correctly ne passe jamais à une autre clé ou un autre fournisseur quand l’une est bloquée.',
    'These only add restrictions: they never give more than the total and action limits allow. Correctly never switches to another key or provider when one is blocked.',
  ],
  warnings: ['Alertes', 'Warnings'],
  warn80: ['Prévenir à 80 % d’une limite', 'Warn at 80% of a limit'],
  warn95: ['Prévenir à 95 % d’une limite', 'Warn at 95% of a limit'],
  warningsHint: [
    'À 100 %, les requêtes concernées sont toujours bloquées. Les alertes s’affichent avec la requête qui les a déclenchées et ici, une fois par limite et par période.',
    'At 100% the matching AI requests are always blocked. Warnings appear next to the request that crossed them and here, once per limit and period.',
  ],
  timezone: [
    'Fuseau horaire des jours, semaines (lundi à dimanche) et mois :',
    'Time zone of days, weeks (Monday to Sunday) and months:',
  ],
  change: ['Modifier…', 'Change…'],
  ianaZone: ['Fuseau horaire IANA', 'IANA time zone'],
  zoneHint: [
    'Le changer ne remet jamais l’usage à zéro : les compteurs du jour, de la semaine et du mois sont conservés.',
    'Changing it never resets usage: the counts of the current day, week and month carry over.',
  ],
  saveLimits: ['Enregistrer les limites', 'Save limits'],
  reloadLimits: ['Recharger les limites enregistrées', 'Reload saved limits'],
  todayTitle: [
    'Aujourd’hui par clé, modèle et action',
    'Today by key, model and action',
  ],
  historyLink: [
    'Historique complet, tokens et coût estimé : <a href="#statistics">Statistiques</a>.',
    'Full history, tokens and estimated cost: <a href="#statistics">Statistics</a>.',
  ],
  limitNote: [
    'Les limites ne valent que pour ce profil de navigateur : les autres navigateurs, profils, appareils ou applications utilisant les mêmes clés ne sont pas comptés, et effacer les données du navigateur les supprime. Une requête dont la réponse a été perdue reste comptée et peut être facturée. Les requêtes ne coûtent pas toutes pareil (tokens) : une limite de requêtes n’est pas une limite de dépense. Fixez des plafonds chez votre fournisseur (leur application peut avoir du retard).',
    'Limits apply to this browser profile only: other browsers, profiles, devices or apps using the same keys are not counted, and clearing the browser’s data erases them. A request whose answer was lost stays counted and may still be billed. Requests cost different amounts (tokens), so a request limit is not a spending limit: set spend caps at your provider (their enforcement may lag).',
  ],
  capsAt: ['Plafonds de dépense :', 'Spend caps:'],
  statsLead: [
    'Ce que Correctly a enregistré dans ce profil : requêtes envoyées, résultats, modifications appliquées, tokens déclarés et coût estimé. Seules des métadonnées sont gardées (jamais votre texte ni vos clés). Consulter ou exporter ne contacte jamais un fournisseur et ne modifie aucune limite : <a href="#usage-limits">gérer les limites d’usage</a>.',
    'What Correctly recorded on this browser profile: requests sent, results, edits applied, provider-reported tokens and an estimated cost. Only metadata is kept (never your text or keys). Viewing or exporting never contacts an AI provider and never changes a limit: <a href="#usage-limits">manage usage limits</a>.',
  ],
  periodFilters: ['Période et filtres', 'Period and filters'],
  period: ['Période', 'Period'],
  today: ['Aujourd’hui', 'Today'],
  thisWeek: ['Cette semaine', 'This week'],
  thisMonth: ['Ce mois-ci', 'This month'],
  custom: ['Personnalisée', 'Custom range'],
  startDate: ['Date de début', 'Start date'],
  endDate: ['Date de fin', 'End date'],
  show: ['Afficher', 'Show'],
  action: ['Action', 'Action'],
  model: ['Modèle', 'Model'],
  requestsUsed: ['Requêtes utilisées', 'Requests used'],
  successful: ['Résultats IA réussis', 'Successful AI results'],
  applied: ['Modifications appliquées', 'AI edits applied'],
  tokens: ['Tokens déclarés', 'Tokens reported'],
  cost: ['Coût API estimé (USD)', 'Estimated API cost (USD)'],
  perDay: ['Requêtes par jour', 'Requests per day'],
  asTable: ['Voir sous forme de tableau', 'Show as a table'],
  colDate: ['Date', 'Date'],
  colRequests: ['Requêtes', 'Requests'],
  colSuccessful: ['Réussies', 'Successful'],
  detail: ['Détail', 'Breakdown'],
  byAction: ['Par action', 'By action'],
  byModel: ['Par fournisseur et modèle', 'By provider and model'],
  byKey: ['Par clé API', 'By API key'],
  colTokens: ['Tokens entrée / sortie', 'Tokens in / out'],
  colWithTokens: ['Avec tokens', 'With tokens'],
  colUsd: ['USD estimés', 'Estimated USD'],
  colCoverage: ['Couverture du coût', 'Cost coverage'],
  exportCsv: ['Exporter CSV', 'Export CSV'],
  exportJson: ['Exporter JSON', 'Export JSON'],
  statsAdvanced: [
    'Réglages avancés des statistiques',
    'Advanced statistics settings',
  ],
  priceRefs: [
    'Prix de référence (USD par million de tokens)',
    'Price references (USD per 1M tokens)',
  ],
  priceHint: [
    'Les estimations utilisent les tokens déclarés par chaque fournisseur et le prix en vigueur au moment de l’envoi. Les prix officiels ont été vérifiés le 15 octobre 2026 et peuvent changer : consultez les tarifs actuels de votre fournisseur. Une estimation n’est pas votre facture (pas de taxes, crédits, offre gratuite ni conversion de devise).',
    'Estimates use the tokens each provider reported and the price in force when the request was sent. Official list prices were checked on 15 October 2026 and may change: check your provider’s current rates. An estimate is not your invoice (no taxes, credits, free tier or currency conversion).',
  ],
  colInput: ['Entrée', 'Input'],
  colCached: ['Entrée en cache', 'Cached input'],
  colOutput: ['Sortie', 'Output'],
  colApplies: ['S’applique à', 'Applies to'],
  colSource: ['Source', 'Source'],
  exactModel: ['Identifiant exact du modèle', 'Exact model ID'],
  inputPrice: ['Entrée $ / 1M', 'Input $ / 1M'],
  cachedPrice: [
    'Entrée en cache $ / 1M (facultatif)',
    'Cached input $ / 1M (optional)',
  ],
  outputPrice: ['Sortie $ / 1M', 'Output $ / 1M'],
  appliesFrom: ['S’applique à partir du', 'Applies from'],
  sourceText: ['Source (texte)', 'Source (text only)'],
  addPrice: ['Ajouter le prix', 'Add price reference'],
  deleteHistory: [
    'Supprimer l’historique des statistiques',
    'Delete statistics history',
  ],
  deleteHint: [
    'Supprime les enregistrements locaux de Correctly pour les requêtes envoyées avant la date choisie, et les modifications appliquées. Vos clés API, vos limites d’usage et ce qu’elles ont déjà compté sont conservés (les limites restent appliquées). Rien n’est supprimé chez Google ou OpenAI. Exportez d’abord si vous voulez une copie.',
    'Deletes Correctly’s local records of requests sent before the chosen date and of the edits applied. Your API keys, your usage limits and what they already counted are kept (limits stay enforced). Nothing is deleted at Google or OpenAI. Export first if you want a copy.',
  ],
  deleteBefore: [
    'Supprimer les requêtes envoyées avant le',
    'Delete requests sent before',
  ],
  deleteStats: ['Supprimer les statistiques', 'Delete statistics'],
  privacy: ['Confidentialité', 'Privacy'],
  about1: [
    'Correctly ne lit la sélection d’une page que quand vous l’ouvrez (bouton de la barre d’outils, Ctrl+M, poignée ou menu clic droit), ne l’envoie que quand vous cliquez sur Générer, et ne modifie la page que quand vous cliquez sur Appliquer.',
    'Correctly reads a page selection only when you open it (toolbar button, Ctrl+M, handle or right-click menu), sends it only when you click Generate, and changes the page only when you click Apply.',
  ],
  about2: [
    'Le texte sélectionné sur un article est en lecture seule : il peut être traduit ou résumé et copié, jamais remplacé dans la page.',
    'Text selected on an article is read-only: it can be translated or summarized and copied, never replaced in the page.',
  ],
  about3: [
    'Les requêtes OpenAI sont envoyées avec <code>store: false</code> (non conservées pour être relues) ; ce n’est pas une garantie de non-conservation.',
    'OpenAI requests are sent with <code>store: false</code> (not kept for later retrieval); this is not a zero-retention guarantee.',
  ],
  about5: [
    'Sauvegarde du compte (facultative ; déconnecté, rien n’est envoyé) : passe par Firebase (Google), sans serveur Correctly ; les clés API n’y sont jamais en clair.',
    'Account backup (optional; signed out, nothing is sent): goes through Firebase (Google), with no Correctly server; API keys are never there in clear.',
  ],
  accountLead: [
    'Connectez votre compte Google pour retrouver vos réglages, raccourcis et clés API après une réinstallation ou sur un autre ordinateur. Facultatif : sans compte, tout reste local. Correctly n’a pas de serveur : les données vont dans un espace Firebase (Google) réservé à votre compte.',
    'Sign in with your Google account to get your settings, shortcuts and API keys back after a reinstall or on another computer. Optional: without an account, everything stays local. Correctly has no server: data goes to a Firebase (Google) space reserved for your account.',
  ],
  accountCardTitle: ['Compte Google', 'Google account'],
  accountSignIn: ['Se connecter avec Google', 'Sign in with Google'],
  accountBackup: ['Sauvegarder maintenant', 'Back up now'],
  accountRestore: ['Restaurer', 'Restore'],
  accountSignOut: ['Se déconnecter', 'Sign out'],
  accountMainTitle: ['Que sauvegarder ?', 'What to back up'],
  accountHint: [
    'Chaque domaine se sauvegarde quelques secondes après un changement, et à l’ouverture de cette page. Cet ordinateur garde toujours sa propre copie et fonctionne hors ligne.',
    'Each domain is backed up a few seconds after a change, and when this page opens. This computer always keeps its own copy and works offline.',
  ],
  accountShortcuts: [
    'Raccourcis texte (la liste ; leur activation reste propre à chaque ordinateur)',
    'Text shortcuts (the list; turning expansion on stays per computer)',
  ],
  accountSettings: [
    'Réglages (langue, styles, traduction, raccourcis clavier et menu clic droit autorisés)',
    'Settings (language, styles, translation, keyboard shortcuts and right-click menu allowed)',
  ],
  accountKeybindings: [
    'Raccourcis clavier Correctly (les combinaisons ; leur activation reste propre à chaque ordinateur)',
    'Correctly keyboard shortcuts (the combinations; turning them on stays per computer)',
  ],
  accountKeys: [
    'Clés API et routes, chiffrées par une phrase secrète',
    'API keys and routes, encrypted with a passphrase',
  ],
  accountNever: [
    'Jamais sauvegardés : limites d’usage, statistiques, autorisation d’envoyer le texte, poignée et accès à tous les sites. Votre texte envoyé à l’IA ne passe jamais par Firebase.',
    'Never backed up: usage limits, statistics, permission to send text, the handle and access to all sites. The text you send to the AI never goes through Firebase.',
  ],
  accountKeysTitle: ['Phrase secrète des clés API', 'API key passphrase'],
  accountKeysHint: [
    'Les clés sont chiffrées sur cet ordinateur (AES-GCM, clé dérivée par PBKDF2) avant d’être envoyées : sans la phrase, ni Google, ni Firebase, ni le propriétaire de Correctly ne peut les lire. Saisissez la même phrase une fois sur chaque ordinateur. Phrase oubliée : les clés sauvegardées sont perdues, ressaisissez-les.',
    'Keys are encrypted on this computer (AES-GCM, key derived with PBKDF2) before they are sent: without the passphrase, neither Google, Firebase nor Correctly’s owner can read them. Enter the same passphrase once on each computer. Forgotten passphrase: the backed-up keys are lost; enter them again.',
  ],
  accountPass: [
    'Phrase secrète (8 caractères minimum, différente de votre mot de passe Google)',
    'Passphrase (at least 8 characters, not your Google password)',
  ],
  accountPass2: ['Confirmer la phrase secrète', 'Confirm the passphrase'],
  accountDeleteTitle: [
    'Supprimer mon compte et mes données cloud',
    'Delete my account and my cloud data',
  ],
  accountDeleteHint: [
    'Supprime vos quatre documents dans le cloud, puis votre compte Correctly (Firebase). Les données de cet ordinateur sont conservées.',
    'Deletes your four documents in the cloud, then your Correctly (Firebase) account. This computer’s data is kept.',
  ],
  accountDelete: [
    'Supprimer mon compte et mes données',
    'Delete my account and data',
  ],
  about4: [
    'Documentation : <code>docs/</code> dans le dépôt du projet.',
    'Documentation: <code>docs/</code> in the project repository.',
  ],
};

const T = (k) => `data-i18n="${k}">{{${k}}}`;
const H = (k) => `data-i18n-html="${k}">{{@${k}}}`;

const TEMPLATE = `<!doctype html>
<!-- Generated by scripts/i18n-options.mjs: edit that script, not this file. -->
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Paramètres — Correctly</title>
    <link rel="icon" href="/icons/icon-48.png" />
    <link rel="stylesheet" href="./settings-ui.css" />
  </head>
  <body>
    <a class="skip" href="#content" ${T('skip')}</a>
    <div class="layout">
      <nav class="sidebar" aria-label="{{navLabel}}" data-i18n-aria="navLabel">
        <div class="brand">
          <img class="logo" src="/icons/icon-48.png" alt="" width="32" height="32" />
          <div>
            <p class="brand-name">Correctly</p>
            <p class="brand-sub"><span ${T('brandSub')}</span> <span id="app-version" class="version"></span></p>
          </div>
        </div>
        <ul class="nav">
          <li class="nav-feature"><a href="#account"><span class="nav-icon" aria-hidden="true">☁</span><span ${T('navAccount')}</span></a><ul class="subnav"><li><a href="#account-card-title"><span ${T('subAccountCard')}</span></a></li><li><a href="#account-main-title"><span ${T('subAccountMain')}</span></a></li><li><a href="#account-keys-title"><span ${T('subAccountKeys')}</span></a></li><li><a href="#account-delete-title"><span ${T('subAccountDelete')}</span></a></li></ul></li>
          <li><a href="#start"><span class="nav-icon" aria-hidden="true">◎</span><span ${T('navStart')}</span></a><ul class="subnav"><li><a href="#language-title"><span ${T('subLanguage')}</span></a></li><li><a href="#correction-title"><span ${T('subCorrection')}</span></a></li><li><a href="#triggers-title"><span ${T('subTriggers')}</span></a></li></ul></li>
          <li class="nav-group" role="presentation"><span ${T('navGroupSetup')}</span></li>
          <li><a href="#providers"><span class="nav-icon" aria-hidden="true">⚿</span><span ${T('navProviders')}</span></a><ul class="subnav"><li><a href="#keys-title"><span ${T('subKeys')}</span></a></li><li><a href="#routing-title"><span ${T('subRouting')}</span></a></li></ul></li>
          <li><a href="#usage-limits"><span class="nav-icon" aria-hidden="true">◔</span><span ${T('navLimits')}</span></a></li>
          <li class="nav-group" role="presentation"><span ${T('navGroupWriting')}</span></li>
          <li><a href="#actions"><span class="nav-icon" aria-hidden="true">✎</span><span ${T('navActions')}</span></a><ul class="subnav"><li><a href="#rewrite-title"><span ${T('subRewrite')}</span></a></li><li><a href="#translation-title"><span ${T('subTranslation')}</span></a></li></ul></li>
          <li><a href="#keyboard"><span class="nav-icon" aria-hidden="true">⌨</span><span ${T('navKeyboard')}</span></a><ul class="subnav"><li><a href="#browser-keys-title"><span ${T('subBrowserKeys')}</span></a></li><li><a href="#page-keys-title"><span ${T('subPageKeys')}</span></a></li></ul></li>
          <li><a href="#shortcuts"><span class="nav-icon" aria-hidden="true">¶</span><span ${T('navShortcuts')}</span></a><ul class="subnav"><li><a href="#shortcut-form-title"><span ${T('subShortcutForm')}</span></a></li><li><a href="#shortcut-list-title"><span ${T('subShortcutList')}</span></a></li><li><a href="#backup-title"><span ${T('subBackup')}</span></a></li></ul></li>
          <li class="nav-group" role="presentation"><span ${T('navGroupUsage')}</span></li>
          <li><a href="#statistics"><span class="nav-icon" aria-hidden="true">▤</span><span ${T('navStats')}</span></a><ul class="subnav"><li><a href="#today-title"><span ${T('subToday')}</span></a></li><li><a href="#chart-title"><span ${T('subChart')}</span></a></li><li><a href="#by-title"><span ${T('subBy')}</span></a></li></ul></li>
          <li><a href="#about"><span class="nav-icon" aria-hidden="true">ⓘ</span><span ${T('navAbout')}</span></a></li>
        </ul>
      </nav>

      <main id="app" aria-busy="true">
        <div id="content" tabindex="-1"></div>

        <!-- ============================================== start -->
        <section class="page" id="start" aria-labelledby="start-title">
          <header class="page-head">
            <h1 id="start-title" ${T('navStart')}</h1>
            <p class="lead" ${T('startLead')}</p>
          </header>

          <ol class="steps">
            <li><strong ${T('step1Title')}</strong><span ${H('step1')}</span></li>
            <li><strong ${T('step2Title')}</strong><span ${T('step2')}</span></li>
            <li><strong ${T('step3Title')}</strong><span ${H('step3')}</span></li>
          </ol>

          <section class="card" aria-labelledby="language-title">
            <h2 id="language-title" ${T('languageTitle')}</h2>
            <label class="stack" for="ui-language"><span ${T('languageLabel')}</span>
              <select id="ui-language" disabled>
                <option value="auto" ${T('languageAuto')}</option>
                <option value="fr" lang="fr">Français</option>
                <option value="en" lang="en">English</option>
              </select>
            </label>
            <p class="hint" ${T('languageHint')}</p>
            <p id="language-message" class="message" aria-live="polite"></p>
          </section>

          <section class="card" aria-labelledby="correction-title">
            <h2 id="correction-title" ${T('consentTitle')}</h2>
            <label class="check" for="correction-consent">
              <input id="correction-consent" type="checkbox" disabled />
              <span ${T('consent')}</span>
            </label>
            <p id="consent-message" class="message" aria-live="polite"></p>
            <details class="more">
              <summary ${T('howItWorks')}</summary>
              <p class="hint" ${H('howItWorksText')}</p>
            </details>
          </section>

          <section class="card" aria-labelledby="triggers-title">
            <h2 id="triggers-title" ${T('triggersTitle')}</h2>
            <p class="hint" ${T('triggersHint')}</p>
            <label class="check" for="trigger-keyboard">
              <input id="trigger-keyboard" type="checkbox" disabled />
              <span ${H('triggerKeyboard')}</span>
            </label>
            <p class="hint" ${H('triggerKeyboardHint')}</p>
            <label class="check" for="trigger-menu">
              <input id="trigger-menu" type="checkbox" disabled />
              <span ${T('triggerMenu')}</span>
            </label>
            <label class="check" for="trigger-smart">
              <input id="trigger-smart" type="checkbox" disabled />
              <span ${T('triggerSmart')}</span>
            </label>
            <label class="check" for="trigger-selection">
              <input id="trigger-selection" type="checkbox" disabled />
              <span ${T('triggerSelection')}</span>
            </label>
            <p id="triggers-message" class="message" aria-live="polite"></p>
          </section>
        </section>

        <!-- ============================================== providers -->
        <section class="page" id="providers" aria-labelledby="providers-title" hidden>
          <header class="page-head">
            <h1 id="providers-title" ${T('navProviders')}</h1>
            <p class="lead" ${H('providersLead')}</p>
          </header>

          <section class="card" aria-labelledby="keys-title">
            <h2 id="keys-title" ${T('keysTitle')}</h2>
            <p id="providers-status" class="message" aria-live="polite"></p>
            <p id="profile-empty" class="empty" ${T('profileEmpty')}</p>
            <ul id="profile-list" class="shortcut-list" aria-label="{{savedKeys}}" data-i18n-aria="savedKeys"></ul>

            <form id="profile-form" class="subcard" novalidate aria-labelledby="profile-form-title">
              <h3 id="profile-form-title" ${T('addKey')}</h3>
              <div class="grid-2">
                <label class="stack" for="profile-provider"><span ${T('provider')}</span>
                  <select id="profile-provider" disabled>
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </label>
                <label class="stack" for="profile-label"><span ${T('keyName')}</span>
                  <input id="profile-label" type="text" maxlength="40" autocomplete="off" disabled />
                </label>
              </div>
              <label class="stack-label" for="profile-key" ${T('apiKey')}</label>
              <div class="key-row">
                <input id="profile-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="key-warning profile-message" disabled />
                <button id="profile-toggle" type="button" class="ghost" aria-controls="profile-key" aria-pressed="false" aria-label="{{showKeyLabel}}" data-i18n-aria="showKeyLabel" disabled ${T('showKey')}</button>
              </div>
              <p class="hint"><span ${T('keyHint')}</span>
                <a id="profile-help-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" ${T('createKey')}</a>.
              </p>
              <div class="actions">
                <button id="profile-save" type="submit" class="primary" disabled ${T('saveKey')}</button>
                <button id="profile-cancel" type="button" class="ghost" hidden ${T('cancel')}</button>
              </div>
              <p id="profile-message" class="message" aria-live="polite"></p>
            </form>
            <p id="key-warning" class="warning small" ${T('keyWarning')}</p>
          </section>

          <section class="card" aria-labelledby="routing-title">
            <h2 id="routing-title" ${T('routingTitle')}</h2>
            <p class="hint" ${H('routingHint')}</p>
            <div id="route-list" class="routes"></div>
            <p class="hint"><span ${T('prices')}</span>
              <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">Gemini</a>,
              <a href="https://openai.com/api/pricing/" target="_blank" rel="noopener noreferrer">OpenAI</a>.
              <span ${T('pricesNote')}</span>
            </p>
          </section>
        </section>

        <!-- ============================================== actions -->
        <section class="page" id="actions" aria-labelledby="actions-title" hidden>
          <header class="page-head">
            <h1 id="actions-title" ${T('navActions')}</h1>
            <p class="lead" ${T('actionsLead')}</p>
          </header>

          <section class="card" aria-labelledby="rewrite-title">
            <h2 id="rewrite-title" ${T('rewriteTitle')}</h2>
            <label class="check" for="rewrite-enabled">
              <input id="rewrite-enabled" type="checkbox" disabled />
              <span ${T('rewriteEnabled')}</span>
            </label>
            <fieldset id="rewrite-styles" class="styles">
              <legend ${T('defaultStyles')}</legend>
            </fieldset>
            <div class="formality-setting">
              <label for="rewrite-formality" ${T('defaultFormality')}</label>
              <div class="formality-row">
                <small ${T('lessFormal')}</small>
                <input id="rewrite-formality" type="range" min="1" max="5" step="1" disabled />
                <small ${T('moreFormal')}</small>
              </div>
              <p id="rewrite-formality-level" class="hint" aria-live="polite"></p>
            </div>
            <p class="hint" ${H('rewriteHint')}</p>
            <p id="rewrite-message" class="message" aria-live="polite"></p>
          </section>

          <section class="card" aria-labelledby="translation-title">
            <h2 id="translation-title" ${T('translationTitle')}</h2>
            <p class="hint" ${H('translationHint')}</p>
            <div class="grid-3">
              <label class="stack" for="translation-source"><span ${T('from')}</span>
                <select id="translation-source" disabled></select>
              </label>
              <label class="stack" for="translation-target"><span ${T('to')}</span>
                <select id="translation-target" disabled></select>
              </label>
              <label class="stack" id="translation-variant-row" for="translation-variant"><span ${T('variant')}</span>
                <select id="translation-variant" disabled></select>
              </label>
            </div>
            <fieldset id="translation-favorites" class="styles favorites">
              <legend ${T('favoritesLegend')}</legend>
            </fieldset>
            <p class="hint" ${T('favoritesHint')}</p>
            <p class="hint" ${T('translationNote')}</p>
            <p id="translation-message" class="message" aria-live="polite"></p>
          </section>
        </section>

        <!-- ============================================== keyboard -->
        <section class="page" id="keyboard" aria-labelledby="keyboard-title" hidden>
          <header class="page-head">
            <h1 id="keyboard-title" ${T('navKeyboard')}</h1>
            <p class="lead" ${T('keyboardLead')}</p>
          </header>

          <section class="card" aria-labelledby="browser-keys-title">
            <div class="card-head">
              <h2 id="browser-keys-title" ${T('browserKeysTitle')}</h2>
              <button id="commands-refresh" type="button" class="ghost" ${T('refresh')}</button>
            </div>
            <p class="hint" ${T('browserKeysHint')}</p>
            <div class="table-wrap">
              <table id="command-list" class="stats-table keys-table">
                <thead><tr><th scope="col" ${T('colAction')}</th><th scope="col" ${T('colShortcut')}</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
            <p id="command-empty" class="empty" hidden ${T('commandEmpty')}</p>
            <div class="actions">
              <button id="open-shortcuts" type="button" disabled ${T('changeInChrome')}</button>
            </div>
          </section>

          <section class="card" aria-labelledby="page-keys-title">
            <h2 id="page-keys-title" ${T('pageKeysTitle')}</h2>
            <p class="hint" ${T('pageKeysHint')}</p>
            <label class="check" for="keybindings-enabled">
              <input id="keybindings-enabled" type="checkbox" disabled />
              <span ${T('keysEnabled')}</span>
            </label>
            <ul id="keybinding-list" class="key-list" aria-label="{{myKeys}}" data-i18n-aria="myKeys"></ul>
            <p id="keybindings-message" class="message" aria-live="polite"></p>
          </section>
        </section>

        <!-- ============================================== text shortcuts -->
        <section class="page" id="shortcuts" aria-labelledby="shortcuts-title" hidden>
          <header class="page-head">
            <h1 id="shortcuts-title" ${T('navShortcuts')}</h1>
            <p class="lead" ${H('shortcutsLead')}</p>
          </header>

          <section class="card" aria-label="{{activation}}" data-i18n-aria="activation">
            <label class="check" for="shortcuts-enabled">
              <input id="shortcuts-enabled" type="checkbox" disabled />
              <span ${T('shortcutsEnabled')}</span>
            </label>
            <p class="hint" ${T('shortcutsHint')}</p>
            <p id="shortcuts-status" class="message" aria-live="polite"></p>
          </section>

          <section class="card" aria-labelledby="shortcut-form-title">
            <h2 id="shortcut-form-title" ${T('addShortcutTitle')}</h2>
            <form id="shortcut-form" novalidate>
              <label class="stack" for="shortcut-trigger"><span ${T('trigger')}</span>
                <input id="shortcut-trigger" type="text" maxlength="32" autocomplete="off" autocapitalize="off" spellcheck="false" disabled />
              </label>
              <label class="stack" for="shortcut-replacement"><span ${T('replacement')}</span>
                <textarea id="shortcut-replacement" rows="2" maxlength="2000" disabled></textarea>
              </label>
              <label class="check" for="shortcut-entry-enabled">
                <input id="shortcut-entry-enabled" type="checkbox" checked disabled />
                <span ${T('entryEnabled')}</span>
              </label>
              <label class="check" for="shortcut-protect-trigger">
                <input id="shortcut-protect-trigger" type="checkbox" checked disabled />
                <span ${T('protectTrigger')}</span>
              </label>
              <label class="check" for="shortcut-protect-replacement">
                <input id="shortcut-protect-replacement" type="checkbox" disabled />
                <span ${T('protectReplacement')}</span>
              </label>
              <div class="actions">
                <button id="shortcut-save" type="submit" class="primary" disabled ${T('addShortcut')}</button>
                <button id="shortcut-cancel" type="button" class="ghost" hidden ${T('cancelEdit')}</button>
              </div>
              <p id="shortcut-message" class="message" aria-live="polite"></p>
            </form>
          </section>

          <section class="card" aria-labelledby="shortcut-list-title">
            <div class="card-head">
              <h2 id="shortcut-list-title" ${T('myShortcuts')}</h2>
              <span id="shortcut-count" class="badge">0 / 500</span>
            </div>
            <label class="stack" for="shortcut-search"><span ${T('search')}</span>
              <input id="shortcut-search" type="search" disabled />
            </label>
            <p id="shortcut-empty" class="empty" ${T('shortcutEmpty')}</p>
            <ul id="shortcut-list" class="shortcut-list"></ul>
          </section>

          <section class="card" aria-labelledby="backup-title">
            <h2 id="backup-title" ${T('backup')}</h2>
            <div class="actions">
              <button id="shortcut-export" type="button" class="ghost" disabled ${T('export')}</button>
              <label class="file" for="shortcut-import"><span ${T('import')}</span>
                <input id="shortcut-import" type="file" accept="application/json,.json" disabled />
              </label>
            </div>
            <div id="import-preview" class="import" hidden>
              <p id="import-summary"></p>
              <fieldset class="styles">
                <legend ${T('ifExists')}</legend>
                <label class="check"><input type="radio" name="import-policy" value="skip" checked /> <span ${T('keepMine')}</span></label>
                <label class="check"><input type="radio" name="import-policy" value="overwrite" /> <span ${T('overwrite')}</span></label>
                <label class="check"><input type="radio" name="import-policy" value="replaceAll" /> <span ${T('replaceAll')}</span></label>
              </fieldset>
              <div class="actions">
                <button id="import-confirm" type="button" class="primary" ${T('importButton')}</button>
                <button id="import-cancel" type="button" class="ghost" ${T('cancel')}</button>
              </div>
            </div>
            <p id="import-message" class="message" aria-live="polite"></p>
          </section>
        </section>

        <!-- ============================================== account -->
        <section class="page" id="account" aria-labelledby="account-title" hidden>
          <header class="page-head">
            <h1 id="account-title" ${T('navAccount')}</h1>
            <p class="lead" ${T('accountLead')}</p>
          </header>

          <section class="card" aria-labelledby="account-card-title">
            <h2 id="account-card-title" ${T('accountCardTitle')}</h2>
            <p id="account-state" class="hint" aria-live="polite"></p>
            <div class="actions">
              <button id="account-signin" type="button" disabled ${T('accountSignIn')}</button>
              <button id="account-backup" type="button" disabled ${T('accountBackup')}</button>
              <button id="account-restore" type="button" class="ghost" disabled ${T('accountRestore')}</button>
              <button id="account-signout" type="button" class="ghost" disabled ${T('accountSignOut')}</button>
            </div>
            <p id="account-message" class="message" aria-live="polite"></p>
          </section>

          <section class="card" aria-labelledby="account-main-title">
            <h2 id="account-main-title" ${T('accountMainTitle')}</h2>
            <p class="hint" ${T('accountHint')}</p>
            <ul class="account-domains">
              <li class="account-domain">
                <label class="check" for="account-shortcuts"><input id="account-shortcuts" type="checkbox" data-domain="shortcuts" disabled /><span ${T('accountShortcuts')}</span></label>
                <p id="account-status-shortcuts" class="hint account-status" aria-live="polite"></p>
              </li>
              <li class="account-domain">
                <label class="check" for="account-settings"><input id="account-settings" type="checkbox" data-domain="settings" disabled /><span ${T('accountSettings')}</span></label>
                <p id="account-status-settings" class="hint account-status" aria-live="polite"></p>
              </li>
              <li class="account-domain">
                <label class="check" for="account-keybindings"><input id="account-keybindings" type="checkbox" data-domain="keybindings" disabled /><span ${T('accountKeybindings')}</span></label>
                <p id="account-status-keybindings" class="hint account-status" aria-live="polite"></p>
              </li>
              <li class="account-domain">
                <label class="check" for="account-keys"><input id="account-keys" type="checkbox" data-domain="keys" disabled /><span ${T('accountKeys')}</span></label>
                <p id="account-status-keys" class="hint account-status" aria-live="polite"></p>
              </li>
            </ul>
            <p class="hint" ${T('accountNever')}</p>
          </section>

          <section class="card" aria-labelledby="account-keys-title">
            <h2 id="account-keys-title" ${T('accountKeysTitle')}</h2>
            <p class="hint" ${T('accountKeysHint')}</p>
            <form id="account-pass-form" novalidate>
              <label class="stack" for="account-pass"><span ${T('accountPass')}</span><input id="account-pass" type="password" autocomplete="new-password" maxlength="1024" disabled /></label>
              <label id="account-pass2-row" class="stack" for="account-pass2"><span ${T('accountPass2')}</span><input id="account-pass2" type="password" autocomplete="new-password" maxlength="1024" disabled /></label>
              <div class="actions">
                <button id="account-pass-submit" type="submit" disabled></button>
                <button id="account-pass-replace" type="button" class="ghost" hidden></button>
              </div>
            </form>
            <p id="account-pass-message" class="message" aria-live="polite"></p>
          </section>

          <section class="card" aria-labelledby="account-delete-title">
            <h2 id="account-delete-title" ${T('accountDeleteTitle')}</h2>
            <p class="hint" ${T('accountDeleteHint')}</p>
            <div class="actions">
              <button id="account-delete" type="button" class="danger" disabled ${T('accountDelete')}</button>
            </div>
            <p id="account-delete-message" class="message" aria-live="polite"></p>
          </section>
        </section>

        <!-- ============================================== usage limits -->
        <section class="page" id="usage-limits" aria-labelledby="limits-title" hidden>
          <header class="page-head">
            <div class="card-head">
              <h1 id="limits-title" ${T('navLimits')}</h1>
              <p id="limits-state" class="status" data-tone="neutral"><span class="dot"></span><span ${T('loading')}</span></p>
            </div>
            <p class="lead" ${T('limitsLead')}</p>
          </header>

          <p id="limits-status" class="message" role="status"></p>
          <div id="limits-repair" class="warning" hidden>
            <p ${T('repairText')}</p>
            <button id="limits-repair-button" type="button" ${T('repairButton')}</button>
          </div>
          <div id="limits-clock" class="warning" hidden>
            <p ${T('clockText')}</p>
            <button id="limits-clock-confirm" type="button" ${T('clockButton')}</button>
          </div>
          <ul id="limits-alerts" class="alerts" aria-label="{{alertsLabel}}" data-i18n-aria="alertsLabel" aria-live="polite"></ul>

          <section class="card" aria-label="{{pause}}" data-i18n-aria="pause">
            <label class="check" for="limits-pause">
              <input id="limits-pause" type="checkbox" disabled />
              <span ${T('pauseAll')}</span>
            </label>
          </section>

          <form id="limits-form" class="card" novalidate>
            <h2 ${T('limitsTitle')}</h2>
            <div id="limits-groups" class="limit-groups"></div>
            <p id="limits-global-error" class="message" data-tone="error"></p>
            <details id="limits-tasks" class="more">
              <summary ${T('tasksLimits')}</summary>
              <p class="hint" ${T('tasksHint')}</p>
              <div id="limits-task-groups" class="limit-groups"></div>
            </details>
            <details id="limits-advanced" class="more">
              <summary ${T('advancedLimits')}</summary>
              <p class="hint" ${T('advancedHint')}</p>
              <div id="limits-advanced-groups" class="limit-groups"></div>
            </details>
            <fieldset class="route">
              <legend ${T('warnings')}</legend>
              <label class="check" for="limits-at80">
                <input id="limits-at80" type="checkbox" disabled />
                <span ${T('warn80')}</span>
              </label>
              <label class="check" for="limits-at95">
                <input id="limits-at95" type="checkbox" disabled />
                <span ${T('warn95')}</span>
              </label>
              <p class="hint" ${T('warningsHint')}</p>
            </fieldset>
            <p class="hint inline"><span ${T('timezone')}</span>
              <strong id="limits-timezone">—</strong>
              <button id="limits-timezone-change" type="button" class="ghost" disabled ${T('change')}</button>
            </p>
            <div id="limits-timezone-row" hidden>
              <label class="stack-label" for="limits-timezone-input" ${T('ianaZone')}</label>
              <input id="limits-timezone-input" list="limits-timezones" autocomplete="off" aria-describedby="limits-timezone-error" />
              <datalist id="limits-timezones"></datalist>
              <p class="hint" ${T('zoneHint')}</p>
            </div>
            <p id="limits-timezone-error" class="message" data-tone="error"></p>
            <div class="actions sticky-actions">
              <button id="limits-save" type="submit" class="primary" disabled ${T('saveLimits')}</button>
              <button id="limits-reload" type="button" hidden ${T('reloadLimits')}</button>
            </div>
            <p id="limits-message" class="message" aria-live="polite"></p>
          </form>

          <section class="card" aria-labelledby="today-title">
            <h2 id="today-title" ${T('todayTitle')}</h2>
            <ul id="usage-routes" class="hint list" aria-label="{{todayTitle}}" data-i18n-aria="todayTitle"></ul>
            <p id="limits-tracking" class="hint"></p>
            <p class="hint" ${H('historyLink')}</p>
          </section>

          <p id="limit-note" class="hint footnote"><span ${T('limitNote')}</span>
            <span ${T('capsAt')}</span>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">Google</a>,
            <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noopener noreferrer">OpenAI</a>.
          </p>
        </section>

        <!-- ============================================== statistics -->
        <section class="page" id="statistics" aria-labelledby="stats-title" hidden>
          <header class="page-head">
            <div class="card-head">
              <h1 id="stats-title" ${T('navStats')}</h1>
              <p id="stats-state" class="status" data-tone="neutral"><span class="dot"></span><span ${T('loading')}</span></p>
            </div>
            <p class="lead" ${H('statsLead')}</p>
          </header>

          <section class="card" aria-label="{{periodFilters}}" data-i18n-aria="periodFilters">
            <div class="period" role="group" aria-label="{{period}}" data-i18n-aria="period">
              <button type="button" data-stats-preset="today" aria-pressed="true" ${T('today')}</button>
              <button type="button" data-stats-preset="week" aria-pressed="false" ${T('thisWeek')}</button>
              <button type="button" data-stats-preset="month" aria-pressed="false" ${T('thisMonth')}</button>
              <button type="button" data-stats-preset="custom" aria-pressed="false" ${T('custom')}</button>
            </div>
            <form id="stats-custom" class="key-row" novalidate hidden>
              <label class="stack" for="stats-from"><span ${T('startDate')}</span> <input id="stats-from" type="date" /></label>
              <label class="stack" for="stats-to"><span ${T('endDate')}</span> <input id="stats-to" type="date" /></label>
              <button type="submit" ${T('show')}</button>
            </form>
            <p id="stats-range" class="hint"></p>
            <div class="filters">
              <label class="stack" for="stats-task"><span ${T('action')}</span> <select id="stats-task" disabled></select></label>
              <label class="stack" for="stats-provider"><span ${T('provider')}</span> <select id="stats-provider" disabled></select></label>
              <label class="stack" for="stats-model"><span ${T('model')}</span> <select id="stats-model" disabled></select></label>
              <label class="stack" for="stats-key"><span ${T('apiKey')}</span> <select id="stats-key" disabled></select></label>
            </div>
          </section>

          <p id="stats-message" class="message" role="status"></p>
          <p id="stats-coverage" class="warning" hidden></p>
          <dl class="stats-cards">
            <div><dt ${T('requestsUsed')}</dt><dd id="stats-requests-value">—</dd><dd id="stats-requests-detail" class="hint"></dd></div>
            <div><dt ${T('successful')}</dt><dd id="stats-success-value">—</dd><dd id="stats-success-detail" class="hint"></dd></div>
            <div><dt ${T('applied')}</dt><dd id="stats-applied-value">—</dd><dd id="stats-applied-detail" class="hint"></dd></div>
            <div><dt ${T('tokens')}</dt><dd id="stats-tokens-value">—</dd><dd id="stats-tokens-detail" class="hint"></dd></div>
            <div><dt ${T('cost')}</dt><dd id="stats-cost-value">—</dd><dd id="stats-cost-detail" class="hint"></dd></div>
          </dl>

          <section class="card" aria-labelledby="chart-title">
            <h2 id="chart-title" ${T('perDay')}</h2>
            <div id="stats-chart" class="chart" role="img"></div>
            <details class="more">
              <summary ${T('asTable')}</summary>
              <table id="stats-days" class="stats-table">
                <thead><tr><th scope="col" ${T('colDate')}</th><th scope="col" ${T('colRequests')}</th><th scope="col" ${T('colSuccessful')}</th></tr></thead>
                <tbody></tbody>
              </table>
            </details>
          </section>

          <section class="card" aria-labelledby="by-title">
            <h2 id="by-title" ${T('detail')}</h2>
            <h3 class="subhead" ${T('byAction')}</h3>
            <div class="table-wrap">
              <table id="stats-by-task" class="stats-table">
                <thead><tr><th scope="col" ${T('action')}</th>{{COLS}}</tr></thead>
                <tbody></tbody>
              </table>
            </div>
            <p id="stats-applied-by-task" class="hint"></p>
            <h3 class="subhead" ${T('byModel')}</h3>
            <div class="table-wrap">
              <table id="stats-by-model" class="stats-table">
                <thead><tr><th scope="col" ${T('model')}</th>{{COLS}}</tr></thead>
                <tbody></tbody>
              </table>
            </div>
            <h3 class="subhead" ${T('byKey')}</h3>
            <div class="table-wrap">
              <table id="stats-by-key" class="stats-table">
                <thead><tr><th scope="col" ${T('apiKey')}</th>{{COLS}}</tr></thead>
                <tbody></tbody>
              </table>
            </div>
            <div class="actions">
              <button id="stats-refresh" type="button" ${T('refresh')}</button>
              <button id="stats-csv" type="button" disabled ${T('exportCsv')}</button>
              <button id="stats-json" type="button" disabled ${T('exportJson')}</button>
            </div>
          </section>

          <section class="card" aria-label="{{statsAdvanced}}" data-i18n-aria="statsAdvanced">
            <details id="stats-prices" class="more">
              <summary ${T('priceRefs')}</summary>
              <p class="hint" ${T('priceHint')}</p>
              <div class="table-wrap">
                <table id="price-table" class="stats-table">
                  <thead><tr><th scope="col" ${T('model')}</th><th scope="col" ${T('colInput')}</th><th scope="col" ${T('colCached')}</th><th scope="col" ${T('colOutput')}</th><th scope="col" ${T('colApplies')}</th><th scope="col" ${T('colSource')}</th></tr></thead>
                  <tbody></tbody>
                </table>
              </div>
              <form id="price-form" class="price-form" novalidate>
                <label class="stack" for="price-provider"><span ${T('provider')}</span>
                  <select id="price-provider">
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                  </select></label>
                <label class="stack" for="price-model"><span ${T('exactModel')}</span> <input id="price-model" list="price-models" autocomplete="off" /></label>
                <datalist id="price-models"></datalist>
                <label class="stack" for="price-input"><span ${T('inputPrice')}</span> <input id="price-input" inputmode="decimal" /></label>
                <label class="stack" for="price-cached"><span ${T('cachedPrice')}</span> <input id="price-cached" inputmode="decimal" /></label>
                <label class="stack" for="price-output"><span ${T('outputPrice')}</span> <input id="price-output" inputmode="decimal" /></label>
                <label class="stack" for="price-from"><span ${T('appliesFrom')}</span> <input id="price-from" type="date" /></label>
                <label class="stack" for="price-label"><span ${T('sourceText')}</span> <input id="price-label" maxlength="120" /></label>
                <button type="submit" ${T('addPrice')}</button>
              </form>
              <p id="price-message" class="message" aria-live="polite"></p>
            </details>
            <details id="stats-delete" class="more">
              <summary ${T('deleteHistory')}</summary>
              <p class="hint" ${T('deleteHint')}</p>
              <form id="stats-delete-form" class="key-row" novalidate>
                <label class="stack" for="stats-delete-before"><span ${T('deleteBefore')}</span> <input id="stats-delete-before" type="date" /></label>
                <button type="submit" class="danger" ${T('deleteStats')}</button>
              </form>
              <p id="stats-delete-message" class="message" aria-live="polite"></p>
            </details>
          </section>
        </section>

        <!-- ============================================== about -->
        <section class="page" id="about" aria-labelledby="notes-title" hidden>
          <header class="page-head">
            <h1 id="notes-title" ${T('navAbout')}</h1>
          </header>
          <section class="card notes" aria-label="{{privacy}}" data-i18n-aria="privacy">
            <ul>
              <li ${T('about1')}</li>
              <li ${T('about2')}</li>
              <li ${H('about3')}</li>
              <li ${T('about5')}</li>
              <li ${H('about4')}</li>
            </ul>
          </section>
        </section>
      </main>
    </div>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
`;

const COLS = [
  'colRequests',
  'colSuccessful',
  'colTokens',
  'colWithTokens',
  'colUsd',
  'colCoverage',
]
  .map((k) => `<th scope="col" ${T(k)}</th>`)
  .join('');
const ALLOWED = /<\/?(strong|kbd|code)>|<a href="#[a-z-]+">|<\/a>/g;
const escape = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const page0 = TEMPLATE.replace(/\{\{COLS\}\}/g, COLS);
const used = new Set(
  [...page0.matchAll(/\{\{@?([A-Za-z0-9]+)\}\}/g)].map((m) => m[1]),
);
const markup = new Set(
  [...page0.matchAll(/\{\{@([A-Za-z0-9]+)\}\}/g)].map((m) => m[1]),
);
const keys = Object.keys(TEXTS).sort();
const missing = [...used].filter((k) => !(k in TEXTS));
const unused = keys.filter((k) => !used.has(k));
if (missing.length || unused.length)
  throw new Error(
    `missing: ${missing.join(', ')}; unused: ${unused.join(', ')}`,
  );
for (const key of markup)
  for (const value of TEXTS[key])
    if (/[<>]/.test(value.replace(ALLOWED, '')))
      throw new Error(`${key}: unexpected markup in ${value}`);
const page = page0.replace(/\{\{(@?)([A-Za-z0-9]+)\}\}/g, (_, raw, key) =>
  raw ? TEXTS[key][0] : escape(TEXTS[key][0]),
);
writeFileSync(join(OPTIONS, 'options.html'), page);

const out = [
  '// Generated by scripts/i18n-options.mjs: edit that script, not this file.',
  '// Static texts of the settings page (data-i18n keys) in English and French.',
  '// Keys in HTML_MARKUP may hold trusted inline markup (strong, kbd, code,',
  '// in-page links); every other value is plain text.',
  '',
  'export type HtmlKey =',
  ...keys.map((k) => `  | '${k}'`),
  ';',
  '',
  'export const HTML_MARKUP: readonly HtmlKey[] = [',
  ...[...markup].sort().map((k) => `  '${k}',`),
  '];',
  '',
];
for (const [name, index] of [
  ['HTML_EN', 1],
  ['HTML_FR', 0],
]) {
  out.push(`export const ${name}: Record<HtmlKey, string> = {`);
  for (const k of keys) out.push(`  ${k}: ${JSON.stringify(TEXTS[k][index])},`);
  out.push('};', '');
}
writeFileSync(join(OPTIONS, 'messages-html.ts'), out.join('\n'));
console.log(`ok: ${keys.length} texts, ${markup.size} with markup`);
