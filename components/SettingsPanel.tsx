/**
 * The action popup: what this browser can translate right now, plus the
 * settings.
 *
 * Like the in-page panel this is presentation only — storage and messaging live
 * in `entrypoints/popup/main.tsx` — so every branch below is a plain function of
 * the props, and the component can be reasoned about (and later tested) on its
 * own.
 */

import type { JSX } from 'preact';
import type { StatusResult } from '../core/messages';
import {
  AUTO_TARGET,
  KNOWN_TARGET_LANGUAGES,
  describeTargetLanguage,
  type Settings,
  type ThemePreference,
} from '../core/settings';
import { MAX_MAX_CHARACTERS, MIN_MAX_CHARACTERS, baseLanguage } from '../core/text';
import type { ModelAvailability } from '../core/types';

/** How far a model download has got, as the popup tracks it. */
export interface DownloadState {
  /** `true` between the request and its `download-result` broadcast. */
  running: boolean;
  /** Latest fraction in `[0, 1]`, `null` while the model reports nothing. */
  progress: number | null;
  /** Set when the download failed. */
  error: string | null;
}

export interface SettingsPanelProps {
  settings: Settings;
  /** `null` until the offscreen document has answered the first status probe. */
  status: StatusResult | null;
  /** `true` when it never answered: no offscreen support, or no listener yet. */
  statusFailed: boolean;
  /** Download state, keyed by base language tag. */
  downloads: Readonly<Record<string, DownloadState>>;
  onChange: (patch: Partial<Settings>) => void;
  onDownload: (language: string) => void;
  onReset: () => void;
}

const AVAILABILITY_LABEL: Record<ModelAvailability, string> = {
  available: 'ready',
  downloadable: 'needs a download',
  downloading: 'downloading',
  unavailable: 'not supported here',
};

const THEMES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Model availability for a language tag, `null` while the status is unknown. */
function availabilityFor(
  status: StatusResult | null,
  language: string,
): ModelAvailability | null {
  if (status === null) return null;
  return status.translator[baseLanguage(language)] ?? null;
}

