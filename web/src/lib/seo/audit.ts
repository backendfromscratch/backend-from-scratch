/**
 * Reglas de la auditoría SEO. Cada regla recibe el build entero y devuelve sus problemas; el build
 * falla si hay alguno (src/integrations/seo-audit.ts). Son funciones puras, con tests.
 */
import type { PageFacts } from './page';

export interface AuditPage {
  /** Ruta pública de la página: '/', '/fase-0/que-es-dns/'… */
  url: string;
  facts: PageFacts;
  /** JavaScript que puede descargar la página, en bytes. */
  jsBytes: number;
}

export interface AuditInput {
  /** Dominio de la web (`site` de Astro). */
  site: string;
  pages: AuditPage[];
  /** URLs del sitemap, o undefined si no hay sitemap. */
  sitemap: string[] | undefined;
  robotsTxt: string | undefined;
  /** Todos los ficheros del build, como rutas públicas ('/og/index.png'). */
  files: Set<string>;
}

export interface Issue {
  url: string;
  rule: string;
  message: string;
}

export type Rule = (input: AuditInput) => Issue[];

/** Una regla que mira cada página por separado: `check` devuelve el problema o undefined. */
function perPage(
  rule: string,
  check: (page: AuditPage, input: AuditInput) => string | undefined,
): Rule {
  return (input) =>
    input.pages.flatMap((page) => {
      const message = check(page, input);
      return message === undefined ? [] : [{ url: page.url, rule, message }];
    });
}

export const oneH1 = perPage('one-h1', ({ facts }) =>
  facts.h1Count === 1 ? undefined : `tiene ${facts.h1Count} <h1>; debe tener uno`,
);

export const titleAndDescription = perPage('title-description', ({ facts }) => {
  if (!facts.title) return 'no tiene <title>';
  if (!facts.description) return 'no tiene meta description';
  return undefined;
});

export const langMatchesUrl = perPage('lang', ({ url, facts }) => {
  const expected = url === '/en/' || url.startsWith('/en/') ? 'en' : 'es';
  return facts.lang === expected
    ? undefined
    : `lang="${facts.lang}", y por su URL debería ser "${expected}"`;
});

export const canonicalIsSelf = perPage('canonical', ({ url, facts }, { site }) => {
  const expected = new URL(url, site).href;
  return facts.canonical === expected
    ? undefined
    : `canonical="${facts.canonical}", y debería ser ${expected}`;
});

export const sitemapMatchesPages: Rule = ({ site, pages, sitemap }) => {
  if (sitemap === undefined)
    return [{ url: '/sitemap-0.xml', rule: 'sitemap', message: 'no hay sitemap' }];
  const pageUrls = new Set(pages.map((p) => new URL(p.url, site).href));
  const listed = new Set(sitemap);
  return [
    ...[...pageUrls]
      .filter((u) => !listed.has(u))
      .map((u) => ({ url: new URL(u).pathname, rule: 'sitemap', message: 'falta en el sitemap' })),
    ...sitemap
      .filter((u) => !pageUrls.has(u))
      .map((u) => ({
        url: new URL(u).pathname,
        rule: 'sitemap',
        message: 'está en el sitemap, pero no es una página del build',
      })),
  ];
};

export const robotsTxtPointsToSitemap: Rule = ({ site, robotsTxt }) => {
  const issue = (message: string) => [{ url: '/robots.txt', rule: 'robots', message }];
  if (robotsTxt === undefined) return issue('no existe');
  const line = `Sitemap: ${new URL('/sitemap-index.xml', site).href}`;
  if (!robotsTxt.split('\n').some((l) => l.trim() === line))
    return issue(`le falta la línea «${line}»`);
  if (/^Disallow:\s*\/\s*$/m.test(robotsTxt)) return issue('bloquea toda la web (Disallow: /)');
  return [];
};
/** Si una página declara hreflang: se incluye a sí misma, tiene x-default, y cada alternativa existe y la declara de vuelta. */
export const hreflangReciprocal: Rule = ({ site, pages }) => {
  const byHref = new Map(pages.map((p) => [new URL(p.url, site).href, p]));
  return pages.flatMap((page) => {
    const alternates = page.facts.alternates;
    if (alternates.length === 0) return [];
    const self = new URL(page.url, site).href;
    const problems: string[] = [];
    if (!alternates.some((a) => a.href === self && a.hreflang === page.facts.lang)) {
      problems.push('no se incluye a sí misma');
    }
    if (!alternates.some((a) => a.hreflang === 'x-default')) problems.push('no tiene x-default');
    for (const alternate of alternates) {
      const target = byHref.get(alternate.href);
      if (target === undefined) {
        problems.push(
          `${alternate.hreflang} apunta a ${alternate.href}, que no es una página del build`,
        );
      } else if (!target.facts.alternates.some((a) => a.href === self)) {
        problems.push(`${alternate.href} no la declara de vuelta`);
      }
    }
    return problems.map((message) => ({ url: page.url, rule: 'hreflang', message }));
  });
};

export const noFallbackCopies = perPage('fallback', ({ facts }) =>
  facts.robots?.includes('noindex')
    ? 'tiene noindex. Si es una copia de respaldo de Starlight, el build debería haberla borrado (src/integrations/drop-fallbacks.ts); si la has marcado a propósito, sácala del build o cambia esta regla'
    : undefined,
);

