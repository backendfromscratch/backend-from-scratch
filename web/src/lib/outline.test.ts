import { describe, expect, it } from 'vitest';
import { currentSection, flattenOutline } from './outline';

describe('flattenOutline', () => {
  it('the Starlight table of contents, as a flat list with the marker of each level', () => {
    const toc = [
      { depth: 2, slug: '_top', text: 'Sinopsis', children: [] },
      {
        depth: 2,
        slug: 'el-problema',
        text: 'El problema',
        children: [{ depth: 3, slug: 'lo-que-decide', text: 'Lo que decide', children: [] }],
      },
    ];
    expect(flattenOutline(toc)).toEqual([
      { slug: '_top', text: 'Sinopsis', mark: '#' },
      { slug: 'el-problema', text: 'El problema', mark: '##' },
      { slug: 'lo-que-decide', text: 'Lo que decide', mark: '###' },
    ]);
  });
});

describe('currentSection', () => {
  it('before any heading reaches the reading line, the first entry', () => {
    expect(currentSection([170, 900, 2000], 166, false)).toBe(0);
  });

  it('the last section whose heading has already reached the line', () => {
    expect(currentSection([-500, 150, 800], 166, false)).toBe(1);
  });

  it('a jump to an anchor leaves the heading right on the line: that is the current one', () => {
    expect(currentSection([-900, -400, 166, 700], 166, false)).toBe(2);
  });

  it('with all headings already above, the last one', () => {
    expect(currentSection([-900, -500, -100], 166, false)).toBe(2);
  });

  it('at the end of the page, the last one, even if its heading does not reach the line', () => {
    expect(currentSection([-900, 300, 700], 166, true)).toBe(2);
  });

  it('at the end of the page, after jumping to a section that cannot scroll up, that section', () => {
    // Click on «¿Lo has entendido?» (index 1): the page scrolls to the end, but the heading
    // stays mid-window and the «Para profundizar» one (index 2) is also visible.
    expect(currentSection([-900, 300, 700], 166, true, { target: 1, viewHeight: 900 })).toBe(1);
  });

  it('the target of a jump only counts at the end of the page', () => {
    expect(currentSection([-500, 150, 800], 166, false, { target: 2, viewHeight: 900 })).toBe(1);
  });

  it('a target that does not exist is ignored', () => {
    expect(currentSection([-900, 300, 700], 166, true, { target: 7, viewHeight: 900 })).toBe(2);
  });

  it('a target that is no longer visible (the reader kept scrolling to the end) is ignored', () => {
    expect(currentSection([-900, -400, 700], 166, true, { target: 0, viewHeight: 900 })).toBe(2);
  });

  it('without headings, none', () => {
    expect(currentSection([], 166, false)).toBe(-1);
  });
});
