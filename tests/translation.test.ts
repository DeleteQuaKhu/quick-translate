import { describe, expect, it, vi } from 'vitest';
import type { LanguageDetectorApi } from '../core/detector';
import { MESSAGE_SOURCE, type ProgressStage } from '../core/messages';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import { pairKey, type TranslatorApi } from '../core/translator';
import {
  candidateSources,
  describeFailure,
  guessSourceLanguages,
  isReading,
  normalizeExplicitTarget,
  resolveRequestedTarget,
  runTranslation,
  type TranslationDeps,
  type TranslationInput,
} from '../core/translation';
import type { ModelAvailability, Reading } from '../core/types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

function detectorFor(entries: unknown): LanguageDetectorApi {
  return {
    availability: async () => 'available',
    create: async () => ({ detect: async () => entries, destroy: () => {} }),
  };
}

interface TranslatorHarness {
  api: TranslatorApi;
  calls: {
    availability: string[];
    created: { sourceLanguage: string; targetLanguage: string }[];
    translated: string[];
    destroyed: number;
  };
}

function translatorFor(
  config: {
    availability?: (pair: string) => ModelAvailability;
    translate?: (text: string, targetLanguage: string) => string;
    failOn?: string;
    failWith?: () => Error;
  } = {},
): TranslatorHarness {
  const calls: TranslatorHarness['calls'] = {
    availability: [],
    created: [],
    translated: [],
    destroyed: 0,
  };

  const api: TranslatorApi = {
    async availability({ sourceLanguage, targetLanguage }) {
      const pair = pairKey(sourceLanguage, targetLanguage);
      calls.availability.push(pair);
      return config.availability?.(pair) ?? 'available';
    },
    async create({ sourceLanguage, targetLanguage }) {
      calls.created.push({ sourceLanguage, targetLanguage });
      if (config.failOn === sourceLanguage) {
        throw config.failWith?.() ?? new Error(`cannot create ${sourceLanguage}`);
      }
      return {
        destroy: () => {
          calls.destroyed += 1;
        },
        translate: async (text: string) => {
          calls.translated.push(text);
          return config.translate?.(text, targetLanguage) ?? `[${targetLanguage}] ${text}`;
        },
      };
    },
  };

  return { api, calls };
}

function makeDeps(overrides: Partial<TranslationDeps> = {}): TranslationDeps {
  return {
    detector: null,
    translator: null,
    settings: settings(),
    uiLanguage: 'vi',
    read: vi.fn(async () => ({ reading: null, skipped: 'no-provider' as const })),
    ...overrides,
  };
}

function makeInput(patch: Partial<TranslationInput> = {}): TranslationInput {
  return { requestId: 'req-1', text: 'こんにちは', reading: false, ...patch };
}

