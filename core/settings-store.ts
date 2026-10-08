/**
 * Settings persistence on top of `chrome.storage.sync`.
 *
 * The value is always run through {@link normalizeSettings} on the way in *and*
 * out, so a corrupt or outdated entry can never reach the rest of the code.
 */

import { storage } from '@wxt-dev/storage';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  normalizeSettings,
  type Settings,
} from './settings';

/** `sync:` keeps the settings in the signed-in Chrome profile. */
export const SETTINGS_ITEM_KEY = `sync:${SETTINGS_STORAGE_KEY}`;

export const settingsItem = storage.defineItem<Settings>(SETTINGS_ITEM_KEY, {
  fallback: DEFAULT_SETTINGS,
  version: SETTINGS_VERSION,
  // Everything written before version 1 was the bare `Settings` shape.
  migrations: {
    0: (oldValue: unknown) => normalizeSettings(oldValue),
  },
});

export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await settingsItem.getValue());
}

/** Merge `patch` into the stored settings and persist the normalized result. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  await settingsItem.setValue(next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  const next = { ...DEFAULT_SETTINGS };
  await settingsItem.setValue(next);
  return next;
}

/** Watch for changes (including from other tabs); returns the unsubscribe fn. */
export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => {
    callback(normalizeSettings(value));
  });
}
