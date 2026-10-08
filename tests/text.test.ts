import { describe, expect, it } from 'vitest';
import {
  baseLanguage,
  clampText,
  hasReadingRelevantScript,
  isProbablyTranslatable,
  isSameLanguage,
  normalizeSelection,
  prepareSelection,
} from '../core/text';

describe('normalizeSelection', () => {
  it('collapses the whitespace that multi-block selections carry', () => {
    expect(normalizeSelection('  Hello\n\n  world\t!  ')).toBe('Hello world !');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeSelection(' \n\t ')).toBe('');
  });
});

describe('isProbablyTranslatable', () => {
  it('accepts text with letters', () => {
    expect(isProbablyTranslatable('Hello')).toBe(true);
    expect(isProbablyTranslatable('你好')).toBe(true);
  });

  it('accepts digits on their own', () => {
    expect(isProbablyTranslatable('42')).toBe(true);
  });

  it('rejects punctuation-only selections', () => {
    expect(isProbablyTranslatable('--- ... !!!')).toBe(false);
    expect(isProbablyTranslatable('')).toBe(false);
  });
});

describe('hasReadingRelevantScript', () => {
  it('detects the scripts that have a reading provider', () => {
    expect(hasReadingRelevantScript('日本語')).toBe(true);
    expect(hasReadingRelevantScript('ひらがな')).toBe(true);
    expect(hasReadingRelevantScript('カタカナ')).toBe(true);
    expect(hasReadingRelevantScript('한국어')).toBe(true);
  });

  it('ignores scripts without a reading provider', () => {
    expect(hasReadingRelevantScript('hello world')).toBe(false);
    expect(hasReadingRelevantScript('привет')).toBe(false);
  });
});

describe('clampText', () => {
  it('keeps short text untouched', () => {
    expect(clampText('abc', 10)).toEqual({ text: 'abc', truncated: false });
  });

  it('truncates and reports it', () => {
    expect(clampText('abcdef', 3)).toEqual({ text: 'abc', truncated: true });
  });

  it('never cuts below one character', () => {
    expect(clampText('abc', 0)).toEqual({ text: 'a', truncated: true });
  });
});

describe('prepareSelection', () => {
  it('normalizes before clamping', () => {
    expect(prepareSelection('  a\n b\n c  ', 4)).toEqual({ text: 'a b ', truncated: true });
  });
});

describe('language tags', () => {
  it('reduces a tag to its base language', () => {
    expect(baseLanguage('zh-Hans')).toBe('zh');
    expect(baseLanguage('EN_us')).toBe('en');
    expect(baseLanguage('  ja  ')).toBe('ja');
    expect(baseLanguage('')).toBe('');
  });

  it('compares base languages', () => {
    expect(isSameLanguage('zh-Hans', 'ZH')).toBe(true);
    expect(isSameLanguage('en', 'en-US')).toBe(true);
    expect(isSameLanguage('en', 'fr')).toBe(false);
    expect(isSameLanguage('', '')).toBe(false);
  });
});
