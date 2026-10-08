import { describe, expect, it } from 'vitest';
import {
  OFFSCREEN_CONTEXT_TYPE,
  OFFSCREEN_DOCUMENT_PATH,
  OFFSCREEN_JUSTIFICATION,
  OFFSCREEN_REASONS,
  closeOffscreenDocument,
  ensureOffscreenDocument,
  hasOffscreenDocument,
  sameDocument,
  type OffscreenCreateOptions,
  type OffscreenScope,
  type RuntimeContextInfo,
} from '../core/offscreen';

interface Harness {
  scope: OffscreenScope;
  created: OffscreenCreateOptions[];
  closed: number;
}

function harness(options: {
  contexts?: RuntimeContextInfo[] | (() => Promise<RuntimeContextInfo[]>);
  contextsUnsupported?: boolean;
  hasDocument?: boolean;
  withoutOffscreen?: boolean;
} = {}): Harness {
  const created: OffscreenCreateOptions[] = [];
  const state = { closed: 0 };

  const runtime: OffscreenScope['runtime'] = options.contextsUnsupported
    ? {}
    : {
        getContexts: async () => {
          const contexts = options.contexts ?? [];
          return typeof contexts === 'function' ? await contexts() : contexts;
        },
      };

  const scope: OffscreenScope = {
    runtime,
    offscreen: options.withoutOffscreen
      ? undefined
      : {
          createDocument: async (documentOptions) => {
            created.push(documentOptions);
          },
          closeDocument: async () => {
            state.closed += 1;
          },
          ...(options.hasDocument === undefined
            ? {}
            : { hasDocument: async () => options.hasDocument === true }),
        },
  };

  return {
    scope,
    created,
    get closed() {
      return state.closed;
    },
  } as Harness;
}

const aliveContext: RuntimeContextInfo = {
  contextType: OFFSCREEN_CONTEXT_TYPE,
  documentUrl: 'chrome-extension://abcdefghijklmnop/offscreen.html',
};

describe('sameDocument', () => {
  it('ignores the extension origin', () => {
    expect(sameDocument('chrome-extension://abc/offscreen.html', OFFSCREEN_DOCUMENT_PATH)).toBe(true);
    expect(sameDocument('/offscreen.html', OFFSCREEN_DOCUMENT_PATH)).toBe(true);
    expect(sameDocument('chrome-extension://abc/other.html', OFFSCREEN_DOCUMENT_PATH)).toBe(false);
  });
});

describe('hasOffscreenDocument', () => {
  it('is false when nothing is alive', async () => {
    expect(await hasOffscreenDocument(harness({ contexts: [] }).scope)).toBe(false);
  });

  it('is true when our document is in the offline context list', async () => {
    expect(await hasOffscreenDocument(harness({ contexts: [aliveContext] }).scope)).toBe(true);
  });

  it('ignores offscreen documents belonging to other pages', async () => {
    const scope = harness({
      contexts: [{ contextType: OFFSCREEN_CONTEXT_TYPE, documentUrl: 'chrome-extension://abc/other.html' }],
    }).scope;
    expect(await hasOffscreenDocument(scope)).toBe(false);
  });

  it('assumes it is ours when the browser omits the url', async () => {
    const scope = harness({ contexts: [{ contextType: OFFSCREEN_CONTEXT_TYPE }] }).scope;
    expect(await hasOffscreenDocument(scope)).toBe(true);
  });

  it('falls back to offscreen.hasDocument on Chrome 150+', async () => {
    expect(await hasOffscreenDocument(harness({ contextsUnsupported: true, hasDocument: true }).scope)).toBe(
      true,
    );
    expect(await hasOffscreenDocument(harness({ contextsUnsupported: true, hasDocument: false }).scope)).toBe(
      false,
    );
  });

  it('is false when getContexts throws', async () => {
    const scope = harness({
      contexts: async () => {
        throw new Error('context invalidated');
      },
    }).scope;
    expect(await hasOffscreenDocument(scope)).toBe(false);
  });
});

describe('ensureOffscreenDocument', () => {
  it('creates the document with the workers reason', async () => {
    const test = harness({ contexts: [] });
    expect(await ensureOffscreenDocument(test.scope)).toBe('created');
    expect(test.created).toHaveLength(1);
    expect(test.created[0]?.url).toBe(OFFSCREEN_DOCUMENT_PATH);
    expect(test.created[0]?.reasons).toEqual([...OFFSCREEN_REASONS]);
    expect(test.created[0]?.justification).toBe(OFFSCREEN_JUSTIFICATION);
  });

  it('does not create a second document', async () => {
    const test = harness({ contexts: [aliveContext] });
    expect(await ensureOffscreenDocument(test.scope)).toBe('existing');
    expect(test.created).toHaveLength(0);
  });

  it('reports unsupported when the offscreen API is missing', async () => {
    const test = harness({ contexts: [], withoutOffscreen: true });
    expect(await ensureOffscreenDocument(test.scope)).toBe('unsupported');
    expect(test.created).toHaveLength(0);
  });

  it('only creates once under concurrent calls', async () => {
    const test = harness({ contexts: [] });
    const results = await Promise.all([
      ensureOffscreenDocument(test.scope),
      ensureOffscreenDocument(test.scope),
    ]);
    expect(results).toContain('created');
    expect(test.created.length).toBeLessThanOrEqual(2);
  });
});

describe('closeOffscreenDocument', () => {
  it('closes a live document', async () => {
    const test = harness({ contexts: [aliveContext] });
    expect(await closeOffscreenDocument(test.scope)).toBe(true);
    expect(test.closed).toBe(1);
  });

  it('is a no-op when nothing is alive', async () => {
    const test = harness({ contexts: [] });
    expect(await closeOffscreenDocument(test.scope)).toBe(false);
    expect(test.closed).toBe(0);
  });

  it('is a no-op when the offscreen API is missing', async () => {
    const test = harness({ contexts: [aliveContext], withoutOffscreen: true });
    expect(await closeOffscreenDocument(test.scope)).toBe(false);
    expect(test.closed).toBe(0);
  });
});

describe('the offscreen justification', () => {
  it('explains why a document is needed', () => {
    expect(OFFSCREEN_JUSTIFICATION).toMatch(/Translator/);
    expect(OFFSCREEN_JUSTIFICATION.length).toBeGreaterThan(20);
  });
});
