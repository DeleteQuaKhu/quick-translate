/**
 * The anchored translation panel.
 *
 * Presentation only: every piece of state lives in the content script (a
 * translation outlives individual renders), and every interaction is reported
 * through a callback, so this component can be reasoned about — and later
 * tested — on its own.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ProgressStage } from '../core/messages';
import { describeTargetLanguage } from '../core/settings';
import { baseLanguage } from '../core/text';
import type { Reading, ReadingSkipReason, TranslationError } from '../core/types';
import {
  ReadingView,
  describeProvider,
  hasNativeReading,
  hasRomanization,
  type ReadingMode,
  type VisibleReadingMode,
} from './ReadingView';

export type PanelStatus = 'loading' | 'ready' | 'error';

const STAGE_LABEL: Record<ProgressStage, string> = {
  detect: 'Detecting the language…',
  translate: 'Translating on device…',
  reading: 'Working out the reading…',
  download: 'Downloading the language model…',
};

const SKIP_LABEL: Record<ReadingSkipReason, string> = {
  disabled: 'Reading is off',
  'no-provider': 'No reading helper for this language',
  'provider-unavailable': 'The reading helper is not available',
  'provider-failed': 'The reading helper failed',
};

export interface PopupProps {
  requestId: string;
  status: PanelStatus;
  stage: ProgressStage | null;
  /** Model download progress in `[0, 1]`, `null` when unknown. */
  progress: number | null;
  sourceText: string;
  truncated: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  reading: Reading | null;
  readingSkipped: ReadingSkipReason | null;
  error: TranslationError | null;
  readingByDefault: boolean;
  preferRomanization: boolean;
  /** Viewport coordinates of the panel, `ready: false` on the first paint. */
  top: number;
  left: number;
  ready: boolean;
  onClose: () => void;
  onRetry: () => void;
  onRequestReading: () => void;
}

/** Which reading variant to show when a new result arrives. */
function initialMode(props: PopupProps): ReadingMode {
  if (!props.readingByDefault) return 'off';
  if (props.reading === null) return 'off';
  const native = hasNativeReading(props.reading);
  const roman = hasRomanization(props.reading);
  if (props.preferRomanization ? roman : native) return props.preferRomanization ? 'roman' : 'native';
  return native ? 'native' : 'roman';
}

