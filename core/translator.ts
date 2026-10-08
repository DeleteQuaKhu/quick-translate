/**
 * Thin, testable adapter around Chrome's built-in `Translator` API
 * (Chrome 138+, on-device, no network).
 *
 * The API is feature-detected, never assumed: `getTranslatorApi()` returns
 * `null` on a browser that does not ship it.
 */

import { clamp } from './anchor';
import type { ModelAvailability } from './types';

/** The bits of `Translation` this extension uses. */
export interface TranslatorInstance {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

export interface TranslatorCreateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  /** Chrome passes an `EventTarget` emitting `downloadprogress`. */
  monitor?: (monitor: unknown) => void;
}

export interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<ModelAvailability>;
  create(options: TranslatorCreateOptions): Promise<TranslatorInstance>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The global `Translator` object, or `null` when the API is missing. */
export function getTranslatorApi(scope: unknown = globalThis): TranslatorApi | null {
  const candidate = isRecord(scope) ? (scope as { Translator?: unknown }).Translator : undefined;
  if (!isRecord(candidate)) return null;
  if (typeof candidate.availability !== 'function' || typeof candidate.create !== 'function') return null;
  return candidate as unknown as TranslatorApi;
}

export const DOWNLOAD_PROGRESS_EVENT = 'downloadprogress';

/** Stable key for a language pair, used to cache availability results. */
export function pairKey(sourceLanguage: string, targetLanguage: string): string {
  return `${sourceLanguage}->${targetLanguage}`;
}

/** `true` when Chrome can translate this pair (possibly after a download). */
export function isPairSupported(availability: ModelAvailability): boolean {
  return availability === 'available' || availability === 'downloadable' || availability === 'downloading';
}

/** `loaded / total` clamped to `[0, 1]`, `null` when the browser did not say. */
export function downloadProgressFraction(event: unknown): number | null {
  if (!isRecord(event)) return null;
  const loaded = typeof event.loaded === 'number' ? event.loaded : null;
  const total = typeof event.total === 'number' && event.total > 0 ? event.total : null;
  if (loaded === null || total === null) return null;
  return clamp(loaded / total, 0, 1);
}

/**
 * Subscribe to a `create()` monitor, forwarding a `[0, 1]` fraction (or `null`
 * when the total is unknown) to `onProgress`.
 */
export function watchDownloadProgress(
  monitor: unknown,
  onProgress: (fraction: number | null) => void,
): boolean {
  if (!isRecord(monitor) || typeof monitor.addEventListener !== 'function') return false;
  monitor.addEventListener(DOWNLOAD_PROGRESS_EVENT, (event: unknown) => {
    onProgress(downloadProgressFraction(event));
  });
  return true;
}
