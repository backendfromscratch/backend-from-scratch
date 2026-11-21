import { describe, expect, it } from 'vitest';
import { clampText, splitLimits, splitValues } from './split';

describe('splitLimits', () => {
  it('leaves the text at least 21rem and the scene at least 22rem', () => {
    expect(splitLimits(1100, 16)).toEqual({ min: 336, max: 748 });
  });

  it('never gives a maximum under the minimum', () => {
    expect(splitLimits(500, 16)).toEqual({ min: 336, max: 336 });
  });
});

describe('clampText', () => {
  const limits = splitLimits(1100, 16);

  it('keeps a chosen width inside the limits', () => {
    expect(clampText(900, limits)).toBe(748);
    expect(clampText(100, limits)).toBe(336);
    expect(clampText(500.4, limits)).toBe(500);
  });
});

describe('splitValues', () => {
  it('gives the text’s share of the width, in percent', () => {
    expect(splitValues(440, 1100, splitLimits(1100, 16))).toEqual({
      now: 40,
      scene: 60,
      min: 31,
      max: 68,
    });
  });
});
