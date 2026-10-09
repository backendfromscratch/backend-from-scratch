/**
 * Starlight infers translations by swapping the language prefix of the URL. With translated routes
 * (/fase-0/que-es-dns/ ↔ /en/phase-0/what-is-dns/) that fails, and here it is fixed with the
 * translation index: the sidebar, pagination, hreflang and fallback copies.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { alternateLinks, fixPagination, keepSidebarLink, pruneSidebar } from './lib/route-fixes';
import { translationsOf, urlOfId } from './lib/translations';
import { getTranslationIndex } from './lib/translations-astro';
import { phases } from './data/phases';
import { currentLesson } from './lib/explorer';
import { localizedHref } from './lib/links';
import { toLocale } from './lib/locales';
import { phaseLabel } from './lib/sidebar';
import { breadcrumbJsonLd } from './lib/structured-data';
import { OG_SIZE, ogImagePath } from './lib/og/card';

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  const index = await getTranslationIndex();
  const realUrls = new Set([...index.keyById.keys()].map(urlOfId));

  // In English, the sidebar includes the fallback copies of the Spanish pages: drop them.
  route.sidebar = pruneSidebar(route.sidebar, (href) => keepSidebarLink(href, realUrls));
  // Starlight computed pagination with the unpruned sidebar: fix whatever points to copies.
  route.pagination = fixPagination(route.pagination, route.sidebar, realUrls);

  route.head = route.head.filter(
    (entry) =>
      !(
        entry.tag === 'link' &&
        entry.attrs?.rel === 'alternate' &&
        entry.attrs.hreflang !== undefined
      ),
  );
  if (route.isFallback) {
    // The build deletes these copies (src/integrations/drop-fallbacks.ts). If one slips through, keep it out of the index.
    route.head.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex' } });
    return;
  }
  if (!context.site) return;

  // The image shown when the page is shared (src/pages/og/[...route].png.ts). The 404 has none.
  const is404 = route.entry.id === '404' || route.entry.id.endsWith('/404');
  if (!is404) {
    route.head.push(
      {
        tag: 'meta',
        attrs: {
          property: 'og:image',
          content: new URL(ogImagePath(route.entry.id), context.site).href,
        },
      },
      { tag: 'meta', attrs: { property: 'og:image:width', content: String(OG_SIZE.width) } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: String(OG_SIZE.height) } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: route.entry.data.title } },
    );
  }

  route.head.push(...alternateLinks(translationsOf(index, route.entry.id), context.site.href));

  // Breadcrumbs for Google: home › phase › lesson.
  const locale = toLocale(route.locale);
  const current = currentLesson(route.sidebar, phases, locale);
  if (current) {
    const { phase, position } = current;
    const crumbs = [
      { name: route.siteTitle, url: localizedHref(locale) },
      { name: phaseLabel(phase, locale), url: position.links[0]!.href },
      ...(position.index > 0
        ? [{ name: route.entry.data.title, url: position.links[position.index]!.href }]
        : []),
    ];
    route.head.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      content: breadcrumbJsonLd(crumbs, context.site.href),
    });
  }
});
