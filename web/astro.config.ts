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

// The fallback copies Starlight would generate: they are deleted from the build and kept out of the sitemap.
const fallbacks = new Set(
  fallbackUrls(listContentIds(fileURLToPath(new URL('./src/content/docs', import.meta.url)))),
);

export default defineConfig({
  // With `site`, Starlight generates each page's canonical URL, hreflang and og:url.
  site: siteUrl,
  integrations: [
    // Before Starlight: deletes the fallback copies before Pagefind indexes the build.
    dropFallbacks(fallbacks),
    // Before Starlight: ```mermaid blocks are converted to HTML at build time (src/lib/diagrams/).
    diagrams(),
    starlight({
      title: siteTitle,
      // Spanish lives at the root (no /es/) and English under /en/.
      locales: {
        root: { label: localeLabels.es, lang: 'es' },
        en: { label: localeLabels.en, lang: 'en' },
      },
      customCss: [
        '@fontsource-variable/jetbrains-mono/index.css',
        '@fontsource-variable/atkinson-hyperlegible-next/index.css',
        // Real italics for <em>; only downloaded if a page uses it.
        '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css',
        './src/styles/theme.css',
        './src/styles/diagrams.css',
      ],
      // Code: a dark and a light theme; Starlight assigns each to its mode.
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
          // Fallback copies are deleted from the build (src/integrations/drop-fallbacks.ts): linking to them is a 404.
          errorOnFallbackPages: true,
          // A Spanish page must not link to /en/… nor the other way around.
          errorOnInconsistentLocale: true,
        }),
      ],
    }),
    // The playgrounds (src/playgrounds/) are React islands.
    react(),
    // Our own sitemap (Starlight does not add its own if there is one), without fallback copies or images.
    sitemap({ filter: keepInSitemap(fallbacks) }),
    // The last one: audits the finished build (sitemap included) and fails it if something SEO-related breaks.
    seoAudit(),
  ],
});
