import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

// Docs: https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Quick Translate',
    description:
      'Translate the text you select into an anchored popup, with an optional reading/transliteration toggle.',
    // The built-in Translator and Language Detector APIs used by the offscreen
    // document shipped in Chrome 138, so older versions are not supported.
    minimum_chrome_version: '138',
    permissions: ['storage', 'offscreen', 'contextMenus'],
    // No host permissions: the translation model runs on-device in the
    // extension's offscreen document, never against a remote service.
    action: {
      default_title: 'Quick Translate',
    },
    commands: {
      'translate-selection': {
        suggested_key: {
          default: 'Alt+T',
          mac: 'Alt+T',
        },
        description: 'Translate the current selection',
      },
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