export function Popup(props: PopupProps): JSX.Element {
  const [mode, setMode] = useState<ReadingMode>(() => initialMode(props));
  const [copied, setCopied] = useState(false);

  // A new translation starts from the user's defaults again.
  useEffect(() => {
    setMode(initialMode(props));
    setCopied(false);
  }, [props.requestId, props.reading, props.readingByDefault, props.preferRomanization]);

  const { reading } = props;
  const native = reading !== null && hasNativeReading(reading);
  const roman = reading !== null && hasRomanization(reading);
  const visible: VisibleReadingMode | null =
    reading === null || mode === 'off'
      ? null
      : mode === 'native' && !native
        ? 'roman'
        : mode === 'roman' && !roman
          ? 'native'
          : mode;
  const canAskForReading =
    reading !== null || props.readingSkipped === null || props.readingSkipped === 'disabled';

  function toggleReading(variant: VisibleReadingMode): void {
    if (reading === null) {
      props.onRequestReading();
      return;
    }
    setMode((previous) => (previous === variant ? 'off' : variant));
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(props.translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // A page without the clipboard permission (http://) just cannot copy.
    }
  }

  const languages = `${baseLanguage(props.sourceLanguage) || '??'} → ${
    props.targetLanguage === '' ? '??' : describeTargetLanguage(props.targetLanguage)
  }`;

  return (
    <div
      class={`qt-surface qt-panel${props.ready ? '' : ' qt-hidden'}`}
      data-qt-surface="panel"
      role="dialog"
      aria-label="Translation"
      style={{ top: `${props.top}px`, left: `${props.left}px` }}
    >
      <div class="qt-header">
        <span class="qt-languages">{languages}</span>
        <span class="qt-spacer" />
        {props.status === 'ready' ? (
          <button
            type="button"
            class="qt-button"
            title="Copy the translation"
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
        <button
          type="button"
          class="qt-button qt-icon-button"
          title="Close"
          aria-label="Close"
          onClick={props.onClose}
        >
          ✕
        </button>
      </div>

      <div class="qt-body">{renderBody(props, visible)}</div>

      {renderFooter(props, {
        mode,
        native,
        roman,
        canAskForReading,
        onToggle: toggleReading,
      })}
    </div>
  );
}


/** The middle of the panel: a spinner, an error or the translation itself. */
function renderBody(props: PopupProps, visible: VisibleReadingMode | null): JSX.Element {
  if (props.status === 'loading') {
    const label = props.stage === null ? 'Translating…' : STAGE_LABEL[props.stage];
    const percent =
      props.stage === 'download' && props.progress !== null
        ? `${Math.round(props.progress * 100)}%`
        : null;
    return (
      <>
        <div class="qt-loading">
          <span class="qt-spinner" aria-hidden="true" />
          <span>{percent === null ? label : `${label} ${percent}`}</span>
        </div>
        {percent === null ? null : (
          <div class="qt-progress">
            <span class="qt-progress-value" style={{ width: percent }} />
          </div>
        )}
      </>
    );
  }

  if (props.status === 'error') {
    return (
      <p class="qt-error">
        {props.error?.message ?? 'The translation failed.'}
        <span class="qt-error-code">{props.error?.code ?? 'internal'}</span>
      </p>
    );
  }

  return (
    <>
      <p class="qt-source" title={props.sourceText}>
        {props.sourceText}
      </p>
      <p class="qt-translation">{props.translatedText}</p>
      {visible !== null && props.reading !== null ? (
        <ReadingView reading={props.reading} mode={visible} />
      ) : null}
      {renderNotes(props)}
    </>
  );
}

/** Small print under the translation: truncation and skipped readings. */
function renderNotes(props: PopupProps): JSX.Element | null {
  const notes: string[] = [];
  if (props.truncated) notes.push('The selection was cut down to the length limit in the settings.');
  if (props.readingSkipped !== null && props.readingSkipped !== 'disabled') {
    notes.push(SKIP_LABEL[props.readingSkipped]);
  }
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((note) => (
        <p class="qt-note" key={note}>
          {note}
        </p>
      ))}
    </>
  );
}

interface FooterState {
  /** What the user chose, `'off'` when the reading is hidden. */
  mode: ReadingMode;
  native: boolean;
  roman: boolean;
  /** `false` when a reading is impossible here (and asking again is pointless). */
  canAskForReading: boolean;
  onToggle: (variant: VisibleReadingMode) => void;
}

function renderReadingControls(props: PopupProps, footer: FooterState): JSX.Element {
  if (props.status !== 'ready') return <></>;

  if (props.reading === null) {
    const title =
      props.readingSkipped === null ? 'Ask for a reading' : SKIP_LABEL[props.readingSkipped];
    return (
      <button
        type="button"
        class="qt-button"
        disabled={!footer.canAskForReading}
        title={title}
        aria-pressed="false"
        onClick={() => footer.onToggle('native')}
      >
        Reading
      </button>
    );
  }

  const provider = describeProvider(props.reading.provider);
  return (
    <>
      <button
        type="button"
        class="qt-button"
        disabled={!footer.native}
        title={footer.native ? `${provider}: click again to hide it` : 'No native reading available'}
        aria-pressed={footer.mode === 'native' ? 'true' : 'false'}
        onClick={() => footer.onToggle('native')}
      >
        {provider}
      </button>
      {footer.roman ? (
        <button
          type="button"
          class="qt-button"
          title="Romanization: click again to hide it"
          aria-pressed={footer.mode === 'roman' ? 'true' : 'false'}
          onClick={() => footer.onToggle('roman')}
        >
          Roman
        </button>
      ) : null}
    </>
  );
}

function renderFooter(props: PopupProps, footer: FooterState): JSX.Element {
  return (
    <div class="qt-footer">
      {renderReadingControls(props, footer)}
      <span class="qt-spacer" />
      {props.status === 'error' ? (
        <button type="button" class="qt-button" onClick={props.onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