describe('the translation pipeline', () => {
  it('refuses blank text', async () => {
    const result = await runTranslation(makeInput({ text: '   ' }), makeDeps());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('empty-text');
    expect(result.requestId).toBe('req-1');
    expect(result.source).toBe(MESSAGE_SOURCE);
  });

  it('refuses text over the configured limit', async () => {
    const deps = makeDeps({ settings: settings({ maxCharacters: 50 }) });
    const result = await runTranslation(makeInput({ text: 'a'.repeat(51) }), deps);
    expect(result.error?.code).toBe('text-too-long');
    expect(result.error?.message).toContain('50');
  });

  it('reports a browser without the Translator API', async () => {
    const result = await runTranslation(makeInput(), makeDeps());
    expect(result.error?.code).toBe('unsupported-api');
    expect(result.translatedText).toBe('');
  });

  it('detects the language, translates and disposes of the translator', async () => {
    const translator = translatorFor();
    const stages: ProgressStage[] = [];
    const deps = makeDeps({
      detector: detectorFor([{ detectedLanguage: 'ja', confidence: 0.98 }]),
      translator: translator.api,
      onProgress: (stage) => stages.push(stage),
    });

    const result = await runTranslation(makeInput(), deps);

    expect(result.ok).toBe(true);
    expect(result.sourceLanguage).toBe('ja');
    expect(result.targetLanguage).toBe('vi');
    expect(result.translatedText).toBe('[vi] こんにちは');
    expect(result.error).toBeNull();
    expect(result.reading).toBeNull();
    expect(result.readingSkipped).toBe('disabled');
    expect(translator.calls.created).toEqual([{ sourceLanguage: 'ja', targetLanguage: 'vi' }]);
    expect(translator.calls.translated).toEqual(['こんにちは']);
    expect(translator.calls.destroyed).toBe(1);
    expect(stages).toEqual(['detect', 'translate']);
  });

  it('honours an explicit target language', async () => {
    const translator = translatorFor();
    const deps = makeDeps({
      detector: detectorFor([{ detectedLanguage: 'ja', confidence: 1 }]),
      translator: translator.api,
    });

    const result = await runTranslation(makeInput({ targetLanguage: 'en' }), deps);
    expect(result.targetLanguage).toBe('en');
    expect(translator.calls.created).toEqual([{ sourceLanguage: 'ja', targetLanguage: 'en' }]);
  });

  it('reports download progress for a model that is not there yet', async () => {
    const translator = translatorFor({ availability: () => 'downloadable' });
    const downloads: (number | null)[] = [];
    const deps = makeDeps({
      detector: detectorFor([{ detectedLanguage: 'ja', confidence: 1 }]),
      translator: translator.api,
      onProgress: (stage, progress) => {
        if (stage === 'download') downloads.push(progress);
      },
    });

    const result = await runTranslation(makeInput(), deps);
    expect(result.ok).toBe(true);
    expect(downloads).toEqual([null]);
  });
});

describe('attaching a reading', () => {
  const reading: Reading = {
    provider: 'ja-furigana',
    language: 'ja',
    tokens: [{ text: 'こんにちは', reading: 'こんにちは', roman: 'konnichiha' }],
    reading: 'こんにちは',
    romanization: 'konnichiha',
  };

  const ja = () => detectorFor([{ detectedLanguage: 'ja', confidence: 1 }]);

  it('asks the provider with the detected language', async () => {
    const read = vi.fn(async () => ({ reading, skipped: null }));
    const stages: ProgressStage[] = [];
    const deps = makeDeps({
      detector: ja(),
      translator: translatorFor().api,
      read,
      onProgress: (stage) => stages.push(stage),
    });

    const result = await runTranslation(makeInput({ reading: true }), deps);

    expect(result.reading).toEqual(reading);
    expect(result.readingSkipped).toBeNull();
    expect(read).toHaveBeenCalledWith('こんにちは', 'ja', deps.settings);
    expect(stages).toEqual(['detect', 'translate', 'reading']);
  });

  it('never calls the provider when the reading is off', async () => {
    const read = vi.fn(async () => ({ reading, skipped: null }));
    const deps = makeDeps({ detector: ja(), translator: translatorFor().api, read });

    const result = await runTranslation(makeInput({ reading: false }), deps);
    expect(read).not.toHaveBeenCalled();
    expect(result.reading).toBeNull();
    expect(result.readingSkipped).toBe('disabled');
  });

  it('keeps the translation when the provider has nothing to add', async () => {
    const deps = makeDeps({
      detector: ja(),
      translator: translatorFor().api,
      read: vi.fn(async () => ({ reading: null, skipped: 'no-provider' as const })),
    });

    const result = await runTranslation(makeInput({ reading: true }), deps);
    expect(result.ok).toBe(true);
    expect(result.translatedText).toBe('[vi] こんにちは');
    expect(result.readingSkipped).toBe('no-provider');
  });

  it('survives a provider that throws', async () => {
    const deps = makeDeps({
      detector: ja(),
      translator: translatorFor().api,
      read: vi.fn(async () => {
        throw new Error('espeakng.worker.js could not be loaded');
      }),
    });

    const result = await runTranslation(makeInput({ reading: true }), deps);
    expect(result.ok).toBe(true);
    expect(result.translatedText).toBe('[vi] こんにちは');
    expect(result.readingSkipped).toBe('provider-failed');
  });

  it('ignores a malformed reading', async () => {
    const deps = makeDeps({
      detector: ja(),
      translator: translatorFor().api,
      read: vi.fn(async () => ({ reading: 'pinyin' as unknown as Reading, skipped: null })),
    });

    const result = await runTranslation(makeInput({ reading: true }), deps);
    expect(result.reading).toBeNull();
    expect(result.readingSkipped).toBe('provider-failed');
  });
});

