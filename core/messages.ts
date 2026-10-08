/**
 * Message protocol shared by the content script, the service worker, the
 * offscreen document and the action popup.
 *
 * Every message carries `source` (so foreign messages are ignored) and
 * `target` (so a context only acts on messages addressed to it). Results are
 * broadcast, the requester matches them by `requestId`.
 */

import type { ModelAvailability, Reading, TranslationError, TranslationTiming } from './types';

export const MESSAGE_SOURCE = 'quick-translate' as const;

export type MessageTarget = 'background' | 'offscreen' | 'broadcast' | 'content';

export type ProgressStage = 'detect' | 'translate' | 'reading' | 'download';

/** Content script -> service worker: "translate this selection". */
export interface TranslateRequest {
  source: typeof MESSAGE_SOURCE;
  target: 'background';
  type: 'translate';
  requestId: string;
  text: string;
  /** `undefined` means "let the extension pick one". */
  targetLanguage?: string;
  reading: boolean;
}

/** Service worker -> offscreen document: the actual work. */
export interface OffscreenTranslateRequest {
  source: typeof MESSAGE_SOURCE;
  target: 'offscreen';
  type: 'translate';
  requestId: string;
  text: string;
  targetLanguage?: string;
  reading: boolean;
}

/** Offscreen document -> everyone: the outcome, matched by `requestId`. */
export interface TranslateResult {
  source: typeof MESSAGE_SOURCE;
  target: 'broadcast';
  type: 'translate-result';
  requestId: string;
  ok: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  reading: Reading | null;
  /** Why a reading is missing, when it is. */
  readingSkipped: string | null;
  error: TranslationError | null;
  timing: TranslationTiming;
}

/** Offscreen document -> everyone: staged progress, matched by `requestId`. */
export interface TranslationProgress {
  source: typeof MESSAGE_SOURCE;
  target: 'broadcast';
  type: 'progress';
  requestId: string;
  stage: ProgressStage;
  /** Model download progress in `[0, 1]`, `null` when unknown. */
  progress: number | null;
}

/** Popup -> offscreen document: what can this browser translate right now? */
export interface StatusRequest {
  source: typeof MESSAGE_SOURCE;
  target: 'offscreen';
  type: 'status';
}

export interface StatusResult {
  source: typeof MESSAGE_SOURCE;
  target: 'broadcast';
  type: 'status-result';
  /** `Translator.availability()` result per language. */
  translator: Record<string, ModelAvailability>;
  detector: ModelAvailability;
  /** `true` when the offscreen document loaded its reading providers. */
  readingProviders: boolean;
}

/** Popup -> offscreen document: download a translation model. */
export interface DownloadRequest {
  source: typeof MESSAGE_SOURCE;
  target: 'offscreen';
  type: 'download';
  language: string;
}

export interface DownloadResult {
  source: typeof MESSAGE_SOURCE;
  target: 'broadcast';
  type: 'download-result';
  language: string;
  availability: ModelAvailability;
  error: TranslationError | null;
}

/**
 * Service worker -> content script: the keyboard shortcut fired, translate the
 * current selection (the service worker cannot read a page's selection itself).
 */
export interface TranslateCommandMessage {
  source: typeof MESSAGE_SOURCE;
  target: 'content';
  type: 'translate-command';
}

export type OffscreenRequest = OffscreenTranslateRequest | StatusRequest | DownloadRequest;
export type ContentRequest = TranslateCommandMessage;
export type BroadcastMessage = TranslateResult | TranslationProgress | StatusResult | DownloadResult;
export type QuickTranslateMessage =
  | TranslateRequest
  | OffscreenRequest
  | ContentRequest
  | BroadcastMessage;

// ---------------------------------------------------------------------------
// Request ids
// ---------------------------------------------------------------------------

