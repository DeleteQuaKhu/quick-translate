import { describe, expect, it, vi } from 'vitest';
import { createReadingDispatcher, type ReadingProviders } from '../core/reading/dispatch';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import type { Reading } from '../core/types';

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function reading(provider: Reading['provider'], language: string): Reading {
  return { provider, language, tokens: [{ text: 'x', roman: 'y' }], reading: 'x', romanization: 'y' };
}

describe('createReadingDispatcher', () => {
  it('reports no-provider for a language without a reading helper', async () => {
    const read = createReadingDispatcher({});
    expect(await read('привет', 'ru', settings())).toEqual({ reading: null, skipped: 'no-provider' });
  });

  it('runs a non-experimental provider with the IPA switch off', async () => {
    const zh = vi.fn(() => reading('zh-pinyin', 'zh'));
    const read = createReadingDispatcher({ 'zh-pinyin': zh });
    const outcome = await read('你好', 'zh', settings({ enableExperimentalIpa: false }));
    expect(outcome).toEqual({ reading: reading('zh-pinyin', 'zh'), skipped: null });
    expect(zh).toHaveBeenCalledTimes(1);
  });

  it('reports disabled for IPA until it is opted into', async () => {
    const ipa = vi.fn(() => reading('ipa', 'en'));
    const read = createReadingDispatcher({ ipa });

    expect(await read('hello', 'en', settings({ enableExperimentalIpa: false }))).toEqual({
      reading: null,
      skipped: 'disabled',
    });

    const enabled = await read('hello', 'en-US', settings({ enableExperimentalIpa: true }));
    expect(enabled).toEqual({ reading: reading('ipa', 'en'), skipped: null });
  });

  it('reports provider-unavailable when the provider is not installed', async () => {
    const read = createReadingDispatcher({ 'zh-pinyin': undefined });
    expect(await read('你好', 'zh', settings())).toEqual({ reading: null, skipped: 'provider-unavailable' });
  });

  it('reports provider-unavailable when the provider declines the text', async () => {
    const read = createReadingDispatcher({ 'ko-romaja': () => null });
    expect(await read('한국어', 'ko', settings())).toEqual({ reading: null, skipped: 'provider-unavailable' });
  });

  it('returns the reading the provider produced', async () => {
    const zh = vi.fn(() => reading('zh-pinyin', 'zh'));
    const read = createReadingDispatcher({ 'zh-pinyin': zh });
    expect(await read('你好', 'zh-Hans', settings())).toEqual({
      reading: reading('zh-pinyin', 'zh'),
      skipped: null,
    });
    // the provider always sees the base language
    expect(zh).toHaveBeenCalledWith('你好', 'zh');
  });

  it('surfaces a provider crash as provider-failed', async () => {
    const providers: ReadingProviders = {
      'zh-pinyin': () => {
        throw new Error('pinyin-pro exploded');
      },
    };
    const read = createReadingDispatcher(providers);
    expect(await read('你好', 'zh', settings())).toEqual({ reading: null, skipped: 'provider-failed' });
  });

  it('awaits asynchronous providers', async () => {
    const read = createReadingDispatcher({
      ipa: async () => reading('ipa', 'de'),
    });
    expect(await read('hallo', 'de', settings({ enableExperimentalIpa: true }))).toEqual({
      reading: reading('ipa', 'de'),
      skipped: null,
    });
  });
});
