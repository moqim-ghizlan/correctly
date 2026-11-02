// 5.13 interface languages (owner request): English and French, chosen in the
// settings ("auto" follows the browser). This module holds the locale logic
// and the wording shared by the in-page UI and the settings page; each UI
// keeps its own catalog (content/messages.ts, options/messages.ts). AI
// prompts are not translated: they are instructions to the model.
import { errorMessage, type ErrorCode } from './errors';
import { PROVIDERS, type RouteSlot } from './models';
import {
  PERIOD_LABELS,
  TASK_LABELS,
  describeNote,
  formatCount,
  formatReset,
  type Period,
  type QuotaNote,
  type QuotaTask,
} from './quota';
import {
  FORMALITY_LEVELS,
  REWRITE_STYLES,
  type Formality,
  type RewriteStyleId,
} from './rewrite';
import {
  SUMMARY_FORMATS,
  SUMMARY_LENGTHS,
  type SummaryFormat,
  type SummaryLength,
} from './summary';
import {
  ALL_VARIANTS,
  LANGUAGES,
  variantsOf,
  type LanguageId,
  type VariantId,
} from './translate';

export {
  LANGUAGE_SETTINGS,
  LOCALES,
  browserLanguage,
  isLanguageSetting,
  isLocale,
  resolveLocale,
  type LanguageSetting,
  type Locale,
} from './locale';
import type { Locale } from './locale';

/** Wording used by both the in-page UI and the settings page. */
export interface CommonMessages {
  locale: Locale;
  error: (code: ErrorCode) => string;
  slot: Record<RouteSlot, string>;
  task: Record<QuotaTask, string>;
  period: Record<Period, string>;
  style: Record<RewriteStyleId, { label: string; description: string }>;
  /** Custom formality slider: level names and the two ends. */
  formality: Record<Formality, string>;
  formalityScale: { name: string; less: string; more: string };
  language: Record<LanguageId, string>;
  variant: Record<VariantId, string>;
  /** 5.16 target menus: favorites first, then every language. */
  languageGroups: { favorites: string; all: string };
  summaryLength: Record<SummaryLength, string>;
  summaryFormat: Record<SummaryFormat, string>;
  number: (value: number) => string;
  dateTime: (date: Date) => string;
  reset: (resetAt: number, timezone: string) => string;
  /** One plain-text sentence about a usage warning or refusal. */
  note: (note: QuotaNote, credentialLabel?: string) => string;
}

const fromCatalog = <K extends string | number>(
  items: readonly { id: K; label: string }[],
): Record<K, string> =>
  Object.fromEntries(items.map((item) => [item.id, item.label])) as Record<
    K,
    string
  >;

// ------------------------------------------------------------- English

const EN: CommonMessages = {
  locale: 'en',
  error: errorMessage,
  slot: {
    default: 'Default',
    correction: 'Correction',
    rewrite: 'Rewrite',
    translation: 'Translation',
    translateRewrite: 'Translate & rewrite',
    summary: 'Summary',
    realtime: 'Real-time',
    ocr: 'Text from image',
  },
  task: { ...TASK_LABELS, test: 'Connection tests' },
  period: PERIOD_LABELS,
  style: Object.fromEntries(
    REWRITE_STYLES.map((s) => [
      s.id,
      { label: s.label, description: s.description },
    ]),
  ) as CommonMessages['style'],
  formality: fromCatalog(FORMALITY_LEVELS),
  formalityScale: {
    name: 'Formality level',
    less: 'Less formal',
    more: 'More formal',
  },
  language: fromCatalog(LANGUAGES),
  variant: fromCatalog(ALL_VARIANTS),
  languageGroups: { favorites: 'Your languages', all: 'All languages' },
  summaryLength: fromCatalog(SUMMARY_LENGTHS),
  summaryFormat: fromCatalog(SUMMARY_FORMATS),
  number: formatCount,
  dateTime: (date) =>
    Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB'),
  reset: formatReset,
  note: describeNote,
};

// -------------------------------------------------------------- French

const FR_SETTINGS = 'Paramètres de Correctly → Fournisseurs IA';
const FR_LIMITS = 'Paramètres de Correctly → Limites d’usage';

