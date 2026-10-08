import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANCHOR_GAP,
  clamp,
  computeAnchorPosition,
  rectsIntersect,
  toRect,
} from '../core/anchor';

const viewport = { width: 1000, height: 800 };
const popup = { width: 300, height: 120 };

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns the minimum when the range is inverted', () => {
    expect(clamp(5, 10, 0)).toBe(10);
  });
});

describe('computeAnchorPosition', () => {
  it('prefers below and centres on the selection', () => {
    const result = computeAnchorPosition({
      anchor: { top: 100, left: 100, width: 200, height: 20 },
      popup,
      viewport,
    });

    expect(result.placement).toBe('below');
    expect(result.top).toBe(100 + 20 + DEFAULT_ANCHOR_GAP);
    expect(result.left).toBe(50);
  });

  it('flips above when there is no room below', () => {
    const result = computeAnchorPosition({
      anchor: { top: 700, left: 100, width: 200, height: 20 },
      popup,
      viewport,
    });

    expect(result.placement).toBe('above');
    expect(result.top).toBe(700 - DEFAULT_ANCHOR_GAP - 120);
  });

  it('stays below and clamps when neither side fits', () => {
    const result = computeAnchorPosition({
      anchor: { top: 50, left: 10, width: 10, height: 10 },
      popup: { width: 300, height: 180 },
      viewport: { width: 1000, height: 200 },
      margin: 8,
    });

    expect(result.placement).toBe('below');
    expect(result.top).toBe(12);
  });

  it('clamps horizontally against both viewport edges', () => {
    const wide = computeAnchorPosition({
      anchor: { top: 10, left: 500, width: 10, height: 10 },
      popup: { width: 2000, height: 100 },
      viewport,
    });
    expect(wide.left).toBe(8);

    const left = computeAnchorPosition({
      anchor: { top: 10, left: -200, width: 10, height: 10 },
      popup,
      viewport,
    });
    expect(left.left).toBe(8);
  });

  it('honours align: start and a custom gap', () => {
    const result = computeAnchorPosition({
      anchor: { top: 100, left: 400, width: 200, height: 20 },
      popup,
      viewport,
      align: 'start',
      gap: 20,
    });

    expect(result.left).toBe(400);
    expect(result.top).toBe(140);
  });
});

describe('rectsIntersect', () => {
  it('detects overlaps', () => {
    expect(rectsIntersect({ top: 0, left: 0, width: 10, height: 10 }, { top: 5, left: 5, width: 10, height: 10 })).toBe(
      true,
    );
  });

  it('treats touching edges as separate', () => {
    expect(rectsIntersect({ top: 0, left: 0, width: 10, height: 10 }, { top: 10, left: 0, width: 10, height: 10 })).toBe(
      false,
    );
  });
});

describe('toRect', () => {
  it('copies the four geometry fields from a DOMRect-like object', () => {
    expect(toRect({ top: 1, left: 2, width: 3, height: 4 })).toEqual({ top: 1, left: 2, width: 3, height: 4 });
  });
});
