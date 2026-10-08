import { describe, expect, it } from 'vitest';
import {
  AUTO_TARGET,
  DEFAULT_SETTINGS,
  describeTargetLanguage,
  normalizeSettings,
  resolveTargetLanguage,
  type Settings,
} from '../core/settings';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('normalizeSettings', () => {
  it('falls back to the defaults for garbage', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    expect(
      normalizeSettings({
        targetLanguage: 'vi',
        theme: 'dark',
        maxCharacters: 120,
        readingByDefault: false,
      }),
    ).toMatchObject({
      targetLanguage: 'vi',
      theme: 'dark',
      maxCharacters: 120,
      readingByDefault: false,
    });
  });

  it('drops invalid values', () => {
    expect(
      normalizeSettings({ targetLanguage: '!!!', theme: 'neon', readingByDefault: 'yes' }),
    ).toMatchObject({
      targetLanguage: AUTO_TARGET,
      theme: 'system',
      readingByDefault: true,
    });
  });

  it('clamps maxCharacters into the allowed range', () => {
    expect(normalizeSettings({ maxCharacters: 1_000_000 }).maxCharacters).toBe(20_000);
    expect(normalizeSettings({ maxCharacters: 1 }).maxCharacters).toBe(50);
    expect(normalizeSettings({ maxCharacters: 812.6 }).maxCharacters).toBe(813);
    expect(normalizeSettings({ maxCharacters: Number.NaN }).maxCharacters).toBe(
      DEFAULT_SETTINGS.maxCharacters,
    );
  });

  it('accepts regional tags', () => {
    expect(normalizeSettings({ targetLanguage: 'pt-BR' }).targetLanguage).toBe('pt-BR');
  });
});

describe('resolveTargetLanguage', () => {
  it('uses the UI language for auto', () => {
    expect(resolveTargetLanguage(settings(), null, 'vi')).toBe('vi');
    expect(resolveTargetLanguage(settings(), null, 'ja-JP')).toBe('ja');
  });

  it('falls back to English when the UI language is unknown', () => {
    expect(resolveTargetLanguage(settings(), null, '')).toBe('en');
  });

  it('does not translate into the language the text already is', () => {
    expect(resolveTargetLanguage(settings(), 'vi', 'vi-VN')).toBe('en');
    expect(resolveTargetLanguage(settings(), 'ja', 'vi')).toBe('vi');
  });

  it('keeps an explicit target', () => {
    expect(resolveTargetLanguage(settings({ targetLanguage: 'ja' }), 'en', 'vi')).toBe('ja');
  });

  it('ignores an explicit target equal to the source language', () => {
    expect(resolveTargetLanguage(settings({ targetLanguage: 'ja' }), 'ja', 'vi')).toBe('vi');
    expect(resolveTargetLanguage(settings({ targetLanguage: 'zh-Hans' }), 'zh', 'en')).toBe('en');
  });
});

describe('describeTargetLanguage', () => {
  it('labels auto and known tags, and passes unknown tags through', () => {
    expect(describeTargetLanguage(AUTO_TARGET)).toBe('Auto (browser language)');
    expect(describeTargetLanguage('vi')).toBe('Tiếng Việt');
    expect(describeTargetLanguage('xx')).toBe('xx');
  });
});
