import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { phases } from './src/data/phases';
import { buildPhaseSidebar } from './src/lib/sidebar';
import { seoAudit } from './src/integrations/seo-audit';
import { fileURLToPath } from 'node:url';
import { dropFallbacks, keepInSitemap, listContentIds } from './src/integrations/drop-fallbacks';
import { localeLabels } from './src/lib/locales';
import { fallbackUrls } from './src/lib/translations';
import sitemap from '@astrojs/sitemap';
import { siteTitle, siteUrl } from './src/data/site';
import { diagrams } from './src/integrations/diagrams';

// Las copias de respaldo que generaría Starlight: se borran del build y no van al sitemap.
const fallbacks = new Set(
  fallbackUrls(listContentIds(fileURLToPath(new URL('./src/content/docs', import.meta.url)))),
);

export default defineConfig({
  // Con `site`, Starlight genera la URL canónica, los hreflang y el og:url de cada página.
  site: siteUrl,
  integrations: [
    // Antes de Starlight: borra las copias de respaldo antes de que Pagefind indexe el build.
    dropFallbacks(fallbacks),
    // Antes de Starlight: los bloques ```mermaid se convierten en HTML al hacer el build (src/lib/diagrams/).
    diagrams(),
    starlight({
      title: siteTitle,
      // El español va en la raíz (sin /es/) y el inglés en /en/.
      locales: {
        root: { label: localeLabels.es, lang: 'es' },
        en: { label: localeLabels.en, lang: 'en' },
      },
      customCss: [
        '@fontsource-variable/jetbrains-mono/index.css',
        '@fontsource-variable/atkinson-hyperlegible-next/index.css',
        // Cursiva de verdad para <em>; solo se descarga si una página la usa.
        '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css',
        './src/styles/theme.css',
        './src/styles/diagrams.css',
      ],
      // Código: un tema oscuro y uno claro; Starlight asigna cada uno a su modo.
      expressiveCode: {
        themes: ['tokyo-night', 'one-light'],
        styleOverrides: { borderRadius: '0.375rem' },
      },
      components: {
        PageTitle: './src/components/overrides/PageTitle.astro',
        TwoColumnContent: './src/components/overrides/TwoColumnContent.astro',
        PageSidebar: './src/components/overrides/PageSidebar.astro',
        Header: './src/components/overrides/Header.astro',
        Sidebar: './src/components/overrides/Sidebar.astro',
        SiteTitle: './src/components/overrides/SiteTitle.astro',
        Footer: './src/components/overrides/Footer.astro',
        Pagination: './src/components/overrides/Pagination.astro',
        LanguageSelect: './src/components/overrides/LanguageSelect.astro',
      },
      routeMiddleware: './src/routeData.ts',
      sidebar: [...buildPhaseSidebar(phases)],
      plugins: [
        starlightLinksValidator({
          // Las copias de respaldo se borran del build (src/integrations/drop-fallbacks.ts): enlazarlas es un 404.
          errorOnFallbackPages: true,
          // Una página en español no debe enlazar a /en/… ni al revés.
          errorOnInconsistentLocale: true,
        }),
      ],
    }),
    // Los playgrounds (src/playgrounds/) son islas de React.
    react(),
    // Sitemap propio (Starlight no añade el suyo si ya hay uno), sin copias de respaldo ni imágenes.
    sitemap({ filter: keepInSitemap(fallbacks) }),
    // La última: audita el build ya terminado (sitemap incluido) y lo hace fallar si algo de SEO se rompe.
    seoAudit(),
  ],
});
