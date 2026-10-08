/**
 * IPA readings for English, German and French.
 *
 * The phonemizer is injected so that this module (and its tests) never need to
 * load the bundled eSpeak NG build; the offscreen document passes the real
 * implementation. See THIRD_PARTY_NOTICES.md for the licence note.
 */

import { baseLanguage } from '../text';
import type { Reading, ReadingToken } from '../types';
import { buildReading } from './shared';

/** Signature of `phonemize` from the `phonemizer` package. */
export type PhonemizeFn = (text: string, voice?: string) => Promise<string[]>;

/** espeak-ng expects a voice name, not a BCP-47 tag. */
export const IPA_VOICES: Record<string, string> = {
  en: 'en-us',
  de: 'de',
  fr: 'fr-fr',
};

/** The espeak voice for a language tag, `null` when IPA is not supported. */
export function ipaVoiceFor(language: string): string | null {
  return IPA_VOICES[baseLanguage(language)] ?? null;
}

/** Rough phrase split: the phonemizer returns one entry per sentence. */
export function splitPhrases(text: string): string[] {
  return (text.match(/[^.!?。！？…]+[.!?。！？…]*/gu) ?? [])
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase !== '');
}

/**
 * Pair the returned phones with the source phrases when the counts line up,
 * otherwise fall back to a single token carrying the whole transcription.
 */
export function pairPhonesWithPhrases(text: string, phones: readonly string[]): ReadingToken[] {
  const phrases = splitPhrases(text);
  if (phones.length > 0 && phones.length === phrases.length) {
    return phones.map((phone, index) => ({ text: phrases[index] ?? '', roman: phone }));
  }
  return [{ text, roman: phones.join(' ') }];
}

/** `null` when the language has no voice, or the phonemizer returned nothing. */
export async function createIpaReading(
  text: string,
  language: string,
  phonemize: PhonemizeFn,
): Promise<Reading | null> {
  const voice = ipaVoiceFor(language);
  if (voice === null) return null;

  const phones = await phonemize(text, voice);
  if (!Array.isArray(phones) || phones.length === 0) return null;

  return buildReading('ipa', baseLanguage(language), pairPhonesWithPhrases(text, phones));
}
