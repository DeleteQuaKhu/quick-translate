# Quick Translate

Select text on any page, press <kbd>Alt</kbd>+<kbd>T</kbd> (or use the
right-click menu), and the translation opens in a small panel anchored to the
selection. Everything runs **on device** through Chrome's built-in Translator and
Language Detector APIs: no server, no account, no `host_permissions` — the only
site access it asks for is the content script that has to read your selection.

## What it does

- An anchored panel next to the selected text, with a *translate* pill that
  appears when you select something (`showSelectionButton`).
- The target language follows your browser's UI language unless you pick one, and
  is never the language the text is already in.
- An optional **reading** under the translation — pinyin, furigana + romaji,
  romaja, or IPA — toggled per panel or switched on by default.
- The action popup shows what this browser can translate right now, per language,
  and downloads a model on request with a progress bar.

| Language | Reading |
| --- | --- |
| Chinese (`zh`) | pinyin |
| Japanese (`ja`) | furigana + romaji (needs the dictionary, see below) |
| Korean (`ko`) | romaja |
| English / German / French | IPA *(experimental, off by default)* |

## Requirements

Chrome 138 or newer: the Translator and Language Detector APIs it uses shipped
then. Chrome downloads each language model the first time it is needed, so the
first translation into a language takes noticeably longer than the rest.

## Install (from source)

```sh
npm install
npm run build          # .output/chrome-mv3
```

Then open `chrome://extensions`, turn on *Developer mode*, choose **Load
unpacked**, and select `.output/chrome-mv3`.

### Japanese readings

`ja-furigana` needs kuromoji's morphological dictionary, ~17 MB, which is not
committed here. Before building:

```sh
npm run dict:ja        # copies node_modules/@patdx/kuromoji/dict/*.dat.gz
npm run build
```

Without it the Japanese provider reports itself as unavailable and Japanese text
simply comes back without a reading; nothing else breaks. See
`public/kuromoji-dict/README.md`.

## Settings

The popup (toolbar icon) holds all of them, and they are stored with
`chrome.storage.sync`:

| Setting | Default | Effect |
| --- | --- | --- |
| Translate into | Auto (browser language) | Target language, or `auto` to follow the browser |
| Show a button when I select text | on | The little *translate* pill next to a selection |
| Show readings by default | on | Whether a new panel starts with the reading visible |
| Prefer romanization over the native script | on | Romaji/pinyin instead of kana/hanzi |
| Add IPA for English, German and French | off | Enables the experimental IPA provider — see the licence note below |
| Theme | System | `System`, `Light` or `Dark`, applied to panel and popup |
| Longest selection | 5000 characters | What is sent to the Translator API; a longer selection is cut down and the panel says so (the setting itself is clamped to 50–20000) |

## Privacy

There is no network code in this extension. The translation, the language
detection and the readings all run in an offscreen document (a service worker has
no DOM, so the models cannot run there); the models themselves are Chrome's, and
Chrome fetches and stores them. Your text never leaves the machine.

## Development

```sh
npm run dev            # WXT dev server with a live-reloading Chrome profile
npm run compile        # tsc --noEmit
npm test               # vitest run
npm run build          # production build in .output/chrome-mv3
npm run zip            # store-ready zip
```

Layout:

- `core/` — protocol, settings, translation pipeline and the reading providers,
  all free of browser APIs so they can be unit tested (see `tests/`).
- `entrypoints/background.ts` — routing, the shortcut and the context menu.
- `entrypoints/offscreen/` — the only context that touches the on-device models.
- `entrypoints/content/` — the in-page panel and the selection handling.
- `entrypoints/popup/` + `components/` — the action popup and the presentational
  panel component both UIs share.

## Licence note

Bundled dependencies and their licences are listed in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Worth knowing before you
redistribute: the experimental IPA provider pulls in `phonemizer`, which embeds
an **eSpeak NG** build, and eSpeak NG is GPL-3.0-or-later rather than Apache-2.0.
It is off by default and loaded lazily, but it is still part of a built package.