describe('falling back when detection is unsure', () => {
  it('uses the script heuristics when the detector is missing', async () => {
    const translator = translatorFor();
    const result = await runTranslation(makeInput(), makeDeps({ translator: translator.api }));

    expect(result.sourceLanguage).toBe('ja');
    expect(translator.calls.availability).toEqual(['ja->vi']);
  });

  it('uses them when the detector throws too', async () => {
    const failing: LanguageDetectorApi = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('model download failed');
      },
    };
    const translator = translatorFor();
    const result = await runTranslation(
      makeInput({ text: '你好世界' }),
      makeDeps({ detector: failing, translator: translator.api }),
    );

    expect(result.sourceLanguage).toBe('zh');
    expect(translator.calls.availability).toEqual(['zh->vi']);
  });

  it('tries the next candidate when Chrome rejects a pair', async () => {
    const translator = translatorFor({
      availability: (pair) => (pair === 'zh->vi' ? 'unavailable' : 'available'),
    });
    const result = await runTranslation(
      makeInput({ text: '你好世界' }),
      makeDeps({ translator: translator.api }),
    );

    expect(translator.calls.availability).toEqual(['zh->vi', 'ja->vi']);
    expect(translator.calls.created).toEqual([{ sourceLanguage: 'ja', targetLanguage: 'vi' }]);
    expect(result.sourceLanguage).toBe('ja');
  });

  it('gives up when every candidate fails', async () => {
    const translator = translatorFor({
      availability: (pair) => (pair === 'zh->vi' ? 'unavailable' : 'available'),
      failOn: 'ja',
    });
    const result = await runTranslation(
      makeInput({ text: '你好世界' }),
      makeDeps({ translator: translator.api }),
    );

    expect(translator.calls.availability).toEqual(['zh->vi', 'ja->vi']);
    expect(translator.calls.created).toEqual([{ sourceLanguage: 'ja', targetLanguage: 'vi' }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('unsupported-language');
    expect(result.sourceLanguage).toBe('');
  });
});

