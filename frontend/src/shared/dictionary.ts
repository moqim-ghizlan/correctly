// V6.1.4 personal dictionary: words the real-time correction never underlines.
// Local only (D7); written by the settings page and by the worker when the
// card's "Add to dictionary" is used. Every read goes through normalizeDictionary.
import type { StorageArea } from './storage';

export const DICTIONARY_KEY = 'correctly.v5.dictionary';
export const MAX_DICTIONARY_WORDS = 2000;
export const MAX_WORD_LENGTH = 64;

export interface Dictionary {
  words: string[];
}

/** Trimmed, no line break, 1–64 characters; '' when not acceptable. */
export function cleanWord(value: unknown): string {
  if (typeof value !== 'string') return '';
  const word = value.trim();
  return word && word.length <= MAX_WORD_LENGTH && !/[\r\n\t]/u.test(word)
    ? word
    : '';
}

/** Words are compared in lower case, so "Lyon" and "lyon" are one entry. */
export const wordKey = (word: string): string => word.toLowerCase();

export function normalizeDictionary(value: unknown): Dictionary {
  const list =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { words?: unknown }).words
      : null;
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of Array.isArray(list) ? (list as unknown[]) : []) {
    const word = cleanWord(item);
    if (!word || seen.has(wordKey(word))) continue;
    seen.add(wordKey(word));
    words.push(word);
    if (words.length >= MAX_DICTIONARY_WORDS) break;
  }
  return { words };
}

export async function loadDictionary(area: StorageArea): Promise<Dictionary> {
  try {
    return normalizeDictionary(
      (await area.get([DICTIONARY_KEY]))[DICTIONARY_KEY],
    );
  } catch {
    return { words: [] };
  }
}

export async function saveDictionary(
  area: StorageArea,
  value: Dictionary,
): Promise<Dictionary> {
  const dictionary = normalizeDictionary(value);
  await area.set({ [DICTIONARY_KEY]: dictionary });
  return dictionary;
}

/** Adds one word; false when it is not acceptable or the list is full. */
export async function addWord(
  area: StorageArea,
  word: unknown,
): Promise<boolean> {
  const clean = cleanWord(word);
  if (!clean) return false;
  const current = await loadDictionary(area);
  if (current.words.some((w) => wordKey(w) === wordKey(clean))) return true;
  if (current.words.length >= MAX_DICTIONARY_WORDS) return false;
  await saveDictionary(area, { words: [...current.words, clean] });
  return true;
}
