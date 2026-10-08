import type { Reading, ReadingProviderId, ReadingToken } from '../types';

/** Join one token field, skipping the tokens that have no value for it. */
export function joinTokens(tokens: readonly ReadingToken[], field: 'reading' | 'roman'): string {
  const parts: string[] = [];
  for (const token of tokens) {
    const value = token[field];
    if (typeof value === 'string' && value.trim() !== '') parts.push(value);
  }
  return parts.join(' ');
}

/** Assemble a {@link Reading}, deriving the joined strings from the tokens. */
export function buildReading(
  provider: ReadingProviderId,
  language: string,
  tokens: ReadingToken[],
): Reading {
  return {
    provider,
    language,
    tokens,
    reading: joinTokens(tokens, 'reading'),
    romanization: joinTokens(tokens, 'roman'),
  };
}

/** The one-line summary shown next to the toggle: romanization first. */
export function summarizeReading(reading: Reading, preferRomanization: boolean): string {
  if (preferRomanization) return reading.romanization || reading.reading;
  return reading.reading || reading.romanization;
}
