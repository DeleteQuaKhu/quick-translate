/**
 * Shared, runtime-free types for the whole extension.
 *
 * Everything here is plain data so that it can safely cross the
 * content script <-> service worker <-> offscreen document boundaries
 * (structured clone only, no class instances).
 */

/** BCP-47-ish language tag, eg. `en`, `en-US`, `zh-Hans`, `pt-BR`. */
export type LanguageTag = string;

/**
 * Which helper produced a reading. Each id maps to exactly one provider
 * module under `core/reading/`.
 */
export type ReadingProviderId = 'zh-pinyin' | 'ja-furigana' | 'ko-romaja' | 'ipa';

/** One unit of a reading: a word or a character plus its reading. */
export interface ReadingToken {
  /** Surface text exactly as it appears in the source. */
  text: string;
  /** Native reading when the script has one (pinyin with tone marks, kana, ...). */
  reading?: string;
  /** Latin-script rendering (toneless pinyin, romaji, romaja, IPA phones). */
  roman?: string;
}

/** Result of running a reading provider over a piece of text. */
export interface Reading {
  provider: ReadingProviderId;
  /** Language tag the provider actually ran with. */
  language: LanguageTag;
  tokens: ReadingToken[];
  /** Whole-text native reading, `''` when the provider has none. */
  reading: string;
  /** Whole-text romanization, `''` when the provider has none. */
  romanization: string;
}

/**
 * Availability reported by `Translator.availability()` and
 * `LanguageDetector.availability()`.
 */
export type ModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** Per-stage wall clock timings, in milliseconds. */
export interface TranslationTiming {
  detectMs: number;
  translateMs: number;
  readingMs: number;
}

export type TranslationErrorCode =
  | 'empty-text'
  | 'text-too-long'
  | 'unsupported-api'
  | 'unsupported-language'
  | 'model-unavailable'
  | 'download-failed'
  | 'offscreen-unavailable'
  | 'timeout'
  | 'internal';

/** Serializable error, safe to send through `chrome.runtime.sendMessage`. */
export interface TranslationError {
  code: TranslationErrorCode;
  message: string;
}

/** The reading a provider produced, or the reason there is none. */
export interface ReadingOutcome {
  reading: Reading | null;
  /** `null` when a reading was produced, otherwise why it was skipped. */
  skipped: ReadingSkipReason | null;
}

export type ReadingSkipReason =
  | 'disabled'
  | 'no-provider'
  | 'provider-unavailable'
  | 'provider-failed';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isReadingSkipReason(value: unknown): value is ReadingSkipReason {
  return (
    value === 'disabled' ||
    value === 'no-provider' ||
    value === 'provider-unavailable' ||
    value === 'provider-failed'
  );
}

export function isModelAvailability(value: unknown): value is ModelAvailability {
  return (
    value === 'unavailable' ||
    value === 'downloadable' ||
    value === 'downloading' ||
    value === 'available'
  );
}
