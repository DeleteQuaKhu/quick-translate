/**
 * The service worker: routing, the keyboard shortcut and the context menu.
 *
 * It owns the three things no other context can do:
 *
 * - keeping the offscreen document alive, because everything that touches the
 *   on-device models has to go through it,
 * - relaying a result back to the content script that asked for it
 *   (`runtime.sendMessage` reaches extension pages, never a content script),
 * - turning the keyboard shortcut and the context menu into a
 *   `translate-command` message, since a selection only exists in the page.
 */

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  MESSAGE_SOURCE,
  createErrorResult,
  isTranslateRequest,
  isTranslateResult,
  isTranslationProgress,
  type BroadcastMessage,
  type OffscreenTranslateRequest,
  type TranslateCommandMessage,
  type TranslateRequest,
} from '../core/messages';
import type { TranslationError } from '../core/types';
import { ensureOffscreen, sendToTab, sendWithRetry } from '../utils/messaging';

const CONTEXT_MENU_ID = 'quick-translate-selection';
const CONTEXT_MENU_TITLE = 'Translate selection';

/** How long a request may wait for its result before it is forgotten. */
const PENDING_TIMEOUT_MS = 120_000;

/** Where the result of one request has to be delivered. */
interface PendingRequest {
  tabId: number;
  frameId: number | undefined;
  createdAt: number;
}

export default defineBackground(() => {
  /** Requests whose result still has to be relayed to a content script. */
  const pending = new Map<string, PendingRequest>();

  function prunePending(now: number): void {
    for (const [requestId, request] of pending) {
      if (now - request.createdAt > PENDING_TIMEOUT_MS) pending.delete(requestId);
    }
  }

  function remember(request: TranslateRequest, tabId: number, frameId: number | undefined): void {
    const now = Date.now();
    prunePending(now);
    pending.set(request.requestId, { tabId, frameId, createdAt: now });
  }

  /**
   * Hand a message to the content script that asked for it. Progress keeps the
   * entry alive, the final result removes it.
   */
  async function deliver(
    requestId: string,
    message: BroadcastMessage,
    keep: boolean,
  ): Promise<void> {
    const request = pending.get(requestId);
    if (!keep) pending.delete(requestId);
    if (request === undefined) return;
    await sendToTab(request.tabId, message, request.frameId);
  }

  async function failRequest(
    requestId: string,
    code: TranslationError['code'],
    message: string,
  ): Promise<void> {
    await deliver(requestId, createErrorResult(requestId, code, message), false);
  }

  /** Ask the offscreen document to run the pipeline; `true` when it accepted. */
  async function forward(
    request: TranslateRequest,
    tabId: number | undefined,
    frameId: number | undefined,
  ): Promise<boolean> {
    if (tabId !== undefined) remember(request, tabId, frameId);

    if ((await ensureOffscreen()) === 'unsupported') {
      await failRequest(
        request.requestId,
        'unsupported-api',
        'This browser does not support offscreen documents, which the on-device translation models need.',
      );
      return false;
    }

    const forwarded: OffscreenTranslateRequest = {
      source: MESSAGE_SOURCE,
      target: 'offscreen',
      type: 'translate',
      requestId: request.requestId,
      text: request.text,
      targetLanguage: request.targetLanguage,
      reading: request.reading,
    };
    if (await sendWithRetry(forwarded)) return true;

    await failRequest(
      request.requestId,
      'internal',
      'The translation helper did not start up. Reload the extension and try again.',
    );
    return false;
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (isTranslateRequest(message)) {
      // Answer the content script straight away; the translation itself arrives
      // later as a relayed result.
      void forward(message, sender.tab?.id, sender.frameId).then((accepted) => {
        sendResponse({ accepted });
      });
      return true;
    }

    if (isTranslateResult(message)) {
      void deliver(message.requestId, message, false);
      return undefined;
    }

    if (isTranslationProgress(message)) {
      void deliver(message.requestId, message, true);
      return undefined;
    }

    // Status and download requests are between the popup and the offscreen
    // document; a broadcast coming *from* it is already home.
    return undefined;
  });

  // -------------------------------------------------------------------------
  // Keyboard shortcut and context menu
  // -------------------------------------------------------------------------

  /**
   * The service worker cannot read a page's selection (and has no idea where it
   * is on screen), so the content script is asked to do the work instead.
   */
  async function sendTranslateCommand(
    tabId: number | undefined,
    frameId: number | undefined,
  ): Promise<void> {
    if (tabId === undefined) return;
    const command: TranslateCommandMessage = {
      source: MESSAGE_SOURCE,
      target: 'content',
      type: 'translate-command',
    };
    await sendToTab(tabId, command, frameId);
  }

  browser.commands.onCommand.addListener((command) => {
    if (command !== 'translate-selection') return;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => sendTranslateCommand(tab?.id, undefined));
  });

  function createContextMenu(): void {
    browser.contextMenus.create(
      { id: CONTEXT_MENU_ID, title: CONTEXT_MENU_TITLE, contexts: ['selection'] },
      () => {
        // Re-creating the item after an extension reload reports a duplicate id;
        // reading `lastError` stops Chrome from logging it.
        void browser.runtime.lastError;
      },
    );
  }

  browser.runtime.onInstalled.addListener(createContextMenu);

  // Chrome passes the tab as a separate argument, not inside `info`.
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    void sendTranslateCommand(tab?.id, undefined);
  });
});
