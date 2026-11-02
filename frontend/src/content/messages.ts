// 5.13: wording of the in-page UI (modal, V5.2–V5.5 panel, handle, Undo
// toast) in English and French. English is the V5.x copy, unchanged.
import { MAX_CORRECTION_CODE_POINTS } from '../shared/contracts';
import type { Locale } from '../shared/locale';

/** What a result is called in a sentence ("No meaningful rewrite…"). */
export type Kind = 'correction' | 'rewrite' | 'reformulation' | 'translation';
export type ModalTabId =
  'correction' | 'reformulation' | 'translation' | 'summary';

export interface Notices {
  select: string;
  notEditable: string;
  rewriteOff: string;
  unreachable: string;
  sensitive: string;
  tooLong: string;
  copyOnly: string;
  readOnly: string;
  stale: string;
  suspicious: string;
  noTarget: string;
  pageText: string;
  readOnlyPage: string;
  multiRange: string;
}

export interface ContentMessages {
  notices: Notices;
  tabs: Record<ModalTabId, { label: string; action: string; loading: string }>;
  // modal
  openSettings: string;
  minimize: string;
  close: string;
  tablist: string;
  textLabel: string;
  placeholder: string;
  manageLimits: string;
  correctionHint: string;
  styles: string;
  oneRequestStyles: string;
  from: string;
  to: string;
  autoDetect: string;
  variant: string;
  alsoRewrite: string;
  summaryLanguage: string;
  length: string;
  format: string;
  summaryHint: string;
  apply: string;
  copy: string;
  cancel: string;
  results: string;
  tooLongForTab: (summaryMax: string) => string;
  summaryTooLong: (max: string) => string;
  selectAtMost: (max: string) => string;
  summaryLabel: (target: string) => string;
  translationLabel: (target: string) => string;
  styledLabel: (style: string, target: string) => string;
  sameLanguage: (target: string, use: Kind) => string;
  sameSourceTarget: (use: Kind) => string;
  notChanged: (message: string) => string;
  noCorrections: string;
  suggestedCorrection: string;
  corrected: string;
  unsummarizable: string;
  suggestedSummary: string;
  noneReturned: (kind: Kind, list: string) => string;
  noMeaningful: (kind: Kind) => string;
  noMeaningfulForStyle: (kind: Kind) => string;
  chooseOne: (kind: Kind) => string;
  suggestedOne: (kind: Kind) => string;
  copied: string;
  copyFailed: string;
  copyFailedPanel: string;
  cancelled: string;
  textReplaced: string;
  undo: string;
  undoRefused: string;
  // V5.2–V5.5 panel
  panelLabel: string;
  original: string;
  rewrites: string;
  generateRewrites: string;
  translate: string;
  closeButton: string;
  title: (kind: Kind) => string;
  titleTranslate: string;
  titleTranslateRewrite: string;
  undoKind: (kind: Kind) => string;
  applied: (kind: Kind) => string;
  undone: (kind: Kind) => string;
  undoRefusedPanel: string;
  checking: string;
  chooseStyles: string;
  generatingRewrites: string;
  translatingInto: (target: string) => string;
  chooseLanguages: string;
  tryAgain: string;
  // handle
  handleLabel: string;
  handleTitle: string;
  // 5.15 translate button and bubble
  selectionButton: string;
  bubbleTitle: string;
  bubbleTranslate: string;
  bubbleTranslating: string;
  bubbleSame: string;
  bubbleEmpty: string;
  bubbleOpen: string;
  // V6.1 real-time correction
  realtime: {
    cardLabel: string;
    spelling: string;
    grammar: string;
    replaceWith: (suggestion: string) => string;
    copyWith: (suggestion: string) => string;
    copied: string;
    copyFailed: string;
    outdated: string;
    copyOnlyHint: string;
    ignore: string;
    addToDictionary: string;
    badgePaused: string;
    badgeOffline: string;
    badgeNeedsEngine: string;
    badgeDownloading: string;
    badgeError: string;
  };
}

