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
  it('removes links to pages that do not really exist (the fallback copies)', () => {
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

  it('removes groups that end up empty', () => {
    expect(pruneSidebar([group('Phase 1', [link('/en/fase-1/')])], () => false)).toEqual([]);
  });
});

describe('paginationFrom', () => {
  it('previous and next by sidebar order, crossing groups', () => {
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

  it('the first page has no previous, and the last has no next', () => {
    expect(paginationFrom([link('/a/', true), link('/b/')])?.prev).toBeUndefined();
    expect(paginationFrom([link('/a/'), link('/b/', true)])?.next).toBeUndefined();
  });

  it('if the current page is not in the sidebar, returns undefined', () => {
    expect(paginationFrom([link('/roadmap/')])).toBeUndefined();
  });
});

describe('alternateLinks', () => {
  it('one hreflang per language and x-default to Spanish, with absolute URLs', () => {
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

  it('an untranslated page has no hreflang', () => {
    expect(alternateLinks({ es: '/fase-1/x/' }, SITE)).toEqual([]);
  });
});

describe('languageTargets', () => {
  it('goes to the translation of the page', () => {
    expect(languageTargets({ es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' })).toEqual({
      es: '/fase-0/que-es-dns/',
      en: '/en/phase-0/what-is-dns/',
    });
  });

  it('without a translation, goes to the home page of that language', () => {
    expect(languageTargets({ es: '/fase-1/x/' }).en).toBe('/en/');
  });
});

describe('keepSidebarLink', () => {
  const real = new Set(['/en/phase-0/']);

  it('keeps real pages and external links; removes internal routes that do not exist', () => {
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

  it('keeps what Starlight computed if it points to real pages: respects the prev and next of the frontmatter', () => {
    const custom = { prev: nav('/en/roadmap/'), next: undefined };
    expect(fixPagination(custom, pruned, real)).toEqual(custom);
  });

  it('replaces what points to a fallback copy with the neighbour in the clean sidebar', () => {
    const fromStarlight = {
      prev: nav('/en/fase-0/que-es-dns/'),
      next: nav('/en/phase-0/tls-and-https/'),
    };
    const fixed = fixPagination(fromStarlight, pruned, real);
    expect(fixed.prev?.href).toBe('/en/phase-0/');
    expect(fixed.next?.href).toBe('/en/phase-0/tls-and-https/');
  });

  it('if the page is not in the sidebar, removes what points to a copy', () => {
    const fixed = fixPagination(
      { prev: nav('/en/fase-0/'), next: undefined },
      [link('/en/roadmap/')],
      real,
    );
    expect(fixed.prev).toBeUndefined();
  });
});
