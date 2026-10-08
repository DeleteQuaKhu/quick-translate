/** Text helpers shared by the content script and the offscreen document. */

/** Chrome's Translator API rejects overly long input, so keep a sane default. */
export const DEFAULT_MAX_CHARACTERS = 5000;
export const MIN_MAX_CHARACTERS = 50;
export const MAX_MAX_CHARACTERS = 20_000;

/** Letters/marks/ideographs, ie. something a translator can actually use. */
const MEANINGFUL_CHARACTER = /[\p{L}\p{M}\p{N}]/u;
/** CJK ideographs, kana, hangul: scripts that need a reading helper. */
const READING_RELEVANT_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Collapse the whitespace that selections spanning multiple blocks always
 * bring along, without touching the inner spacing of single-line text.
 */
export function normalizeSelection(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim();
}

/** True when the text contains at least one letter, digit or mark. */
export function isProbablyTranslatable(text: string): boolean {
  return MEANINGFUL_CHARACTER.test(text);
}

/** True when the text contains a script that has a reading provider. */
export function hasReadingRelevantScript(text: string): boolean {
  return READING_RELEVANT_SCRIPT.test(text);
}

export interface ClampResult {
  text: string;
  truncated: boolean;
}

/** Cut `text` down to `maxCharacters`, reporting whether it was cut. */
export function clampText(text: string, maxCharacters: number): ClampResult {
  const limit = Math.max(1, Math.floor(maxCharacters));
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}

/** `'  Hello   world '` -> `'Hello world'`, `''` when blank. */
export function prepareSelection(raw: string, maxCharacters: number): ClampResult {
  return clampText(normalizeSelection(raw), maxCharacters);
}

/** Normalize a language tag for comparison: `'zh-Hans'` -> `'zh'`. */
export function baseLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/** True when two tags share the same base language. */
export function isSameLanguage(a: string, b: string): boolean {
  const baseA = baseLanguage(a);
  return baseA !== '' && baseA === baseLanguage(b);
}
