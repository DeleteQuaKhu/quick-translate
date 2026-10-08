/**
 * The offscreen document.
 *
 * A service worker has no DOM, so Chrome's on-device Translator and Language
 * Detector models and the bundled reading helpers can only run here. This is
 * the single context that talks to those models: the service worker forwards a
 * request to it, the answer is *broadcast* and the requester matches it by
 * `requestId` (that way a keyboard-shortcut request started in the service
 * worker and one started in a page travel the same path).
 */

import { browser } from 'wxt/browser';
import { getLanguageDetectorApi } from '../../core/detector';
import {
  MESSAGE_SOURCE,
  isDownloadRequest,
  isOffscreenRequest,
  isStatusRequest,
  toTranslationError,
  type BroadcastMessage,
  type DownloadRequest,
  type DownloadResult,
  type OffscreenRequest,
  type OffscreenTranslateRequest,
  type ProgressStage,
  type StatusResult,
  type TranslationProgress,
} from '../../core/messages';
import { createReadingDispatcher } from '../../core/reading/dispatch';
import { KNOWN_TARGET_LANGUAGES } from '../../core/settings';
import { getSettings } from '../../core/settings-store';
import { baseLanguage } from '../../core/text';
import { runTranslation } from '../../core/translation';
import { getTranslatorApi, isPairSupported, watchDownloadProgress } from '../../core/translator';
import type { ModelAvailability, TranslationError } from '../../core/types';
import { createReadingProviders } from './providers';

/** Runs the real reading providers; see `./providers.ts`. */
const read = createReadingDispatcher(createReadingProviders());

/** The browser UI language, used to resolve `targetLanguage: 'auto'`. */
function uiLanguage(): string {
  return browser.i18n.getUILanguage() || navigator.language || 'en';
}

/** Send a message to every other extension context. */
async function broadcast(message: BroadcastMessage): Promise<void> {
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // Thrown when no other context is alive (no popup open, no content script
    // in any tab). Nobody is waiting for this answer, so it is not an error.
  }
}

/** Staged progress for one request. */
async function reportProgress(
  requestId: string,
  stage: ProgressStage,
  progress: number | null,
): Promise<void> {
  const message: TranslationProgress = {
    source: MESSAGE_SOURCE,
    target: 'broadcast',
    type: 'progress',
    requestId,
    stage,
    progress,
  };
  await broadcast(message);
}

/** Request types are independent, so they can run concurrently. */
async function handleRequest(request: OffscreenRequest): Promise<void> {
  if (isStatusRequest(request)) await handleStatus();
  else if (isDownloadRequest(request)) await handleDownload(request);
  else await handleTranslate(request);
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (isOffscreenRequest(message)) void handleRequest(message);
  // Never answer in place: the outcome is broadcast from `handleTranslate` so
  // every context of every tab sees the same result.
  return undefined;
});

// ---------------------------------------------------------------------------
// translate
// ---------------------------------------------------------------------------

async function handleTranslate(request: OffscreenTranslateRequest): Promise<void> {
  const settings = await getSettings();
  const result = await runTranslation(
    {
      requestId: request.requestId,
      text: request.text,
      targetLanguage: request.targetLanguage,
      reading: request.reading,
    },
    {
      detector: getLanguageDetectorApi(),
      translator: getTranslatorApi(),
      settings,
      uiLanguage: uiLanguage(),
      read,
      onProgress: (stage, progress) => {
        void reportProgress(request.requestId, stage, progress);
      },
    },
  );
  await broadcast(result);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

/** Source language to probe a target with: our UI language, English otherwise. */
function probeSource(targetLanguage: string): string {
  const preferred = baseLanguage(uiLanguage()) || 'en';
  return preferred === targetLanguage ? 'en' : preferred;
}

async function availabilityOf(
  sourceLanguage: string,
  targetLanguage: string,
): Promise<ModelAvailability> {
  const translator = getTranslatorApi();
  if (translator === null) return 'unavailable';
  try {
    return await translator.availability({ sourceLanguage, targetLanguage });
  } catch {
    return 'unavailable';
  }
}

async function detectorAvailability(): Promise<ModelAvailability> {
  const detector = getLanguageDetectorApi();
  if (detector === null) return 'unavailable';
  try {
    return await detector.availability();
  } catch {
    return 'unavailable';
  }
}

/**
 * What this browser can translate right now, per known target language. The
 * popup uses this to decide which entries of its dropdown are worth offering
 * and which ones need a download.
 */
async function handleStatus(): Promise<void> {
  const translator = getTranslatorApi();
  const perLanguage: Record<string, ModelAvailability> = {};
  for (const { tag } of KNOWN_TARGET_LANGUAGES) {
    perLanguage[tag] =
      translator === null ? 'unavailable' : await availabilityOf(probeSource(tag), tag);
  }

  const result: StatusResult = {
    source: MESSAGE_SOURCE,
    target: 'broadcast',
    type: 'status-result',
    translator: perLanguage,
    detector: await detectorAvailability(),
    // The providers are constructed synchronously above, so reaching this
    // handler at all means they loaded.
    readingProviders: true,
  };
  await broadcast(result);
}

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

/**
 * Warm one translation model up.
 *
 * `Translator.create()` may resolve before the model has actually been fetched,
 * so the availability is probed again afterwards: the popup shows the truth
 * either way. Progress is broadcast with the *language* as its `requestId` — a
 * download is not tied to a page, and the popup owns the download UI.
 */
async function handleDownload(request: DownloadRequest): Promise<void> {
  const language = baseLanguage(request.language);
  const sourceLanguage = probeSource(language);
  const translator = getTranslatorApi();

  let availability: ModelAvailability = 'unavailable';
  let error: TranslationError | null = null;

  if (translator === null) {
    error = {
      code: 'unsupported-api',
      message: 'This browser does not provide the built-in Translator API.',
    };
  } else {
    try {
      availability = await translator.availability({ sourceLanguage, targetLanguage: language });
      if (isPairSupported(availability)) {
        const instance = await translator.create({
          sourceLanguage,
          targetLanguage: language,
          monitor: (monitor) => {
            watchDownloadProgress(monitor, (fraction) => {
              void reportProgress(language, 'download', fraction);
            });
          },
        });
        try {
          instance.destroy();
        } catch {
          /* the instance is already gone */
        }
        availability = await availabilityOf(sourceLanguage, language);
      }
    } catch (thrown) {
      error = toTranslationError(thrown);
      availability = await availabilityOf(sourceLanguage, language);
    }
  }

  const result: DownloadResult = {
    source: MESSAGE_SOURCE,
    target: 'broadcast',
    type: 'download-result',
    language,
    availability,
    error,
  };
  await broadcast(result);
}
