/**
 * Korean readings: Revised Romanization of the hangul, word by word so that
 * the (context sensitive) assimilation rules are applied inside each word.
 */

import * as hangulRomanization from 'hangul-romanization';
import type { Reading, ReadingToken } from '../types';
import { buildReading } from './shared';

const HANGUL = /\p{Script=Hangul}/u;

/** `convert(text)` from `hangul-romanization`. */
export type HangulConvertFn = (text: string) => string;

/**
 * `hangul-romanization` is a CommonJS bundle (`exports.convert`), so depending
 * on the bundler's interop the callable can sit on the namespace, on the
 * default export, or on `default.convert`. Probe all three lazily.
 */
export function resolveHangulConverter(module: unknown): HangulConvertFn | null {
  if (typeof module !== 'object' || module === null) return null;
  const namespace = module as { convert?: unknown; default?: unknown };
  const candidates = [
    namespace.convert,
    namespace.default,
    typeof namespace.default === 'object' && namespace.default !== null
      ? (namespace.default as { convert?: unknown }).convert
      : undefined,
  ];
  return (candidates.find((candidate) => typeof candidate === 'function') as HangulConvertFn) ?? null;
}

let cachedConverter: HangulConvertFn | null | undefined;

/** Romanize a run of hangul using the Revised Romanization rules. */
export function romanizeHangul(text: string): string {
  if (cachedConverter === undefined) cachedConverter = resolveHangulConverter(hangulRomanization);
  return cachedConverter === null ? text : cachedConverter(text);
}

/** Word / whitespace / punctuation chunks, romanized where hangul is found. */
export function createKoTokens(text: string): ReadingToken[] {
  const chunks = text.match(/\s+|[^\s]+/gu) ?? [];
  return chunks.map((chunk) => {
    if (!HANGUL.test(chunk)) return { text: chunk };
    return { text: chunk, roman: romanizeHangul(chunk) };
  });
}

export function createKoReading(text: string, language = 'ko'): Reading {
  return buildReading('ko-romaja', language, createKoTokens(text));
}