const EN_NOUN: Record<Kind, string> = {
  correction: 'correction',
  rewrite: 'rewrite',
  reformulation: 'reformulation',
  translation: 'translation',
};
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const EN: ContentMessages = {
  notices: {
    select: 'Select the text to correct, then ask Correctly again.',
    notEditable:
      'Select text inside a text box or editor. Correctly does not send other page text.',
    rewriteOff: 'Rewrite is turned off in the Correctly settings.',
    unreachable:
      'Correctly cannot reach this editor (embedded from another site). Copy the text into a regular text box.',
    sensitive:
      'Correctly never reads password, email, phone, URL, number or search fields.',
    tooLong: `Select at most ${MAX_CORRECTION_CODE_POINTS.toLocaleString('en')} characters.`,
    copyOnly:
      'Apply works only in plain text boxes. Copy the suggestion instead.',
    readOnly: 'This field cannot be edited. Copy the suggestion instead.',
    stale:
      'The text or selection changed since the request. Copy the suggestion or correct again.',
    suspicious:
      'A number, link or email address differs from your text. Check it and copy it if it is right; Apply is disabled.',
    noTarget:
      'No text box selection to replace: Apply is disabled. Copy the result instead.',
    pageText:
      'Text selected on the page: results can be copied, never applied to the page.',
    readOnlyPage:
      'This text was selected on the page, which Correctly never edits. Copy the result instead.',
    multiRange:
      'Select one continuous piece of text, then ask Correctly again.',
  },
  tabs: {
    correction: {
      label: 'Correction',
      action: 'Generate correction',
      loading: 'Checking with your AI provider…',
    },
    reformulation: {
      label: 'Reformulation',
      action: 'Generate reformulation',
      loading: 'Generating reformulations…',
    },
    translation: {
      label: 'Translation',
      action: 'Generate translation',
      loading: 'Translating…',
    },
    summary: {
      label: 'Summary',
      action: 'Generate summary',
      loading: 'Summarizing…',
    },
  },
  openSettings: 'Open Correctly settings',
  minimize: 'Minimize Correctly (keeps your text and results)',
  close: 'Close Correctly',
  tablist: 'Correctly actions',
  textLabel: 'Text',
  placeholder: 'Type or paste text here.',
  manageLimits: 'Manage limits',
  correctionHint:
    'Fixes spelling and grammar. The text is sent to your AI provider only when you click Generate correction.',
  styles: 'Styles',
  oneRequestStyles:
    'All chosen styles are generated in ONE AI request, which may count against your quota.',
  from: 'From',
  to: 'To',
  autoDetect: 'Auto-detect',
  variant: 'Variant',
  alsoRewrite: 'Also rewrite in a style',
  summaryLanguage: 'Summary language',
  length: 'Length',
  format: 'Format',
  summaryHint:
    'The summary is written directly in the chosen language in ONE AI request. Only the text above is sent, when you click Generate summary.',
  apply: 'Apply',
  copy: 'Copy',
  cancel: 'Cancel',
  results: 'Results',
  tooLongForTab: (summaryMax) =>
    `Select at most ${MAX_CORRECTION_CODE_POINTS.toLocaleString('en')} characters. Summary accepts up to ${summaryMax}.`,
  summaryTooLong: (max) =>
    `Summary accepts at most ${max} characters; nothing is cut automatically.`,
  selectAtMost: (max) => `Select at most ${max} characters.`,
  summaryLabel: (target) => `Summary → ${target}`,
  translationLabel: (target) => `Translation → ${target}`,
  styledLabel: (style, target) => `${style} → ${target}`,
  sameLanguage: (target, use) =>
    `The text already seems to be in ${target}. Nothing to translate: use ${capital(EN_NOUN[use])} to change its style.`,
  sameSourceTarget: (use) =>
    `Source and target are the same: use ${capital(EN_NOUN[use])} instead.`,
  notChanged: (message) => `${message} Your text was not changed.`,
  noCorrections: 'No corrections needed.',
  suggestedCorrection: 'Suggested correction',
  corrected: 'Corrected',
  unsummarizable:
    'This text cannot be summarized faithfully (too short, unclear or incomplete). Nothing was invented.',
  suggestedSummary: 'Suggested summary.',
  noneReturned: (kind, list) =>
    ` No ${EN_NOUN[kind]} was returned for: ${list}.`,
  noMeaningful: (kind) => `No meaningful ${EN_NOUN[kind]} was generated.`,
  noMeaningfulForStyle: (kind) =>
    `No meaningful ${EN_NOUN[kind]} was generated for this style.`,
  chooseOne: (kind) => `Choose a ${EN_NOUN[kind]}, then Apply or Copy.`,
  suggestedOne: (kind) => `Suggested ${EN_NOUN[kind]}.`,
  copied: 'Copied.',
  copyFailed: 'Copy failed. Select the result and copy it manually.',
  copyFailedPanel:
    'Copy failed. Select the corrected text and copy it manually.',
  cancelled: 'Cancelled. A request already sent may still count in your usage.',
  textReplaced: 'Text replaced.',
  undo: 'Undo',
  undoRefused: 'The text changed after Apply, so it cannot be undone safely.',
  panelLabel: 'Correctly correction',
  original: 'Original',
  rewrites: 'Rewrites',
  generateRewrites: 'Generate rewrites',
  translate: 'Translate',
  closeButton: 'Close',
  title: (kind) => `Correctly — ${capital(EN_NOUN[kind])}`,
  titleTranslate: 'Correctly — Translate',
  titleTranslateRewrite: 'Correctly — Translate & rewrite',
  undoKind: (kind) => `Undo ${EN_NOUN[kind]}`,
  applied: (kind) => `${capital(EN_NOUN[kind])} applied.`,
  undone: (kind) => `${capital(EN_NOUN[kind])} undone.`,
  undoRefusedPanel:
    'The text changed after the correction, so it cannot be undone safely.',
  checking: 'Checking with your AI provider…',
  chooseStyles: 'Choose one or more styles, then Generate rewrites.',
  generatingRewrites: 'Generating rewrites…',
  translatingInto: (target) => `Translating into ${target}…`,
  chooseLanguages:
    'Choose the languages, then Translate. Selected text is sent to your AI provider only when you click Translate.',
  tryAgain: 'Try again',
  handleLabel: 'Open Correctly (drag to move)',
  handleTitle: 'Correctly — click to open, drag up or down to move',
  selectionButton: 'Translate with Correctly',
  bubbleTitle: 'Translation',
  bubbleTranslate: 'Translate',
  bubbleTranslating: 'Translating…',
  bubbleSame: 'This text is already in the chosen language.',
  bubbleEmpty: 'No usable translation was returned.',
  bubbleOpen: 'Open in Correctly',
  realtime: {
    cardLabel: 'Correctly suggestion',
    spelling: 'Spelling',
    grammar: 'Grammar',
    replaceWith: (suggestion) => `Replace with “${suggestion}”`,
    copyWith: (suggestion) => `Copy “${suggestion}”`,
    copied: 'Copied. Paste it over the word.',
    copyFailed: 'Could not copy. Select the word and type the suggestion.',
    outdated: 'The text changed. Checking again…',
    copyOnlyHint: 'This editor cannot be changed safely: copy the suggestion.',
    ignore: 'Ignore',
    addToDictionary: 'Add to dictionary',
    badgePaused: 'Correctly: checking paused (usage limit)',
    badgeOffline: 'Correctly: offline, checking paused',
    badgeNeedsEngine:
      'Correctly: real-time correction needs Chrome’s built-in AI or API mode (Settings)',
    badgeDownloading: 'Correctly: the on-device model is downloading…',
    badgeError: 'Correctly: checking paused',
  },
};

