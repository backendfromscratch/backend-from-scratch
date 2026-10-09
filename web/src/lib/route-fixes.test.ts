import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { describe, expect, it } from 'vitest';
import {
  alternateLinks,
  fixPagination,
  keepSidebarLink,
  languageTargets,
  paginationFrom,
  pruneSidebar,
} from './route-fixes';

type SidebarEntry = StarlightRouteData['sidebar'][number];
const link = (href: string, isCurrent = false) =>
  ({ type: 'link', label: href, href, isCurrent, badge: undefined, attrs: {} }) as SidebarEntry;
const group = (label: string, entries: SidebarEntry[]) =>
  ({ type: 'group', label, entries, collapsed: false, badge: undefined }) as SidebarEntry;
const SITE = 'https://backenddesdecero.com/';

describe('pruneSidebar', () => {
  it('quita los enlaces a páginas que no existen de verdad (las copias de respaldo)', () => {
    const sidebar = [
      link('/en/roadmap/'),
      group('Phase 0', [
        link('/en/fase-0/'),
        link('/en/fase-0/que-es-dns/'),
        link('/en/phase-0/'),
        link('/en/phase-0/what-is-dns/', true),
      ]),
    ];
    const real = new Set(['/en/roadmap/', '/en/phase-0/', '/en/phase-0/what-is-dns/']);
    expect(pruneSidebar(sidebar, (href) => real.has(href))).toEqual([
      link('/en/roadmap/'),
      group('Phase 0', [link('/en/phase-0/'), link('/en/phase-0/what-is-dns/', true)]),
    ]);
  });

  it('quita los grupos que se quedan vacíos', () => {
    expect(pruneSidebar([group('Phase 1', [link('/en/fase-1/')])], () => false)).toEqual([]);
  });
});

describe('paginationFrom', () => {
  it('anterior y siguiente según el orden del sidebar, atravesando grupos', () => {
    const sidebar = [
      link('/roadmap/'),
      group('Fase 0', [
        link('/fase-0/'),
        link('/fase-0/que-es-dns/', true),
        link('/fase-0/tls-y-https/'),
      ]),
    ];
    const pagination = paginationFrom(sidebar);
    expect(pagination?.prev?.href).toBe('/fase-0/');
    expect(pagination?.next?.href).toBe('/fase-0/tls-y-https/');
  });

  it('la primera página no tiene anterior, y la última no tiene siguiente', () => {
    expect(paginationFrom([link('/a/', true), link('/b/')])?.prev).toBeUndefined();
    expect(paginationFrom([link('/a/'), link('/b/', true)])?.next).toBeUndefined();
  });

  it('si la página actual no está en el sidebar, devuelve undefined', () => {
    expect(paginationFrom([link('/roadmap/')])).toBeUndefined();
  });
});

describe('alternateLinks', () => {
  it('un hreflang por idioma y x-default al español, con URLs absolutas', () => {
    expect(
      alternateLinks({ es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' }, SITE),
    ).toEqual([
      {
        tag: 'link',
        attrs: { rel: 'alternate', hreflang: 'es', href: `${SITE}fase-0/que-es-dns/` },
      },
      {
        tag: 'link',
        attrs: { rel: 'alternate', hreflang: 'en', href: `${SITE}en/phase-0/what-is-dns/` },
      },
      {
        tag: 'link',
        attrs: { rel: 'alternate', hreflang: 'x-default', href: `${SITE}fase-0/que-es-dns/` },
      },
    ]);
  });

  it('una página sin traducir no lleva hreflang', () => {
    expect(alternateLinks({ es: '/fase-1/x/' }, SITE)).toEqual([]);
  });
});

describe('languageTargets', () => {
  it('lleva a la traducción de la página', () => {
    expect(languageTargets({ es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' })).toEqual({
      es: '/fase-0/que-es-dns/',
      en: '/en/phase-0/what-is-dns/',
    });
  });

  it('sin traducción, lleva a la portada de ese idioma', () => {
    expect(languageTargets({ es: '/fase-1/x/' }).en).toBe('/en/');
  });
});

describe('keepSidebarLink', () => {
  const real = new Set(['/en/phase-0/']);

  it('conserva las páginas reales y los enlaces externos; quita las rutas internas que no existen', () => {
    expect(keepSidebarLink('/en/phase-0/', real)).toBe(true);
    expect(keepSidebarLink('https://github.com/backendfromscratch', real)).toBe(true);
    expect(keepSidebarLink('/en/fase-0/', real)).toBe(false);
  });
});

describe('fixPagination', () => {
  type SidebarLink = Extract<SidebarEntry, { type: 'link' }>;
  const nav = (href: string) => link(href) as SidebarLink;
  const real = new Set([
    '/en/roadmap/',
    '/en/phase-0/',
    '/en/phase-0/what-is-dns/',
    '/en/phase-0/tls-and-https/',
  ]);
  const pruned = [
    link('/en/roadmap/'),
    group('Phase 0', [
      link('/en/phase-0/'),
      link('/en/phase-0/what-is-dns/', true),
      link('/en/phase-0/tls-and-https/'),
    ]),
  ];

  it('conserva lo que calculó Starlight si apunta a páginas reales: respeta prev y next del frontmatter', () => {
    const custom = { prev: nav('/en/roadmap/'), next: undefined };
    expect(fixPagination(custom, pruned, real)).toEqual(custom);
  });

  it('cambia lo que apunta a una copia de respaldo por el vecino del sidebar limpio', () => {
    const fromStarlight = {
      prev: nav('/en/fase-0/que-es-dns/'),
      next: nav('/en/phase-0/tls-and-https/'),
    };
    const fixed = fixPagination(fromStarlight, pruned, real);
    expect(fixed.prev?.href).toBe('/en/phase-0/');
    expect(fixed.next?.href).toBe('/en/phase-0/tls-and-https/');
  });

  it('si la página no está en el sidebar, quita lo que apunta a una copia', () => {
    const fixed = fixPagination(
      { prev: nav('/en/fase-0/'), next: undefined },
      [link('/en/roadmap/')],
      real,
    );
    expect(fixed.prev).toBeUndefined();
  });
});
