/**
 * Pure corrections of what Starlight infers by assuming a translation has the same route
 * with a different language prefix. Applied by src/routeData.ts.
 */
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { localizedHref } from './links';
import { locales, type Locale } from './locales';

type SidebarEntry = StarlightRouteData['sidebar'][number];
type SidebarLink = Extract<SidebarEntry, { type: 'link' }>;
type HeadEntry = StarlightRouteData['head'][number];

/** Removes from the sidebar the links that fail `keep` and the groups that end up empty. */
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

/** Previous and next by sidebar order, or undefined if the page is not in it. */
export function paginationFrom(
  entries: readonly SidebarEntry[],
): StarlightRouteData['pagination'] | undefined {
  const links = flatten(entries);
  const index = links.findIndex((link) => link.isCurrent);
  return index === -1 ? undefined : { prev: links[index - 1], next: links[index + 1] };
}

/** The hreflangs of a page that exists in several languages; x-default points to Spanish. */
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

/** Where the language selector leads: to the translation or, if there is none, to the language's home page. */
export function languageTargets(urls: Partial<Record<Locale, string>>): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, urls[locale] ?? localizedHref(locale)]),
  ) as Record<Locale, string>;
}

/**
 * What stays in the sidebar: external links and pages that really exist. Internal routes that do
 * not exist go, that is, Starlight's fallback copies.
 */
export function keepSidebarLink(href: string, realUrls: ReadonlySet<string>): boolean {
  return !href.startsWith('/') || realUrls.has(href);
}

/**
 * Starlight's pagination already respects the frontmatter's `prev`/`next`. Only the links
 * that point to a fallback copy are changed, to the neighbour in the clean sidebar (or to nothing).
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
