/**
 * The action popup's entrypoint.
 *
 * Like the content script it owns the state — the stored settings, what this
 * browser can translate and the model downloads — and renders the
 * presentational `components/SettingsPanel`.
 *
 * Unlike the content script it cannot ask a question and wait for the answer in
 * the same breath: the offscreen document *broadcasts* its status and its
 * download progress, so the popup listens for the same messages the content
 * script does and matches them by request id.
 */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { SettingsPanel, type DownloadState } from '../../components/SettingsPanel';
import {
  MESSAGE_SOURCE,
  isDownloadResult,
  isStatusResult,
  isTranslationProgress,
  type DownloadRequest,
  type StatusRequest,
  type StatusResult,
} from '../../core/messages';
import type { Settings, ThemePreference } from '../../core/settings';
import { getSettings, resetSettings, saveSettings, watchSettings } from '../../core/settings-store';
import { baseLanguage } from '../../core/text';
import { ensureOffscreen, sendWithRetry } from '../../utils/messaging';
import './style.css';

const STATUS_REQUEST: StatusRequest = {
  source: MESSAGE_SOURCE,
  target: 'offscreen',
  type: 'status',
};

/** A download's progress is broadcast with the language tag as its request id. */
function downloadRequest(language: string): DownloadRequest {
  return { source: MESSAGE_SOURCE, target: 'offscreen', type: 'download', language };
}

/** Before any download has been asked for. */
const NO_DOWNLOAD: DownloadState = { running: false, progress: null, error: null };

/** Shown when the offscreen document never picked the request up. */
const NO_HELPER = 'The translation helper did not start up. Reload the extension and try again.';

/** Apply the stored theme to the document, following the OS for `'system'`. */
function useAppliedTheme(theme: ThemePreference | null): void {
  useEffect(() => {
    if (theme === null) return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();

    if (theme !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  /**
   * How many times the offscreen document has said something about a language's
   * download. This is what tells "nothing is listening" apart from "the helper
   * is busy and stayed quiet" — see `onDownload`.
   */
  const answers = useRef(new Map<string, number>());

  useAppliedTheme(settings?.theme ?? null);

  const patchDownload = useCallback((tag: string, patch: Partial<DownloadState>) => {
    setDownloads((current) => ({
      ...current,
      [tag]: { ...(current[tag] ?? NO_DOWNLOAD), ...patch },
    }));
  }, []);

  // The stored settings, kept in step with any other tab that changes them.
  useEffect(() => {
    let alive = true;
    void getSettings().then((loaded) => {
      if (alive) setSettings(loaded);
    });
    const stop = watchSettings((next) => setSettings(next));
    return () => {
      alive = false;
      stop();
    };
  }, []);

  // Broadcasts from the offscreen document: the status, and the download's
  // progress and outcome.
  useEffect(() => {
    const listener = (message: unknown): undefined => {
      if (isStatusResult(message)) {
        setStatus(message);
      } else if (isDownloadResult(message)) {
        const tag = baseLanguage(message.language);
        answers.current.set(tag, (answers.current.get(tag) ?? 0) + 1);
        patchDownload(tag, {
          running: false,
          progress: null,
          error: message.error?.message ?? null,
        });
        // A finished download changes what the dropdown claims, so patch the
        // status in place rather than asking for it all over again.
        setStatus((current) =>
          current === null
            ? current
            : { ...current, translator: { ...current.translator, [tag]: message.availability } },
        );
      } else if (isTranslationProgress(message) && message.stage === 'download') {
        const tag = baseLanguage(message.requestId);
        answers.current.set(tag, (answers.current.get(tag) ?? 0) + 1);
        patchDownload(tag, {
          running: true,
          progress: message.progress,
          error: null,
        });
      }
      return undefined;
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [patchDownload]);

  // What can this browser translate? Creating the offscreen document is
  // harmless when the service worker already did it.
  useEffect(() => {
    void (async () => {
      await ensureOffscreen();
      if (!(await sendWithRetry(STATUS_REQUEST))) setProbeFailed(true);
    })();
  }, []);

  const onChange = useCallback((patch: Partial<Settings>) => {
    void saveSettings(patch).then((next) => setSettings(next));
  }, []);

  const onReset = useCallback(() => {
    void resetSettings().then((next) => setSettings(next));
  }, []);

  const onDownload = useCallback(
    (language: string) => {
      const tag = baseLanguage(language);
      const answeredBefore = answers.current.get(tag) ?? 0;
      patchDownload(tag, { running: true, progress: null, error: null });

      void (async () => {
        await ensureOffscreen();
        await sendWithRetry(downloadRequest(language));
        // The offscreen document never answers in place — it broadcasts — so a
        // send that comes back with nothing means "nobody is listening" only
        // when the helper also had nothing to say. Progress and the result are
        // what actually drive the UI; see the listener above.
        if ((answers.current.get(tag) ?? 0) > answeredBefore) return;
        patchDownload(tag, { running: false, progress: null, error: NO_HELPER });
      })();
    },
    [patchDownload],
  );

  if (settings === null) {
    return <p class="qt-loading">Loading the settings…</p>;
  }

  return (
    <SettingsPanel
      settings={settings}
      status={status}
      // The broadcast is the source of truth: a probe that returns nothing is
      // only a failure while no status has arrived at all.
      statusFailed={probeFailed && status === null}
      downloads={downloads}
      onChange={onChange}
      onDownload={onDownload}
      onReset={onReset}
    />
  );
}

const container = document.getElementById('app');
if (container === null) {
  // Only possible if `index.html` lost its container, which is a bug worth
  // failing loudly on rather than rendering a blank popup.
  throw new Error('The popup has no #app container.');
}

render(<App />, container);
