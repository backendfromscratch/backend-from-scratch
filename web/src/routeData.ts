/**
 * Starlight deduce las traducciones cambiando el prefijo de idioma de la URL. Con rutas traducidas
 * (/fase-0/que-es-dns/ ↔ /en/phase-0/what-is-dns/) eso falla, y aquí se corrige con el índice de
 * traducciones: el sidebar, la paginación, los hreflang y las copias de respaldo.
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

  // En inglés, el sidebar incluye las copias de respaldo de las páginas en español: fuera.
  route.sidebar = pruneSidebar(route.sidebar, (href) => keepSidebarLink(href, realUrls));
  // Starlight calculó la paginación con el sidebar sin limpiar: se corrige lo que apunta a copias.
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
    // El build borra estas copias (src/integrations/drop-fallbacks.ts). Si alguna se escapa, que no se indexe.
    route.head.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex' } });
    return;
  }
  if (!context.site) return;

  // La imagen que se ve al compartir la página (src/pages/og/[...route].png.ts). La 404 no tiene.
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

  // Migas para Google: portada › fase › lección.
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
