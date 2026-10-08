/**
 * Styles for the in-page popup, injected into its shadow root.
 *
 * They are a plain string rather than a `.css` import because the shadow root
 * is created imperatively-ish: `createShadowRootUi` takes the CSS text, and a
 * string keeps the whole look in one reviewable place.
 *
 * Everything is sized in `px` on purpose: WXT resets `all: initial` on the
 * host, but `rem` would still be resolved against the *page's* root font size.
 */

/** Colour tokens, `data-theme` on the wrapper decides which set applies. */
const TOKENS = `
.qt-root[data-theme='light'] {
  --qt-bg: #ffffff;
  --qt-fg: #1b1b1f;
  --qt-muted: #6b7280;
  --qt-border: #e4e4e7;
  --qt-hover: #f4f4f5;
  --qt-accent: #1d4ed8;
  --qt-accent-fg: #ffffff;
  --qt-error: #b91c1c;
  --qt-shadow: 0 12px 32px rgb(15 23 42 / 18%);
}
.qt-root[data-theme='dark'] {
  --qt-bg: #1e1e22;
  --qt-fg: #f4f4f5;
  --qt-muted: #a1a1aa;
  --qt-border: #3f3f46;
  --qt-hover: #2c2c33;
  --qt-accent: #7dd3fc;
  --qt-accent-fg: #0c1424;
  --qt-error: #fca5a5;
  --qt-shadow: 0 12px 32px rgb(0 0 0 / 55%);
}
`;

/** The wrapper is a 0x0 anchor layer; surfaces position themselves inside it. */
const LAYOUT = `
.qt-root {
  position: absolute;
  top: 0;
  left: 0;
  font: 400 13px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.qt-root,
.qt-root * {
  box-sizing: border-box;
}
.qt-surface {
  position: absolute;
  pointer-events: auto;
  user-select: none;
  color: var(--qt-fg);
  background: var(--qt-bg);
  border: 1px solid var(--qt-border);
  box-shadow: var(--qt-shadow);
}
.qt-hidden {
  visibility: hidden;
}
`;

/** The panel itself. */
const PANEL = `
.qt-panel {
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - 16px));
  max-height: min(420px, calc(100vh - 32px));
  border-radius: 10px;
  overflow: hidden;
}
.qt-header,
.qt-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  flex: 0 0 auto;
}
.qt-header {
  border-bottom: 1px solid var(--qt-border);
}
.qt-footer {
  border-top: 1px solid var(--qt-border);
}
.qt-languages {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--qt-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qt-spacer {
  flex: 1 1 auto;
}
.qt-body {
  flex: 1 1 auto;
  padding: 9px 10px;
  overflow: auto;
  user-select: text;
}
.qt-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--qt-muted);
}
.qt-translation {
  margin: 0;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.qt-source {
  margin: 0 0 7px;
  font-size: 12px;
  color: var(--qt-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.qt-error {
  margin: 0;
  color: var(--qt-error);
}
.qt-error-code {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--qt-muted);
}
.qt-note {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--qt-muted);
}
`;

/** Readings: native script above the text (ruby) or as a flat latin line. */
const READING = `
.qt-reading {
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px dashed var(--qt-border);
}
.qt-ruby {
  font-size: 15px;
  line-height: 1.95;
  overflow-wrap: anywhere;
}
.qt-ruby rt {
  font-size: 10px;
  color: var(--qt-accent);
}
.qt-roman {
  margin: 0;
  font-size: 12.5px;
  color: var(--qt-accent);
  overflow-wrap: anywhere;
}
.qt-reading-label {
  margin: 0 0 2px;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--qt-muted);
}
`;

/** Buttons, spinner and the model download bar. */
const CONTROLS = `
.qt-button {
  font: inherit;
  font-size: 11.5px;
  line-height: 1.4;
  padding: 3px 7px;
  color: var(--qt-fg);
  background: transparent;
  border: 1px solid var(--qt-border);
  border-radius: 7px;
  cursor: pointer;
}
.qt-button:hover:not(:disabled) {
  border-color: var(--qt-accent);
  color: var(--qt-accent);
}
.qt-button:disabled {
  opacity: 0.45;
  cursor: default;
}
.qt-button[aria-pressed='true'] {
  color: var(--qt-accent-fg);
  background: var(--qt-accent);
  border-color: var(--qt-accent);
}
.qt-icon-button {
  padding: 2px 6px;
  font-size: 13px;
  line-height: 1;
}
.qt-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--qt-border);
  border-top-color: var(--qt-accent);
  border-radius: 50%;
  animation: qt-spin 0.8s linear infinite;
}
@keyframes qt-spin {
  to {
    transform: rotate(360deg);
  }
}
.qt-progress {
  height: 3px;
  margin-top: 7px;
  border-radius: 2px;
  background: var(--qt-border);
  overflow: hidden;
}
.qt-progress-value {
  display: block;
  height: 100%;
  background: var(--qt-accent);
}
`;

/** The little button that offers to translate a fresh selection. */
const PILL = `
.qt-pill {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.qt-pill:hover {
  border-color: var(--qt-accent);
  color: var(--qt-accent);
}
.qt-pill-glyph {
  font-size: 11px;
}
`;

/** Everything the shadow root needs; order matters only for readability. */
export const POPUP_CSS = [TOKENS, LAYOUT, PANEL, READING, CONTROLS, PILL]
  .map((block) => block.trim())
  .join('\n');

