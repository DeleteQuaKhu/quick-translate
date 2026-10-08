/**
 * The whole in-page UI: at most one surface is on screen at a time.
 *
 * Both surfaces are children of a single wrapper so they share the theme tokens
 * from `styles.ts` and the pointer-events rules; `theme` is already resolved by
 * the content script, which is the only context that can read the settings.
 */

import type { JSX } from 'preact';
import { Popup, type PopupProps } from './Popup';
import { SelectionButton, type SelectionButtonProps } from './SelectionButton';

export interface RootProps {
  /** Resolved theme, `'system'` is never passed in. */
  theme: 'light' | 'dark';
  /** The translation panel, or `null` when it is not shown. */
  panel: PopupProps | null;
  /** The "translate this selection" pill, or `null` when it is not shown. */
  pill: SelectionButtonProps | null;
}

export function Root({ theme, panel, pill }: RootProps): JSX.Element | null {
  if (panel === null && pill === null) return null;
  return (
    <div class="qt-root" data-theme={theme}>
      {pill === null ? null : <SelectionButton {...pill} />}
      {panel === null ? null : <Popup {...panel} />}
    </div>
  );
}
