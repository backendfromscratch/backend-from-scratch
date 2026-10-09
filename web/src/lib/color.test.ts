import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './color';

describe('relativeLuminance', () => {
  it('es 0 para el negro y 1 para el blanco', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
  });

  it('rechaza formatos que no son #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow(/Color no válido/);
    expect(() => relativeLuminance('red')).toThrow(/Color no válido/);
  });
});

describe('contrastRatio', () => {
  it('blanco sobre negro es 21:1, y el orden no importa', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('un color contra sí mismo es 1:1', () => {
    expect(contrastRatio('#7445D6', '#7445D6')).toBe(1);
  });

  it('#777777 sobre blanco queda justo por debajo de 4,5:1', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});
