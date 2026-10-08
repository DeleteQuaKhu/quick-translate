/**
 * The content script: selection capture plus the anchored popup.
 *
 * What it does, in the order it happens:
 *
 * 1. watch the page for a fresh selection and offer the little translate pill,
 * 2. turn that selection into a `translate` request for the service worker,
 * 3. render whatever comes back in a shadow-DOM panel anchored to the text,
 * 4. keep the panel glued to the selection while the page scrolls or resizes.
 *
 * It never talks to the AI APIs itself: those only exist in the offscreen
 * document, and results reach us through the service worker because
 * `runtime.sendMessage` cannot address a content script.
 */

import { h, render } from 'preact';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import type { PopupProps } from '../../components/Popup';
import { Root, type RootProps } from '../../components/Root';
import { POPUP_CSS } from '../../components/styles';
import { computeAnchorPosition, type Rect } from '../../core/anchor';
import {
  MESSAGE_SOURCE,
  createRequestId,
  isTranslateCommandMessage,
  isTranslateResult,
  isTranslationProgress,
  matchesRequest,
  type ProgressStage,
  type TranslateRequest,
  type TranslateResult,
} from '../../core/messages';
import { AUTO_TARGET, DEFAULT_SETTINGS, type Settings } from '../../core/settings';
import { getSettings, watchSettings } from '../../core/settings-store';
import { prepareSelection } from '../../core/text';
import {
  isReadingSkipReason,
  type Reading,
  type ReadingSkipReason,
  type TranslationError,
} from '../../core/types';
import { readSelection, rectOf, type SelectionSnapshot } from './selection';

/** Above everything a page can put on screen, below the browser's own UI. */
const Z_INDEX = 2_147_483_646;

/** How long a request may run before the panel gives up on it, in ms. */
const RESULT_TIMEOUT_MS = 90_000;

/** How long to wait after a `mouseup` before reading the selection, in ms. */
const SELECTION_DELAY_MS = 10;

/** Everything the panel needs to render; owned and mutated here. */
interface PanelState {
  requestId: string;
  status: PopupProps['status'];
  stage: ProgressStage | null;
  progress: number | null;
  /** The text that was sent, already clamped to the settings' limit. */
  text: string;
  truncated: boolean;
  /** `true` when this request asked the offscreen document for a reading. */
  readingRequested: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  reading: Reading | null;
  readingSkipped: ReadingSkipReason | null;
  error: TranslationError | null;
}

/** What is currently on screen: nothing, the pill, or the panel. */
type View =
  | { kind: 'hidden' }
  | {
      kind: 'pill';
      text: string;
      rect: Rect;
      range: Range | null;
      top: number;
      left: number;
      ready: boolean;
    }
  | {
      kind: 'panel';
      panel: PanelState;
      rect: Rect;
      range: Range | null;
      top: number;
      left: number;
      ready: boolean;
    };

/** The `{ accepted }` answer the service worker sends back straight away. */
function isAccepted(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { accepted?: unknown }).accepted === true
  );
}