const FR_ERRORS: Record<ErrorCode, string> = {
  NOT_CONFIGURED: `Aucun fournisseur d’IA n’est configuré pour cette action. Ajoutez une clé API et choisissez un modèle dans ${FR_SETTINGS}.`,
  ROUTE_BROKEN: `La clé API choisie pour cette action a été supprimée ou est incomplète. Choisissez-en une autre dans ${FR_SETTINGS}. Aucune autre clé n’a été utilisée.`,
  PROFILE_DISABLED: `La clé API choisie pour cette action est désactivée. Activez-la ou choisissez-en une autre dans ${FR_SETTINGS}. Aucune autre clé n’a été utilisée.`,
  ROUTE_CHANGED:
    'La clé API de cette requête a été modifiée ou supprimée pendant son exécution : la requête a été arrêtée. Elle peut quand même être facturée.',
  INVALID_KEY: `Le fournisseur a refusé cette clé API. Remplacez-la ou vérifiez-la dans ${FR_SETTINGS}.`,
  PERMISSION_DENIED:
    'Le fournisseur a refusé cette requête pour votre clé ou projet (API désactivée, restrictions de clé, région ou facturation). Vérifiez le tableau de bord du fournisseur.',
  MODEL_UNAVAILABLE: `Ce modèle n’est pas disponible pour cette clé. Choisissez un autre modèle dans ${FR_SETTINGS}. Aucun autre modèle n’a été utilisé.`,
  MODEL_INCOMPATIBLE: `Ce modèle n’accepte pas les options dont Correctly a besoin (sortie JSON structurée). Choisissez un autre modèle dans ${FR_SETTINGS}.`,
  RATE_LIMITED:
    'Le fournisseur limite le débit, ou votre quota ou plafond de facturation chez lui est atteint (ce n’est pas une limite de Correctly). Aucun changement automatique n’a été fait ; réessayez plus tard.',
  QUOTA_EXCEEDED: `Une limite d’usage de Correctly est atteinte : aucune requête n’a été envoyée. Voir ${FR_LIMITS}.`,
  AI_PAUSED: `Les requêtes IA sont en pause dans ${FR_LIMITS}. Aucune requête n’a été envoyée. Les raccourcis texte fonctionnent toujours.`,
  QUOTA_UNAVAILABLE: `Correctly ne peut pas vérifier vos limites d’usage pour le moment. Aucune requête IA n’a été envoyée. Ouvrez ${FR_LIMITS}.`,
  CLOCK_CHANGED: `L’horloge de votre ordinateur a reculé : les requêtes IA sont en pause jusqu’à ce que vous confirmiez l’heure dans ${FR_LIMITS}. Aucune requête n’a été envoyée.`,
  CONSENT_REQUIRED:
    'Autorisez d’abord l’envoi du texte sélectionné à votre fournisseur d’IA dans les paramètres de Correctly (section Démarrage).',
  NETWORK_ERROR:
    'Hors ligne ou erreur réseau : vérifiez votre connexion internet.',
  TIMEOUT:
    'Le fournisseur n’a pas répondu à temps. La requête peut quand même être facturée ; ne réessayez que si vous voulez faire une nouvelle requête.',
  RESPONSE_LOST:
    'La connexion a été perdue après l’envoi. Le fournisseur a pu recevoir la requête et la facturer ; ne réessayez que si vous voulez faire une nouvelle requête.',
  PROVIDER_ERROR:
    'Le fournisseur a renvoyé une erreur. Réessayez plus tard ; si cela persiste, vérifiez son tableau de bord.',
  INVALID_RESPONSE:
    'Le fournisseur a répondu, mais la réponse est inutilisable (incomplète ou mal formée). Rien n’a été confirmé ni modifié.',
  RESPONSE_REFUSED:
    'Le fournisseur a refusé de traiter ce texte. Rien n’a été modifié.',
  STORAGE_ERROR:
    'Le stockage du navigateur n’a pas pu être lu ou écrit. Rechargez cette page et réessayez.',
  CAPTURE_FAILED:
    'La capture d’écran a échoué (l’onglet doit être visible et au premier plan). Rien n’a été envoyé. Réessayez.',
  CAPTURE_FORBIDDEN:
    'Chrome n’autorise pas la capture de cette page. Rien n’a été envoyé. Ouvrez la fenêtre Correctly avec l’icône de la barre d’outils ou Ctrl+M sur cette page, puis réessayez.',
  AREA_TOO_SMALL: 'La zone choisie est trop petite. Rien n’a été envoyé.',
  NO_TEXT_FOUND: 'Aucun texte trouvé dans cette zone.',
  MODEL_NO_VISION: `Ce modèle ne sait pas lire les images. Choisissez-en un autre pour « Texte d’une image » dans ${FR_SETTINGS}. Rien n’a été envoyé.`,
  IMAGE_CONSENT_REQUIRED:
    'Autorisez d’abord l’envoi d’une image de la zone choisie à votre fournisseur d’IA dans les paramètres de Correctly. Rien n’a été envoyé.',
  UNKNOWN_ERROR:
    'Une erreur inattendue s’est produite. Rechargez cette page et réessayez.',
};

