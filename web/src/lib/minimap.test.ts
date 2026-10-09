import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  dragScroll,
  layoutStrokes,
  mapOffset,
  proportionalScale,
  scrollTargetFor,
  viewportRect,
  wordKind,
} from './minimap';

describe('proportionalScale', () => {
  it('the content fits the width of the minimap, and that scale also applies to the height', () => {
    expect(proportionalScale(900, 72)).toBeCloseTo(0.08);
  });

  it('narrow content is not enlarged: MAX_SCALE at most', () => {
    expect(proportionalScale(200, 72)).toBe(MAX_SCALE);
  });

  it('without a width (hidden minimap or no content), the scale is 0', () => {
    expect(proportionalScale(0, 72)).toBe(0);
    expect(proportionalScale(900, 0)).toBe(0);
  });
});

describe('mapOffset', () => {
  // 10,000 px page at scale 0.1: the drawing is 1,000 px tall and the minimap, 600.
  const page = { viewHeight: 900, docHeight: 10_000, scale: 0.1, mapHeight: 600 };
  const offset = (scrollY: number, p = page) =>
    mapOffset(scrollY, p.viewHeight, p.docHeight, p.scale, p.mapHeight);

  it('if the drawing fits in the minimap, it does not slide', () => {
    expect(offset(3000, { ...page, mapHeight: 1200 })).toBe(0);
  });

  it('at the very top, the minimap shows its start', () => {
    expect(offset(0)).toBe(0);
  });

  it('at the very bottom, it shows its end', () => {
    expect(offset(10_000 - 900)).toBeCloseTo(1000 - 600);
  });

  it('in between, it slides in proportion to the page', () => {
    expect(offset((10_000 - 900) / 2)).toBeCloseTo((1000 - 600) / 2);
  });

  it('a page shorter than the window does not slide', () => {
    expect(offset(0, { ...page, docHeight: 800 })).toBe(0);
  });
});

describe('viewportRect', () => {
  it('the rectangle is the window at scale, minus how far the minimap has slid', () => {
    const rect = viewportRect(2000, 900, 0.1, 150);
    expect(rect.top).toBeCloseTo(200 - 150);
    expect(rect.height).toBeCloseTo(90);
  });

  it('without scrolling, as before', () => {
    expect(viewportRect(2000, 900, 0.1).top).toBeCloseTo(200);
  });
});

describe('scrollTargetFor', () => {
  it('centers the window on the clicked point', () => {
    expect(scrollTargetFor(300, 0.1, 900, 10_000)).toBeCloseTo(3000 - 450);
  });

  it('accounts for how far the minimap has slid', () => {
    expect(scrollTargetFor(300, 0.1, 900, 10_000, 200)).toBeCloseTo(5000 - 450);
  });

  it('does not go below 0 or past the end', () => {
    expect(scrollTargetFor(10, 0.1, 900, 10_000)).toBe(0);
    expect(scrollTargetFor(990, 0.1, 900, 10_000)).toBe(10_000 - 900);
  });

  it('a page shorter than the window does not scroll', () => {
    expect(scrollTargetFor(50, MAX_SCALE, 900, 600)).toBe(0);
  });

  it('without a scale, it does not move', () => {
    expect(scrollTargetFor(100, 0, 900, 10_000)).toBe(0);
  });
});

describe('dragScroll', () => {
  it('if the drawing fits, the rectangle follows the pointer at scale', () => {
    // 20 px of minimap are 200 px of page at scale 0.1.
    expect(dragScroll(1000, 20, 0.1, 900, 10_000, 1200)).toBeCloseTo(1200);
  });

  it('if the minimap slides, the rectangle travels the minimap while the page goes from top to bottom', () => {
    // The rectangle is 90 px tall and has 600 − 90 = 510 px of travel for 9,100 px of page.
    const end = dragScroll(0, 600 - 90, 0.1, 900, 10_000, 600);
    expect(end).toBeCloseTo(10_000 - 900);
  });

  it('does not go below 0 or past the end', () => {
    expect(dragScroll(100, -500, 0.1, 900, 10_000, 600)).toBe(0);
    expect(dragScroll(9000, 500, 0.1, 900, 10_000, 600)).toBe(10_000 - 900);
  });

  it('without a scale or a page to scroll, it does not move', () => {
    expect(dragScroll(300, 50, 0, 900, 10_000, 600)).toBe(300);
    expect(dragScroll(0, 50, 0.1, 900, 800, 600)).toBe(0);
  });
});

describe('layoutStrokes', () => {
  it('each word is a stroke at scale: position, width and height', () => {
    const [stroke] = layoutStrokes([{ x: 100, y: 2000, width: 60, height: 20, kind: 'text' }], 0.1);
    expect(stroke).toMatchObject({ kind: 'text' });
    expect(stroke?.x).toBeCloseTo(10);
    expect(stroke?.y).toBeCloseTo(200);
    expect(stroke?.width).toBeCloseTo(6);
    expect(stroke?.height).toBeCloseTo(2);
  });

  it('a very short word is still visible: 1 px at least', () => {
    const [stroke] = layoutStrokes([{ x: 0, y: 0, width: 5, height: 5, kind: 'code' }], 0.1);
    expect(stroke?.width).toBe(1);
    expect(stroke?.height).toBe(1);
  });

  it('what is not visible (no width or no height) is not drawn', () => {
    expect(layoutStrokes([{ x: 0, y: 0, width: 0, height: 20, kind: 'text' }], 0.1)).toEqual([]);
    expect(layoutStrokes([{ x: 0, y: 0, width: 40, height: 0, kind: 'text' }], 0.1)).toEqual([]);
  });
});

describe('wordKind', () => {
  const el = (tagName: string, ...classList: string[]) => ({ tagName, classList });

  it('a word inside a heading is a heading word', () => {
    expect(wordKind([el('SPAN'), el('H2')])).toBe('heading');
    expect(wordKind([el('A'), el('DIV', 'sl-heading-wrapper', 'level-h2')])).toBe('heading');
  });

  it('terms in a definition list, as headings (the glossary)', () => {
    expect(wordKind([el('DT')])).toBe('heading');
    expect(wordKind([el('P'), el('DD')])).toBe('text');
  });

  it('code, as a block or inside a sentence, is code', () => {
    expect(wordKind([el('SPAN'), el('DIV', 'ec-line'), el('PRE')])).toBe('code');
    expect(wordKind([el('CODE'), el('P')])).toBe('code');
  });

  it('the closest one wins: code inside a heading is code', () => {
    expect(wordKind([el('CODE'), el('H2')])).toBe('code');
  });

  it('the explanation of a «Pruébalo» is text; only its terminal is code', () => {
    expect(wordKind([el('P'), el('SECTION', 'try-it')])).toBe('text');
  });

  it('everything else is text', () => {
    expect(wordKind([el('P')])).toBe('text');
    expect(wordKind([])).toBe('text');
  });
});
