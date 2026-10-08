# Third-party notices

Quick Translate is mostly other people's code in a thin wrapper. This file says
who wrote what, under which licence, and where the awkward corners are.
Versions are the ranges from `package.json`; the resolved versions are in
`package-lock.json`.

## Bundled in the built extension

| Component | Version | Licence | Used for |
| --- | --- | --- | --- |
| [preact](https://github.com/preactjs/preact) | ^10.29.8 | MIT | the in-page panel and the settings popup |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) | ^3.29.4 | MIT | Mandarin readings (`zh-pinyin`) |
| [wanakana](https://github.com/WaniKani/WanaKana) | ^5.3.1 | MIT | kana ⇄ rōmaji for the Japanese readings |
| [hangul-romanization](https://github.com/otakustay/hangul-romanization) | ^1.0.1 | MIT | Korean romanisation (`ko-romaja`) |
| [@patdx/kuromoji](https://github.com/patdx/kuromoji.js) | ^1.0.4 | Apache-2.0 | Japanese morphology (`ja-furigana`) |
| [phonemizer](https://github.com/xenova/phonemizer.js) | ^1.2.1 | Apache-2.0 | IPA for English, German and French — see the eSpeak section below |

The MIT and Apache-2.0 texts themselves are not copied into the packaged
extension; they sit next to the code in `node_modules/<package>/` (`LICENSE`,
`LICENSE-2.0.txt`) and at the links above.

The `Translator` and `LanguageDetector` APIs are Chrome features rather than
bundled code: the models are downloaded and stored by the browser and are
covered by Chrome's own terms. The same goes for `chrome.offscreen`.

### The Japanese dictionary

`ja-furigana` needs kuromoji's morphological dictionary (`dict/*.dat.gz`,
roughly 17 MB over twelve files). It is neither committed to this repository nor
part of the default build — `npm run dict:ja` copies it into
`public/kuromoji-dict/`, and the provider reports itself as unavailable when the
files are missing. The data originates from MeCab's IPA dictionary (IPADIC,
Nara Institute of Science and Technology); see
[MeCab](https://taku910.github.io/mecab/) and
[kuromoji.js](https://github.com/atilika/kuromoji) for that project's terms.

## eSpeak NG — GPL-3.0-or-later (read this before redistributing)

`phonemizer` is Apache-2.0, but it does not implement phonemisation itself: its
bundle embeds [eSpeak NG](https://github.com/espeak-ng/espeak-ng) compiled to
WebAssembly. eSpeak NG is **GNU GPL version 3 or later**, so that part of the
dependency is not Apache-2.0 and not MIT.

What that means in practice:

- The eSpeak NG build is a lazily loaded chunk of its own. It is reached from
  `entrypoints/offscreen/providers.ts` when the `ipa` provider runs, and
  `core/reading/dispatch.ts` refuses that provider unless the user has turned on
  "Add IPA for English, German and French (experimental)" —
  `DEFAULT_SETTINGS.enableExperimentalIpa` is `false`.
- It is still part of the packaged extension, so shipping a build of this
  extension means shipping a GPL-3.0-or-later binary. If you distribute the
  extension (with IPA usable, or in the default configuration), honour the GPL:
  keep the licence text with the distribution and point users at the
  corresponding source — eSpeak NG's is the project linked above, and this
  repository is the source for the extension itself.
- Anyone who would rather not deal with that can remove the `phonemizer`
  dependency, the `ipa` provider and the `enableExperimentalIpa` setting;
  nothing else depends on them.

None of the above is legal advice.

## Development-only tooling

Not part of the built extension, listed for completeness:
[WXT](https://github.com/wxt-dev/wxt) (MIT),
[Vite](https://github.com/vitejs/vite) (MIT),
[Vitest](https://github.com/vitest-dev/vitest) (MIT),
[@preact/preset-vite](https://github.com/preactjs/preset-vite) (MIT),
[TypeScript](https://github.com/microsoft/TypeScript) (Apache-2.0) and
[@types/chrome](https://github.com/DefinitelyTyped/DefinitelyTyped) (MIT).

When you add a dependency, add a row above — and a note in `core/settings.ts`
(and here) if it is optional or carries a copyleft licence.