/** `'Tiếng Việt · ready'`: the dropdown never claims more than the browser. */
function describeEntry(status: StatusResult | null, tag: string, label: string): string {
  const availability = availabilityFor(status, tag);
  return availability === null ? label : `${label} · ${AVAILABILITY_LABEL[availability]}`;
}

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const { settings } = props;

  return (
    <div class="qt-app">
      <header class="qt-header">
        <h1 class="qt-heading">Quick Translate</h1>
        <p class="qt-hint">
          Select text on any page, then press <kbd class="qt-kbd">Alt</kbd>+
          <kbd class="qt-kbd">T</kbd> or use the right-click menu. The translation runs on
          device; nothing is sent anywhere.
        </p>
      </header>

      <section class="qt-group">
        <label class="qt-label" for="qt-target">
          Translate into
        </label>
        <select
          id="qt-target"
          class="qt-input"
          value={settings.targetLanguage}
          onChange={(event) => props.onChange({ targetLanguage: event.currentTarget.value })}
        >
          <option value={AUTO_TARGET}>{describeTargetLanguage(AUTO_TARGET)}</option>
          {KNOWN_TARGET_LANGUAGES.map(({ tag, label }) => (
            <option value={tag} key={tag}>
              {describeEntry(props.status, tag, label)}
            </option>
          ))}
        </select>
        {renderModelRow(props)}
      </section>

      <section class="qt-group">
        {renderToggle('Show a button when I select text', settings.showSelectionButton, (value) =>
          props.onChange({ showSelectionButton: value }),
        )}
        {renderToggle('Show readings by default', settings.readingByDefault, (value) =>
          props.onChange({ readingByDefault: value }),
        )}
        {renderToggle(
          'Prefer romanization (romaji, pinyin) over the native script',
          settings.preferRomanization,
          (value) => props.onChange({ preferRomanization: value }),
        )}
        {renderToggle(
          'Add IPA for English, German and French (experimental)',
          settings.enableExperimentalIpa,
          (value) => props.onChange({ enableExperimentalIpa: value }),
        )}
      </section>

      <section class="qt-group qt-row">
        <label class="qt-label" for="qt-theme">
          Theme
        </label>
        <select
          id="qt-theme"
          class="qt-input qt-input-small"
          value={settings.theme}
          onChange={(event) =>
            props.onChange({ theme: event.currentTarget.value as ThemePreference })
          }
        >
          {THEMES.map(({ value, label }) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </section>

      <section class="qt-group qt-row">
        <label class="qt-label" for="qt-max">
          Longest selection
        </label>
        <input
          id="qt-max"
          class="qt-input qt-input-small"
          type="number"
          min={MIN_MAX_CHARACTERS}
          max={MAX_MAX_CHARACTERS}
          step={50}
          value={settings.maxCharacters}
          // `change`, not `input`: the stored value is clamped, so committing
          // every keystroke would fight the user while they type.
          onChange={(event) => {
            const parsed = Number.parseInt(event.currentTarget.value, 10);
            if (Number.isFinite(parsed)) props.onChange({ maxCharacters: parsed });
          }}
        />
        <span class="qt-units">characters</span>
      </section>

      <footer class="qt-footer">
        <p class={props.statusFailed ? 'qt-status qt-status-bad' : 'qt-status'}>
          {describeStatus(props)}
        </p>
        <button type="button" class="qt-button" onClick={props.onReset}>
          Restore defaults
        </button>
      </footer>
    </div>
  );
}

/** One checkbox row. */
function renderToggle(
  label: string,
  checked: boolean,
  onToggle: (checked: boolean) => void,
): JSX.Element {
  return (
    <label class="qt-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * The model behind the chosen target: ready, downloadable, or out of reach.
 *
 * The `auto` target is resolved per page from Chrome's language, so there is
 * nothing to download for it.
 */
function renderModelRow(props: SettingsPanelProps): JSX.Element {
  const { targetLanguage } = props.settings;

  if (targetLanguage === AUTO_TARGET) {
    return (
      <p class="qt-note">
        Chrome's own language is used, falling back to English when the text is already in it.
      </p>
    );
  }

  const tag = baseLanguage(targetLanguage);
  const label = describeTargetLanguage(tag);
  const download = props.downloads[tag];

  if (download?.running === true) {
    const percent = Math.round((download.progress ?? 0) * 100);
    return (
      <div class="qt-progress">
        <div
          class="qt-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div class="qt-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <p class="qt-note">Downloading the {label} model… {percent}%</p>
      </div>
    );
  }

  if (download?.error != null) {
    return (
      <div class="qt-progress">
        <p class="qt-note qt-status-bad">{download.error}</p>
        <button type="button" class="qt-button" onClick={() => props.onDownload(tag)}>
          Try again
        </button>
      </div>
    );
  }

  const availability = availabilityFor(props.status, tag);
  if (availability === 'available') {
    return <p class="qt-note">{label} is ready — nothing to download.</p>;
  }
  if (availability === null) {
    return <p class="qt-note">Checking whether {label} is ready…</p>;
  }
  if (availability === 'unavailable') {
    return (
      <p class="qt-note qt-status-bad">
        This browser cannot translate into {label} yet. Chrome ships these models
        gradually, so it may simply not have arrived.
      </p>
    );
  }

  // 'downloadable', or 'downloading' because some other page got there first.
  return (
    <div class="qt-progress">
      <button type="button" class="qt-button" onClick={() => props.onDownload(tag)}>
        Download the {label} model
      </button>
      <p class="qt-note">
        Chrome fetches it once and keeps it on this computer, shared with every site.
      </p>
    </div>
  );
}

/** One line about the moving parts: language detection and the readings. */
function describeStatus(props: SettingsPanelProps): string {
  if (props.statusFailed) {
    return 'The extension backend did not answer. Reload it from chrome://extensions and try again.';
  }

  const { status } = props;
  if (status === null) return 'Checking what this browser can translate…';

  const ready = KNOWN_TARGET_LANGUAGES.filter(
    ({ tag }) => status.translator[tag] === 'available',
  ).length;
  const readings = status.readingProviders ? 'ready' : 'unavailable';
  return (
    `Language detection: ${AVAILABILITY_LABEL[status.detector]} · readings: ${readings}` +
    ` · ${ready} of ${KNOWN_TARGET_LANGUAGES.length} languages ready.`
  );
}