async function start(ctx: ContentScriptContext): Promise<void> {
  let settings: Settings = DEFAULT_SETTINGS;
  let ui: ShadowRootContentScriptUi<null> | null = null;
  /** Our host element: a selection inside it is never translated again. */
  let hosts: readonly Element[] = [];
  let currentRequestId: string | null = null;
  let view: View = { kind: 'hidden' };
  let repositionQueued = false;

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** `'system'` is resolved here: only the content script sees the page. */
  function effectiveTheme(): 'light' | 'dark' {
    if (settings.theme !== 'system') return settings.theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function panelProps(open: Extract<View, { kind: 'panel' }>): PopupProps {
    const panel = open.panel;
    return {
      requestId: panel.requestId,
      status: panel.status,
      stage: panel.stage,
      progress: panel.progress,
      sourceText: panel.text,
      truncated: panel.truncated,
      sourceLanguage: panel.sourceLanguage,
      targetLanguage: panel.targetLanguage,
      translatedText: panel.translatedText,
      reading: panel.reading,
      readingSkipped: panel.readingSkipped,
      error: panel.error,
      readingByDefault: settings.readingByDefault,
      preferRomanization: settings.preferRomanization,
      top: open.top,
      left: open.left,
      ready: open.ready,
      onClose: hide,
      onRetry: retry,
      onRequestReading: requestReading,
    };
  }

  /** Draw the current view. Positioning is a second step, see {@link place}. */
  function paint(): void {
    if (ui === null) return;
    if (view.kind === 'hidden') {
      render(null, ui.uiContainer);
      return;
    }
    const theme = effectiveTheme();
    const props: RootProps =
      view.kind === 'pill'
        ? {
            theme,
            panel: null,
            pill: { top: view.top, left: view.left, ready: view.ready, onActivate: activatePill },
          }
        : { theme, pill: null, panel: panelProps(view) };
    render(h(Root, props), ui.uiContainer);
  }

  /** Measure the surface that is on screen, or `null` before the first paint. */
  function measure(): { width: number; height: number } | null {
    const surface = ui?.uiContainer.querySelector('[data-qt-surface]');
    if (surface === null || surface === undefined) return null;
    const rect = surface.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Anchor the surface to the selection. The first paint of every view is
   * hidden (`ready: false`) precisely so that only the positioned result is
   * ever visible: the surface has to be in the DOM to be measured.
   */
  function place(): void {
    if (ui === null || view.kind === 'hidden') return;
    const size = measure();
    if (size === null) return;
    const { top, left } = computeAnchorPosition({
      anchor: view.rect,
      popup: size,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    view = { ...view, top, left, ready: true };
    paint();
  }

  /** Put a view on screen: paint it hidden, measure it, then place it. */
  function show(next: View): void {
    view = next;
    paint();
    place();
  }

  function hide(): void {
    if (view.kind === 'hidden') return;
    view = { kind: 'hidden' };
    currentRequestId = null;
    paint();
  }

  /** Create the shadow root on first use; `false` when the context died. */
  async function ensureUi(): Promise<boolean> {
    if (ui !== null) return true;
    if (ctx.isInvalid) return false;

    const created = await createShadowRootUi<null>(ctx, {
      name: 'quick-translate',
      position: 'modal',
      zIndex: Z_INDEX,
      css: POPUP_CSS,
      // Nothing from inside the popup may leak into the page, and the page must
      // not see our clicks: WXT stops these at the shadow root.
      isolateEvents: ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick'],
      onMount: (container, shadow) => {
        // The layer itself is a full-viewport box: it must never swallow clicks
        // meant for the page. Only the surfaces re-enable pointer events.
        container.style.pointerEvents = 'none';
        // `stopPropagation` stops the page from seeing our keys, but not other
        // listeners on the shadow root, so Escape still closes the panel.
        ctx.addEventListener(shadow, 'keydown', (event) => {
          if ((event as KeyboardEvent).key === 'Escape') hide();
        });
        return null;
      },
    });

    created.mount();
    ui = created;
    hosts = [created.shadowHost];
    return true;
  }

  // -------------------------------------------------------------------------
  // Translating
  // -------------------------------------------------------------------------

  /** Update the open panel, as long as it is still the one being asked about. */
  function applyPanel(requestId: string, update: (panel: PanelState) => PanelState): void {
    if (view.kind !== 'panel' || view.panel.requestId !== requestId) return;
    view = { ...view, panel: update(view.panel) };
    paint();
    place();
  }

  function fail(requestId: string, code: TranslationError['code'], message: string): void {
    applyPanel(requestId, (panel) => ({
      ...panel,
      status: 'error',
      stage: null,
      progress: null,
      error: { code, message },
    }));
  }

  /** Absolute last resort, so a lost message cannot leave the panel spinning. */
  function watch(requestId: string): void {
    ctx.setTimeout(() => {
      if (view.kind !== 'panel' || view.panel.status !== 'loading') return;
      fail(requestId, 'timeout', 'The translation took too long and was given up on.');
    }, RESULT_TIMEOUT_MS);
  }

  async function translate(
    text: string,
    anchor: { rect: Rect; range: Range | null },
    reading: boolean,
  ): Promise<void> {
    // The offscreen document rejects anything past the limit, so clamp first.
    const prepared = prepareSelection(text, settings.maxCharacters);
    if (prepared.text === '') return;
    if (!(await ensureUi())) return;

    const requestId = createRequestId();
    currentRequestId = requestId;
    const request: TranslateRequest = {
      source: MESSAGE_SOURCE,
      target: 'background',
      type: 'translate',
      requestId,
      text: prepared.text,
      // `'auto'` means "no override", the settings decide inside the pipeline.
      ...(settings.targetLanguage === AUTO_TARGET ? {} : { targetLanguage: settings.targetLanguage }),
      reading,
    };

    show({
      kind: 'panel',
      panel: {
        requestId,
        status: 'loading',
        stage: null,
        progress: null,
        text: prepared.text,
        truncated: prepared.truncated,
        readingRequested: reading,
        sourceLanguage: '',
        targetLanguage: '',
        translatedText: '',
        reading: null,
        readingSkipped: null,
        error: null,
      },
      rect: anchor.rect,
      range: anchor.range,
      top: 0,
      left: 0,
      ready: false,
    });
    watch(requestId);

    let answer: unknown;
    try {
      answer = await browser.runtime.sendMessage(request);
    } catch {
      fail(
        requestId,
        'internal',
        'Quick Translate is not running on this page. Reload the page and try again.',
      );
      return;
    }
    if (!isAccepted(answer)) {
      // Every "not accepted" path also relays an error result, so the message
      // for this failure arrives on its own; only a dead worker stays silent.
      fail(requestId, 'internal', 'The extension was reloaded. Reload the page and try again.');
    }
  }

  // -------------------------------------------------------------------------
  // Results coming back
  // -------------------------------------------------------------------------

  function onResult(result: TranslateResult): void {
    if (!result.ok) {
      const error: TranslationError = result.error ?? {
        code: 'internal',
        message: 'The translation failed.',
      };
      fail(result.requestId, error.code, error.message);
      return;
    }

    applyPanel(result.requestId, (panel) => ({
      ...panel,
      status: 'ready',
      stage: null,
      progress: null,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      translatedText: result.translatedText,
      reading: result.reading,
      readingSkipped: isReadingSkipReason(result.readingSkipped) ? result.readingSkipped : null,
      error: null,
    }));
  }

  function onProgress(stage: ProgressStage, progress: number | null): void {
    if (view.kind !== 'panel') return;
    applyPanel(view.panel.requestId, (panel) => ({ ...panel, status: 'loading', stage, progress }));
  }

  /**
   * Results are broadcast to every context and matched by `requestId`, so a
   * result for an older request (or another tab) is simply ignored.
   */
  const onMessage = (message: unknown): undefined => {
    if (isTranslateCommandMessage(message)) {
      onCommand();
      return undefined;
    }
    if (currentRequestId === null) return undefined;
    if (isTranslationProgress(message) && matchesRequest(message, currentRequestId)) {
      onProgress(message.stage, message.progress);
      return undefined;
    }
    if (isTranslateResult(message) && matchesRequest(message, currentRequestId)) {
      onResult(message);
      return undefined;
    }
    return undefined;
  };

  // -------------------------------------------------------------------------
  // Interactions
  // -------------------------------------------------------------------------

  /** The pill was clicked: translate the text it was offered for. */
  function activatePill(): void {
    if (view.kind !== 'pill') return;
    const { text, rect, range } = view;
    void translate(text, { rect, range }, settings.readingByDefault);
  }

  /** The reading was switched on for a result that came back without one. */
  function requestReading(): void {
    if (view.kind !== 'panel') return;
    const { rect, range } = view;
    void translate(view.panel.text, { rect, range }, true);
  }

  function retry(): void {
    if (view.kind !== 'panel') return;
    const { rect, range, panel } = view;
    void translate(panel.text, { rect, range }, panel.readingRequested);
  }

  /** The keyboard shortcut and the context menu both end up here. */
  function onCommand(): void {
    const snapshot = readSelection(hosts);
    if (snapshot === null) return;
    void translate(snapshot.text, snapshot, settings.readingByDefault);
  }

  /** Offer the pill for a fresh selection. */
  async function showPill(snapshot: SelectionSnapshot): Promise<void> {
    if (!(await ensureUi())) return;
    show({
      kind: 'pill',
      text: snapshot.text,
      rect: snapshot.rect,
      range: snapshot.range,
      top: 0,
      left: 0,
      ready: false,
    });
  }

  // -------------------------------------------------------------------------
  // Page events
  // -------------------------------------------------------------------------

  /**
   * A click anywhere on the page dismisses what is open. Clicks inside the
   * shadow root never reach us: WXT stops them at the shadow root boundary.
   */
  function onMouseDown(): void {
    hide();
  }

  /** A fresh selection offers the pill, unless the setting turned it off. */
  function onMouseUp(event: MouseEvent): void {
    if (event.button !== 0 || !settings.showSelectionButton) return;
    // The browser only updates the selection once the mouseup has been
    // handled, so the read has to wait a tick.
    ctx.setTimeout(() => {
      const snapshot = readSelection(hosts);
      if (snapshot === null) return;
      void showPill(snapshot);
    }, SELECTION_DELAY_MS);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') hide();
  }

  function scheduleReposition(): void {
    if (repositionQueued || view.kind === 'hidden') return;
    repositionQueued = true;
    ctx.requestAnimationFrame(() => {
      repositionQueued = false;
      reposition();
    });
  }

  /** Follow the text through scrolls and resizes. One layout read per frame. */
  function reposition(): void {
    if (view.kind === 'hidden') return;
    const rect = rectOf(view.range);
    if (rect === null) {
      // The selected nodes are gone (an SPA re-render, a removed element):
      // floating at the old coordinates would be worse than closing.
      hide();
      return;
    }
    if (view.kind === 'pill') {
      view = { ...view, rect, ready: false };
    } else {
      view = { ...view, rect, ready: false };
    }
    paint();
    place();
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  settings = await getSettings();
  ctx.onInvalidated(
    watchSettings((next) => {
      const buttonTurnedOff = settings.showSelectionButton && !next.showSelectionButton;
      settings = next;
      if (buttonTurnedOff && view.kind === 'pill') hide();
      paint();
    }),
  );

  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));

  // Capture phase, so a page that stops propagation cannot hide its selection.
  ctx.addEventListener(document, 'mousedown', onMouseDown, { capture: true });
  ctx.addEventListener(document, 'mouseup', onMouseUp, { capture: true });
  ctx.addEventListener(document, 'keydown', onKeyDown);
  ctx.addEventListener(window, 'scroll', scheduleReposition, { capture: true });
  ctx.addEventListener(window, 'resize', scheduleReposition);
  // An SPA route change replaces the text under the popup; start over.
  ctx.addEventListener(window, 'wxt:locationchange', hide);

  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  ctx.addEventListener(dark, 'change', () => {
    if (settings.theme === 'system') paint();
  });
}

export default defineContentScript({
  /**
   * The extension has no host permissions and never calls a remote service;
   * this pattern only decides which pages may show the popup.
   */
  matches: ['<all_urls>'],
  // A selection can live in any frame, and the frame is where it must be read.
  allFrames: true,
  runAt: 'document_idle',
  async main(ctx) {
    await start(ctx);
  },
});
