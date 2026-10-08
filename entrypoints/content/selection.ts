/**
 * Reading the page's selection.
 *
 * All the DOM access needed to capture a selection lives here so the content
 * script entrypoint stays about the popup's state machine. Everything returned
 * is plain data plus a cloned `Range`: the range is what keeps the popup glued
 * to the text while the page scrolls.
 */

import { toRect, type Rect } from '../../core/anchor';
import { isProbablyTranslatable, normalizeSelection } from '../../core/text';

export interface SelectionSnapshot {
  /** Normalized, non-empty text, still at its full length. */
  text: string;
  /** Bounding rect of the selection, in viewport coordinates. */
  rect: Rect;
  /** Clone of the selection's range, used to follow it later. */
  range: Range | null;
}

/** `true` when `node` is one of our hosts or lives inside one of them. */
function isOurs(node: Node | null, hosts: readonly Element[]): boolean {
  if (node === null) return false;
  return hosts.some((host) => host === node || host.contains(node));
}

/**
 * The rect to anchor on: the *last* line of the selection, so a multi-line
 * selection does not put the popup miles away from where the user stopped.
 */
function anchorRect(range: Range): Rect | null {
  const rects = range.getClientRects();
  const last = rects.length > 0 ? rects[rects.length - 1] : undefined;
  if (last !== undefined && (last.width > 0 || last.height > 0)) return toRect(last);

  const bounds = range.getBoundingClientRect();
  if (bounds.width > 0 || bounds.height > 0) return toRect(bounds);
  return null;
}

/** Safely re-derive a rect from a range captured earlier. */
function rectOfRange(range: Range): Rect | null {
  if (!range.commonAncestorContainer.isConnected) return null;
  try {
    return anchorRect(range);
  } catch {
    // A range whose nodes have been removed throws in some engines.
    return null;
  }
}

/** The current selection, or `null` when there is nothing worth translating. */
export function readSelection(hosts: readonly Element[]): SelectionSnapshot | null {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (isOurs(selection.anchorNode, hosts) || isOurs(selection.focusNode, hosts)) return null;

  const text = normalizeSelection(selection.toString());
  if (text === '' || !isProbablyTranslatable(text)) return null;

  const range = selection.getRangeAt(0).cloneRange();
  const rect = anchorRect(range);
  if (rect === null) return null;
  return { text, rect, range };
}

/** Where the anchored text is now; `null` when it (or its whole document) went away. */
export function rectOf(range: Range | null): Rect | null {
  if (range === null) return null;
  return rectOfRange(range);
}
