import { defineConfig } from 'vitest/config';

// The core modules are deliberately DOM-free, so the tests run in plain Node.
// The reading providers (pinyin-pro, wanakana, hangul-romanization) are pure
// JavaScript and therefore testable here too; kuromoji and the phonemizer are
// injected instead of loaded.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
  },
});
