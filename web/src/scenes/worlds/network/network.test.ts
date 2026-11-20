import { describe, expect, it } from 'vitest';
import { elapsed, timeUntil } from './network';

describe('the time bar’s numbers', () => {
  it('add up to the total of each language’s real curl run', () => {
    expect(timeUntil('es', 'near')).toBeCloseTo(74.2, 5);
    expect(timeUntil('es', 'far')).toBe(1072);
    expect(timeUntil('en', 'near')).toBeCloseTo(71.14, 5);
    expect(timeUntil('en', 'far')).toBe(1057);
  });

  it('reach the first byte when the request and the server are done', () => {
    expect(timeUntil('es', 'near', 'wait')).toBe(74);
    expect(timeUntil('es', 'far', 'wait')).toBe(662);
    expect(timeUntil('en', 'near', 'wait')).toBe(71);
  });

  it('make the clock the sum of the finished phases', () => {
    expect(elapsed('es', { done: ['dns', 'tcp'], mode: 'near' })).toBe(33);
    expect(elapsed('en', { done: [], mode: 'far' })).toBe(0);
  });
});
