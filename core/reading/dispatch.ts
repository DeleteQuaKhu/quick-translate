/**
 * Picks the reading provider for a language, checks whether it is allowed and
 * runs it.
 *
 * The providers themselves are injected: the offscreen document passes the real
 * pinyin / kuromoji / phonemizer implementations, tests pass fixtures. That
 * keeps this module browser-free (and cheap to unit test) while still being the
 * single place that decides *whether* a reading is attempted.
 */

import type { Settings } from '../settings';
import { baseLanguage } from '../text';
import type { Reading, ReadingOutcome, ReadingProviderId } from '../types';
import { chooseReadingProvider, isProviderEnabled } from './registry';

/** Runs one provider over text that was already normalized by the caller. */
export type ReadingProviderFn = (
  text: string,
  language: string,
) => Reading | null | Promise<Reading | null>;

/** Providers that exist, keyed by id; a missing id means "not installed". */
export type ReadingProviders = Partial<Record<ReadingProviderId, ReadingProviderFn>>;

/** Signature of the `read` dependency the translation pipeline expects. */
export type ReadFn = (
  text: string,
  language: string,
  settings: Settings,
) => Promise<ReadingOutcome>;

export function createReadingDispatcher(providers: ReadingProviders): ReadFn {
  return async function read(text, language, settings) {
    const providerId = chooseReadingProvider(language);
    if (providerId === null) return { reading: null, skipped: 'no-provider' };

    if (!isProviderEnabled(providerId, settings.enableExperimentalIpa)) {
      return { reading: null, skipped: 'disabled' };
    }

    const provider = providers[providerId];
    if (provider === undefined) return { reading: null, skipped: 'provider-unavailable' };

    try {
      const reading = await provider(text, baseLanguage(language));
      if (reading === null) return { reading: null, skipped: 'provider-unavailable' };
      return { reading, skipped: null };
    } catch {
      return { reading: null, skipped: 'provider-failed' };
    }
  };
}
