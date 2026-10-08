import { describe, expect, it, vi } from 'vitest';
import {
  MIN_DETECTION_CONFIDENCE,
  detectLanguage,
  getLanguageDetectorApi,
  pickDetection,
  type LanguageDetectorApi,
} from '../core/detector';

describe('pickDetection', () => {
  it('returns the most confident entry', () => {
    expect(
      pickDetection([
        { detectedLanguage: 'fr', confidence: 0.3 },
        { detectedLanguage: 'es', confidence: 0.9 },
      ]),
    ).toEqual({ language: 'es', confidence: 0.9 });
  });

  it('trims the language tag', () => {
    expect(pickDetection([{ detectedLanguage: ' ja ', confidence: 0.8 }])).toEqual({
      language: 'ja',
      confidence: 0.8,
    });
  });

  it('assumes full confidence when the field is missing', () => {
    expect(pickDetection([{ detectedLanguage: 'en' }])).toEqual({ language: 'en', confidence: 1 });
  });

  it('rejects results below the confidence threshold', () => {
    expect(pickDetection([{ detectedLanguage: 'en', confidence: MIN_DETECTION_CONFIDENCE - 0.01 }])).toBeNull();
  });

  it('skips malformed entries', () => {
    expect(pickDetection([null, { confidence: 0.9 }, { detectedLanguage: '' }, 42])).toBeNull();
    expect(pickDetection([{ detectedLanguage: '', confidence: 1 }, { detectedLanguage: 'de', confidence: 0.5 }])).toEqual({
      language: 'de',
      confidence: 0.5,
    });
  });

  it('rejects anything that is not an array', () => {
    expect(pickDetection(undefined)).toBeNull();
    expect(pickDetection('en')).toBeNull();
    expect(pickDetection([])).toBeNull();
  });
});

describe('getLanguageDetectorApi', () => {
  it('returns the API when both methods exist', () => {
    const api = { availability: async () => 'available' as const, create: async () => ({}) };
    expect(getLanguageDetectorApi({ LanguageDetector: api })).toBe(api);
  });

  it('returns null when the API is missing or incomplete', () => {
    expect(getLanguageDetectorApi({})).toBeNull();
    expect(getLanguageDetectorApi({ LanguageDetector: { create: async () => ({}) } })).toBeNull();
    expect(getLanguageDetectorApi(null)).toBeNull();
    expect(getLanguageDetectorApi({ LanguageDetector: 'nope' })).toBeNull();
  });
});

describe('detectLanguage', () => {
  it('detects and disposes of the detector', async () => {
    const destroy = vi.fn();
    const api: LanguageDetectorApi = {
      availability: async () => 'available',
      create: async () => ({
        destroy,
        detect: async () => [{ detectedLanguage: 'ja', confidence: 0.99 }],
      }),
    };

    expect(await detectLanguage('こんにちは', api)).toEqual({ language: 'ja', confidence: 0.99 });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('returns null when the API is missing', async () => {
    expect(await detectLanguage('hello', null)).toBeNull();
  });

  it('returns null instead of throwing', async () => {
    const failing: LanguageDetectorApi = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('no model');
      },
    };
    expect(await detectLanguage('hello', failing)).toBeNull();

    const destroy = vi.fn();
    const throwsWhileDetecting: LanguageDetectorApi = {
      availability: async () => 'available',
      create: async () => ({
        destroy,
        detect: async () => {
          throw new Error('boom');
        },
      }),
    };
    expect(await detectLanguage('hello', throwsWhileDetecting)).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
