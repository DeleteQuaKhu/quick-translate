/**
 * Which reading helper to use for a language, and whether it is enabled.
 *
 * Pure lookup tables: the providers themselves live next to this file and are
 * wired up by the offscreen document.
 */

import { baseLanguage } from '../text';
import type { ReadingProviderId } from '../types';

export const READING_PROVIDER_LABELS: Record<ReadingProviderId, string> = {
  'zh-pinyin': 'Pinyin',
  'ja-furigana': 'Furigana + romaji',
  'ko-romaja': 'Romaja',
  ipa: 'IPA',
};

/** Languages the built-in Translator reports, mapped to a provider. */
const PROVIDER_BY_LANGUAGE: Record<string, ReadingProviderId> = {
  zh: 'zh-pinyin',
  cmn: 'zh-pinyin',
  yue: 'zh-pinyin',
  ja: 'ja-furigana',
  ko: 'ko-romaja',
  en: 'ipa',
  de: 'ipa',
  fr: 'ipa',
};

/** The provider responsible for `language`, `null` when there is none. */
export function chooseReadingProvider(language: string): ReadingProviderId | null {
  return PROVIDER_BY_LANGUAGE[baseLanguage(language)] ?? null;
}

/** Every language that can produce a reading, for docs and tests. */
export function readingProviderLanguages(): string[] {
  return Object.keys(PROVIDER_BY_LANGUAGE);
}

/**
 * IPA needs an explicit opt-in: the phonemizer package embeds an eSpeak NG
 * build whose licence is not Apache-2.0 (see THIRD_PARTY_NOTICES.md).
 */
export function isProviderEnabled(
  provider: ReadingProviderId,
  enableExperimentalIpa: boolean,
): boolean {
  return provider !== 'ipa' || enableExperimentalIpa;
}

export function describeProvider(provider: ReadingProviderId): string {
  return READING_PROVIDER_LABELS[provider];
}
