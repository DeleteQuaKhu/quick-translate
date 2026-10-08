/**
 * Chinese readings: pinyin with tone marks plus the toneless latin form.
 *
 * `pinyin-pro` is fully bundled (no dictionary fetch) and works both in the
 * offscreen document and in tests.
 */

import { pinyin } from 'pinyin-pro';
import type { Reading, ReadingToken } from '../types';
import { buildReading } from './shared';

/** The fields of `pinyin-pro`'s `type: 'all'` output this provider uses. */
interface PinyinEntry {
  origin: string;
  pinyin: string;
  isZh: boolean;
}

const ALL_OPTIONS = { type: 'all', toneSandhi: true } as const;

/** One token per character: source character + toned pinyin + toneless pinyin. */
export function createZhTokens(text: string): ReadingToken[] {
  const toned: PinyinEntry[] = pinyin(text, { ...ALL_OPTIONS, toneType: 'symbol' });
  const toneless: PinyinEntry[] = pinyin(text, { ...ALL_OPTIONS, toneType: 'none' });

  return toned.map((entry, index) => {
    if (!entry.isZh || entry.origin.trim() === '') return { text: entry.origin };

    const token: ReadingToken = { text: entry.origin, reading: entry.pinyin };
    const roman = toneless[index]?.pinyin ?? '';
    if (roman !== '' && roman !== entry.pinyin) token.roman = roman;
    return token;
  });
}

export function createZhReading(text: string, language = 'zh'): Reading {
  return buildReading('zh-pinyin', language, createZhTokens(text));
}
