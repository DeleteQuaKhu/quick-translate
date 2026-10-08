/**
 * Runtime messaging helpers shared by the service worker, the offscreen
 * document and the popup.
 *
 * Two Chrome rules shape everything in here:
 *
 * - `runtime.sendMessage` reaches the extension's pages and service worker, but
 *   *never* a page's content script (Chrome's own documentation is explicit
 *   about that). Results therefore have to be relayed with
 *   `tabs.sendMessage`, which is the service worker's job.
 * - right after `offscreen.createDocument()` resolves, the document's module
 *   has not necessarily run yet, so the very first message would be dropped.
 *   {@link sendWithRetry} waits for the listener instead.
 */

import { browser } from 'wxt/browser';
import type { BroadcastMessage } from '../core/messages';
import {
  ensureOffscreenDocument,
  type EnsureOffscreenResult,
  type OffscreenScope,
} from '../core/offscreen';

/** Wait times between delivery attempts, in milliseconds. */
const RETRY_DELAYS_MS: readonly number[] = [0, 25, 50, 100, 200, 400];

/**
 * The real `chrome` namespace, seen through the narrow interface
 * `core/offscreen.ts` is written against (and unit tested with).
 */
export function offscreenScope(): OffscreenScope {
  return browser as unknown as OffscreenScope;
}

/**
 * Make sure the offscreen document exists. Creating it twice is harmless: the
 * helper checks `runtime.getContexts()` first.
 */
export async function ensureOffscreen(): Promise<EnsureOffscreenResult> {
  return ensureOffscreenDocument(offscreenScope());
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Send a message to every other extension context and report whether a
 * listener handled it.
 *
 * Chrome rejects with `Could not establish connection. Receiving end does not
 * exist.` when nothing is listening, which is exactly the situation this retry
 * loop is for.
 */
export async function sendWithRetry(
  message: unknown,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<boolean> {
  for (const wait of delays) {
    if (wait > 0) await delay(wait);
    try {
      await browser.runtime.sendMessage(message);
      return true;
    } catch {
      // No listener (yet); fall through and try the next delay.
    }
  }
  return false;
}

/** Broadcast a result to the extension's pages, ignoring "nobody is open". */
export async function broadcast(message: BroadcastMessage): Promise<void> {
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // No popup is open and no other context is listening: nothing to do.
  }
}

/** Send a message to one content script; `false` when it is not there. */
export async function sendToTab(
  tabId: number,
  message: unknown,
  frameId?: number,
): Promise<boolean> {
  try {
    await browser.tabs.sendMessage(tabId, message, frameId === undefined ? {} : { frameId });
    return true;
  } catch {
    // The frame has no content script (a chrome:// page, the Web Store, a page
    // loaded before the extension) or the whole tab is gone.
    return false;
  }
}