const FR_SLOT: Record<RouteSlot, string> = {
  default: 'Par défaut',
  correction: 'Correction',
  rewrite: 'Reformulation',
  translation: 'Traduction',
  translateRewrite: 'Traduire et reformuler',
  summary: 'Résumé',
  realtime: 'Temps réel',
  ocr: 'Texte d’une image',
};

const FR_PERIOD_NOUN: Record<Period, string> = {
  daily: 'journalière',
  weekly: 'hebdomadaire',
  monthly: 'mensuelle',
};

const frNumber = (value: number): string => value.toLocaleString('fr-FR');

function frReset(resetAt: number, timezone: string): string {
  const text = new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(resetAt));
  return `${text} (${timezone})`;
}

function frLimitName(
  note: QuotaNote,
  credentialLabel = 'cette clé API',
): string {
  const period = FR_PERIOD_NOUN[note.period];
  switch (note.scope) {
    case 'global':
      return `limite ${period} du total des requêtes IA`;
    case 'task':
      return `limite ${period} des requêtes « ${FR.task[note.task ?? 'test']} »`;
    case 'provider':
      return `limite ${period} des requêtes ${note.provider ? PROVIDERS[note.provider].label : 'du fournisseur'}`;
    case 'credential':
      return `limite ${period} des requêtes pour ${credentialLabel}`;
  }
}

function frNote(note: QuotaNote, credentialLabel?: string): string {
  const name = frLimitName(note, credentialLabel);
  const capital = name.charAt(0).toUpperCase() + name.slice(1);
  const counts = `(${frNumber(note.used)} / ${frNumber(note.max)})`;
  const reset = `Remise à zéro : ${frReset(note.resetAt, note.timezone)}.`;
  if (note.blocked)
    return `${capital} atteinte ${counts}. Aucune requête n’a été envoyée. ${reset}`;
  if (note.level === 100)
    return `${capital} atteinte ${counts}. Les requêtes suivantes qu’elle couvre sont bloquées jusqu’à la remise à zéro. ${reset}`;
  const left = Math.max(0, note.max - note.used);
  return `Correctly : ${note.level} % de votre ${name} utilisés ${counts}. ${note.level === 95 ? 'Plus que ' : 'Il reste '}${frNumber(left)}. ${reset}`;
}

