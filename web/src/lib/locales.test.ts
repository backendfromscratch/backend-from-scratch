import { describe, expect, it } from 'vitest';
import { isLocale, localeLabels, locales, toLocale } from './locales';

describe('isLocale', () => {
  it('acepta los idiomas del curso', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  it('rechaza cualquier otro valor', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('toLocale', () => {
  it('devuelve el idioma si es válido', () => {
    expect(toLocale('en')).toBe('en');
  });

  it('undefined es el español: el idioma raíz, que Starlight representa sin locale', () => {
    expect(toLocale(undefined)).toBe('es');
  });

  it('lanza un error si el idioma no existe, porque indica un error de configuración', () => {
    expect(() => toLocale('fr')).toThrow(/Idioma desconocido/);
  });
});

describe('localeLabels', () => {
  it('cada idioma tiene su nombre para el selector', () => {
    expect(Object.keys(localeLabels)).toEqual([...locales]);
  });
});