/** Unique id used to correlate broadcasts with the request that caused them. */
export function createRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.length > 0) return uuid;
  return `qt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.source === MESSAGE_SOURCE && typeof value.type === 'string';
}

function hasRequestShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.text === 'string' &&
    typeof value.reading === 'boolean'
  );
}

export function isTranslateRequest(value: unknown): value is TranslateRequest {
  return (
    hasEnvelope(value) &&
    value.type === 'translate' &&
    value.target === 'background' &&
    hasRequestShape(value)
  );
}

export function isOffscreenTranslateRequest(value: unknown): value is OffscreenTranslateRequest {
  return (
    hasEnvelope(value) &&
    value.type === 'translate' &&
    value.target === 'offscreen' &&
    hasRequestShape(value)
  );
}

export function isStatusRequest(value: unknown): value is StatusRequest {
  return hasEnvelope(value) && value.type === 'status' && value.target === 'offscreen';
}

export function isDownloadRequest(value: unknown): value is DownloadRequest {
  return (
    hasEnvelope(value) &&
    value.type === 'download' &&
    value.target === 'offscreen' &&
    typeof value.language === 'string' &&
    value.language.length > 0
  );
}

export function isOffscreenRequest(value: unknown): value is OffscreenRequest {
  return isOffscreenTranslateRequest(value) || isStatusRequest(value) || isDownloadRequest(value);
}

export function isTranslateCommandMessage(value: unknown): value is TranslateCommandMessage {
  return hasEnvelope(value) && value.type === 'translate-command' && value.target === 'content';
}

export function isTranslateResult(value: unknown): value is TranslateResult {
  return (
    hasEnvelope(value) &&
    value.type === 'translate-result' &&
    value.target === 'broadcast' &&
    typeof value.requestId === 'string' &&
    typeof value.ok === 'boolean' &&
    typeof value.translatedText === 'string'
  );
}

export function isTranslationProgress(value: unknown): value is TranslationProgress {
  return (
    hasEnvelope(value) &&
    value.type === 'progress' &&
    value.target === 'broadcast' &&
    typeof value.requestId === 'string' &&
    typeof value.stage === 'string'
  );
}

export function isStatusResult(value: unknown): value is StatusResult {
  return (
    hasEnvelope(value) &&
    value.type === 'status-result' &&
    value.target === 'broadcast' &&
    isRecord(value.translator)
  );
}

export function isDownloadResult(value: unknown): value is DownloadResult {
  return (
    hasEnvelope(value) &&
    value.type === 'download-result' &&
    value.target === 'broadcast' &&
    typeof value.language === 'string'
  );
}

/** True when `value` is the answer to the request `requestId`. */
export function matchesRequest(value: unknown, requestId: string): boolean {
  return isRecord(value) && typeof value.requestId === 'string' && value.requestId === requestId;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ZERO_TIMING: TranslationTiming = { detectMs: 0, translateMs: 0, readingMs: 0 };

/** Map any thrown value onto the serializable error shape used on the wire. */
export function toTranslationError(error: unknown): TranslationError {
  if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code as TranslationError['code'], message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  const lower = message.toLowerCase();

  if (name === 'NotSupportedError') return { code: 'unsupported-api', message };
  if (name === 'QuotaExceededError' || name === 'OperationError') return { code: 'download-failed', message };
  if (name === 'AbortError' || name === 'TimeoutError') return { code: 'timeout', message };
  if (lower.includes('not supported') || lower.includes('unsupported')) {
    return { code: 'unsupported-language', message };
  }
  if (lower.includes('not available') || lower.includes('unavailable')) {
    return { code: 'model-unavailable', message };
  }
  if (lower.includes('download')) return { code: 'download-failed', message };

  return { code: 'internal', message };
}

/** Build a failed {@link TranslateResult} without going through the offscreen document. */
export function createErrorResult(
  requestId: string,
  code: TranslationError['code'],
  message: string,
  extra: { sourceLanguage?: string; targetLanguage?: string; timing?: TranslationTiming } = {},
): TranslateResult {
  return {
    source: MESSAGE_SOURCE,
    target: 'broadcast',
    type: 'translate-result',
    requestId,
    ok: false,
    sourceLanguage: extra.sourceLanguage ?? '',
    targetLanguage: extra.targetLanguage ?? '',
    translatedText: '',
    reading: null,
    readingSkipped: null,
    error: { code, message },
    timing: extra.timing ?? ZERO_TIMING,
  };
}