describe('error reporting', () => {
  const jaDetector = () => detectorFor([{ detectedLanguage: 'ja', confidence: 1 }]);

  it('keeps a classified browser error as it is', async () => {
    const translator = translatorFor({
      failOn: 'ja',
      failWith: () => Object.assign(new Error('no model for ja'), { name: 'NotSupportedError' }),
    });
    const result = await runTranslation(
      makeInput(),
      makeDeps({ detector: jaDetector(), translator: translator.api }),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('unsupported-api');
    expect(result.error?.message).toBe('no model for ja');
    expect(result.readingSkipped).toBeNull();
  });

  it('prefers the download hint for an unclassified error', async () => {
    const translator = translatorFor({ availability: () => 'downloadable', failOn: 'ja' });
    const result = await runTranslation(
      makeInput(),
      makeDeps({ detector: jaDetector(), translator: translator.api }),
    );

    expect(result.error?.code).toBe('download-failed');
    expect(result.error?.message).toContain('has not been downloaded yet');
  });

  it('lists the pairs it tried when none of them works', async () => {
    const translator = translatorFor({ availability: () => 'unavailable' });
    const result = await runTranslation(
      makeInput({ text: '你好世界' }),
      makeDeps({ translator: translator.api }),
    );

    expect(result.error?.code).toBe('unsupported-language');
    expect(result.error?.message).toBe('Chrome cannot translate zh, ja into vi.');
  });

  it('says so when there is no language left to try', async () => {
    const translator = translatorFor();
    const result = await runTranslation(
      makeInput({ text: 'привет', targetLanguage: 'ru' }),
      makeDeps({ translator: translator.api }),
    );

    expect(translator.calls.availability).toEqual([]);
    expect(result.error?.message).toBe('Could not work out which language the selection is written in.');
  });

  it('reports how long each stage took', async () => {
    let clock = 0;
    const result = await runTranslation(
      makeInput(),
      makeDeps({
        detector: jaDetector(),
        translator: translatorFor().api,
        now: () => {
          clock += 10;
          return clock;
        },
      }),
    );

    expect(result.timing.detectMs).toBeGreaterThan(0);
    expect(result.timing.translateMs).toBeGreaterThan(0);
    expect(result.timing.readingMs).toBe(0);
  });
});

describe('target language resolution', () => {
  it('treats blank and auto overrides as "no override"', () => {
    expect(normalizeExplicitTarget(undefined)).toBeNull();
    expect(normalizeExplicitTarget('  ')).toBeNull();
    expect(normalizeExplicitTarget('auto')).toBeNull();
    expect(normalizeExplicitTarget(' EN ')).toBe('en');
    expect(normalizeExplicitTarget('zh-Hans')).toBe('zh');
  });

  it('lets an explicit target win over the settings', () => {
    const explicit = makeInput({ targetLanguage: 'en' });
    expect(resolveRequestedTarget(explicit, settings(), 'ja', 'vi')).toBe('en');
    expect(resolveRequestedTarget(makeInput(), settings(), 'ja', 'vi')).toBe('vi');
    expect(resolveRequestedTarget(makeInput(), settings(), null, 'ja-JP')).toBe('ja');
  });

  it('ignores an explicit target that is the detected language', () => {
    const explicit = makeInput({ targetLanguage: 'en' });
    expect(resolveRequestedTarget(explicit, settings(), 'en', 'vi')).toBe('vi');
  });
});

describe('guessing the source language', () => {
  it('reads the script whenever it can', () => {
    expect(guessSourceLanguages('こんにちは')).toEqual(['ja']);
    expect(guessSourceLanguages('안녕하세요')).toEqual(['ko']);
    expect(guessSourceLanguages('你好')).toEqual(['zh', 'ja']);
    expect(guessSourceLanguages('привет')).toEqual(['ru']);
  });

  it('falls back to the common latin languages', () => {
    expect(guessSourceLanguages('hello')).toEqual(['en', 'fr', 'de', 'es']);
  });

  it('puts the detector first and keeps the guesses behind it', () => {
    expect(candidateSources('こんにちは', null, 'vi')).toEqual(['ja']);
    expect(candidateSources('こんにちは', 'ja', 'vi')).toEqual(['ja']);
    expect(candidateSources('你好', 'zh', 'vi')).toEqual(['zh', 'ja']);
    expect(candidateSources('hello', 'ja', 'vi')).toEqual(['ja', 'en', 'fr', 'de']);
  });

  it('never suggests the language it is translating into', () => {
    expect(candidateSources('hello', null, 'en')).toEqual(['fr', 'de', 'es']);
    expect(candidateSources('привет', null, 'ru')).toEqual([]);
  });
});

describe('the reading guard', () => {
  it('accepts a well-formed reading', () => {
    expect(
      isReading({ provider: 'ipa', language: 'en', tokens: [], reading: '', romanization: 'hi' }),
    ).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isReading(null)).toBe(false);
    expect(isReading('ipa')).toBe(false);
    expect(isReading({ provider: 'ipa', language: 'en', tokens: 'none', reading: '', romanization: '' })).toBe(
      false,
    );
    expect(isReading({ provider: 'ipa', language: 'en', tokens: [] })).toBe(false);
  });
});

describe('failure descriptions', () => {
  it('explains that a model is missing', () => {
    expect(describeFailure([{ sourceLanguage: 'ja', availability: 'downloadable' }], 'vi')).toContain(
      'has not been downloaded yet',
    );
  });

  it('lists what was tried', () => {
    expect(describeFailure([{ sourceLanguage: 'zh', availability: 'unavailable' }], 'vi')).toBe(
      'Chrome cannot translate zh into vi.',
    );
  });

  it('admits when it has no idea', () => {
    expect(describeFailure([], 'vi')).toBe(
      'Could not work out which language the selection is written in.',
    );
  });
});

