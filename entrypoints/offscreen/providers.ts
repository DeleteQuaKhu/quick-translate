/**
 * The real reading providers, wired to the bundled libraries.
 *
 * Only the offscreen document loads this module: it is the one context that is
 * neither a worker (no DOM) nor a page the user is browsing.
 *
 * - `pinyin-pro`, `wanakana` and `hangul-romanization` are small and load
 *   together with this module,
 * - `kuromoji` (a 17 MB dictionary) and the `phonemizer` (an eSpeak NG WASM
 *   build) are imported on first use and memoized,
 * - the Japanese dictionary is *not* part of the default bundle, so a missing
 *   dictionary degrades to "no reading" instead of an error. Run
 *   `npm run dict:ja` and reload the extension to enable it (see README).
 */

import type { IpadicFeatures, LoaderConfig } from '@patdx/kuromoji';
import { browser } from 'wxt/browser';
import type { ReadingProviders } from '../../core/reading/dispatch';
import { createIpaReading, type PhonemizeFn } from '../../core/reading/ipa';
import { buildJaReading } from '../../core/reading/ja';
import { createKoReading } from '../../core/reading/ko';
import { createZhReading } from '../../core/reading/zh';
import type { Reading } from '../../core/types';

/** Where `npm run dict:ja` copies kuromoji's gzipped dictionary. */
export const JA_DICTIONARY_PATH = '/kuromoji-dict/';

/** The only part of kuromoji's `Tokenizer` this extension calls. */
interface JaTokenizer {
  tokenize(text: string): IpadicFeatures[];
}

/**
 * kuromoji asks its loader for bare `.dat.gz` names; the dictionary is already
 * stored gzipped inside the extension, so all the loader has to do is read it
 * from our own origin (no network, no host permissions) and inflate it.
 */
function createDictionaryLoader(): LoaderConfig {
  return {
    async loadArrayBuffer(url: string): Promise<ArrayBuffer> {
      const file = url.split('/').pop() ?? url;
      // Annotated, not inferred: `getURL` only accepts the paths that can
      // exist inside the extension package.
      const path: `/kuromoji-dict/${string}` = `${JA_DICTIONARY_PATH}${file}`;
      const response = await fetch(browser.runtime.getURL(path));
      if (!response.ok || response.body === null) {
        throw new Error(`The Japanese dictionary file ${file} is not bundled (${response.status}).`);
      }
      const inflated = response.body.pipeThrough(new DecompressionStream('gzip'));
      return await new Response(inflated).arrayBuffer();
    },
  };
}

let jaTokenizer: Promise<JaTokenizer | null> | null = null;
let phonemize: Promise<PhonemizeFn | null> | null = null;

/**
 * Build kuromoji's tokenizer once. `null` means the dictionary is unavailable,
 * which is reported as `provider-unavailable` rather than as a crash.
 */
function loadJaTokenizer(): Promise<JaTokenizer | null> {
  jaTokenizer ??= import('@patdx/kuromoji')
    .then(({ TokenizerBuilder }) => new TokenizerBuilder({ loader: createDictionaryLoader() }).build())
    .catch(() => null);
  return jaTokenizer;
}

/** Load the eSpeak NG phonemizer once; `null` when the WASM build cannot load. */
function loadPhonemize(): Promise<PhonemizeFn | null> {
  phonemize ??= import('phonemizer')
    .then((module) => (typeof module.phonemize === 'function' ? module.phonemize : null))
    .catch(() => null);
  return phonemize;
}

/**
 * The provider table handed to {@link createReadingDispatcher}. Building it is
 * cheap: the heavy libraries are only touched when a provider is actually used.
 */
export function createReadingProviders(): ReadingProviders {
  return {
    'zh-pinyin': (text, language) => createZhReading(text, language),
    'ko-romaja': (text, language) => createKoReading(text, language),
    'ja-furigana': async (text, language): Promise<Reading | null> => {
      const tokenizer = await loadJaTokenizer();
      if (tokenizer === null) return null;
      return buildJaReading(tokenizer.tokenize(text), language);
    },
    ipa: async (text, language): Promise<Reading | null> => {
      const convert = await loadPhonemize();
      if (convert === null) return null;
      return createIpaReading(text, language, convert);
    },
  };
}
