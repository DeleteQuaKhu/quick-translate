/**
 * The little "translate" button offered next to a fresh selection.
 *
 * It lives in the page's shadow root next to the panel so it inherits the same
 * theme and can be positioned with the very same maths.
 */

import type { JSX } from 'preact';

export interface SelectionButtonProps {
  /** Viewport coordinates, already computed by `computeAnchorPosition`. */
  top: number;
  left: number;
  /** `false` while the button's size is still unknown (first paint). */
  ready: boolean;
  onActivate: () => void;
}

export function SelectionButton({
  top,
  left,
  ready,
  onActivate,
}: SelectionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={`qt-surface qt-pill${ready ? '' : ' qt-hidden'}`}
      data-qt-surface="pill"
      style={{ top: `${top}px`, left: `${left}px` }}
      title="Translate the selection (Alt+T)"
      aria-label="Translate the selection"
      // Keeping the default action here would drop the page's selection before
      // the click handler runs, and the page would see a stray click.
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
    >
      <span class="qt-pill-glyph" aria-hidden="true">
        文
      </span>
      A
    </button>
  );
}
