/**
 * User settings: pure defaults, validation and target-language resolution.
 *
 * The storage read/write itself lives in `core/settings-store.ts` so this file
 * stays unit-testable without a browser.
 */

import {
  DEFAULT_MAX_CHARACTERS,
  MAX_MAX_CHARACTERS,
  MIN_MAX_CHARACTERS,
  baseLanguage,
  isSameLanguage,
} from './text';

/** Sentinel meaning "pick the target from the browser's UI language". */
export const AUTO_TARGET = 'auto';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  /** Language tag, or {@link AUTO_TARGET}. */
  targetLanguage: string;
  /** Show the reading toggle switched on for a new popup. */
  readingByDefault: boolean;
  /** Prefer the latin romanization over the native reading. */
  preferRomanization: boolean;
  /**
   * IPA for en/de/fr is off by default: the bundled phonemizer embeds an
   * eSpeak NG build, see THIRD_PARTY_NOTICES.md.
   */
  enableExperimentalIpa: boolean;
  /** Show the little "translate" pill next to a selection. */
  showSelectionButton: boolean;
  theme: ThemePreference;
  /** Selection length limit sent to the Translator API. */
  maxCharacters: number;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLanguage: AUTO_TARGET,
  readingByDefault: true,
  preferRomanization: true,
  enableExperimentalIpa: false,
  showSelectionButton: true,
  theme: 'system',
  maxCharacters: DEFAULT_MAX_CHARACTERS,
};

export const SETTINGS_STORAGE_KEY = 'settings';
export const SETTINGS_VERSION = 1;

/**
 * Convenience subset of the languages Chrome's Translator API exposes, used to
 * populate the settings dropdown. The popup always shows the *runtime*
 * availability, so this list never claims more than the browser supports.
 */
export const KNOWN_TARGET_LANGUAGES: readonly { tag: string; label: string }[] = [
  { tag: 'en', label: 'English' },
  { tag: 'vi', label: 'Tiếng Việt' },
  { tag: 'ja', label: '日本語' },
  { tag: 'ko', label: '한국어' },
  { tag: 'zh', label: '中文' },
  { tag: 'es', label: 'Español' },
  { tag: 'fr', label: 'Français' },
  { tag: 'de', label: 'Deutsch' },
  { tag: 'it', label: 'Italiano' },
  { tag: 'pt', label: 'Português' },
  { tag: 'ru', label: 'Русский' },
  { tag: 'hi', label: 'हिन्दी' },
  { tag: 'th', label: 'ไทย' },
  { tag: 'id', label: 'Bahasa Indonesia' },
  { tag: 'ar', label: 'العربية' },
];

const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const THEME_VALUES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readClampedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

function readLanguage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed === AUTO_TARGET) return AUTO_TARGET;
  return LANGUAGE_TAG.test(trimmed) ? trimmed : fallback;
}

/** Turn anything (whatever is in storage) into valid {@link Settings}. */
export function normalizeSettings(input: unknown): Settings {
  if (!isRecord(input)) return { ...DEFAULT_SETTINGS };

  const theme = THEME_VALUES.find((candidate) => candidate === input.theme) ?? DEFAULT_SETTINGS.theme;

  return {
    targetLanguage: readLanguage(input.targetLanguage, DEFAULT_SETTINGS.targetLanguage),
    readingByDefault: readBoolean(input.readingByDefault, DEFAULT_SETTINGS.readingByDefault),
    preferRomanization: readBoolean(input.preferRomanization, DEFAULT_SETTINGS.preferRomanization),
    enableExperimentalIpa: readBoolean(input.enableExperimentalIpa, DEFAULT_SETTINGS.enableExperimentalIpa),
    showSelectionButton: readBoolean(input.showSelectionButton, DEFAULT_SETTINGS.showSelectionButton),
    theme,
    maxCharacters: readClampedInteger(
      input.maxCharacters,
      DEFAULT_SETTINGS.maxCharacters,
      MIN_MAX_CHARACTERS,
      MAX_MAX_CHARACTERS,
    ),
  };
}

/**
 * Decide which language to translate into.
 *
 * - an explicit target wins, unless it equals the (known) source language,
 * - of `'auto'`, the browser UI language is used,
 * - and English is the last resort so a `ja -> ja` request never happens.
 */
export function resolveTargetLanguage(
  settings: Settings,
  sourceLanguage: string | null,
  uiLanguage: string,
): string {
  const requested = settings.targetLanguage === AUTO_TARGET ? '' : baseLanguage(settings.targetLanguage);
  if (requested !== '' && !(sourceLanguage !== null && isSameLanguage(requested, sourceLanguage))) {
    return requested;
  }

  const preferred = baseLanguage(uiLanguage) || 'en';
  if (sourceLanguage !== null && isSameLanguage(preferred, sourceLanguage)) return 'en';
  return preferred;
}

/** `'auto'` -> `'Auto (browser language)'`, tags -> their human label when known. */
export function describeTargetLanguage(tag: string): string {
  if (tag === AUTO_TARGET) return 'Auto (browser language)';
  return KNOWN_TARGET_LANGUAGES.find((entry) => entry.tag === tag)?.label ?? tag;
}
