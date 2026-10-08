/**
 * Anchoring math for the selection popup.
 *
 * Kept free of DOM access so the placement rules can be unit tested: callers
 * pass plain rectangles in viewport coordinates.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Vertical side of the anchor the popup ended up on. */
export type AnchorPlacement = 'below' | 'above';

export interface AnchorInput {
  /** The selection's bounding rect, in viewport coordinates. */
  anchor: Rect;
  /** Measured (or estimated) popup size. */
  popup: Size;
  viewport: Viewport;
  /** Space between the anchor and the popup. */
  gap?: number;
  /** Minimum distance kept from every viewport edge. */
  margin?: number;
  /** Horizontal alignment against the anchor. */
  align?: 'center' | 'start';
}

export interface AnchorResult {
  top: number;
  left: number;
  placement: AnchorPlacement;
}

export const DEFAULT_ANCHOR_GAP = 8;
export const DEFAULT_VIEWPORT_MARGIN = 8;

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Place a popup next to a selection:
 *
 * 1. prefer `below`, flip to `above` when there is no room left below,
 * 2. otherwise clamp inside the viewport so the popup stays usable,
 * 3. horizontally centre it on the selection, clamped to the viewport.
 */
export function computeAnchorPosition(input: AnchorInput): AnchorResult {
  const gap = input.gap ?? DEFAULT_ANCHOR_GAP;
  const margin = input.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const align = input.align ?? 'center';

  const maxLeft = Math.max(margin, input.viewport.width - input.popup.width - margin);
  const centeredLeft = input.anchor.left + input.anchor.width / 2 - input.popup.width / 2;
  const left = clamp(align === 'center' ? centeredLeft : input.anchor.left, margin, maxLeft);

  const belowTop = input.anchor.top + input.anchor.height + gap;
  const aboveTop = input.anchor.top - gap - input.popup.height;
  const fitsBelow = belowTop + input.popup.height <= input.viewport.height - margin;
  const fitsAbove = aboveTop >= margin;

  const placement: AnchorPlacement = fitsBelow || !fitsAbove ? 'below' : 'above';
  const maxTop = Math.max(margin, input.viewport.height - input.popup.height - margin);
  const top = clamp(placement === 'below' ? belowTop : aboveTop, margin, maxTop);

  return { top, left, placement };
}

/** `true` when the two rects overlap, used to ignore clicks inside the popup. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/** Build a {@link Rect} from anything rect-like (eg. a `DOMRect`). */
export function toRect(rect: { top: number; left: number; width: number; height: number }): Rect {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}