export const languageSelectorMatchesHreflang = perPage('language-select', ({ facts }) => {
  const missing = facts.alternates
    .filter((a) => a.hreflang !== 'x-default')
    .map((a) => new URL(a.href).pathname)
    .filter((pathname) => !facts.languageOptions.includes(pathname));
  return missing.length > 0 ? `el selector de idioma no lleva a ${missing.join(', ')}` : undefined;
});

export const noLegacySpanishPrefix = perPage('es-prefix', ({ url }) =>
  url.startsWith('/es/')
    ? 'el español vive en la raíz: no debería haber páginas bajo /es/'
    : undefined,
);

/**
 * JavaScript máximo por página, sin comprimir, contando todo lo que puede importar. Una lección con
 * laboratorio ronda los 340 KB (React 208 KB, el buscador de Starlight 92 KB y el laboratorio); Mermaid
 * llegaba a 3.400 KB.
 */
export const JS_BUDGET_BYTES = 400 * 1024;

export const noMermaid = perPage('mermaid', ({ facts }) =>
  facts.mermaidBlocks > 0
    ? `tiene ${facts.mermaidBlocks} diagramas Mermaid sin convertir a HTML`
    : undefined,
);

export const jsBudget = perPage('js-budget', ({ jsBytes }) =>
  jsBytes > JS_BUDGET_BYTES
    ? `puede descargar ${Math.round(jsBytes / 1024)} KB de JavaScript; el límite es ${JS_BUDGET_BYTES / 1024} KB`
    : undefined,
);

export const titleNotDuplicated = perPage('title', ({ facts }) => {
  const [name, site] = (facts.title ?? '').split(' | ');
  return name && name === site
    ? `el título repite el nombre de la web: «${facts.title}»`
    : undefined;
});

const PHASE_PAGE = /^(?:\/en)?\/(?:fase|phase)-\d+\//;

export const breadcrumbsOnPhasePages = perPage('breadcrumbs', ({ url, facts }, { site }) => {
  if (!PHASE_PAGE.test(url)) return undefined;
  const list = facts.jsonLd.find(
    (data) => (data as { '@type'?: unknown })['@type'] === 'BreadcrumbList',
  ) as { itemListElement?: { item?: string }[] } | undefined;
  const last = list?.itemListElement?.at(-1)?.item;
  return last === new URL(url, site).href
    ? undefined
    : 'le falta el BreadcrumbList (JSON-LD) que termina en la propia página';
});

export const ogImageExists = perPage('og-image', ({ facts }, { site, files }) => {
  if (!facts.ogImage) return 'no tiene og:image';
  const image = new URL(facts.ogImage);
  if (image.origin !== new URL(site).origin)
    return `og:image apunta fuera de la web: ${facts.ogImage}`;
  // Los ficheros del build no van codificados («introducción.png»); la URL sí.
  const pathname = decodeURI(image.pathname);
  return files.has(pathname)
    ? undefined
    : `og:image apunta a ${pathname}, que no existe en el build`;
});

/**
 * Cada enlace interno lleva a un fichero del build. El validador de Starlight solo mira el contenido;
 * esto cubre también los enlaces que generan los componentes (PhaseList, LessonIntro, CodeLens…).
 */
export const internalLinksResolve = perPage('links', ({ url, facts }, { site, files }) => {
  const base = new URL(url, site);
  const broken = new Set<string>();
  for (const href of facts.links) {
    if (/^(?:#|mailto:|tel:|javascript:)/.test(href)) continue;
    const target = new URL(href, base);
    if (target.origin !== base.origin) continue;
    const path = decodeURI(target.pathname);
    const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`];
    if (!candidates.some((candidate) => files.has(candidate))) broken.add(path);
  }
  return broken.size > 0
    ? `enlaza a páginas que no existen en el build: ${[...broken].join(', ')}`
    : undefined;
});

/** Google corta el título hacia los 60-70 caracteres y la descripción hacia los 155. */
export const TITLE_MAX = 70;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 155;

/** Caracteres, no unidades UTF-16: una tilde cuenta como uno. */
const length = (text: string) => [...text].length;

export const titleLength = perPage('title-length', ({ facts }) => {
  const n = length(facts.title ?? '');
  return n > TITLE_MAX
    ? `el <title> tiene ${n} caracteres; Google lo corta a partir de unos ${TITLE_MAX}`
    : undefined;
});

export const descriptionLength = perPage('description-length', ({ facts }) => {
  if (!facts.description) return undefined;
  const n = length(facts.description);
  if (n > DESCRIPTION_MAX) {
    return `la descripción tiene ${n} caracteres; Google la corta a partir de unos ${DESCRIPTION_MAX}`;
  }
  if (n < DESCRIPTION_MIN) {
    return `la descripción tiene ${n} caracteres; aprovecha hasta ${DESCRIPTION_MAX} para decir de qué va la página`;
  }
  return undefined;
});

export const defaultRules: Rule[] = [
  oneH1,
  titleAndDescription,
  langMatchesUrl,
  canonicalIsSelf,
  sitemapMatchesPages,
  robotsTxtPointsToSitemap,
  hreflangReciprocal,
  noFallbackCopies,
  languageSelectorMatchesHreflang,
  noLegacySpanishPrefix,
  noMermaid,
  jsBudget,
  titleNotDuplicated,
  breadcrumbsOnPhasePages,
  ogImageExists,
  internalLinksResolve,
  titleLength,
  descriptionLength,
];

export function auditSite(input: AuditInput, rules: readonly Rule[] = defaultRules): Issue[] {
  return rules.flatMap((rule) => rule(input));
}
