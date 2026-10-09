/**
 * Correcciones puras de lo que Starlight deduce suponiendo que una traducción tiene la misma ruta
 * con otro prefijo de idioma. Las aplica src/routeData.ts.
 */
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { localizedHref } from './links';
import { locales, type Locale } from './locales';

type SidebarEntry = StarlightRouteData['sidebar'][number];
type SidebarLink = Extract<SidebarEntry, { type: 'link' }>;
type HeadEntry = StarlightRouteData['head'][number];

/** Quita del sidebar los enlaces que no cumplen `keep` y los grupos que se quedan vacíos. */
export function pruneSidebar(
  entries: readonly SidebarEntry[],
  keep: (href: string) => boolean,
): SidebarEntry[] {
  return entries.flatMap((entry): SidebarEntry[] => {
    if (entry.type === 'link') return keep(entry.href) ? [entry] : [];
    const children = pruneSidebar(entry.entries, keep);
    return children.length > 0 ? [{ ...entry, entries: children }] : [];
  });
}

function flatten(entries: readonly SidebarEntry[]): SidebarLink[] {
  return entries.flatMap((entry) => (entry.type === 'link' ? [entry] : flatten(entry.entries)));
}

/** Anterior y siguiente según el orden del sidebar, o undefined si la página no está en él. */
export function paginationFrom(
  entries: readonly SidebarEntry[],
): StarlightRouteData['pagination'] | undefined {
  const links = flatten(entries);
  const index = links.findIndex((link) => link.isCurrent);
  return index === -1 ? undefined : { prev: links[index - 1], next: links[index + 1] };
}

/** Los hreflang de una página que existe en varios idiomas; x-default apunta al español. */
export function alternateLinks(urls: Partial<Record<Locale, string>>, site: string): HeadEntry[] {
  const present = locales.filter((locale) => urls[locale] !== undefined);
  if (present.length < 2) return [];
  const link = (hreflang: string, url: string): HeadEntry => ({
    tag: 'link',
    attrs: { rel: 'alternate', hreflang, href: new URL(url, site).href },
  });
  return [
    ...present.map((locale) => link(locale, urls[locale]!)),
    ...(urls.es === undefined ? [] : [link('x-default', urls.es)]),
  ];
}

/** A dónde lleva el selector de idioma: a la traducción o, si no la hay, a la portada del idioma. */
export function languageTargets(urls: Partial<Record<Locale, string>>): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, urls[locale] ?? localizedHref(locale)]),
  ) as Record<Locale, string>;
}

/**
 * Lo que se queda en el sidebar: los enlaces externos y las páginas que existen de verdad. Se van las
 * rutas internas que no existen, es decir, las copias de respaldo de Starlight.
 */
export function keepSidebarLink(href: string, realUrls: ReadonlySet<string>): boolean {
  return !href.startsWith('/') || realUrls.has(href);
}

/**
 * La paginación de Starlight ya respeta `prev`/`next` del frontmatter. Solo se cambian los enlaces
 * que apuntan a una copia de respaldo, por el vecino en el sidebar limpio (o por nada).
 */
export function fixPagination(
  pagination: StarlightRouteData['pagination'],
  entries: readonly SidebarEntry[],
  realUrls: ReadonlySet<string>,
): StarlightRouteData['pagination'] {
  const neighbours = paginationFrom(entries);
  const fix = (link: SidebarLink | undefined, neighbour: SidebarLink | undefined) =>
    link === undefined || keepSidebarLink(link.href, realUrls) ? link : neighbour;
  return {
    prev: fix(pagination.prev, neighbours?.prev),
    next: fix(pagination.next, neighbours?.next),
  };
}
