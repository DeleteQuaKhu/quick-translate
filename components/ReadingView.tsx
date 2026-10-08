/**
 * Rendering a {@link Reading} produced by one of the reading providers.
 *
 * Two shapes exist in practice, and the component picks the one the data
 * supports:
 *
 * - per-token readings that are worth putting *above* the text (kana furigana,
 *   pinyin over Han characters) are rendered as `<ruby>`,
 * - everything else (romaji, romaja, IPA phones, a whole-text reading with no
 *   per-token breakdown) is rendered as one latin line.
 */

import type { JSX } from 'preact';
import type { Reading } from '../core/types';

export type ReadingMode = 'native' | 'roman' | 'off';
export type VisibleReadingMode = Exclude<ReadingMode, 'off'>;

/** Providers whose native reading is a script annotation, not a transcription. */
const ANNOTATION_PROVIDERS: ReadonlySet<Reading['provider']> = new Set(['ja-furigana', 'zh-pinyin']);

const PROVIDER_LABEL: Record<Reading['provider'], string> = {
  'zh-pinyin': 'Pinyin',
  'ja-furigana': 'Furigana',
  'ko-romaja': 'Romaja',
  ipa: 'IPA',
};

/** Human label for a provider, eg. `'ja-furigana'` -> `'Furigana'`. */
export function describeProvider(provider: Reading['provider']): string {
  return PROVIDER_LABEL[provider];
}

/** `true` when the provider produced anything to show as the native reading. */
export function hasNativeReading(reading: Reading): boolean {
  return reading.reading !== '' || reading.tokens.some((token) => (token.reading ?? '') !== '');
}

/** `true` when the provider produced anything to show as a romanization. */
export function hasRomanization(reading: Reading): boolean {
  return reading.romanization !== '' || reading.tokens.some((token) => (token.roman ?? '') !== '');
}

/** The variant a `mode` selects, pulled out of one token. */
function variantOf(token: Reading['tokens'][number], mode: VisibleReadingMode): string {
  return (mode === 'native' ? token.reading : token.roman) ?? '';
}

export interface ReadingViewProps {
  reading: Reading;
  mode: VisibleReadingMode;
}

export function ReadingView({ reading, mode }: ReadingViewProps): JSX.Element {
  const label = `${PROVIDER_LABEL[reading.provider]} ${mode === 'roman' ? 'romanization' : 'reading'}`;
  const values = reading.tokens.map((token) => variantOf(token, mode));
  const canAnnotate = mode === 'native' && ANNOTATION_PROVIDERS.has(reading.provider);
  const annotated = canAnnotate && values.some((value) => value !== '');

  if (annotated) {
    return (
      <div class="qt-reading">
        <p class="qt-reading-label">{label}</p>
        <div class="qt-ruby">
          {reading.tokens.map((token, index) => {
            const value = values[index] ?? '';
            if (value === '') return <span key={index}>{token.text}</span>;
            return (
              <ruby key={index}>
                {token.text}
                <rt>{value}</rt>
              </ruby>
            );
          })}
        </div>
      </div>
    );
  }

  const joined = reading.tokens.map((token, index) => values[index] ?? '').join('');
  const flat = joined !== '' ? joined : (mode === 'native' ? reading.reading : reading.romanization);

  return (
    <div class="qt-reading">
      <p class="qt-reading-label">{label}</p>
      <p class="qt-roman">{flat}</p>
    </div>
  );
}
