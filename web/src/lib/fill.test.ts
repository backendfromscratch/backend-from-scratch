import { describe, expect, it } from 'vitest';
import { fill } from './fill';

describe('fill', () => {
  it('sustituye los huecos y deja los que no conoce', () => {
    expect(fill('{a} y {b}', { a: 1 })).toBe('1 y {b}');
    expect(fill('ack={ack}, {otro}', { ack: 107 })).toBe('ack=107, {otro}');
  });

  it('acepta textos, números y valores verdadero/falso', () => {
    expect(fill('{n} {s} {b}', { n: 2, s: 'x', b: true })).toBe('2 x true');
  });
});
