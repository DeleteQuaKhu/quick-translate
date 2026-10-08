/**
 * The translation pipeline: detect the source language, pick a target, run
 * Chrome's on-device Translator and optionally attach a reading.
 *
 * Every dependency is injected, so this module never touches a browser API
 * directly and can be unit tested with fakes.
 */

import { detectLanguage, type LanguageDetectorApi } from './detector';
import { AUTO_TARGET, resolveTargetLanguage, type Settings } from './settings';
import { baseLanguage, isSameLanguage } from './text';
import {
  MESSAGE_SOURCE,
  createErrorResult,
  toTranslationError,
  type ProgressStage,
  type TranslateResult,
} from './messages';
import {
  isPairSupported,
  watchDownloadProgress,
  type TranslatorApi,
  type TranslatorInstance,
} from './translator';
import type { ModelAvailability, Reading, ReadingOutcome, TranslationTiming } from './types';

/** Scripts whose language is (almost) decided by the characters alone. */
const SCRIPT_CANDIDATES: readonly { script: RegExp; languages: readonly string[] }[] = [
  { script: /\p{Script=Hiragana}|\p{Script=Katakana}/u, languages: ['ja'] },
  { script: /\p{Script=Hangul}/u, languages: ['ko'] },
  { script: /\p{Script=Han}/u, languages: ['zh', 'ja'] },
  { script: /\p{Script=Cyrillic}/u, languages: ['ru'] },
  { script: /\p{Script=Arabic}/u, languages: ['ar'] },
  { script: /\p{Script=Devanagari}/u, languages: ['hi'] },
  { script: /\p{Script=Thai}/u, languages: ['th'] },
];

/** Latin characters are ambiguous, so the common languages are tried in order. */
const LATIN_CANDIDATES: readonly string[] = ['en', 'fr', 'de', 'es', 'pt', 'it', 'vi'];

/** Upper bound on the `availability()` probes a single request may cost. */
export const MAX_SOURCE_CANDIDATES = 4;

/** Languages worth trying when the detector is missing or below confidence. */
export function guessSourceLanguages(text: string): string[] {
  const guesses: string[] = [];
  for (const entry of SCRIPT_CANDIDATES) {
    if (entry.script.test(text)) guesses.push(...entry.languages);
  }
  if (guesses.length === 0) return LATIN_CANDIDATES.slice(0, MAX_SOURCE_CANDIDATES);
  return [...new Set(guesses)].slice(0, MAX_SOURCE_CANDIDATES);
}

/**
 * Source languages to try, best guess first.
 *
 * The detector's answer goes first, but the script heuristics stay behind it:
 * the detector is wrong often enough on short strings, and a rejected pair is
 * cheap to skip (`availability()` is a local lookup).
 */
export function candidateSources(
  text: string,
  detected: string | null,
  targetLanguage: string,
): string[] {
  const ordered = detected === null ? guessSourceLanguages(text) : [detected, ...guessSourceLanguages(text)];

  const candidates: string[] = [];
  for (const language of ordered) {
    const base = baseLanguage(language);
    if (base === '' || candidates.includes(base) || isSameLanguage(base, targetLanguage)) continue;
    candidates.push(base);
  }
  return candidates.slice(0, MAX_SOURCE_CANDIDATES);
}

/** `ReadingOutcome` check: only a well-formed {@link Reading} crosses the wire. */
export function isReading(value: unknown): value is Reading {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Reading>;
  return (
    typeof candidate.provider === 'string' &&
    typeof candidate.language === 'string' &&
    Array.isArray(candidate.tokens) &&
    typeof candidate.reading === 'string' &&
    typeof candidate.romanization === 'string'
  );
}

export interface TranslationDeps {
  /** Chrome's `LanguageDetector`, `null` when the browser has no such API. */
  detector: LanguageDetectorApi | null;
  /** Chrome's `Translator`, `null` when the browser has no such API. */
  translator: TranslatorApi | null;
  settings: Settings;
  /** The browser UI language, used to resolve `targetLanguage: 'auto'`. */
  uiLanguage: string;
  /** Runs the reading providers for a language; injected to stay DOM-free. */
  read: (text: string, language: string, settings: Settings) => Promise<ReadingOutcome>;
  onProgress?: (stage: ProgressStage, progress: number | null) => void;
  now?: () => number;
}

export interface TranslationInput {
  requestId: string;
  text: string;
  /** Explicit override; `'auto'`/absent falls back to the settings. */
  targetLanguage?: string | undefined;
  reading: boolean;
}

/** `'auto'`, empty and blank overrides all mean "decide from the settings". */
export function normalizeExplicitTarget(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === AUTO_TARGET) return null;
  return baseLanguage(trimmed);
}

/**
 * The target language for a request: an explicit request wins as long as it is
 * not the language the text already is, otherwise the settings decide.
 */
export function resolveRequestedTarget(
  input: TranslationInput,
  settings: Settings,
  detected: string | null,
  uiLanguage: string,
): string {
  const explicit = normalizeExplicitTarget(input.targetLanguage);
  if (explicit !== null && (detected === null || !isSameLanguage(explicit, detected))) {
    return explicit;
  }
  return resolveTargetLanguage(settings, detected, uiLanguage);
}

