/**
 * Japanese readings: hiragana furigana (from kuromoji's katakana readings)
 * plus romaji, produced by `wanakana`.
 *
 * The morphological analysis itself is injected: the offscreen document
 * supplies a real kuromoji tokenizer, tests supply fixtures.
 */

import { toHiragana, toRomaji } from 'wanakana';
import type { Reading, ReadingToken } from '../types';
import { buildReading } from './shared';

/** The subset of kuromoji's `IpadicFeatures` this provider reads. */
export interface JaMorphToken {
  surface_form: string;
  reading?: string | undefined;
  pos?: string | undefined;
}

/** kuromoji's part of speech for punctuation. */
const PUNCTUATION_POS = '記号';
const KATAKANA_ONLY = /^[\u30A1-\u30FA\u30FC]+$/u;

/** `true` when the token has a katakana reading that differs from its surface. */
export function isFuriganaReadable(token: JaMorphToken): boolean {
  const reading = token.reading;
  if (typeof reading !== 'string' || reading === '' || reading === '*') return false;
  if (!KATAKANA_ONLY.test(reading)) return false;
  return reading !== token.surface_form;
}

export function createJaTokens(tokens: readonly JaMorphToken[]): ReadingToken[] {
  return tokens.map((token) => {
    if (token.pos === PUNCTUATION_POS) return { text: token.surface_form };

    if (isFuriganaReadable(token)) {
      const reading = token.reading as string;
      return { text: token.surface_form, reading: toHiragana(reading), roman: toRomaji(reading) };
    }

    if (KATAKANA_ONLY.test(token.surface_form)) {
      return {
        text: token.surface_form,
        reading: toHiragana(token.surface_form),
        roman: toRomaji(token.surface_form),
      };
    }

    return { text: token.surface_form };
  });
}

export function buildJaReading(tokens: readonly JaMorphToken[], language = 'ja'): Reading {
  return buildReading('ja-furigana', language, createJaTokens(tokens));
}
