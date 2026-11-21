import { describe, expect, it } from 'vitest';
import { scrolls } from './scroll-regions';

describe('scrolls', () => {
  it('is true when the content is wider than the box', () => {
    expect(scrolls({ scrollWidth: 640, clientWidth: 400 })).toBe(true);
  });

  it('is false when it fits, or misses by a pixel of rounding', () => {
    expect(scrolls({ scrollWidth: 400, clientWidth: 400 })).toBe(false);
    expect(scrolls({ scrollWidth: 401, clientWidth: 400 })).toBe(false);
  });
});
