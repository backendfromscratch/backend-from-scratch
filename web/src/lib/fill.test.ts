import { describe, expect, it } from 'vitest';
import { fill } from './fill';

describe('fill', () => {
  it('replaces the placeholders and leaves the ones it does not know', () => {
    expect(fill('{a} y {b}', { a: 1 })).toBe('1 y {b}');
    expect(fill('ack={ack}, {otro}', { ack: 107 })).toBe('ack=107, {otro}');
  });

  it('accepts strings, numbers and true/false values', () => {
    expect(fill('{n} {s} {b}', { n: 2, s: 'x', b: true })).toBe('2 x true');
  });
});
