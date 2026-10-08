import { describe, expect, it, vi } from 'vitest';
import {
  DOWNLOAD_PROGRESS_EVENT,
  downloadProgressFraction,
  getTranslatorApi,
  isPairSupported,
  pairKey,
  watchDownloadProgress,
  type TranslatorApi,
} from '../core/translator';

describe('getTranslatorApi', () => {
  it('returns the API when both methods exist', () => {
    const api = { availability: async () => 'available' as const, create: async () => ({}) };
    expect(getTranslatorApi({ Translator: api })).toBe(api);
  });

  it('returns null when the API is missing or incomplete', () => {
    expect(getTranslatorApi({})).toBeNull();
    expect(getTranslatorApi({ Translator: { availability: async () => 'available' } })).toBeNull();
    expect(getTranslatorApi(undefined)).toBeNull();
  });
});

describe('pairKey', () => {
  it('is stable and pair specific', () => {
    expect(pairKey('en', 'vi')).toBe('en->vi');
    expect(pairKey('en', 'vi')).not.toBe(pairKey('vi', 'en'));
  });
});

describe('isPairSupported', () => {
  it('accepts every availability except unavailable', () => {
    expect(isPairSupported('available')).toBe(true);
    expect(isPairSupported('downloadable')).toBe(true);
    expect(isPairSupported('downloading')).toBe(true);
    expect(isPairSupported('unavailable')).toBe(false);
  });
});

describe('downloadProgressFraction', () => {
  it('computes loaded / total', () => {
    expect(downloadProgressFraction({ loaded: 5, total: 10 })).toBe(0.5);
  });

  it('clamps to [0, 1]', () => {
    expect(downloadProgressFraction({ loaded: 20, total: 10 })).toBe(1);
  });

  it('returns null when the total is unknown or zero', () => {
    expect(downloadProgressFraction({ loaded: 5 })).toBeNull();
    expect(downloadProgressFraction({ loaded: 5, total: 0 })).toBeNull();
    expect(downloadProgressFraction({ total: 5 })).toBeNull();
    expect(downloadProgressFraction('nope')).toBeNull();
    expect(downloadProgressFraction(null)).toBeNull();
  });
});

describe('watchDownloadProgress', () => {
  it('forwards the fraction from the monitor events', () => {
    let handler: ((event: unknown) => void) | undefined;
    const monitor = {
      addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
        if (type === DOWNLOAD_PROGRESS_EVENT) handler = listener;
      }),
    };
    const onProgress = vi.fn();

    expect(watchDownloadProgress(monitor, onProgress)).toBe(true);
    handler?.({ loaded: 3, total: 4 });
    handler?.({ loaded: 3 });

    expect(onProgress).toHaveBeenNthCalledWith(1, 0.75);
    expect(onProgress).toHaveBeenNthCalledWith(2, null);
  });

  it('reports false for a monitor it cannot subscribe to', () => {
    expect(watchDownloadProgress({}, vi.fn())).toBe(false);
    expect(watchDownloadProgress(null, vi.fn())).toBe(false);
  });
});

describe('the injected api shape', () => {
  it('is enough to drive a translation', async () => {
    const destroy = vi.fn();
    const api: TranslatorApi = {
      availability: async ({ targetLanguage }) => (targetLanguage === 'vi' ? 'downloadable' : 'unavailable'),
      create: async ({ sourceLanguage, targetLanguage }) => {
        expect(sourceLanguage).toBe('en');
        return { destroy, translate: async (text) => `[${targetLanguage}] ${text}` };
      },
    };

    expect(await api.availability({ sourceLanguage: 'en', targetLanguage: 'vi' })).toBe('downloadable');
    const translation = await api.create({ sourceLanguage: 'en', targetLanguage: 'vi' });
    expect(await translation.translate('hello')).toBe('[vi] hello');
  });
});
