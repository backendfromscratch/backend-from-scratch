import { describe, expect, it } from 'vitest';
import {
  buildTranslationIndex,
  fallbackUrls,
  idFromContentPath,
  localeOfId,
  normalizeId,
  translationKeyOf,
  translationsOf,
  urlOfId,
} from './translations';

describe('normalizeId, localeOfId y urlOfId', () => {
  it('the Spanish home page arrives as "index" or "" and lives at /', () => {
    expect(normalizeId('index')).toBe('');
    expect(urlOfId('index')).toBe('/');
    expect(urlOfId('')).toBe('/');
    expect(localeOfId('')).toBe('es');
  });

  it('English lives in the en/ folder', () => {
    expect(localeOfId('en')).toBe('en');
    expect(localeOfId('en/phase-0/what-is-dns')).toBe('en');
    expect(urlOfId('en')).toBe('/en/');
    expect(urlOfId('en/phase-0/what-is-dns')).toBe('/en/phase-0/what-is-dns/');
  });

  it('Spanish lives at the root', () => {
    expect(localeOfId('fase-0/que-es-dns')).toBe('es');
    expect(urlOfId('fase-0/que-es-dns')).toBe('/fase-0/que-es-dns/');
  });

  it('a Spanish page whose route starts with «en» is still Spanish', () => {
    expect(localeOfId('enlaces')).toBe('es');
  });
});

describe('translationKeyOf', () => {
  it('uses translationKey if there is one', () => {
    expect(translationKeyOf({ id: 'fase-0/que-es-dns', translationKey: 'dns' })).toBe('dns');
  });

  it('otherwise, the route without the language prefix', () => {
    expect(translationKeyOf({ id: 'en/roadmap' })).toBe('roadmap');
    expect(translationKeyOf({ id: 'roadmap' })).toBe('roadmap');
    expect(translationKeyOf({ id: 'index' })).toBe('');
    expect(translationKeyOf({ id: 'en' })).toBe('');
  });
});

describe('buildTranslationIndex y translationsOf', () => {
  const index = buildTranslationIndex([
    { id: 'index' },
    { id: 'en' },
    { id: 'fase-0', translationKey: 'phase-0' },
    { id: 'en/phase-0', translationKey: 'phase-0' },
    { id: 'fase-1', translationKey: 'phase-1' },
    { id: 'fase-0/que-es-dns', translationKey: 'dns' },
    { id: 'en/phase-0/what-is-dns', translationKey: 'dns' },
    { id: 'fase-1/solo-en-espanol', translationKey: 'solo' },
  ]);

  it('pairs each page with its translation even if the routes look nothing alike', () => {
    const both = { es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' };
    expect(translationsOf(index, 'fase-0/que-es-dns')).toEqual(both);
    expect(translationsOf(index, 'en/phase-0/what-is-dns')).toEqual(both);
  });

  it('pairs the home pages, whether the id comes as "index" or ""', () => {
    expect(translationsOf(index, '')).toEqual({ es: '/', en: '/en/' });
    expect(translationsOf(index, 'index')).toEqual({ es: '/', en: '/en/' });
  });

  it('an untranslated page only has its own language', () => {
    expect(translationsOf(index, 'fase-1/solo-en-espanol')).toEqual({
      es: '/fase-1/solo-en-espanol/',
    });
  });

  it('a page that does not exist has no translations', () => {
    expect(translationsOf(index, 'no-existe')).toEqual({});
  });

  it('a phase page without translationKey fails the build: it would silently end up without a pair', () => {
    expect(() => buildTranslationIndex([{ id: 'fase-1/shell' }])).toThrow(
      /"fase-1\/shell" has no translationKey/,
    );
    expect(() => buildTranslationIndex([{ id: 'en/phase-1' }])).toThrow(
      /"en\/phase-1" has no translationKey/,
    );
  });

  it('a lesson needs the introduction of its phase in its language: without it, the positions shift', () => {
    expect(() =>
      buildTranslationIndex([
        { id: 'fase-0', translationKey: 'phase-0' },
        { id: 'fase-0/a', translationKey: 'a' },
        { id: 'en/phase-0/a', translationKey: 'a' },
      ]),
    ).toThrow(/"en\/phase-0\/a".*"en\/phase-0"/);
  });

  it('root pages (home, roadmap, glossary) are paired by their route, without translationKey', () => {
    expect(() =>
      buildTranslationIndex([{ id: 'roadmap' }, { id: 'en/roadmap' }, { id: 'index' }]),
    ).not.toThrow();
  });

  it('two pages in the same language with the same key fail the build, and both are named', () => {
    expect(() =>
      buildTranslationIndex([
        { id: 'fase-0/a', translationKey: 'x' },
        { id: 'fase-0/b', translationKey: 'x' },
      ]),
    ).toThrow(/"fase-0\/a" and "fase-0\/b"/);
  });
});

describe('idFromContentPath', () => {
  it('removes the extension and the trailing /index, like Astro', () => {
    expect(idFromContentPath('index.mdx')).toBe('index');
    expect(idFromContentPath('en/index.mdx')).toBe('en');
    expect(idFromContentPath('fase-0/index.mdx')).toBe('fase-0');
    expect(idFromContentPath('fase-0/que-es-dns.mdx')).toBe('fase-0/que-es-dns');
    expect(idFromContentPath('roadmap.md')).toBe('roadmap');
  });

  it('lowercase, like Astro ids', () => {
    expect(idFromContentPath('fase-1/Mis-Enlaces.mdx')).toBe('fase-1/mis-enlaces');
  });
});

describe('fallbackUrls', () => {
  it('with Spanish at the root and translated routes, each Spanish page of a phase has a copy', () => {
    expect(
      fallbackUrls([
        'index',
        'en',
        'roadmap',
        'en/roadmap',
        'fase-0',
        'fase-0/que-es-dns',
        'en/phase-0',
        'en/phase-0/what-is-dns',
      ]),
    ).toEqual(['/en/fase-0/', '/en/fase-0/que-es-dns/']);
  });
});