interface Attempt {
  sourceLanguage: string;
  availability: ModelAvailability;
}

/** Human readable explanation for a request that produced no translation. */
export function describeFailure(attempts: readonly Attempt[], targetLanguage: string): string {
  if (
    attempts.some(
      (attempt) => attempt.availability === 'downloadable' || attempt.availability === 'downloading',
    )
  ) {
    return `The ${targetLanguage} translation model has not been downloaded yet. Open the extension popup to start the download.`;
  }
  if (attempts.length === 0) {
    return 'Could not work out which language the selection is written in.';
  }
  return `Chrome cannot translate ${attempts.map((attempt) => attempt.sourceLanguage).join(', ')} into ${targetLanguage}.`;
}

/**
 * Run the whole pipeline for one request. This never throws: every failure is
 * reported as a `translate-result` with `ok: false`.
 */
export async function runTranslation(
  input: TranslationInput,
  deps: TranslationDeps,
): Promise<TranslateResult> {
  const now = deps.now ?? (() => Date.now());
  const notify = deps.onProgress ?? (() => {});
  const settings = deps.settings;
  const requestId = input.requestId;
  const text = input.text;

  if (text.trim() === '') {
    return createErrorResult(requestId, 'empty-text', 'There is nothing to translate.');
  }
  if (text.length > settings.maxCharacters) {
    return createErrorResult(
      requestId,
      'text-too-long',
      `The selection is longer than the ${settings.maxCharacters} character limit.`,
    );
  }

  const translator = deps.translator;
  if (translator === null) {
    return createErrorResult(
      requestId,
      'unsupported-api',
      'This browser does not provide the built-in Translator API.',
    );
  }

  notify('detect', null);
  const detectStart = now();
  const detection = await detectLanguage(text, deps.detector);
  const detectMs = now() - detectStart;
  const detected = detection === null ? null : baseLanguage(detection.language);

  const targetLanguage = resolveRequestedTarget(input, settings, detected, deps.uiLanguage);
  const candidates = candidateSources(text, detected, targetLanguage);

  const attempts: Attempt[] = [];
  const translateStart = now();
  let translatedText = '';
  let sourceLanguage = detected ?? '';
  let failure: unknown = null;

  for (const candidate of candidates) {
    let availability: ModelAvailability = 'unavailable';
    try {
      availability = await translator.availability({ sourceLanguage: candidate, targetLanguage });
    } catch {
      availability = 'unavailable';
    }
    attempts.push({ sourceLanguage: candidate, availability });
    if (!isPairSupported(availability)) continue;

    if (availability !== 'available') notify('download', null);
    let instance: TranslatorInstance | null = null;
    try {
      instance = await translator.create({
        sourceLanguage: candidate,
        targetLanguage,
        monitor: (monitor) => {
          watchDownloadProgress(monitor, (fraction) => {
            notify('download', fraction);
          });
        },
      });
      notify('translate', null);
      translatedText = await instance.translate(text);
      sourceLanguage = candidate;
      failure = null;
    } catch (error) {
      failure = error;
      translatedText = '';
    } finally {
      try {
        instance?.destroy();
      } catch {
        /* the instance is already gone */
      }
    }

    if (translatedText !== '') break;
  }

  const timing: TranslationTiming = { detectMs, translateMs: now() - translateStart, readingMs: 0 };

  if (translatedText === '') {
    if (failure !== null) {
      const mapped = toTranslationError(failure);
      // A classified browser error is more precise than anything the sequence
      // of attempted pairs can say, an unclassified one is not.
      if (mapped.code !== 'internal') {
        return createErrorResult(requestId, mapped.code, mapped.message, {
          sourceLanguage,
          targetLanguage,
          timing,
        });
      }
    }
    const downloading = attempts.some(
      (attempt) => attempt.availability === 'downloadable' || attempt.availability === 'downloading',
    );
    return createErrorResult(
      requestId,
      downloading ? 'download-failed' : 'unsupported-language',
      describeFailure(attempts, targetLanguage),
      { sourceLanguage, targetLanguage, timing },
    );
  }

  let reading: Reading | null = null;
  let readingSkipped: string | null = 'disabled';
  if (input.reading) {
    notify('reading', null);
    const readingStart = now();
    try {
      const outcome = await deps.read(text, sourceLanguage, settings);
      reading = isReading(outcome.reading) ? outcome.reading : null;
      readingSkipped = reading === null ? (outcome.skipped ?? 'provider-failed') : null;
    } catch {
      readingSkipped = 'provider-failed';
    }
    timing.readingMs = now() - readingStart;
  }

  return {
    source: MESSAGE_SOURCE,
    target: 'broadcast',
    type: 'translate-result',
    requestId,
    ok: true,
    sourceLanguage,
    targetLanguage,
    translatedText,
    reading,
    readingSkipped,
    error: null,
    timing,
  };
}
