/**
 * WXT's generated `PublicPath` only lists the files that exist in `public/`,
 * but `public/kuromoji-dict/` is filled in by `npm run dict:ja` and the
 * dictionary (17 MB) is deliberately not committed. This augmentation adds the
 * missing prefix so the offscreen document type-checks with *and* without the
 * dictionary installed.
 *
 * The import below is load-bearing: it is what makes this file a module, so
 * the block underneath *augments* `wxt/browser` the way
 * `.wxt/types/paths.d.ts` does. Without it TypeScript treats the block as an
 * ambient declaration that replaces the real module, and every WXT export
 * (`browser`, `Browser`, ...) would go missing.
 */
import 'wxt/browser';

declare module 'wxt/browser' {
  interface WxtRuntime {
    getURL(path: `/kuromoji-dict/${string}`): string;
  }
}
