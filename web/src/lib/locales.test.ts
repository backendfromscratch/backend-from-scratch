import { describe, expect, it } from 'vitest';
import { isLocale, localeLabels, locales, toLocale } from './locales';

describe('isLocale', () => {
  it('accepts the course languages', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  it('rejects any other value', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('toLocale', () => {
  it('returns the language if it is valid', () => {
    expect(toLocale('en')).toBe('en');
  });

  it('undefined is Spanish: the root language, which Starlight represents without a locale', () => {
    expect(toLocale(undefined)).toBe('es');
  });

  it('throws if the language does not exist, because it signals a configuration error', () => {
    expect(() => toLocale('fr')).toThrow(/Unknown language/);
  });
});

describe('localeLabels', () => {
  it('each language has its name for the selector', () => {
    expect(Object.keys(localeLabels)).toEqual([...locales]);
  });
});