// French nouns are all feminine here: "aucune correction / reformulation /
// traduction utile".
const FR_NOUN: Record<Kind, string> = {
  correction: 'correction',
  rewrite: 'reformulation',
  reformulation: 'reformulation',
  translation: 'traduction',
};

const FR: ContentMessages = {
  notices: {
    select: 'Sélectionnez le texte à corriger, puis rouvrez Correctly.',
    notEditable:
      'Sélectionnez du texte dans une zone de texte ou un éditeur. Correctly n’envoie pas le reste de la page.',
    rewriteOff:
      'La reformulation est désactivée dans les paramètres de Correctly.',
    unreachable:
      'Correctly ne peut pas atteindre cet éditeur (intégré depuis un autre site). Copiez le texte dans une zone de texte ordinaire.',
    sensitive:
      'Correctly ne lit jamais les champs mot de passe, e-mail, téléphone, URL, nombre ou recherche.',
    tooLong: `Sélectionnez au plus ${MAX_CORRECTION_CODE_POINTS.toLocaleString('fr-FR')} caractères.`,
    copyOnly:
      'Appliquer ne fonctionne que dans les zones de texte simples. Copiez plutôt la suggestion.',
    readOnly: 'Ce champ n’est pas modifiable. Copiez plutôt la suggestion.',
    stale:
      'Le texte ou la sélection a changé depuis la demande. Copiez la suggestion ou relancez.',
    suspicious:
      'Un nombre, un lien ou une adresse e-mail diffère de votre texte. Vérifiez-le et copiez-le s’il est juste ; Appliquer est désactivé.',
    noTarget:
      'Aucune sélection de zone de texte à remplacer : Appliquer est désactivé. Copiez plutôt le résultat.',
    pageText:
      'Texte sélectionné sur la page : les résultats peuvent être copiés, jamais appliqués à la page.',
    readOnlyPage:
      'Ce texte a été sélectionné sur la page, que Correctly ne modifie jamais. Copiez plutôt le résultat.',
    multiRange: 'Sélectionnez un seul passage continu, puis rouvrez Correctly.',
  },
  tabs: {
    correction: {
      label: 'Correction',
      action: 'Générer la correction',
      loading: 'Vérification auprès de votre fournisseur d’IA…',
    },
    reformulation: {
      label: 'Reformulation',
      action: 'Générer la reformulation',
      loading: 'Génération des reformulations…',
    },
    translation: {
      label: 'Traduction',
      action: 'Générer la traduction',
      loading: 'Traduction…',
    },
    summary: {
      label: 'Résumé',
      action: 'Générer le résumé',
      loading: 'Résumé en cours…',
    },
  },
  openSettings: 'Ouvrir les paramètres de Correctly',
  minimize: 'Réduire Correctly (garde votre texte et les résultats)',
  close: 'Fermer Correctly',
  tablist: 'Actions de Correctly',
  textLabel: 'Texte',
  placeholder: 'Tapez ou collez du texte ici.',
  manageLimits: 'Gérer les limites',
  correctionHint:
    'Corrige l’orthographe et la grammaire. Le texte n’est envoyé à votre fournisseur d’IA que quand vous cliquez sur Générer la correction.',
  styles: 'Styles',
  oneRequestStyles:
    'Tous les styles choisis sont générés en UNE seule requête IA, qui peut compter dans votre quota.',
  from: 'De',
  to: 'Vers',
  autoDetect: 'Détection automatique',
  variant: 'Variante',
  alsoRewrite: 'Reformuler aussi dans un style',
  summaryLanguage: 'Langue du résumé',
  length: 'Longueur',
  format: 'Format',
  summaryHint:
    'Le résumé est écrit directement dans la langue choisie, en UNE seule requête IA. Seul le texte ci-dessus est envoyé, quand vous cliquez sur Générer le résumé.',
  apply: 'Appliquer',
  copy: 'Copier',
  cancel: 'Annuler',
  results: 'Résultats',
  tooLongForTab: (summaryMax) =>
    `Sélectionnez au plus ${MAX_CORRECTION_CODE_POINTS.toLocaleString('fr-FR')} caractères. Le résumé accepte jusqu’à ${summaryMax}.`,
  summaryTooLong: (max) =>
    `Le résumé accepte au plus ${max} caractères ; rien n’est coupé automatiquement.`,
  selectAtMost: (max) => `Sélectionnez au plus ${max} caractères.`,
  summaryLabel: (target) => `Résumé → ${target}`,
  translationLabel: (target) => `Traduction → ${target}`,
  styledLabel: (style, target) => `${style} → ${target}`,
  sameLanguage: (target, use) =>
    `Le texte semble déjà être en ${target.toLowerCase()}. Rien à traduire : utilisez ${capital(FR_NOUN[use])} pour changer son style.`,
  sameSourceTarget: (use) =>
    `La langue source et la langue cible sont identiques : utilisez plutôt ${capital(FR_NOUN[use])}.`,
  notChanged: (message) => `${message} Votre texte n’a pas été modifié.`,
  noCorrections: 'Aucune correction nécessaire.',
  suggestedCorrection: 'Correction suggérée',
  corrected: 'Corrigé',
  unsummarizable:
    'Ce texte ne peut pas être résumé fidèlement (trop court, peu clair ou incomplet). Rien n’a été inventé.',
  suggestedSummary: 'Résumé suggéré.',
  noneReturned: (kind, list) =>
    ` Aucune ${FR_NOUN[kind]} n’a été renvoyée pour : ${list}.`,
  noMeaningful: (kind) => `Aucune ${FR_NOUN[kind]} utile n’a été générée.`,
  noMeaningfulForStyle: (kind) =>
    `Aucune ${FR_NOUN[kind]} utile n’a été générée pour ce style.`,
  chooseOne: (kind) =>
    `Choisissez une ${FR_NOUN[kind]}, puis Appliquer ou Copier.`,
  suggestedOne: (kind) => `${capital(FR_NOUN[kind])} suggérée.`,
  copied: 'Copié.',
  copyFailed:
    'La copie a échoué. Sélectionnez le résultat et copiez-le à la main.',
  copyFailedPanel:
    'La copie a échoué. Sélectionnez le texte corrigé et copiez-le à la main.',
  cancelled:
    'Annulé. Une requête déjà envoyée peut quand même compter dans votre usage.',
  textReplaced: 'Texte remplacé.',
  undo: 'Annuler',
  undoRefused:
    'Le texte a changé après Appliquer : l’annulation n’est plus sûre.',
  panelLabel: 'Correction Correctly',
  original: 'Original',
  rewrites: 'Reformulations',
  generateRewrites: 'Générer les reformulations',
  translate: 'Traduire',
  closeButton: 'Fermer',
  title: (kind) => `Correctly — ${capital(FR_NOUN[kind])}`,
  titleTranslate: 'Correctly — Traduire',
  titleTranslateRewrite: 'Correctly — Traduire et reformuler',
  undoKind: (kind) => `Annuler la ${FR_NOUN[kind]}`,
  applied: (kind) => `${capital(FR_NOUN[kind])} appliquée.`,
  undone: (kind) => `${capital(FR_NOUN[kind])} annulée.`,
  undoRefusedPanel:
    'Le texte a changé après la correction : l’annulation n’est plus sûre.',
  checking: 'Vérification auprès de votre fournisseur d’IA…',
  chooseStyles:
    'Choisissez un ou plusieurs styles, puis Générer les reformulations.',
  generatingRewrites: 'Génération des reformulations…',
  translatingInto: (target) => `Traduction en ${target.toLowerCase()}…`,
  chooseLanguages:
    'Choisissez les langues, puis Traduire. Le texte sélectionné n’est envoyé à votre fournisseur d’IA que quand vous cliquez sur Traduire.',
  tryAgain: 'Réessayer',
  handleLabel: 'Ouvrir Correctly (glisser pour déplacer)',
  handleTitle:
    'Correctly — cliquer pour ouvrir, glisser vers le haut ou le bas pour déplacer',
  selectionButton: 'Traduire avec Correctly',
  bubbleTitle: 'Traduction',
  bubbleTranslate: 'Traduire',
  bubbleTranslating: 'Traduction…',
  bubbleSame: 'Ce texte est déjà dans la langue choisie.',
  bubbleEmpty: 'Aucune traduction utilisable n’a été renvoyée.',
  bubbleOpen: 'Ouvrir dans Correctly',
  realtime: {
    cardLabel: 'Suggestion de Correctly',
    spelling: 'Orthographe',
    grammar: 'Grammaire',
    replaceWith: (suggestion) => `Remplacer par « ${suggestion} »`,
    copyWith: (suggestion) => `Copier « ${suggestion} »`,
    copied: 'Copié. Collez-le à la place du mot.',
    copyFailed:
      'Copie impossible. Sélectionnez le mot et saisissez la suggestion.',
    outdated: 'Le texte a changé. Nouvelle vérification…',
    copyOnlyHint:
      'Cet éditeur ne peut pas être modifié sans risque : copiez la suggestion.',
    ignore: 'Ignorer',
    addToDictionary: 'Ajouter au dictionnaire',
    badgePaused: 'Correctly : vérification en pause (limite d’usage)',
    badgeOffline: 'Correctly : hors ligne, vérification en pause',
    badgeNeedsEngine:
      'Correctly : la correction en direct demande l’IA intégrée de Chrome ou le mode API (Paramètres)',
    badgeDownloading: 'Correctly : le modèle local se télécharge…',
    badgeError: 'Correctly : vérification en pause',
  },
};

export const CONTENT: Record<Locale, ContentMessages> = { en: EN, fr: FR };
