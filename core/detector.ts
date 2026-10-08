/**
 * Thin, testable adapter around Chrome's built-in `LanguageDetector` API
 * (Chrome 138+, on-device).
 */

import type { ModelAvailability } from './types';

export interface LanguageDetectorInstance {
  detect(text: string): Promise<unknown>;
  destroy(): void;
}

export interface LanguageDetectorApi {
  availability(options?: { expectedInputLanguages?: string[] }): Promise<ModelAvailability>;
  create(options?: {
    expectedInputLanguages?: string[];
    monitor?: (monitor: unknown) => void;
  }): Promise<LanguageDetectorInstance>;
}

export interface DetectionResult {
  language: string;
  confidence: number;
}

/** Below this the detection is treated as "no idea". */
export const MIN_DETECTION_CONFIDENCE = 0.4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The global `LanguageDetector` object, or `null` when the API is missing. */
export function getLanguageDetectorApi(scope: unknown = globalThis): LanguageDetectorApi | null {
  const candidate = isRecord(scope)
    ? (scope as { LanguageDetector?: unknown }).LanguageDetector
    : undefined;
  if (!isRecord(candidate)) return null;
  if (typeof candidate.availability !== 'function' || typeof candidate.create !== 'function') {
    return null;
  }
  return candidate as unknown as LanguageDetectorApi;
}

/**
 * Chrome returns `[{ detectedLanguage, confidence }]` ordered by confidence.
 * Anything malformed is dropped; the highest confidence entry wins.
 */
export function pickDetection(raw: unknown): DetectionResult | null {
  if (!Array.isArray(raw)) return null;

  const candidates: DetectionResult[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const language = entry.detectedLanguage;
    if (typeof language !== 'string' || language.trim() === '') continue;
    const confidence = typeof entry.confidence === 'number' ? entry.confidence : 1;
    candidates.push({ language: language.trim(), confidence });
  }

  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return best.confidence < MIN_DETECTION_CONFIDENCE ? null : best;
}

/** Run detection, returning `null` instead of throwing. */
export async function detectLanguage(
  text: string,
  api: LanguageDetectorApi | null,
): Promise<DetectionResult | null> {
  if (api === null) return null;
  let detector: LanguageDetectorInstance | null = null;
  try {
    detector = await api.create();
    return pickDetection(await detector.detect(text));
  } catch {
    return null;
  } finally {
    try {
      detector?.destroy();
    } catch {
      /* already gone */
    }
  }
}
