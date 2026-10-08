/**
 * Offscreen document lifecycle.
 *
 * The Translator API, the Language Detector API and the reading helpers all
 * need a DOM-ish, non-worker context, so the service worker spins up a single
 * offscreen document and keeps it alive while it is needed.
 *
 * Chrome's `chrome.offscreen.hasDocument()` only exists from Chrome 150, so
 * `runtime.getContexts()` (Chrome 116+) is used instead; both are injected so
 * the logic can be unit tested.
 */

export const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';

export const OFFSCREEN_JUSTIFICATION =
  'Runs the on-device Translator and Language Detector models plus the bundled ' +
  'reading (transliteration) helpers, none of which are available in a service worker.';

/** `chrome.offscreen.Reason.WORKERS`, kept as a string for testability. */
export const OFFSCREEN_REASONS: readonly string[] = ['WORKERS'];

export const OFFSCREEN_CONTEXT_TYPE = 'OFFSCREEN_DOCUMENT';

export interface OffscreenCreateOptions {
  url: string;
  reasons: readonly string[];
  justification: string;
}

export interface OffscreenApi {
  createDocument(options: OffscreenCreateOptions): Promise<void>;
  closeDocument(): Promise<void>;
  hasDocument?: () => Promise<boolean>;
}

export interface RuntimeContextInfo {
  contextType: string;
  documentUrl?: string;
}

export interface OffscreenScope {
  runtime?: {
    getContexts?: (filter: {
      contextTypes?: string[];
      documentUrls?: string[];
    }) => Promise<RuntimeContextInfo[]>;
  };
  offscreen?: OffscreenApi;
}

export type EnsureOffscreenResult = 'created' | 'existing' | 'unsupported';

function hasOffscreenApi(scope: OffscreenScope): scope is OffscreenScope & { offscreen: OffscreenApi } {
  return (
    typeof scope.offscreen?.createDocument === 'function' &&
    typeof scope.offscreen?.closeDocument === 'function'
  );
}

/** `true` when an offscreen document for `url` is already alive. */
export async function hasOffscreenDocument(
  scope: OffscreenScope,
  url: string = OFFSCREEN_DOCUMENT_PATH,
): Promise<boolean> {
  const getContexts = scope.runtime?.getContexts;
  if (typeof getContexts === 'function') {
    let contexts: readonly RuntimeContextInfo[];
    try {
      contexts = await getContexts.call(scope.runtime, { contextTypes: [OFFSCREEN_CONTEXT_TYPE] });
    } catch {
      // `getContexts` throws when the extension context is being torn down.
      return false;
    }
    // A missing `documentUrl` means "some offscreen document", which is close
    // enough: this extension only ever creates one.
    return contexts.some(
      (context) => context.documentUrl === undefined || sameDocument(context.documentUrl, url),
    );
  }

  if (typeof scope.offscreen?.hasDocument === 'function') {
    return scope.offscreen.hasDocument();
  }

  return false;
}

/**
 * Compare a runtime context URL with our document path. `getContexts` reports
 * fully qualified `chrome-extension://<id>/offscreen.html` URLs, while the
 * document is created with a root-relative path.
 */
export function sameDocument(documentUrl: string, expectedUrl: string): boolean {
  const normalize = (value: string): string => {
    const withoutOrigin = value.replace(/^[a-z-]+:\/\/[^/]+/i, '');
    return withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;
  };
  return normalize(documentUrl) === normalize(expectedUrl);
}

/** Create the offscreen document unless it is already there. */
export async function ensureOffscreenDocument(
  scope: OffscreenScope,
  url: string = OFFSCREEN_DOCUMENT_PATH,
): Promise<EnsureOffscreenResult> {
  if (!hasOffscreenApi(scope)) return 'unsupported';
  if (await hasOffscreenDocument(scope, url)) return 'existing';

  await scope.offscreen.createDocument({
    url,
    reasons: OFFSCREEN_REASONS,
    justification: OFFSCREEN_JUSTIFICATION,
  });
  return 'created';
}

/** Close the offscreen document, `true` when one was actually closed. */
export async function closeOffscreenDocument(scope: OffscreenScope): Promise<boolean> {
  if (!hasOffscreenApi(scope)) return false;
  if (!(await hasOffscreenDocument(scope))) return false;
  await scope.offscreen.closeDocument();
  return true;
}
