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
  it('la portada en español llega como "index" o como "" y vive en /', () => {
    expect(normalizeId('index')).toBe('');
    expect(urlOfId('index')).toBe('/');
    expect(urlOfId('')).toBe('/');
    expect(localeOfId('')).toBe('es');
  });

  it('el inglés vive en la carpeta en/', () => {
    expect(localeOfId('en')).toBe('en');
    expect(localeOfId('en/phase-0/what-is-dns')).toBe('en');
    expect(urlOfId('en')).toBe('/en/');
    expect(urlOfId('en/phase-0/what-is-dns')).toBe('/en/phase-0/what-is-dns/');
  });

  it('el español vive en la raíz', () => {
    expect(localeOfId('fase-0/que-es-dns')).toBe('es');
    expect(urlOfId('fase-0/que-es-dns')).toBe('/fase-0/que-es-dns/');
  });

  it('una página española cuya ruta empieza por «en» sigue siendo española', () => {
    expect(localeOfId('enlaces')).toBe('es');
  });
});

describe('translationKeyOf', () => {
  it('usa translationKey si la hay', () => {
    expect(translationKeyOf({ id: 'fase-0/que-es-dns', translationKey: 'dns' })).toBe('dns');
  });

  it('si no, la ruta sin el prefijo de idioma', () => {
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

  it('une cada página con su traducción aunque las rutas no se parezcan', () => {
    const both = { es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' };
    expect(translationsOf(index, 'fase-0/que-es-dns')).toEqual(both);
    expect(translationsOf(index, 'en/phase-0/what-is-dns')).toEqual(both);
  });

  it('une las portadas, venga el id como "index" o como ""', () => {
    expect(translationsOf(index, '')).toEqual({ es: '/', en: '/en/' });
    expect(translationsOf(index, 'index')).toEqual({ es: '/', en: '/en/' });
  });

  it('una página sin traducir solo tiene su idioma', () => {
    expect(translationsOf(index, 'fase-1/solo-en-espanol')).toEqual({
      es: '/fase-1/solo-en-espanol/',
    });
  });

  it('una página que no existe no tiene traducciones', () => {
    expect(translationsOf(index, 'no-existe')).toEqual({});
  });

  it('una página de una fase sin translationKey hace fallar el build: se quedaría sin pareja sin avisar', () => {
    expect(() => buildTranslationIndex([{ id: 'fase-1/shell' }])).toThrow(
      /"fase-1\/shell" no tiene translationKey/,
    );
    expect(() => buildTranslationIndex([{ id: 'en/phase-1' }])).toThrow(
      /"en\/phase-1" no tiene translationKey/,
    );
  });

  it('una lección necesita la introducción de su fase en su idioma: sin ella, las posiciones se desplazan', () => {
    expect(() =>
      buildTranslationIndex([
        { id: 'fase-0', translationKey: 'phase-0' },
        { id: 'fase-0/a', translationKey: 'a' },
        { id: 'en/phase-0/a', translationKey: 'a' },
      ]),
    ).toThrow(/"en\/phase-0\/a".*"en\/phase-0"/);
  });

  it('las páginas raíz (portada, roadmap, glosario) se emparejan por su ruta, sin translationKey', () => {
    expect(() =>
      buildTranslationIndex([{ id: 'roadmap' }, { id: 'en/roadmap' }, { id: 'index' }]),
    ).not.toThrow();
  });

  it('dos páginas del mismo idioma con la misma clave hacen fallar el build, y se nombran las dos', () => {
    expect(() =>
      buildTranslationIndex([
        { id: 'fase-0/a', translationKey: 'x' },
        { id: 'fase-0/b', translationKey: 'x' },
      ]),
    ).toThrow(/"fase-0\/a" y "fase-0\/b"/);
  });
});

describe('idFromContentPath', () => {
  it('quita la extensión y el /index final, como Astro', () => {
    expect(idFromContentPath('index.mdx')).toBe('index');
    expect(idFromContentPath('en/index.mdx')).toBe('en');
    expect(idFromContentPath('fase-0/index.mdx')).toBe('fase-0');
    expect(idFromContentPath('fase-0/que-es-dns.mdx')).toBe('fase-0/que-es-dns');
    expect(idFromContentPath('roadmap.md')).toBe('roadmap');
  });

  it('en minúsculas, como los ids de Astro', () => {
    expect(idFromContentPath('fase-1/Mis-Enlaces.mdx')).toBe('fase-1/mis-enlaces');
  });
});

describe('fallbackUrls', () => {
  it('con el español en la raíz y rutas traducidas, cada página española de una fase tiene copia', () => {
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
