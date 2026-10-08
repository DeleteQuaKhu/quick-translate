import { describe, expect, it } from 'vitest';
import {
  MESSAGE_SOURCE,
  ZERO_TIMING,
  createErrorResult,
  createRequestId,
  isDownloadResult,
  isOffscreenTranslateRequest,
  isStatusResult,
  isTranslateCommandMessage,
  isTranslateRequest,
  isTranslateResult,
  isTranslationProgress,
  matchesRequest,
  toTranslationError,
} from '../core/messages';

const baseRequest = {
  source: MESSAGE_SOURCE,
  target: 'background',
  type: 'translate',
  requestId: 'req-1',
  text: 'hello',
  reading: true,
};

describe('createRequestId', () => {
  it('is unique and non-empty', () => {
    const first = createRequestId();
    const second = createRequestId();
    expect(first).not.toBe('');
    expect(first).not.toBe(second);
  });
});

describe('request guards', () => {
  it('accepts a well formed translate request', () => {
    expect(isTranslateRequest(baseRequest)).toBe(true);
  });

  it('rejects requests from other extensions', () => {
    expect(isTranslateRequest({ ...baseRequest, source: 'someone-else' })).toBe(false);
  });

  it('rejects requests addressed elsewhere', () => {
    expect(isTranslateRequest({ ...baseRequest, target: 'offscreen' })).toBe(false);
    expect(isOffscreenTranslateRequest({ ...baseRequest, target: 'offscreen' })).toBe(true);
  });

  it('rejects requests missing fields', () => {
    expect(isTranslateRequest({ ...baseRequest, reading: undefined })).toBe(false);
    expect(isTranslateRequest({ ...baseRequest, requestId: '' })).toBe(false);
    expect(isTranslateRequest({ ...baseRequest, text: 5 })).toBe(false);
    expect(isTranslateRequest(null)).toBe(false);
  });
});

describe('broadcast guards', () => {
  it('accepts a translate result', () => {
    expect(
      isTranslateResult({
        source: MESSAGE_SOURCE,
        target: 'broadcast',
        type: 'translate-result',
        requestId: 'req-1',
        ok: true,
        translatedText: 'xin chào',
      }),
    ).toBe(true);
  });

  it('accepts progress, status and download results', () => {
    expect(
      isTranslationProgress({
        source: MESSAGE_SOURCE,
        target: 'broadcast',
        type: 'progress',
        requestId: 'req-1',
        stage: 'detect',
        progress: null,
      }),
    ).toBe(true);
    expect(
      isStatusResult({
        source: MESSAGE_SOURCE,
        target: 'broadcast',
        type: 'status-result',
        translator: { en: 'available' },
      }),
    ).toBe(true);
    expect(
      isDownloadResult({
        source: MESSAGE_SOURCE,
        target: 'broadcast',
        type: 'download-result',
        language: 'en',
      }),
    ).toBe(true);
  });

  it('rejects foreign broadcasts', () => {
    expect(isTranslateResult({ source: 'other', type: 'translate-result', target: 'broadcast' })).toBe(false);
  });

  it('matches a result to its request', () => {
    expect(matchesRequest({ requestId: 'req-1' }, 'req-1')).toBe(true);
    expect(matchesRequest({ requestId: 'req-2' }, 'req-1')).toBe(false);
    expect(matchesRequest(undefined, 'req-1')).toBe(false);
  });
});

describe('toTranslationError', () => {
  it('passes a serializable error through unchanged', () => {
    expect(toTranslationError({ code: 'empty-text', message: 'nothing to do' })).toEqual({
      code: 'empty-text',
      message: 'nothing to do',
    });
  });

  it('maps DOMException names', () => {
    const notSupported = new Error('nope');
    notSupported.name = 'NotSupportedError';
    expect(toTranslationError(notSupported).code).toBe('unsupported-api');

    const quota = new Error('full');
    quota.name = 'QuotaExceededError';
    expect(toTranslationError(quota).code).toBe('download-failed');

    const aborted = new Error('stopped');
    aborted.name = 'AbortError';
    expect(toTranslationError(aborted).code).toBe('timeout');
  });

  it('falls back to message sniffing', () => {
    expect(toTranslationError(new Error('Language pair not supported')).code).toBe('unsupported-language');
    expect(toTranslationError(new Error('model not available')).code).toBe('model-unavailable');
    expect(toTranslationError(new Error('download failed')).code).toBe('download-failed');
    expect(toTranslationError(new Error('boom')).code).toBe('internal');
    expect(toTranslationError('boom').message).toBe('boom');
  });
});

describe('createErrorResult', () => {
  it('builds a failed result with the zero timing', () => {
    const result = createErrorResult('req-1', 'empty-text', 'nothing');
    expect(result.ok).toBe(false);
    expect(result.target).toBe('broadcast');
    expect(result.error).toEqual({ code: 'empty-text', message: 'nothing' });
    expect(result.timing).toEqual(ZERO_TIMING);
    expect(result.reading).toBeNull();
    expect(result.translatedText).toBe('');
  });

  it('carries the optional extras', () => {
    const result = createErrorResult('req-1', 'unsupported-language', 'nope', {
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
    });
    expect(result.sourceLanguage).toBe('ja');
    expect(result.targetLanguage).toBe('vi');
  });
});

describe('isTranslateCommandMessage', () => {
  it('accepts the keyboard shortcut message', () => {
    expect(
      isTranslateCommandMessage({
        source: MESSAGE_SOURCE,
        target: 'content',
        type: 'translate-command',
      }),
    ).toBe(true);
  });

  it('rejects everything else', () => {
    const base = { source: MESSAGE_SOURCE, target: 'content', type: 'translate-command' };
    expect(isTranslateCommandMessage({ ...base, source: 'somebody-else' })).toBe(false);
    expect(isTranslateCommandMessage({ ...base, target: 'offscreen' })).toBe(false);
    expect(isTranslateCommandMessage({ ...base, type: 'translate' })).toBe(false);
    expect(isTranslateCommandMessage(baseRequest)).toBe(false);
    expect(isTranslateCommandMessage(null)).toBe(false);
  });
});
