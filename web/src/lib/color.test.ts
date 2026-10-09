import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './color';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
  });

  it('rejects formats that are not #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow(/Invalid color/);
    expect(() => relativeLuminance('red')).toThrow(/Invalid color/);
  });
});

describe('contrastRatio', () => {
  it('white on black is 21:1, and the order does not matter', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('a color against itself is 1:1', () => {
    expect(contrastRatio('#7445D6', '#7445D6')).toBe(1);
  });

  it('#777777 on white falls just below 4.5:1', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});