const FR: CommonMessages = {
  locale: 'fr',
  error: (code) => FR_ERRORS[code],
  slot: FR_SLOT,
  task: {
    correction: FR_SLOT.correction,
    rewrite: FR_SLOT.rewrite,
    translation: FR_SLOT.translation,
    translateRewrite: FR_SLOT.translateRewrite,
    summary: FR_SLOT.summary,
    realtime: FR_SLOT.realtime,
    ocr: FR_SLOT.ocr,
    test: 'Tests de connexion',
  },
  period: { daily: 'Par jour', weekly: 'Par semaine', monthly: 'Par mois' },
  style: {
    professional: {
      label: 'Professionnel',
      description: 'adapté au travail, clair et concis',
    },
    formal: { label: 'Formel', description: 'registre soutenu et poli' },
    friendly: {
      label: 'Amical',
      description: 'chaleureux, naturel et accessible, sans emojis',
    },
    casual: { label: 'Décontracté', description: 'conversationnel et détendu' },
    polite: {
      label: 'Poli',
      description: 'respectueux et attentionné, sans excuses excessives',
    },
    concise: {
      label: 'Concis',
      description:
        'plus court, en gardant dates, nombres, négations et conditions',
    },
    funny: {
      label: 'Drôle',
      description: 'humour léger et bienveillant, sérieux si le sujet l’est',
    },
    custom: {
      label: 'Formalité personnalisée',
      description: 'choisissez le niveau, de la retouche légère au très formel',
    },
  },
  formality: {
    1: 'Retouche légère',
    2: 'Détendu',
    3: 'Neutre',
    4: 'Soigné',
    5: 'Très formel',
  },
  formalityScale: {
    name: 'Niveau de formalité',
    less: 'Moins formel',
    more: 'Plus formel',
  },
  language: {
    fr: 'Français',
    en: 'Anglais',
    ar: 'Arabe',
    tr: 'Turc',
    de: 'Allemand',
    es: 'Espagnol',
    pt: 'Portugais',
    it: 'Italien',
    nl: 'Néerlandais',
    pl: 'Polonais',
    ro: 'Roumain',
    el: 'Grec',
    sv: 'Suédois',
    da: 'Danois',
    no: 'Norvégien',
    fi: 'Finnois',
    cs: 'Tchèque',
    hu: 'Hongrois',
    uk: 'Ukrainien',
    ru: 'Russe',
    bg: 'Bulgare',
    sr: 'Serbe',
    hr: 'Croate',
    he: 'Hébreu',
    fa: 'Persan',
    ku: 'Kurde',
    sw: 'Swahili',
    am: 'Amharique',
    hi: 'Hindi',
    ur: 'Ourdou',
    bn: 'Bengali',
    id: 'Indonésien',
    ms: 'Malais',
    vi: 'Vietnamien',
    th: 'Thaï',
    fil: 'Filipino',
    zh: 'Chinois',
    ja: 'Japonais',
    ko: 'Coréen',
  },
  variant: {
    msa: 'Arabe standard moderne',
    syrian: 'Syrien (dialecte parlé)',
    egyptian: 'Égyptien (dialecte parlé)',
    moroccan: 'Marocain (darija)',
    lebanese: 'Libanais (dialecte parlé)',
    gulf: 'Golfe (khaleeji)',
    pt_br: 'Brésil',
    pt_pt: 'Portugal',
    zh_hans: 'Simplifié',
    zh_hant: 'Traditionnel',
    kmr: 'Kurmandji (alphabet latin)',
    ckb: 'Sorani (alphabet arabe)',
  },
  languageGroups: { favorites: 'Vos langues', all: 'Toutes les langues' },
  summaryLength: { short: 'Court', medium: 'Moyen', detailed: 'Détaillé' },
  summaryFormat: { paragraph: 'Paragraphe', key_points: 'Points clés' },
  number: frNumber,
  dateTime: (date) =>
    Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR'),
  reset: frReset,
  note: frNote,
};

export const COMMON: Record<Locale, CommonMessages> = { en: EN, fr: FR };

/** "English — English", "Arabe — العربية": a language in its own script too. */
export function languageName(common: CommonMessages, id: LanguageId): string {
  const native = LANGUAGES.find((l) => l.id === id)?.native ?? id;
  const name = common.language[id];
  return name === native ? name : `${name} — ${native}`;
}

/** "Arabic (Syrian colloquial)" / "Portugais (Brésil)". */
export function targetName(
  common: CommonMessages,
  target: LanguageId,
  variant: VariantId | null,
): string {
  const name = common.language[target];
  return variantsOf(target).some((item) => item.id === variant) && variant
    ? `${name} (${common.variant[variant]})`
    : name;
}

export interface MenuItem {
  id: string;
  label: string;
}
export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

/**
 * 5.16 language menus: "Your languages" (favorites, in the user's order)
 * then every language, sorted in the interface language ("Japonais — 日本語").
 */
export function languageOptions(
  common: CommonMessages,
  favorites: readonly LanguageId[],
): MenuGroup[] {
  const item = (id: LanguageId) => ({ id, label: languageName(common, id) });
  const collator = new Intl.Collator(common.locale);
  const all = LANGUAGES.map((language) => item(language.id)).sort((a, b) =>
    collator.compare(a.label, b.label),
  );
  return [
    ...(favorites.length
      ? [{ label: common.languageGroups.favorites, items: favorites.map(item) }]
      : []),
    { label: common.languageGroups.all, items: all },
  ];
}

/** Variants of this target, in catalog order (empty when it has none). */
export const variantOptions = (
  common: CommonMessages,
  target: LanguageId,
): MenuItem[] =>
  variantsOf(target).map((item) => ({
    id: item.id,
    label: common.variant[item.id],
  }));
